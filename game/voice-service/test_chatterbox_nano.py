"""Contract tests; run with the optional Nano environment, without model weights."""
from io import BytesIO
import asyncio
import importlib.util
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf
import torch
from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile

spec = importlib.util.spec_from_file_location('oki_chatterbox_nano', Path(__file__).with_name('chatterbox_nano.py'))
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


def has_ffmpeg_opus_encoder():
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        return False
    result = subprocess.run([ffmpeg, '-hide_banner', '-encoders'], capture_output=True, text=True)
    return result.returncode == 0 and 'libopus' in result.stdout


def has_ffmpeg_aac_encoder():
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        return False
    result = subprocess.run([ffmpeg, '-hide_banner', '-encoders'], capture_output=True, text=True)
    return result.returncode == 0 and any(line.split()[1:2] == ['aac'] for line in result.stdout.splitlines())


def recording(seconds):
    buffer = BytesIO()
    times = np.arange(int(16000 * seconds), dtype='float32') / 16000
    sf.write(buffer, 0.1 * np.sin(2 * np.pi * 220 * times), 16000, format='WAV')
    return buffer.getvalue()


class FakeModel:
    sr = 24000

    def __init__(self):
        self.preparations = []
        self.spoken = []
        self.paths = []

    def prepare_conditionals(self, path):
        samples, rate = sf.read(path)
        self.preparations.append((len(samples), rate))
        self.paths.append(Path(path))

    def generate(self, text):
        self.spoken.append(text)
        return torch.ones((1, self.sr), dtype=torch.float32) * 0.1


class NanoContractTests(unittest.TestCase):
    def test_launcher_alias_is_opt_in_and_exact(self):
        origin, alias = 'http://127.0.0.1:8766', 'http://localhost:8766'
        headers = {'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type'}
        with patch.object(service, 'load_nano', return_value=FakeModel()):
            with TestClient(service.create_app(origin), base_url='http://127.0.0.1:8001') as client:
                self.assertEqual(client.options('/tts', headers={'origin': alias, **headers}).status_code, 403)
            with TestClient(service.create_app(origin, allow_loopback_alias=True), base_url='http://127.0.0.1:8001') as client:
                for allowed in [origin, alias]:
                    result = client.options('/tts', headers={'origin': allowed, **headers})
                    self.assertEqual(result.status_code, 200)
                    self.assertEqual(result.headers.get('access-control-allow-origin'), allowed)
                    self.assertEqual(client.post('/tts', headers={'origin': allowed}, json={}).status_code, 422)
                for denied in ['http://localhost:8767', 'http://127.0.0.1:8767', 'https://localhost:8766', 'http://other.example:8766']:
                    result = client.options('/tts', headers={'origin': denied, **headers})
                    self.assertEqual(result.status_code, 403)
                    self.assertNotIn('access-control-allow-origin', result.headers)
        with self.assertRaises(ValueError):
            service.create_app('https://example.com:8766', allow_loopback_alias=True)
        with self.assertRaises(ValueError):
            service.create_app('http://@localhost:8766', allow_loopback_alias=True)

    def test_startup_failure_removes_temporary_reference(self):
        # A copied reference must not outlive a service that fails to start.
        # Use generated tones; no personal recording is involved.
        with tempfile.TemporaryDirectory() as tmp:
            reference = Path(tmp, 'ref.wav')
            reference.write_bytes(recording(7))
            factory = tempfile.TemporaryDirectory
            with patch.object(service.tempfile, 'TemporaryDirectory', side_effect=lambda **kwargs: factory(dir=tmp, **kwargs)):
                app = service.create_app('http://127.0.0.1:8766', default_reference=reference)
            voice_root = next(Path(tmp).glob('oki-nano-voices-*'))
            with patch.object(service, 'load_nano', side_effect=RuntimeError('synthetic startup failure')):
                with self.assertRaisesRegex(RuntimeError, 'synthetic startup failure'):
                    with TestClient(app):
                        pass
            self.assertFalse(voice_root.exists(), 'startup failure removes temporary reference copies')

    def test_local_upload_default_and_speech_contract(self):
        model = FakeModel()
        with tempfile.TemporaryDirectory() as tmp:
            reference = Path(tmp, 'ref.wav')
            reference.write_bytes(recording(7))
            with patch.object(service, 'load_nano', return_value=model):
                with TestClient(service.create_app('http://127.0.0.1:8766', default_reference=reference), base_url='http://127.0.0.1:8001') as client:
                    trusted = {'origin': 'http://127.0.0.1:8766'}
                    self.assertEqual(client.post('/tts', headers={'origin':'http://elsewhere.invalid'}, json={}).status_code, 403)
                    self.assertEqual(client.post('/tts', headers={'host':'elsewhere.invalid'}, json={}).status_code, 403)
                    oversized = client.post('/tts/upload-voice', headers={'content-length':str(service.MAX_UPLOAD + 65537)}, content=b'')
                    self.assertEqual(oversized.status_code, 413)
                    response = client.post('/tts/upload-voice', headers=trusted, files={'file': ('sample.wav', recording(7), 'audio/wav')})
                    self.assertEqual(response.status_code, 200)
                    voice = response.json()['voice_id']
                    self.assertRegex(voice, r'^[0-9a-f]{32}\.wav$')
                    short = client.post('/tts/upload-voice', headers=trusted, files={'file': ('short.wav', recording(5), 'audio/wav')})
                    self.assertEqual(short.status_code, 422)
                    self.assertEqual(client.post('/tts', headers=trusted, json={'text':'hello', 'engine':'chatterbox_nano', 'voice':'../ref.wav'}).status_code, 422)
                    for selected in (voice, voice, 'default'):
                        response = client.post('/tts', headers=trusted, json={'text':'Hello there.', 'engine':'chatterbox_nano', 'voice':selected, 'speed':1})
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response.headers['content-type'], 'audio/wav')
                        audio, rate = sf.read(BytesIO(response.content))
                        self.assertEqual((len(audio), rate), (24000, 24000))
                    self.assertEqual(len(model.preparations), 2, 'same voice reuses conditionals, switching voices reloads them')
                self.assertTrue(all(not path.exists() for path in model.paths), 'service shutdown removes temporary references')

    def test_upload_limit_is_per_session(self):
        with patch.object(service, 'load_nano', return_value=FakeModel()):
            with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                data = recording(7)
                for _ in range(service.MAX_REFERENCES):
                    response = client.post('/tts/upload-voice', files={'file': ('ref.wav', data, 'audio/wav')})
                    self.assertEqual(response.status_code, 200)
                self.assertEqual(client.post('/tts/upload-voice', files={'file': ('ref.wav', data, 'audio/wav')}).status_code, 429)

    def test_failed_voice_switch_forces_the_previous_voice_to_be_prepared_again(self):
        class InterruptedModel(FakeModel):
            def __init__(self):
                super().__init__()
                self.attempts = []
            def prepare_conditionals(self, path):
                name = Path(path).name
                # Simulate a model which changed some internal state before it
                # discovers that the new reference cannot be prepared.
                self.attempts.append(name)
                if name != 'default.wav':
                    raise RuntimeError('synthetic failed preparation')
                super().prepare_conditionals(path)

        model = InterruptedModel()
        with tempfile.TemporaryDirectory() as tmp:
            reference = Path(tmp, 'ref.wav')
            reference.write_bytes(recording(7))
            with patch.object(service, 'load_nano', return_value=model):
                with TestClient(service.create_app('http://127.0.0.1:8766', default_reference=reference), base_url='http://127.0.0.1:8001') as client:
                    uploaded = client.post('/tts/upload-voice', files={'file': ('sample.wav', recording(7), 'audio/wav')})
                    self.assertEqual(uploaded.status_code, 200)
                    voice = uploaded.json()['voice_id']
                    def speak(selected):
                        return client.post('/tts', json={'text': 'Hello.', 'engine': 'chatterbox_nano', 'voice': selected})
                    self.assertEqual(speak('default').status_code, 200)
                    self.assertEqual(speak(voice).status_code, 503)
                    self.assertEqual(speak('default').status_code, 200)
                    self.assertEqual(model.attempts, ['default.wav', voice, 'default.wav'])

    def test_antiphase_stereo_reference_retains_an_audible_channel(self):
        times = np.arange(7 * 16000, dtype='float32') / 16000
        signal = 0.1 * np.sin(2 * np.pi * 220 * times)
        data = BytesIO()
        sf.write(data, np.column_stack((signal, -signal)), 16000, format='WAV', subtype='PCM_16')
        model = FakeModel()
        with patch.object(service, 'load_nano', return_value=model):
            with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                upload = client.post('/tts/upload-voice', files={'file': ('stereo.wav', data.getvalue(), 'audio/wav')})
                self.assertEqual(upload.status_code, 200, upload.text)
                voice = upload.json()['voice_id']
                response = client.post('/tts', json={'text': 'Hello.', 'engine': 'chatterbox_nano', 'voice': voice})
                self.assertEqual(response.status_code, 200)
                samples, rate = sf.read(model.paths[-1])
                self.assertEqual(rate, 16000)
                self.assertGreater(float(np.max(np.abs(samples))), 0.09)
                silent = BytesIO()
                sf.write(silent, np.zeros((7 * 16000, 2), dtype='float32'), 16000, format='WAV')
                rejected = client.post('/tts/upload-voice', files={'file': ('silent.wav', silent.getvalue(), 'audio/wav')})
                self.assertEqual(rejected.status_code, 422)

    def test_empty_and_nonfinite_model_output_are_not_reported_as_speech(self):
        class BadModel(FakeModel):
            def __init__(self, result):
                super().__init__()
                self.result = result

            def generate(self, text):
                return self.result

        with tempfile.TemporaryDirectory() as tmp:
            reference = Path(tmp, 'reference.wav')
            reference.write_bytes(recording(7))
            for bad in (torch.empty((1, 0)), torch.tensor([[float('nan'), 0.1]]), torch.tensor([[float('inf'), 0.1]])):
                with self.subTest(output=bad):
                    with patch.object(service, 'load_nano', return_value=BadModel(bad)):
                        with TestClient(service.create_app('http://127.0.0.1:8766', default_reference=reference), base_url='http://127.0.0.1:8001') as client:
                            response = client.post('/tts', json={'text': 'Hello.', 'engine': 'chatterbox_nano', 'voice': 'default'})
                            self.assertEqual(response.status_code, 503)
                            self.assertNotEqual(response.headers.get('content-type'), 'audio/wav')

    def test_synthesis_rejects_audio_above_the_duration_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            reference = Path(tmp, 'reference.wav')
            reference.write_bytes(recording(7))
            with patch.object(service, 'load_nano', return_value=FakeModel()), patch.object(service, 'MAX_AUDIO_SECONDS', 0.5):
                with TestClient(service.create_app('http://127.0.0.1:8766', default_reference=reference), base_url='http://127.0.0.1:8001') as client:
                    response = client.post('/tts', json={'text': 'Hello.', 'engine': 'chatterbox_nano', 'voice': 'default'})
                    self.assertEqual(response.status_code, 503)

    def test_long_text_is_not_dropped(self):
        text = ' '.join(['a complete sentence.'] * 40)
        parts = service.split_text(text)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(len(part) <= 180 for part in parts))
        self.assertEqual(' '.join(parts), text)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
    def test_phone_style_m4a_can_be_uploaded(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp, 'source.wav')
            target = Path(tmp, 'reference.m4a')
            source.write_bytes(recording(7))
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-c:a', 'aac', str(target)], check=True)
            with patch.object(service, 'load_nano', return_value=FakeModel()):
                with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                    response = client.post('/tts/upload-voice', headers={'origin':'http://127.0.0.1:8766'}, files={'file': ('reference.m4a', target.read_bytes(), 'audio/mp4')})
                    self.assertEqual(response.status_code, 200, response.text)

    @unittest.skipUnless(has_ffmpeg_aac_encoder(), 'ffmpeg AAC encoder unavailable')
    def test_phone_aac_mp4_and_3gp_decode_and_keep_duration_limits(self):
        # Force the ffmpeg path even on systems whose libsndfile decodes AAC.
        with tempfile.TemporaryDirectory() as tmp, patch.object(service, 'load_nano', return_value=FakeModel()):
            with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                real_soundfile = service.sf.SoundFile
                for seconds, ext, mime in [(7, 'aac', 'audio/aac'), (7, 'mp4', 'audio/mp4'), (7, '3gp', 'audio/3gpp'), (4, 'aac', 'audio/aac'), (31, 'aac', 'audio/aac')]:
                    source = Path(tmp, f'{seconds}-{ext}.wav')
                    target = Path(tmp, f'{seconds}.{ext}')
                    source.write_bytes(recording(seconds))
                    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-c:a', 'aac', str(target)], check=True)
                    data = target.read_bytes()
                    def fallback_then_read(stream, *args, **kwargs):
                        if isinstance(stream, BytesIO) and stream.getvalue() == data:
                            raise RuntimeError('Codec unavailable')
                        return real_soundfile(stream, *args, **kwargs)
                    with self.subTest(seconds=seconds, extension=ext), patch.object(service.sf, 'SoundFile', side_effect=fallback_then_read):
                        response = client.post('/tts/upload-voice', files={'file': (target.name, data, mime)})
                        self.assertEqual(response.status_code, 200 if seconds == 7 else 422, response.text)
                        if seconds == 7:
                            self.assertTrue(response.json()['voice_id'].endswith('.wav'))

    @unittest.skipUnless(has_ffmpeg_opus_encoder(), 'ffmpeg libopus encoder unavailable')
    def test_phone_opus_in_ogg_and_webm_is_decoded_when_soundfile_lacks_support(self):
        # Some libsndfile builds support Opus directly, others do not. Force
        # the latter case so both Android-style containers exercise ffmpeg.
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp, 'source.wav')
            source.write_bytes(recording(7))
            real_soundfile = service.sf.SoundFile
            for ext, mime in [('ogg', 'audio/ogg'), ('opus', 'audio/ogg'), ('webm', 'audio/webm')]:
                target = Path(tmp, 'reference.' + ext)
                subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-c:a', 'libopus', str(target)], check=True)
                data = target.read_bytes()
                def fallback_then_read(stream, *args, **kwargs):
                    if isinstance(stream, BytesIO) and stream.getvalue() == data:
                        raise RuntimeError('Codec unavailable')
                    return real_soundfile(stream, *args, **kwargs)
                with self.subTest(extension=ext), patch.object(service.sf, 'SoundFile', side_effect=fallback_then_read), patch.object(service, 'load_nano', return_value=FakeModel()):
                    with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                        result = client.post('/tts/upload-voice', files={'file': (target.name, data, mime)})
                        self.assertEqual(result.status_code, 200, result.text)
                        self.assertTrue(result.json()['voice_id'].endswith('.wav'))

    @unittest.skipUnless(has_ffmpeg_opus_encoder(), 'ffmpeg libopus encoder unavailable')
    def test_opus_duration_limits_remain_enforced_after_conversion(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(service, 'load_nano', return_value=FakeModel()):
                with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                    for seconds in (4, 31):
                        source = Path(tmp, f'{seconds}.wav')
                        target = Path(tmp, f'{seconds}.webm')
                        source.write_bytes(recording(seconds))
                        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-c:a', 'libopus', str(target)], check=True)
                        data = target.read_bytes()
                        real_soundfile = service.sf.SoundFile
                        def fallback_then_read(stream, *args, **kwargs):
                            if isinstance(stream, BytesIO) and stream.getvalue() == data:
                                raise RuntimeError('Codec unavailable')
                            return real_soundfile(stream, *args, **kwargs)
                        with self.subTest(seconds=seconds), patch.object(service.sf, 'SoundFile', side_effect=fallback_then_read):
                            result = client.post('/tts/upload-voice', files={'file': (target.name, data, 'audio/webm')})
                            self.assertEqual(result.status_code, 422, result.text)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
    def test_antiphase_m4a_keeps_audible_stereo(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp, 'source.wav')
            target = Path(tmp, 'reference.m4a')
            times = np.arange(7 * 16000, dtype='float32') / 16000
            signal = 0.1 * np.sin(2 * np.pi * 220 * times)
            sf.write(source, np.column_stack((signal, -signal)), 16000)
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-c:a', 'aac', str(target)], check=True)
            model = FakeModel()
            with patch.object(service, 'load_nano', return_value=model):
                with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                    upload = client.post('/tts/upload-voice', files={'file': ('reference.m4a', target.read_bytes(), 'audio/mp4')})
                    self.assertEqual(upload.status_code, 200, upload.text)
                    response = client.post('/tts', json={'text': 'Hello.', 'engine': 'chatterbox_nano', 'voice': upload.json()['voice_id']})
                    self.assertEqual(response.status_code, 200)
                    samples, _ = sf.read(model.paths[-1])
                    self.assertGreater(float(np.max(np.abs(samples))), 0.05)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
    def test_seekable_decoder_cleans_its_temporary_copy(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root, 'source.wav')
            target = Path(root, 'reference.m4a')
            source.write_bytes(recording(7))
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-c:a', 'aac', str(target)], check=True)
            app = service.create_app('http://127.0.0.1:8766')
            factory = tempfile.TemporaryDirectory
            created = []
            def make_temp(**kwargs):
                temp = factory(dir=root, **kwargs)
                created.append(Path(temp.name))
                return temp
            with patch.object(service, 'load_nano', return_value=FakeModel()):
                with TestClient(app, base_url='http://127.0.0.1:8001') as client:
                    with patch.object(service.tempfile, 'TemporaryDirectory', side_effect=make_temp):
                        response = client.post('/tts/upload-voice', files={'file': ('reference.m4a', target.read_bytes(), 'audio/mp4')})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertTrue(created)
                    self.assertTrue(all(not path.exists() for path in created), 'successful decoding removes its temporary file')
                    created.clear()
                    with patch.object(service.tempfile, 'TemporaryDirectory', side_effect=make_temp):
                        response = client.post('/tts/upload-voice', files={'file': ('invalid.m4a', b'not valid audio', 'audio/mp4')})
                    self.assertEqual(response.status_code, 422)
                    self.assertTrue(created)
                    self.assertTrue(all(not path.exists() for path in created), 'failed decoding removes its temporary file')

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
    def test_seekable_m4a_still_enforces_duration_limit_and_rejects_playlists(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp, 'long.wav')
            target = Path(tmp, 'long.m4a')
            source.write_bytes(recording(31))
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-c:a', 'aac', str(target)], check=True)
            with patch.object(service, 'load_nano', return_value=FakeModel()):
                with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                    response = client.post('/tts/upload-voice', files={'file': ('long.m4a', target.read_bytes(), 'audio/mp4')})
                    self.assertEqual(response.status_code, 422)
                    playlist = b'#EXTM3U\n#EXT-X-TARGETDURATION:10\nfile:///tmp/nonexistent-audio.wav\n'
                    response = client.post('/tts/upload-voice', files={'file': ('playlist.m4a', playlist, 'audio/mp4')})
                    self.assertEqual(response.status_code, 422)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
    def test_streaming_mp3_fallback_remains_available(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp, 'source.wav')
            target = Path(tmp, 'reference.mp3')
            source.write_bytes(recording(7))
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), str(target)], check=True)
            original = sf.SoundFile
            def lacking_mp3_decoder(source, *args, **kwargs):
                if isinstance(source, BytesIO) and source.getvalue().startswith(b'ID3'):
                    raise RuntimeError('synthetic missing MP3 decoder')
                return original(source, *args, **kwargs)
            with patch.object(service, 'load_nano', return_value=FakeModel()):
                with TestClient(service.create_app('http://127.0.0.1:8766'), base_url='http://127.0.0.1:8001') as client:
                    with patch.object(service.sf, 'SoundFile', side_effect=lacking_mp3_decoder):
                        response = client.post('/tts/upload-voice', files={'file': ('reference.mp3', target.read_bytes(), 'audio/mpeg')})
                    self.assertEqual(response.status_code, 200, response.text)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
    def test_cancelled_upload_cleans_decode_copy_when_worker_finishes(self):
        with tempfile.TemporaryDirectory() as root:
            app = service.create_app('http://127.0.0.1:8766')
            endpoint = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/tts/upload-voice')
            factory = tempfile.TemporaryDirectory
            created = []
            started, release = threading.Event(), threading.Event()
            def make_temp(**kwargs):
                temp = factory(dir=root, **kwargs)
                created.append(Path(temp.name))
                return temp
            def fake_decode(*_args, **_kwargs):
                started.set()
                if not release.wait(5):
                    raise RuntimeError('test did not release decoder')
                return subprocess.CompletedProcess([], 0, stdout=recording(7))
            async def scenario():
                with patch.object(service, 'load_nano', return_value=FakeModel()), \
                     patch.object(service.tempfile, 'TemporaryDirectory', side_effect=make_temp), \
                     patch.object(service.subprocess, 'run', side_effect=fake_decode):
                    async with app.router.lifespan_context(app):
                        task = asyncio.create_task(endpoint(UploadFile(file=BytesIO(b'not valid audio'), filename='synthetic.m4a')))
                        self.assertTrue(await asyncio.to_thread(started.wait, 2), 'decoder started')
                        self.assertTrue(created and created[0].exists())
                        if os.name == 'posix':
                            self.assertEqual(stat.S_IMODE(created[0].stat().st_mode), 0o700)
                            self.assertEqual(stat.S_IMODE((created[0] / 'reference.m4a').stat().st_mode) & 0o077, 0)
                        task.cancel()
                        with self.assertRaises(asyncio.CancelledError):
                            await task
                        release.set()
                    # Lifespan waits for the upload worker before cleanup.
                    self.assertTrue(all(not path.exists() for path in created), 'cancelled upload does not retain decoder input')
            try:
                asyncio.run(scenario())
            finally:
                release.set()

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
    def test_cancelled_upload_that_later_fails_releases_its_reference_slot(self):
        app = service.create_app('http://127.0.0.1:8766')
        endpoint = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/tts/upload-voice')
        started, release, finished = threading.Event(), threading.Event(), threading.Event()

        def fail_after_release(*_args, **_kwargs):
            started.set()
            if not release.wait(5):
                raise RuntimeError('test did not release decoder')
            finished.set()
            raise OSError('synthetic decoder failure')

        async def scenario():
            with patch.object(service, 'load_nano', return_value=FakeModel()), \
                 patch.object(service.subprocess, 'run', side_effect=fail_after_release):
                async with app.router.lifespan_context(app):
                    for _ in range(service.MAX_REFERENCES):
                        started.clear()
                        release.clear()
                        finished.clear()
                        task = asyncio.create_task(endpoint(UploadFile(file=BytesIO(b'invalid audio'), filename='synthetic.m4a')))
                        self.assertTrue(await asyncio.to_thread(started.wait, 2))
                        task.cancel()
                        with self.assertRaises(asyncio.CancelledError):
                            await task
                        release.set()
                        self.assertTrue(await asyncio.to_thread(finished.wait, 2))
                        # Let the completion notification run before the next upload.
                        await asyncio.sleep(0.01)
                    result = await endpoint(UploadFile(file=BytesIO(recording(7)), filename='valid.wav'))
                    self.assertEqual(result['status'], 'success')
        try:
            asyncio.run(scenario())
        finally:
            release.set()

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
    def test_cancelled_upload_that_later_succeeds_releases_its_reference_slot(self):
        with tempfile.TemporaryDirectory() as root:
            factory = tempfile.TemporaryDirectory
            with patch.object(service.tempfile, 'TemporaryDirectory', side_effect=lambda **kw: factory(dir=root, **kw)):
                app = service.create_app('http://127.0.0.1:8766')
            voice_root = next(Path(root).glob('oki-nano-voices-*'))
            endpoint = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/tts/upload-voice')
            started, release, written = threading.Event(), threading.Event(), threading.Event()
            data = recording(7)
            original_write = sf.write

            def decode_after_release(*_args, **_kwargs):
                started.set()
                if not release.wait(5):
                    raise RuntimeError('test did not release decoder')
                return subprocess.CompletedProcess([], 0, stdout=data)

            def track_write(file, *args, **kwargs):
                original_write(file, *args, **kwargs)
                if isinstance(file, Path) and file.parent == voice_root:
                    written.set()

            async def scenario():
                with patch.object(service, 'load_nano', return_value=FakeModel()), \
                     patch.object(service.subprocess, 'run', side_effect=decode_after_release), \
                     patch.object(service.sf, 'write', side_effect=track_write):
                    async with app.router.lifespan_context(app):
                        for _ in range(service.MAX_REFERENCES):
                            started.clear(); release.clear(); written.clear()
                            task = asyncio.create_task(endpoint(UploadFile(file=BytesIO(b'invalid audio'), filename='synthetic.m4a')))
                            self.assertTrue(await asyncio.to_thread(started.wait, 2))
                            task.cancel()
                            with self.assertRaises(asyncio.CancelledError):
                                await task
                            release.set()
                            self.assertTrue(await asyncio.to_thread(written.wait, 2))
                            # The callback must remove the now-unreachable file
                            # and release its reservation before another upload.
                            for _ in range(200):
                                if not list(voice_root.glob('*.wav')):
                                    break
                                await asyncio.sleep(0.01)
                            self.assertFalse(list(voice_root.glob('*.wav')))
                        result = await endpoint(UploadFile(file=BytesIO(data), filename='valid.wav'))
                        self.assertEqual(result['status'], 'success')
                        self.assertTrue((voice_root / result['voice_id']).is_file())
            try:
                asyncio.run(scenario())
            finally:
                release.set()


if __name__ == '__main__':
    unittest.main()
