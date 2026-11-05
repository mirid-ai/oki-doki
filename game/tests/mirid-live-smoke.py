"""Run game JS adapters against a disposable, local Mirid API-profile backend.

Example (run from the workspace root):
  Mirid-Installed-Test/venv/bin/python game/tests/mirid-live-smoke.py --node /path/to/node

Uses existing local models/runners and a synthetic WAV. No downloads, user
profiles, physical devices, browser, or hosted provider calls are required.
The Mirid API profile's Linux local speech features are experimental.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time

import httpx


def args_for_test():
    workspace = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mirid-root', type=Path, default=workspace / 'Mirid-Integrated')
    parser.add_argument('--assets-root', type=Path, default=workspace / 'Mirid-Local-Assets')
    parser.add_argument('--fixture', type=Path, default=workspace / 'evidence/linux-parakeet-cpu-1.0.18/synthetic-flite-16k.wav')
    parser.add_argument('--node', default=shutil.which('node'), help='Node 22+ executable with fetch and WebSocket')
    parser.add_argument('--model', default='Qwen2.5-1.5B-Instruct-Q4_K_M.gguf')
    parser.add_argument('--gateway', action='store_true', help='Test the companion HTTPS gateway instead of the direct game adapters; requires openssl')
    parser.add_argument('--long-speech', action='store_true', help='Also synthesize a long multi-chunk passage directly; may take several minutes on CPU')
    return parser.parse_args()


def run():
    args = args_for_test()
    os.umask(0o077)
    if args.gateway and args.long_speech:
        raise RuntimeError('--long-speech currently requires the direct game adapter, without --gateway.')
    if not args.node:
        raise RuntimeError('Node is unavailable. Supply --node with a Node executable that has fetch and WebSocket.')
    node = Path(args.node).resolve(strict=True)
    app = args.mirid_root.resolve(strict=True)
    assets = args.assets_root.resolve(strict=True)
    fixture = args.fixture.resolve(strict=True)
    if not (assets / 'text-models' / args.model).is_file():
        raise RuntimeError('The selected local text model is missing.')
    client_name = 'gateway-live-client.mjs' if args.gateway else 'mirid-live-client.mjs'
    client_script = Path(__file__).with_name(client_name).resolve(strict=True)

    with tempfile.TemporaryDirectory(prefix='game-mirid-smoke-') as folder:
        root = Path(folder)
        for name in ('config', 'data', 'logs', 'cache', 'home'):
            (root / name).mkdir()
        (root / 'config/settings.json').write_text(json.dumps({'localCompute': {'text': {
            'backend': 'cpu', 'device': 'none', 'cpu_threads': 2,
            'batch_size': 128, 'micro_batch_size': 128, 'fit': False
        }}}), encoding='utf-8')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        if port == 8765:
            raise RuntimeError('The test selected a reserved port; run it again.')
        base = f'http://127.0.0.1:{port}'
        env = {
            'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1',
            'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'XDG_CACHE_HOME': str(root / 'cache'),
            'MIRID_CONFIG_DIR': str(root / 'config'), 'MIRID_DATA_DIR': str(root / 'data'), 'MIRID_LOG_DIR': str(root / 'logs'),
            'MIRID_RUNTIME_PROFILE': 'api', 'MIRID_EXPERIMENTAL_LOCAL_TEXT': '1', 'MIRID_EXPERIMENTAL_LOCAL_STT': '1',
            'MIRID_EXPERIMENTAL_LOCAL_KOKORO': '1', 'MIRID_FORCE_CPU': '1', 'MIRID_LOCAL_BACKEND': 'cpu', 'MIRID_NATIVE_RUNNERS': '1',
            'MIRID_STARTER_MODELS_DIR': str(assets / 'text-models'), 'MIRID_RUNNER_ROOT': str(assets / 'runners'),
            'MIRID_PARAKEET_CPP_ROOT': str(assets / 'speech/parakeet/runner'),
            'MIRID_PARAKEET_CPP_MODELS_DIR': str(assets / 'speech/parakeet/models'),
            'MIRID_KOKORO_PYTHON': str(assets / 'speech/kokoro/venv/bin/python'),
            'MIRID_KOKORO_MODELS': str(assets / 'speech/kokoro/model'),
            'MIRID_MODEL_START_TIMEOUT': '25', 'PORT': str(port), 'TTS_PORT': str(port),
            'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2', 'CUDA_VISIBLE_DEVICES': ''
        }
        bootstrap = root / 'bootstrap.py'
        bootstrap.write_text(
            "from pathlib import Path\nimport os, sys\n"
            "Path.home = classmethod(lambda cls: Path(os.environ['MIRID_CONFIG_DIR']).parent / 'home')\n"
            f'sys.path.insert(0, {str(app)!r})\n'
            "import uvicorn\n"
            "uvicorn.run('backend.app.main:app', host='127.0.0.1', port=int(os.environ['PORT']), log_level='warning', access_log=False)\n",
            encoding='utf-8')
        log = root / 'backend.log'
        with log.open('w+', encoding='utf-8') as output:
            process = subprocess.Popen([sys.executable, str(bootstrap)], cwd=root, env=env,
                                       stdout=output, stderr=output, start_new_session=True)
            try:
                deadline = time.monotonic() + 30
                with httpx.Client(base_url=base, timeout=2, trust_env=False) as client:
                    while time.monotonic() < deadline:
                        if process.poll() is not None:
                            raise RuntimeError('Mirid exited during startup.')
                        try:
                            if client.get('/health').status_code == 200:
                                break
                        except httpx.HTTPError:
                            pass
                        time.sleep(.25)
                    else:
                        raise RuntimeError('Mirid did not become ready within 30 seconds.')
                command = [str(node), str(client_script), base, str(fixture), args.model]
                if args.long_speech:
                    command.append('--long-speech')
                subprocess.run(command, cwd=root, env=env, check=True, timeout=360 if args.long_speech else 150)
            except Exception:
                output.flush()
                print('Mirid backend log tail:', log.read_text(errors='replace')[-5000:], file=sys.stderr)
                raise
            finally:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=5)
                print('Mirid backend stopped; temporary profile removed.', flush=True)


if __name__ == '__main__':
    run()
