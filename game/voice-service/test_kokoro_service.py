"""Contract tests for the optional local Kokoro endpoint; no model is loaded."""
import http.client
import json
from pathlib import Path
import threading
import unittest
import tempfile
from unittest.mock import patch

from kokoro_service import MAX_BODY, ThreadingHTTPServer, make_handler, validate_origin, checked_file, split_text, VOICE_HASHES, create_espeak_alias


class LocalSpeechTests(unittest.TestCase):
    def test_espeak_data_falls_back_to_a_temporary_copy_without_symlink_privilege(self):
        with tempfile.TemporaryDirectory() as source_dir:
            source = Path(source_dir) / 'espeak-ng-data'
            (source / 'lang').mkdir(parents=True)
            (source / 'lang/en').write_bytes(b'test data')
            with patch.object(Path, 'symlink_to', side_effect=OSError('symlinks unavailable')):
                alias = create_espeak_alias(source)
            target = Path(alias.name) / 'espeak-ng-data'
            self.assertTrue(target.is_dir())
            self.assertFalse(target.is_symlink())
            self.assertEqual((target / 'lang/en').read_bytes(), b'test data')
            alias.cleanup()
            self.assertFalse(target.exists())
            self.assertTrue((source / 'lang/en').exists())

    @classmethod
    def setUpClass(cls):
        cls.requests = []
        def fake_synthesis(text, voice, speed):
            cls.requests.append((text, voice, speed))
            return b'RIFF-test-audio'
        cls.origin = 'http://127.0.0.1:8766'
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(cls.origin, fake_synthesis))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path='/tts', value=None, origin=None, host='127.0.0.1', method='POST', headers=None):
        body = json.dumps(value).encode() if value is not None else b''
        combined = {'Host': f'{host}:{self.server.server_port}', 'Content-Type': 'application/json'}
        if origin is not None:
            combined['Origin'] = origin
        combined.update(headers or {})
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        try:
            conn.request(method, path, body=body, headers=combined)
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def test_official_voice_assets_are_pinned(self):
        root = Path(__file__).parent / 'kokoro-voices'
        self.assertEqual(len(VOICE_HASHES), 7)
        for name, digest in VOICE_HASHES.items():
            self.assertTrue(checked_file(root, name + '.pt', digest).is_file())

    def test_long_passages_are_split_without_losing_words(self):
        text = 'First sentence. ' + 'A longer thought continues here, ' * 30 + 'The last sentence.'
        parts = split_text(text)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(0 < len(part) <= 180 for part in parts))
        self.assertEqual(' '.join(parts), text.strip())
        uninterrupted = 'x' * 401
        self.assertEqual(''.join(split_text(uninterrupted)), uninterrupted)

    def test_exact_origin_and_loopback_host(self):
        with self.assertRaises(ValueError):
            validate_origin('https://example.com:443')
        with self.assertRaises(ValueError):
            validate_origin('http://127.0.0.1:8766/a')
        with self.assertRaises(ValueError):
            validate_origin('http://@localhost:8766')
        value = {'text': 'Hello there.', 'voice': 'af_bella', 'engine': 'kokoro', 'speed': 1}
        status, headers, body = self.request(value=value, origin=self.origin)
        self.assertEqual((status, headers['Content-Type'], body), (200, 'audio/wav', b'RIFF-test-audio'))
        self.assertEqual(headers['Access-Control-Allow-Origin'], self.origin)
        self.assertEqual(self.requests[-1], ('Hello there.', 'af_bella', 1.0))
        self.assertEqual(self.request(value=value, origin='https://untrusted.example')[0], 403)
        self.assertEqual(self.request(value=value, host='other.example')[0], 403)

    def test_companion_health_identity_obeys_host_and_origin_rules(self):
        status, headers, body = self.request(path='/health', method='GET')
        self.assertEqual(status, 200)
        self.assertEqual(headers['Content-Type'], 'application/json')
        self.assertEqual(json.loads(body), {'service': 'oki-doki-kokoro', 'voices': 7})
        self.assertEqual(self.request(path='/health', method='GET', host='other.example')[0], 403)
        self.assertEqual(self.request(path='/health', method='GET', origin='https://untrusted.example')[0], 403)
        self.assertEqual(self.request(path='/unrelated', method='GET')[0], 404)

    def test_preflight_and_tts_only(self):
        status, headers, _ = self.request(method='OPTIONS', origin=self.origin,
            headers={'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
        self.assertEqual(status, 204)
        self.assertEqual(headers['Access-Control-Allow-Origin'], self.origin)
        self.assertEqual(self.request(path='/transcribe', value={}, origin=self.origin)[0], 404)

    def test_launcher_alias_is_opt_in_and_exact(self):
        alias = 'http://localhost:8766'
        headers = {'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'}
        self.assertEqual(self.request(method='OPTIONS', origin=alias, headers=headers)[0], 403,
                         'standalone configuration keeps its single exact origin')
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.origin, lambda *_: b'RIFF', True))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            def preflight(origin):
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                try:
                    conn.request('OPTIONS', '/tts', headers={'Origin': origin, **headers})
                    response = conn.getresponse()
                    response.read()
                    return response.status, response.getheader('Access-Control-Allow-Origin')
                finally:
                    conn.close()
            for origin in [self.origin, alias]:
                self.assertEqual(preflight(origin), (204, origin))
            for origin in ['http://localhost:8767', 'http://127.0.0.1:8767', 'https://localhost:8766', 'http://other.example:8766']:
                self.assertEqual(preflight(origin), (403, None))
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_rejects_unsupported_and_oversized_requests(self):
        for value in [
            {'text': 'Hello', 'voice': 'af_unknown', 'engine': 'kokoro'},
            {'text': 'Hello', 'voice': '../af_heart', 'engine': 'kokoro'},
            {'text': 'Hello', 'voice': 'af_heart', 'engine': 'wrong'},
            {'text': 'Hello', 'voice': 'af_heart', 'engine': 'kokoro', 'speed': True},
            {'text': 'x' * 2001, 'voice': 'af_heart', 'engine': 'kokoro'},
        ]:
            self.assertEqual(self.request(value=value, origin=self.origin)[0], 400)
        self.assertEqual(self.request(value={'x': 'x' * MAX_BODY}, origin=self.origin)[0], 413)


if __name__ == '__main__':
    unittest.main()
