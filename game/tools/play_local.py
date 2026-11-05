#!/usr/bin/env python3
"""Run Oki Doki and optional existing local AI services on loopback.

No models or recordings are downloaded. Ctrl+C stops only processes started
by this command. The experimental Mirid profile is temporary and isolated.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import signal
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

GAME = Path(__file__).resolve().parents[1]
WORKSPACE = GAME.parent


def port(value: str) -> int:
    number = int(value)
    if not 1024 <= number <= 65535:
        raise argparse.ArgumentTypeError('Choose a port between 1024 and 65535.')
    return number


def interpreter(venv: Path) -> Path:
    return venv / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')


def parakeet_available(assets: Path) -> bool:
    """Advertise transcription only when the configured runner and model exist."""
    runner = assets / 'speech/parakeet/runner/parakeet-cli'
    model = assets / 'speech/parakeet/models/tdt_ctc-110m-q4_k.gguf'
    try:
        return runner.is_file() and os.access(runner, os.X_OK) and model.is_file() and model.stat().st_size > 0
    except OSError:
        return False


def valid_model_filename(name: str) -> bool:
    """Match the browser's bounded model basename rules before launching."""
    return (isinstance(name, str)
            and len(name.encode('utf-16-le', 'surrogatepass')) // 2 <= 150
            and name == name.strip()
            and name.lower().endswith('.gguf')
            and not re.search(r'[\\/<>:"|?*\x00-\x1f\x7f-\x9f\ud800-\udfff\ufeff]', name))


def available(number: int) -> bool:
    with socket.socket() as sock:
        # Permit recently closed sockets in TIME_WAIT, while active listeners still block.
        if os.name == 'nt' and hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        else:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('127.0.0.1', number))
            return True
        except OSError:
            return False


def mirid_health(number: int) -> bool:
    # Never consult proxy settings or follow redirects to another host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(f'http://127.0.0.1:{number}/health', timeout=1) as response:
            data = json.loads(response.read(8192))
        return data.get('status') == 'healthy' and data.get('service') == 'backend'
    except (OSError, ValueError, AttributeError, urllib.error.URLError):
        return False


def stop_all(children: list[subprocess.Popen]) -> None:
    for child in reversed(children):
        if child.poll() is None:
            if os.name == 'posix':
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            else:
                child.terminate()
    for child in reversed(children):
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            if os.name == 'posix':
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            else:
                child.kill()
            child.wait(timeout=5)


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=port, default=8766, help='Game port (default 8766)')
    parser.add_argument('--kokoro-port', type=port, default=8770)
    parser.add_argument('--mirid-port', type=port, default=8000)
    parser.add_argument('--nano-port', type=port, default=8001)
    parser.add_argument('--assets-root', type=Path, default=WORKSPACE / 'Mirid-Local-Assets')
    parser.add_argument('--no-kokoro', action='store_true', help='Run without the optional Kokoro service')
    parser.add_argument('--nano', action='store_true', help='Start installed Chatterbox Nano; add your reference separately in game settings')
    parser.add_argument('--with-mirid', action='store_true', help='Start an isolated, experimental Linux workspace Mirid backend')
    parser.add_argument('--model', default='Qwen2.5-1.5B-Instruct-Q4_K_M.gguf', help='Existing workspace text-model filename for --with-mirid')
    return parser


def run(args: argparse.Namespace) -> int:
    assets = args.assets_root.expanduser().resolve()
    origin = f'http://127.0.0.1:{args.port}'
    kokoro = assets / 'speech/kokoro'
    nano = assets / 'speech/chatterbox-nano'
    kokoro_python, nano_python = interpreter(kokoro / 'venv'), interpreter(nano / 'venv')
    kokoro_model = kokoro / 'model'
    use_kokoro = not args.no_kokoro and kokoro_python.is_file() and (kokoro_model / 'kokoro-v1_0.pth').is_file() and (kokoro_model / 'config.json').is_file()
    use_parakeet = args.with_mirid and parakeet_available(assets)
    if args.nano and (not nano_python.is_file() or not (nano / 'cache').is_dir()):
        raise RuntimeError('Chatterbox Nano environment or model cache not found. See voice-service/README.md.')
    if args.with_mirid:
        if not sys.platform.startswith('linux'):
            raise RuntimeError('The isolated workspace Mirid profile is currently available only on Linux.')
        mirid_root = WORKSPACE / 'Mirid-Integrated'
        mirid_python = interpreter(WORKSPACE / 'Mirid-Installed-Test/venv')
        if not valid_model_filename(args.model) or not (assets / 'text-models' / args.model).is_file():
            raise RuntimeError('The selected local text-model filename is invalid or missing from the assets directory.')
        required = [mirid_python, mirid_root / 'backend/app/main.py', assets / 'runners']
        if any(not path.exists() for path in required):
            raise RuntimeError('Workspace Mirid runtime or text runner assets are missing. Start your own Mirid backend instead.')
    requested = [('game', args.port)] + ([('Kokoro', args.kokoro_port)] if use_kokoro else []) + ([('Nano', args.nano_port)] if args.nano else []) + ([('Mirid', args.mirid_port)] if args.with_mirid else [])
    if len({number for _, number in requested}) != len(requested):
        raise RuntimeError('Game and service ports must be different.')
    for label, number in requested:
        if not available(number):
            raise RuntimeError(f'{label} port {number} is already in use. Choose another port; existing services are untouched.')

    children: list[subprocess.Popen] = []
    with tempfile.TemporaryDirectory(prefix='oki-mirid-') as temporary:
        temp = Path(temporary)
        try:
            server_args = [sys.executable, str(GAME / 'tools/local_game_server.py'), '--port', str(args.port), '--directory', str(GAME)]
            setup = None
            setup_file = temp / 'launcher-setup.json'
            def write_setup():
                # Atomic replacement keeps requests from seeing a partial JSON file.
                pending = temp / 'launcher-setup.tmp'
                pending.write_text(json.dumps(setup), encoding='utf-8')
                pending.replace(setup_file)
            if args.with_mirid or use_kokoro or args.nano:
                # Older game builds ignore unknown fields; make them reject a
                # text-only setup rather than silently select missing ASR.
                setup = {'version': 2 if args.with_mirid and not use_parakeet else 1,
                         'miridPort': args.mirid_port if args.with_mirid else None, 'model': args.model if args.with_mirid else None,
                         'kokoroPort': args.kokoro_port if use_kokoro else None,
                         'nanoPort': args.nano_port if args.nano else None}
                if args.with_mirid:
                    setup['asrAvailable'] = use_parakeet
                write_setup()
                server_args += ['--setup-file', str(setup_file)]
            web = subprocess.Popen(server_args, stdin=subprocess.DEVNULL, start_new_session=True)
            children.append(web)
            services = {}
            if use_kokoro:
                child = subprocess.Popen([str(kokoro_python), str(GAME / 'voice-service/kokoro_service.py'), '--model-dir', str(kokoro_model), '--origin', origin, '--allow-loopback-alias', '--port', str(args.kokoro_port)], stdin=subprocess.DEVNULL, start_new_session=True)
                children.append(child)
                services['Kokoro'] = (child, 'kokoroPort')
                print('Starting local Kokoro; it may take a little while to load.', flush=True)
            else:
                print('Kokoro was not started. The written game is available; see voice-service/README.md for setup.', flush=True)
            if args.nano:
                env = {key: os.environ[key] for key in ('PATH', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'WINDIR', 'TMPDIR') if key in os.environ}
                env.update({'HF_HOME': str(nano / 'cache'), 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1'})
                child = subprocess.Popen([str(nano_python), str(GAME / 'voice-service/chatterbox_nano.py'), '--origin', origin, '--allow-loopback-alias', '--port', str(args.nano_port)], env=env, stdin=subprocess.DEVNULL, start_new_session=True)
                children.append(child)
                services['Nano'] = (child, 'nanoPort')
                print('Starting local Nano without a reference. Choose your own file later in game settings.', flush=True)
            if args.with_mirid:
                for directory in ('config', 'data', 'logs', 'cache', 'home'):
                    (temp / directory).mkdir()
                (temp / 'config/settings.json').write_text(json.dumps({'localCompute': {'text': {'backend': 'cpu', 'device': 'none', 'cpu_threads': 2, 'batch_size': 128, 'micro_batch_size': 128, 'fit': False}}}), encoding='utf-8')
                env = {key: os.environ[key] for key in ('PATH', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'WINDIR', 'TMPDIR') if key in os.environ}
                env.update({'HF_HOME': str(temp / 'cache'), 'MIRID_CORS_ORIGINS': '', 'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1', 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'XDG_CACHE_HOME': str(temp / 'cache'), 'MIRID_CONFIG_DIR': str(temp / 'config'), 'MIRID_DATA_DIR': str(temp / 'data'), 'MIRID_LOG_DIR': str(temp / 'logs'), 'MIRID_RUNTIME_PROFILE': 'api', 'MIRID_EXPERIMENTAL_LOCAL_TEXT': '1', 'MIRID_EXPERIMENTAL_LOCAL_STT': '1' if use_parakeet else '0', 'MIRID_FORCE_CPU': '1', 'MIRID_LOCAL_BACKEND': 'cpu', 'MIRID_NATIVE_RUNNERS': '1', 'MIRID_STARTER_MODELS_DIR': str(assets / 'text-models'), 'MIRID_RUNNER_ROOT': str(assets / 'runners'), 'MIRID_PARAKEET_CPP_ROOT': str(assets / 'speech/parakeet/runner'), 'MIRID_PARAKEET_CPP_MODELS_DIR': str(assets / 'speech/parakeet/models'), 'MIRID_MODEL_START_TIMEOUT': '25', 'PORT': str(args.mirid_port), 'TTS_PORT': str(args.mirid_port), 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2', 'CUDA_VISIBLE_DEVICES': ''})
                bootstrap = temp / 'bootstrap.py'
                # Only this temporary game process is patched: the installed Mirid
                # product and any independently running profile remain untouched.
                bootstrap.write_text("from pathlib import Path\nimport os, sys\nPath.home = classmethod(lambda cls: Path(os.environ['MIRID_CONFIG_DIR']).parent / 'home')\n" + f'sys.path.insert(0, {str(mirid_root)!r})\n' + "from backend.app import outreach_db, outreach_worker\nasync def disabled_outreach():\n    raise RuntimeError('Disabled in the isolated Oki Doki profile')\nasync def disabled_outreach_loop(_app):\n    return\noutreach_db.initialize = disabled_outreach\noutreach_worker.outreach_loop = disabled_outreach_loop\nfrom backend.app.main import app\napp.state.outreach_enabled = False\nasync def game_app(scope, receive, send):\n    if scope['type'] == 'http' and scope.get('path', '').startswith('/outreach/'):\n        await send({'type': 'http.response.start', 'status': 404, 'headers': []})\n        await send({'type': 'http.response.body', 'body': b''})\n        return\n    await app(scope, receive, send)\nimport uvicorn\nuvicorn.run(game_app, host='127.0.0.1', port=int(os.environ['PORT']), log_level='warning', access_log=False)\n", encoding='utf-8')
                child = subprocess.Popen([str(mirid_python), str(bootstrap)], cwd=temp, env=env, stdin=subprocess.DEVNULL, start_new_session=True)
                children.append(child)
                services['Mirid'] = (child, 'miridPort')
                print('Starting isolated local Mirid for text' + (' and transcription.' if use_parakeet else '. Parakeet is missing or incomplete; transcription settings will remain unchanged.'), flush=True)
            print(f'Open {origin}/ in your browser. Press Ctrl+C here to stop.', flush=True)
            print(f'In AI settings use Mirid at http://127.0.0.1:{args.mirid_port}; choose the loaded model.', flush=True)
            if args.with_mirid or use_kokoro or args.nano:
                print('In AI settings, choose Use local launcher settings, then save for this session.', flush=True)
            if use_kokoro:
                print(f'Set read-aloud service URL to http://127.0.0.1:{args.kokoro_port} and protocol to Mirid-compatible /tts.', flush=True)
            if args.nano:
                print(f'For your one chosen voice, set Chatterbox Nano URL to http://127.0.0.1:{args.nano_port}.', flush=True)
            if not args.with_mirid:
                print('Mirid health:', 'available (model readiness is separate)' if mirid_health(args.mirid_port) else 'not detected; start Mirid separately if you want text or transcription.', flush=True)
            while True:
                if web.poll() is not None:
                    raise RuntimeError(f'The game server stopped (exit {web.returncode}).')
                for label, (child, key) in list(services.items()):
                    if child.poll() is not None:
                        del services[label]
                        setup[key] = None
                        if key == 'miridPort':
                            setup['model'] = None
                            setup.pop('asrAvailable', None)
                            setup['version'] = 1
                        write_setup()
                        print(f'{label} stopped (exit {child.returncode}). The game and other services remain available; local launcher settings no longer include it.', flush=True)
                time.sleep(.25)
        except KeyboardInterrupt:
            print('\nStopping local services.', flush=True)
        finally:
            stop_all(children)
    return 0


def main() -> int:
    # Run the same cleanup for terminal interruption and process termination.
    def terminate(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, terminate)
    try:
        return run(make_parser().parse_args())
    except (RuntimeError, OSError) as exc:
        print(f'Could not start Oki Doki: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
