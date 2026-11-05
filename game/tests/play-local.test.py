"""Exercise the real desktop launcher without requiring any model downloads."""
import os
import json
import importlib.util
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / 'tools' / 'play_local.py'


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class LauncherTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform.startswith('linux'), 'workspace Mirid profile is Linux-only')
    def test_mirid_text_starts_with_missing_partial_and_complete_parakeet(self):
        # Fake backend observes launch configuration; real text inference is
        # exercised separately against an isolated installed model.
        for variant in ('missing', 'runner-only', 'model-only', 'empty-model', 'unexecutable', 'complete'):
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as directory:
                workspace = Path(directory)
                assets = workspace / 'assets'
                (assets / 'text-models').mkdir(parents=True)
                (assets / 'text-models/model.gguf').write_bytes(b'model')
                (assets / 'runners').mkdir()
                log = workspace / 'backend-env.json'
                fake = workspace / 'Mirid-Installed-Test/venv/bin/python'
                fake.parent.mkdir(parents=True)
                fake.write_text('#!/usr/bin/env python3\nimport os,pathlib,time\n' +
                                f'pathlib.Path({str(log)!r}).write_text(os.environ["MIRID_EXPERIMENTAL_LOCAL_STT"])\n' +
                                'time.sleep(30)\n')
                fake.chmod(0o755)
                app = workspace / 'Mirid-Integrated/backend/app/main.py'
                app.parent.mkdir(parents=True)
                app.touch()
                if variant not in ('missing', 'model-only'):
                    runner = assets / 'speech/parakeet/runner/parakeet-cli'
                    runner.parent.mkdir(parents=True)
                    runner.write_bytes(b'runner')
                    runner.chmod(0o644 if variant == 'unexecutable' else 0o755)
                if variant in ('empty-model', 'model-only', 'unexecutable', 'complete'):
                    model = assets / 'speech/parakeet/models/tdt_ctc-110m-q4_k.gguf'
                    model.parent.mkdir(parents=True)
                    model.write_bytes(b'' if variant == 'empty-model' else b'model')
                wrapper = workspace / 'launch.py'
                wrapper.write_text('import importlib.util, pathlib, sys\n' +
                    f'spec=importlib.util.spec_from_file_location("launcher", {str(LAUNCHER)!r})\n' +
                    'launcher=importlib.util.module_from_spec(spec); spec.loader.exec_module(launcher)\n' +
                    f'launcher.WORKSPACE=pathlib.Path({str(workspace)!r})\n' +
                    'sys.exit(launcher.main())\n')
                game_port, mirid_port = free_port(), free_port()
                while mirid_port == game_port:
                    mirid_port = free_port()
                p = subprocess.Popen([sys.executable, str(wrapper), '--assets-root', str(assets),
                                      '--port', str(game_port), '--mirid-port', str(mirid_port),
                                      '--model', 'model.gguf', '--with-mirid', '--no-kokoro'],
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                try:
                    deadline = time.monotonic() + 10
                    while True:
                        try:
                            with urlopen(f'http://127.0.0.1:{game_port}/.well-known/oki-doki-local.json', timeout=1) as response:
                                setup = json.load(response)
                            if log.is_file():
                                break
                        except (URLError, ConnectionError):
                            pass
                        if p.poll() is not None or time.monotonic() >= deadline:
                            self.fail(f'Launcher failed for {variant}')
                        time.sleep(.05)
                    complete = variant == 'complete'
                    self.assertEqual(setup['version'], 1 if complete else 2)
                    self.assertEqual(setup['miridPort'], mirid_port)
                    self.assertEqual(setup['model'], 'model.gguf')
                    self.assertEqual(setup['asrAvailable'], complete)
                    self.assertEqual(log.read_text(), '1' if complete else '0')
                finally:
                    if p.poll() is None:
                        p.send_signal(signal.SIGINT)
                    output = p.communicate(timeout=10)[0]
                self.assertEqual(p.returncode, 0, output)
                self.assertIn('text and transcription' if complete else 'transcription settings will remain unchanged', output)

    def test_model_filename_validation_matches_browser_setup(self):
        spec = importlib.util.spec_from_file_location('oki_play_local', LAUNCHER)
        launcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(launcher)
        for name in ('Mistral-7B-v0.3 (Q4_K_M).gguf', 'モデル-🦋.GGUF'):
            self.assertTrue(launcher.valid_model_filename(name), repr(name))
        for name in ('../../outside.gguf', '..\\outside.gguf', 'bad\0name.gguf',
                     'bad\nname.gguf', 'model.gguf ', 'a' * 146 + '.gguf'):
            self.assertFalse(launcher.valid_model_filename(name), repr(name))

    @unittest.skipIf(os.name == 'nt', 'fake executable fixture uses a POSIX shebang')
    def test_optional_service_failures_keep_game_and_other_voice_service_running(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory)
            for kind in ('kokoro', 'chatterbox-nano'):
                speech = assets / 'speech' / kind
                fake = speech / 'venv/bin/python'
                fake.parent.mkdir(parents=True)
                trigger = assets / (kind + '-stop')
                argv_log = assets / (kind + '-args.json')
                fake.write_text('#!/usr/bin/env python3\nimport pathlib,time,sys,json\n' +
                                f'pathlib.Path({str(argv_log)!r}).write_text(json.dumps(sys.argv))\n' +
                                f'p=pathlib.Path({str(trigger)!r})\n' +
                                'while not p.exists(): time.sleep(.05)\nraise SystemExit(17)\n')
                fake.chmod(0o755)
                if kind == 'kokoro':
                    (speech / 'model').mkdir()
                    for filename in ('kokoro-v1_0.pth', 'config.json'):
                        (speech / 'model' / filename).touch()
                else:
                    (speech / 'cache').mkdir()
            ports = set()
            while len(ports) < 3:
                ports.add(free_port())
            game_port, kokoro_port, nano_port = ports
            p = subprocess.Popen([sys.executable, str(LAUNCHER), '--assets-root', directory,
                                  '--port', str(game_port), '--kokoro-port', str(kokoro_port),
                                  '--nano-port', str(nano_port), '--nano'],
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            url = f'http://127.0.0.1:{game_port}/.well-known/oki-doki-local.json'
            try:
                def wait_for(predicate):
                    deadline = time.monotonic() + 10
                    while time.monotonic() < deadline:
                        if p.poll() is not None:
                            self.fail('Launcher stopped after an optional service failed')
                        try:
                            with urlopen(url, timeout=1) as response:
                                data = json.load(response)
                            if predicate(data):
                                return
                        except HTTPError as exc:
                            if exc.code == 404 and predicate(None):
                                return
                        except (URLError, ConnectionError):
                            pass
                        time.sleep(.05)
                    self.fail('Timed out waiting for launcher configuration')
                wait_for(lambda data: data is not None and data['kokoroPort'] == kokoro_port and data['nanoPort'] == nano_port)
                deadline = time.monotonic() + 5
                while not all((assets / (kind + '-args.json')).is_file() for kind in ('kokoro', 'chatterbox-nano')):
                    if time.monotonic() >= deadline:
                        self.fail('Timed out waiting for the voice service arguments')
                    time.sleep(.05)
                for kind in ('kokoro', 'chatterbox-nano'):
                    args = json.loads((assets / (kind + '-args.json')).read_text())
                    self.assertIn('--allow-loopback-alias', args)
                    self.assertEqual(args[args.index('--origin') + 1], f'http://127.0.0.1:{game_port}')
                (assets / 'kokoro-stop').touch()
                wait_for(lambda data: data is not None and data['kokoroPort'] is None and data['nanoPort'] == nano_port)
                with urlopen(f'http://127.0.0.1:{game_port}/', timeout=1) as response:
                    self.assertIn(b'Oki Doki', response.read())
                (assets / 'chatterbox-nano-stop').touch()
                wait_for(lambda data: data is None)
                with urlopen(f'http://127.0.0.1:{game_port}/', timeout=1) as response:
                    self.assertIn(b'Oki Doki', response.read())
            finally:
                if p.poll() is None:
                    p.send_signal(signal.SIGINT)
                output = p.communicate(timeout=10)[0]
            self.assertEqual(p.returncode, 0, output)
            self.assertIn('Kokoro stopped (exit 17)', output)
            self.assertIn('Nano stopped (exit 17)', output)

    @unittest.skipIf(os.name == 'nt', 'fake executable fixture uses a POSIX shebang')
    def test_speech_only_launcher_advertises_kokoro_without_a_text_model(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory)
            speech = assets / 'speech/kokoro'
            fake_python = speech / 'venv/bin/python'
            fake_python.parent.mkdir(parents=True)
            fake_python.write_text('#!/usr/bin/env python3\nimport time\ntime.sleep(30)\n')
            fake_python.chmod(0o755)
            (speech / 'model').mkdir()
            for filename in ('kokoro-v1_0.pth', 'config.json'):
                (speech / 'model' / filename).touch()
            game_port, kokoro_port = free_port(), free_port()
            while kokoro_port == game_port:
                kokoro_port = free_port()
            p = subprocess.Popen([sys.executable, str(LAUNCHER), '--assets-root', directory,
                                  '--port', str(game_port), '--kokoro-port', str(kokoro_port)],
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            try:
                deadline = time.monotonic() + 10
                while True:
                    try:
                        with urlopen(f'http://127.0.0.1:{game_port}/.well-known/oki-doki-local.json', timeout=1) as response:
                            setup = json.load(response)
                        break
                    except (URLError, ConnectionError):
                        if p.poll() is not None or time.monotonic() >= deadline:
                            self.fail('Game server did not start')
                        time.sleep(.05)
                self.assertEqual(setup, {'version': 1, 'miridPort': None, 'model': None,
                                         'kokoroPort': kokoro_port, 'nanoPort': None})
            finally:
                if p.poll() is None:
                    p.send_signal(signal.SIGINT)
                output = p.communicate(timeout=10)[0]
            self.assertEqual(p.returncode, 0, output)

    def test_serves_game_and_stops_its_server(self):
        port = free_port()
        p = subprocess.Popen([sys.executable, str(LAUNCHER), '--no-kokoro', '--port', str(port)],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            deadline = time.monotonic() + 10
            while True:
                try:
                    with urlopen(f'http://127.0.0.1:{port}/', timeout=1) as response:
                        self.assertEqual(response.status, 200)
                        self.assertIn(b'Oki Doki', response.read())
                    with self.assertRaises(HTTPError) as error:
                        urlopen(f'http://127.0.0.1:{port}/.well-known/oki-doki-local.json', timeout=1)
                    self.assertEqual(error.exception.code, 404)
                    break
                except (URLError, ConnectionError):
                    if p.poll() is not None or time.monotonic() >= deadline:
                        self.fail('Game server did not start')
                    time.sleep(.05)
        finally:
            if p.poll() is None:
                p.send_signal(signal.SIGINT if os.name != 'nt' else signal.SIGTERM)
            output = p.communicate(timeout=10)[0]
        self.assertEqual(p.returncode, 0, output)
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(('127.0.0.1', port))

    def test_workspace_mirid_disables_outreach_scheduler(self):
        if not sys.platform.startswith('linux') or not (ROOT.parent / 'Mirid-Installed-Test/venv/bin/python').is_file():
            self.skipTest('prepared Linux Mirid runtime is unavailable')
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('127.0.0.1', 8000))
            except OSError:
                self.skipTest('port 8000 belongs to another process')
        game_port = free_port()
        # A file avoids blocking the verbose backend on an unread output pipe.
        with tempfile.TemporaryFile(mode='w+t') as log:
            p = subprocess.Popen([sys.executable, str(LAUNCHER), '--no-kokoro', '--with-mirid',
                                  '--port', str(game_port)], stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 20
                while True:
                    try:
                        with urlopen('http://127.0.0.1:8000/health', timeout=1) as response:
                            self.assertEqual(response.status, 200)
                        break
                    except (URLError, ConnectionError):
                        if p.poll() is not None or time.monotonic() >= deadline:
                            self.fail('isolated Mirid did not start')
                        time.sleep(.1)
                with urlopen(f'http://127.0.0.1:{game_port}/.well-known/oki-doki-local.json', timeout=3) as response:
                    setup = json.load(response)
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                self.assertEqual(setup['miridPort'], 8000)
                self.assertEqual(setup['model'], 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf')
                self.assertIsNone(setup['kokoroPort'])
                self.assertIsNone(setup['nanoPort'])
                # The backend's default-port worker would otherwise start after four seconds.
                for method, path in [('GET', '/outreach/v1/rules'), ('POST', '/outreach/v1/sync')]:
                    req = Request('http://127.0.0.1:8000' + path, method=method,
                                  data=b'{"enabled":true}' if method == 'POST' else None,
                                  headers={'Content-Type': 'application/json'})
                    with self.assertRaises(HTTPError) as error:
                        urlopen(req, timeout=3)
                    self.assertEqual(error.exception.code, 404)
                time.sleep(4.5)
                with urlopen('http://127.0.0.1:8000/health', timeout=3) as response:
                    self.assertEqual(response.status, 200)
            finally:
                if p.poll() is None:
                    p.send_signal(signal.SIGINT)
                p.wait(timeout=15)
                log.seek(0)
                output = log.read()
            self.assertEqual(p.returncode, 0, output)
            self.assertIn('Outreach scheduler init failed: Disabled in the isolated Oki Doki profile', output)
            self.assertNotIn('Outreach scheduler started', output)
            self.assertIn('Election module disabled; startup work skipped', output)

    def test_occupied_port_does_not_disturb_listener(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            port = listener.getsockname()[1]
            result = subprocess.run([sys.executable, str(LAUNCHER), '--no-kokoro', '--port', str(port)],
                                    capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('already in use', result.stdout + result.stderr)
            with socket.create_connection(('127.0.0.1', port), timeout=1):
                pass

    def test_missing_optional_nano_gives_clear_error(self):
        with tempfile.TemporaryDirectory() as assets:
            result = subprocess.run([sys.executable, str(LAUNCHER), '--nano', '--no-kokoro',
                                     '--assets-root', assets, '--port', str(free_port())],
                                    capture_output=True, text=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Chatterbox Nano', result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
