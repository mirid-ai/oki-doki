"""Loopback Kokoro speech for Oki Doki using an existing local CPU model.

The /tts endpoint follows Mirid's JSON contract. Voice packs are pinned local
assets; neither inference nor startup fetches a model or voice from the web.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import wave

VOICE_HASHES = {
    'af_heart': '0ab5709b8ffab19bfd849cd11d98f75b60af7733253ad0d67b12382a102cb4ff',
    'af_sarah': '49bd364ea3be9eb3e9685e8f9a15448c4883112a7c0ff7ab139fa4088b08cef9',
    'af_nicole': 'c5561808bcf5250fe8c5f5de32caf2d94f27e57e95befdb098c5c85991d4c5da',
    'am_adam': 'ced7e284aba12472891be1da3ab34db84cc05cc02b5889535796dbf2d8b0cb34',
    'af_bella': '8cb64e02fcc8de0327a8e13817e49c76c945ecf0052ceac97d3081480e8e48d6',
    'bm_george': 'f1bc812213dc59774769e5c80004b13eeb79bd78130b11b2d7f934542dab811b',
    'bf_emma': 'd0a423deabf4a52b4f49318c51742c54e21bb89bbbe9a12141e7758ddb5da701',
}
MODEL_HASHES = {
    'config.json': '5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f',
    'kokoro-v1_0.pth': '496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4',
}
MAX_BODY = 32768
MAX_TEXT = 2000
MAX_FRAMES = 24000 * 180


def checked_file(root: Path, name: str, digest: str) -> Path:
    root = root.resolve(strict=True)
    path = root / name
    if path.is_symlink() or not path.is_file() or not path.resolve(strict=True).is_relative_to(root):
        raise ValueError('A required speech asset is missing or unsafe.')
    hasher = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    if hasher.hexdigest() != digest:
        raise ValueError('A speech asset failed its pinned checksum.')
    return path


def validate_origin(origin: str) -> str:
    parsed = urlsplit(origin)
    if (parsed.scheme not in ('http', 'https') or parsed.hostname not in ('127.0.0.1', 'localhost')
            or parsed.username is not None or parsed.password is not None or parsed.path or parsed.query or parsed.fragment
            or not parsed.port):
        raise ValueError('The allowed game origin must be an exact localhost URL including its port.')
    return origin


def split_text(text: str, limit: int = 180) -> list[str]:
    """Keep the complete passage in short segments for Kokoro's token limit."""
    remaining = ' '.join(text.split())
    parts = []
    while len(remaining) > limit:
        window = remaining[:limit + 1]
        endings = list(re.finditer(r'[.!?]["\']?\s+', window))
        end = endings[-1].end() if endings else window.rfind(' ')
        if end <= 0:
            end = limit
        parts.append(remaining[:end].strip())
        remaining = remaining[end:].strip()
    if remaining:
        parts.append(remaining)
    return parts


def create_espeak_alias(data: Path):
    """Provide a short eSpeak data path, including on systems without symlink privileges."""
    alias = tempfile.TemporaryDirectory(prefix='oki-espeak-')
    target = Path(alias.name) / 'espeak-ng-data'
    try:
        try:
            target.symlink_to(data, target_is_directory=True)
        except (OSError, NotImplementedError):
            # Windows often requires Developer Mode or elevated privileges for
            # symlinks. Copy the installed data into the private temporary
            # directory instead; it is removed when the service stops.
            shutil.copytree(data, target)
        return alias
    except BaseException:
        alias.cleanup()
        raise


class LocalKokoro:
    def __init__(self, model_dir: Path, voice_dir: Path, threads: int):
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        assets = {name: checked_file(model_dir, name, digest) for name, digest in MODEL_HASHES.items()}
        self.voices = {name: checked_file(voice_dir, name + '.pt', digest) for name, digest in VOICE_HASHES.items()}
        import espeakng_loader
        espeak_data = Path(espeakng_loader.get_data_path()).resolve(strict=True)
        if not espeak_data.is_dir() or espeak_data.name != 'espeak-ng-data':
            raise ValueError('The local speech phoneme data is unavailable.')
        # espeak-ng truncates long paths. Keep a short temporary alias alive.
        self.espeak_alias = create_espeak_alias(espeak_data)
        os.environ['ESPEAK_DATA_PATH'] = self.espeak_alias.name
        import spacy
        if not spacy.util.is_package('en_core_web_sm'):
            raise ValueError('The local English speech language model is missing.')
        def no_download(*_args, **_kwargs):
            raise RuntimeError('Automatic dependency downloads are disabled.')
        spacy.cli.download = no_download
        import torch
        from kokoro import KModel, KPipeline
        torch.set_num_threads(threads)
        model = KModel(repo_id='hexgrad/Kokoro-82M', config=str(assets['config.json']),
                       model=str(assets['kokoro-v1_0.pth'])).to('cpu').eval()
        self.pipelines = {lang: KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M',
                                           model=model, device='cpu') for lang in ('a', 'b')}
        self.lock = threading.Lock()

    def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        import numpy as np
        frames, count = [], 0
        with self.lock:
            pipeline = self.pipelines['b' if voice.startswith('b') else 'a']
            for result in pipeline(split_text(text), voice=str(self.voices[voice]), speed=speed):
                chunk = np.asarray(result.audio, dtype=np.float32).reshape(-1)
                count += len(chunk)
                if count > MAX_FRAMES or not np.isfinite(chunk).all():
                    raise ValueError('Speech output is too large or invalid.')
                frames.append(chunk)
        if not count:
            raise ValueError('Speech produced no audio.')
        pcm = (np.clip(np.concatenate(frames), -1, 1) * 32767).astype('<i2').tobytes()
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(pcm)
        return output.getvalue()


def make_handler(origin: str, synthesize, allow_loopback_alias: bool = False):
    origin = validate_origin(origin)
    origins = {origin}
    if allow_loopback_alias:
        parsed = urlsplit(origin)
        alias = 'localhost' if parsed.hostname == '127.0.0.1' else '127.0.0.1'
        origins.add(f'{parsed.scheme}://{alias}:{parsed.port}')
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *_args):
            # Do not log text, voice requests or browser identifiers.
            pass

        def permitted(self):
            host = (self.headers.get('Host') or '').split(':', 1)[0].lower()
            request_origin = self.headers.get('Origin')
            return host in ('localhost', '127.0.0.1') and (request_origin is None or request_origin in origins)

        def send(self, status: int, data: bytes = b'', content_type: str = 'text/plain'):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            request_origin = self.headers.get('Origin')
            if request_origin in origins:
                self.send_header('Access-Control-Allow-Origin', request_origin)
                self.send_header('Vary', 'Origin')
            self.end_headers()
            if data:
                self.wfile.write(data)

        def do_GET(self):
            # Identity and readiness probe for the local companion. This server
            # is loopback-only; the same origin/Host rules apply as for speech.
            if not self.permitted():
                self.send(403)
                return
            if self.path != '/health':
                self.send(404)
                return
            self.send(200, b'{"service":"oki-doki-kokoro","voices":7}', 'application/json')

        def do_OPTIONS(self):
            request_origin = self.headers.get('Origin')
            if not self.permitted() or self.path != '/tts' or request_origin not in origins:
                self.send(403)
                return
            if self.headers.get('Access-Control-Request-Method') != 'POST':
                self.send(405)
                return
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', request_origin)
            self.send_header('Access-Control-Allow-Methods', 'POST')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.send_header('Vary', 'Origin')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def do_POST(self):
            if not self.permitted():
                self.send(403)
                self.close_connection = True
                return
            if self.path != '/tts':
                self.send(404)
                self.close_connection = True
                return
            length = self.headers.get('Content-Length', '')
            if not length.isascii() or not length.isdigit() or len(length) > 8 or not 0 < int(length) <= MAX_BODY:
                self.send(413)
                self.close_connection = True
                return
            try:
                request = json.loads(self.rfile.read(int(length)))
                if not isinstance(request, dict):
                    raise ValueError()
                text, voice, engine, speed = request.get('text'), request.get('voice'), request.get('engine'), request.get('speed', 1)
                if (not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT
                        or any(ord(c) < 32 and c not in '\n\t' for c in text)
                        or voice not in VOICE_HASHES or engine != 'kokoro'
                        or isinstance(speed, bool) or not isinstance(speed, (int, float))
                        or not math.isfinite(speed) or not 0.5 <= speed <= 2):
                    raise ValueError()
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError, TypeError):
                self.send(400, b'Invalid speech request.')
                return
            try:
                audio = synthesize(text.strip(), voice, float(speed))
            except Exception:
                self.send(503, b'Local speech synthesis failed.')
                return
            self.send(200, audio, 'audio/wav')

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, required=True, help='Absolute directory containing local Kokoro config.json and model weights')
    parser.add_argument('--origin', required=True, help='Exact local game origin, for example http://127.0.0.1:8766')
    parser.add_argument('--allow-loopback-alias', action='store_true', help='Also allow the other localhost/127.0.0.1 alias at the same game port')
    parser.add_argument('--port', type=int, default=8770)
    parser.add_argument('--threads', type=int, default=2, choices=range(1, 9))
    args = parser.parse_args()
    if not args.model_dir.is_absolute():
        parser.error('--model-dir must be absolute')
    validate_origin(args.origin)
    engine = LocalKokoro(args.model_dir, Path(__file__).resolve().parent / 'kokoro-voices', args.threads)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(args.origin, engine.synthesize, args.allow_loopback_alias))
    alias_notice = ' and the other loopback name at that port' if args.allow_loopback_alias else ''
    print(f'Kokoro speech ready at http://127.0.0.1:{server.server_port}; allowed game origin {args.origin}{alias_notice}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        engine.espeak_alias.cleanup()


if __name__ == '__main__':
    main()
