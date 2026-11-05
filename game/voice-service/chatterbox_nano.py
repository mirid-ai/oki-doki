"""Optional loopback speech service for a local Chatterbox Nano installation.

The game uses the Mirid-compatible /tts/upload-voice and /tts endpoints.
Reference audio is stored only in a temporary directory for this process.
"""
from __future__ import annotations

import argparse
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
from urllib.parse import urlsplit

import numpy as np
import os
import soundfile as sf
import torch
from chatterbox.tts_turbo import ChatterboxTurboTTS
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from huggingface_hub import snapshot_download
from pydantic import BaseModel, Field

MAX_UPLOAD = 12 * 1024 * 1024
MAX_REFERENCES = 8
MAX_TEXT = 2000
MAX_AUDIO_SECONDS = 180
MODEL_REVISION = '71ccd1d0081b430592cea481f4307e764e07bc64'


def load_nano():
    kwargs = dict(repo_id='ResembleAI/chatterbox-nano', revision=MODEL_REVISION,
                  allow_patterns=['*.safetensors', '*.json', '*.txt', '*.pt', '*.model'])
    try:
        model_path = snapshot_download(**kwargs)
    except Exception as exc:
        # Match upstream's workaround for environments where Xet cannot read
        # a public model; use the ordinary HTTP download in that case.
        if 'xet' not in str(exc).lower() and 'hex hash' not in str(exc).lower():
            raise
        import huggingface_hub.constants as hf_constants
        hf_constants.HF_HUB_DISABLE_XET = True
        model_path = snapshot_download(**kwargs)
    return ChatterboxTurboTTS.from_local(model_path, device='cpu', nano=True)


def split_text(text: str) -> list[str]:
    """Keep the whole passage, preferring sentence then word boundaries."""
    remaining = ' '.join(text.split())
    result = []
    while len(remaining) > 180:
        window = remaining[:181]
        sentence = list(re.finditer(r'[.!?]["\']?\s+', window))
        end = sentence[-1].end() if sentence else window.rfind(' ')
        if end <= 0:
            end = 180
        result.append(remaining[:end].strip())
        remaining = remaining[end:].strip()
    if remaining:
        result.append(remaining)
    return result


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    engine: str
    voice: str
    speed: float = 1.0


def create_app(origin: str, threads: int = 4, default_reference: Path | None = None, allow_loopback_alias: bool = False) -> FastAPI:
    origins = {origin}
    if allow_loopback_alias:
        parsed = urlsplit(origin)
        if (parsed.scheme not in ('http', 'https') or parsed.hostname not in ('localhost', '127.0.0.1') or
                parsed.username is not None or parsed.password is not None or parsed.path or parsed.query or parsed.fragment or not parsed.port):
            raise ValueError('The local game origin must include an explicit port.')
        alias = 'localhost' if parsed.hostname == '127.0.0.1' else '127.0.0.1'
        origins.add(f'{parsed.scheme}://{alias}:{parsed.port}')
    references = tempfile.TemporaryDirectory(prefix='oki-nano-voices-')
    voice_root = Path(references.name)
    lock = asyncio.Lock()
    upload_lock = asyncio.Lock()
    uploaded = set()
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='oki-nano')
    upload_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='oki-nano-upload')
    state = {'model': None, 'voice': None}

    def store_reference(data: bytes, name: str) -> None:
        if not data or len(data) > MAX_UPLOAD:
            raise ValueError('Reference recording is too large or empty.')
        try:
            sound = sf.SoundFile(BytesIO(data))
        except RuntimeError:
            # Phone recordings are often AAC/M4A, which libsndfile may not
            # decode. MP4 recordings may need to seek backwards to their
            # media data after reading a trailing index; a pipe cannot do so.
            # Decode a short-lived local file, allow only supported audio
            # demuxers and disable external data references. Preserve stereo
            # until the phase-aware downmix below.
            ffmpeg = shutil.which('ffmpeg')
            if not ffmpeg:
                raise ValueError('Unsupported audio format. Use WAV or install ffmpeg for AAC, MP4, 3GP, Ogg or WebM.') from None
            try:
                output_options = ['-t', '30.01', '-map', '0:a:0', '-ac', '2', '-ar', '24000', '-f', 'wav', 'pipe:1']
                with tempfile.TemporaryDirectory(prefix='oki-nano-decode-') as tmp:
                    source = Path(tmp) / 'reference.m4a'
                    fd = os.open(source, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(fd, 'wb') as stream:
                        stream.write(data)
                    try:
                        converted = subprocess.run(
                            [ffmpeg, '-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe',
                             '-format_whitelist', 'mov,mp4,m4a,3gp,3g2,mj2', '-enable_drefs', '0', '-i', str(source),
                             *output_options],
                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30, check=True,
                        ).stdout
                    except subprocess.CalledProcessError:
                        # Other supported formats may need ffmpeg when the
                        # installed libsndfile lacks a decoder. They stream
                        # from a pipe and cannot open local or remote paths.
                        converted = subprocess.run(
                            [ffmpeg, '-v', 'error', '-nostdin', '-protocol_whitelist', 'pipe',
                             '-format_whitelist', 'aac,mp3,wav,flac,ogg,matroska,webm', '-i', 'pipe:0', *output_options],
                            input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30, check=True,
                        ).stdout
                sound = sf.SoundFile(BytesIO(converted))
            except (OSError, RuntimeError, subprocess.SubprocessError):
                raise ValueError('Could not decode this recording. Try WAV or MP3.') from None
        with sound:
            rate = sound.samplerate
            if not 8000 <= rate <= 192000 or sound.channels not in (1, 2):
                raise ValueError('Unsupported audio format.')
            duration = sound.frames / rate
            if not 5 < duration <= 30:
                raise ValueError('Reference must be longer than 5 seconds and no longer than 30 seconds.')
            # Bound decoded samples too, including when a file reports a
            # misleading length. This avoids expanding an enormous recording.
            samples = sound.read(frames=rate * 30 + 1, dtype='float32', always_2d=True)
            if len(samples) > rate * 30 or not np.isfinite(samples).all():
                raise ValueError('Reference recording is too long or invalid.')
        mono = samples.mean(axis=1)
        # Opposite-polarity stereo channels can cancel almost completely when
        # averaged even though the recording is audible on either channel.
        # Keep the louder channel in that case; ordinary stereo downmixes and
        # genuinely silent recordings continue to use the existing behavior.
        if sound.channels == 2 and len(mono):
            channel_peaks = np.max(np.abs(samples), axis=0)
            loudest = int(np.argmax(channel_peaks))
            if float(np.max(np.abs(mono))) < float(channel_peaks[loudest]) * 0.05:
                mono = samples[:, loudest]
        if float(np.max(np.abs(mono))) < 0.0001:
            raise ValueError('Recording contains no audible signal.')
        sf.write(voice_root / name, mono, rate, format='WAV', subtype='PCM_16')

    @asynccontextmanager
    async def lifespan(app):
        try:
            torch.set_num_threads(threads)
            if default_reference is not None:
                with default_reference.open('rb') as stream:
                    store_reference(stream.read(MAX_UPLOAD + 1), 'default.wav')
            state['model'] = await asyncio.to_thread(load_nano)
            yield
        finally:
            # Work may still be finishing after a browser disconnect. Do not
            # delete its reference while the one inference worker uses it.
            await asyncio.to_thread(executor.shutdown, wait=True, cancel_futures=True)
            await asyncio.to_thread(upload_executor.shutdown, wait=True, cancel_futures=True)
            state['model'] = None
            references.cleanup()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=sorted(origins), allow_methods=['POST'], allow_headers=['Content-Type'])

    @app.middleware('http')
    async def local_only(request: Request, call_next):
        # Restrict browser origins as well as binding to loopback; a hostname
        # chosen by an unrelated site cannot be used to address this service.
        host = (request.headers.get('host') or '').split(':', 1)[0].lower()
        request_origin = request.headers.get('origin')
        if host not in ('127.0.0.1', 'localhost') or (request_origin and request_origin not in origins):
            return Response(status_code=403)
        if request.method == 'POST' and request.url.path in ('/tts/upload-voice', '/tts'):
            # Reject unbounded streams before FastAPI parses multipart files or
            # JSON. Normal browser requests with a File provide a length.
            length = request.headers.get('content-length', '')
            if not length.isascii() or not length.isdigit():
                return Response(status_code=411)
            limit = MAX_UPLOAD + 65536 if request.url.path == '/tts/upload-voice' else 32768
            if len(length) > 10 or int(length) > limit:
                return Response(status_code=413)
        return await call_next(request)

    @app.post('/tts/upload-voice')
    async def upload_voice(file: UploadFile = File(...)):
        data = await file.read(MAX_UPLOAD + 1)
        if not data or len(data) > MAX_UPLOAD:
            raise HTTPException(413, 'Reference recording is too large or empty.')
        async with upload_lock:
            if len(uploaded) >= MAX_REFERENCES:
                raise HTTPException(429, 'Reference limit reached; restart the service to clear the session.')
            name = secrets.token_hex(16) + '.wav'
            # Reserve a slot before dispatch, so a cancelled upload cannot
            # create an uncounted temporary file while decoding continues.
            uploaded.add(name)
            loop = asyncio.get_running_loop()
            try:
                work = upload_executor.submit(store_reference, data, name)
            except RuntimeError:
                uploaded.discard(name)
                raise

            abandoned = threading.Event()

            def release_unused_upload(completed):
                # Cancellation of the request does not necessarily stop a
                # decoder already running in the worker. Account for it until
                # that worker has finished, then release failed or abandoned
                # references. An abandoned ID was never returned to the caller.
                if not abandoned.is_set() and not completed.cancelled() and completed.exception() is None:
                    return
                try:
                    (voice_root / name).unlink(missing_ok=True)
                except OSError:
                    return  # Keep the slot if a partial file could not be removed.
                try:
                    loop.call_soon_threadsafe(uploaded.discard, name)
                except RuntimeError:
                    pass  # The service's event loop has already shut down.

            work.add_done_callback(release_unused_upload)
            try:
                await asyncio.wrap_future(work, loop=loop)
            except asyncio.CancelledError:
                abandoned.set()
                # The worker may have completed between the cancellation and
                # this handler, before its callback could see abandonment.
                if work.done():
                    release_unused_upload(work)
                raise
            except (ValueError, RuntimeError) as exc:
                raise HTTPException(422, str(exc)) from exc
        return {'status': 'success', 'voice_id': name}

    @app.post('/tts')
    async def synthesize(payload: SpeechRequest):
        if payload.engine != 'chatterbox_nano' or payload.speed != 1:
            raise HTTPException(422, 'Select chatterbox_nano at normal speed.')
        if payload.voice == 'default':
            name = 'default.wav'
        elif re.fullmatch(r'[0-9a-f]{32}\.wav', payload.voice):
            name = payload.voice
        else:
            raise HTTPException(422, 'Select an uploaded voice reference.')
        path = voice_root / name
        if not path.is_file():
            raise HTTPException(404, 'Voice reference is no longer available; upload it again.')
        parts = split_text(payload.text)
        if not parts:
            raise HTTPException(422, 'Enter something to read aloud.')

        def run():
            model = state['model']
            with torch.inference_mode():
                if state['voice'] != payload.voice:
                    # A failed preparation may have partially changed the
                    # model's conditionals. Do not claim the previous voice
                    # is still loaded; the next request must prepare again.
                    state['voice'] = None
                    model.prepare_conditionals(str(path))
                    state['voice'] = payload.voice
                clips = []
                frame_count = 0
                for part in parts:
                    clip = np.asarray(model.generate(part).detach().cpu().numpy(), dtype='float32').reshape(-1)
                    frame_count += len(clip)
                    if not len(clip) or frame_count > model.sr * MAX_AUDIO_SECONDS or not np.isfinite(clip).all():
                        raise ValueError('Speech output is empty, too large or invalid.')
                    clips.append(clip)
            gap = np.zeros(round(model.sr * 0.12), dtype='float32')
            if frame_count + len(gap) * (len(clips) - 1) > model.sr * MAX_AUDIO_SECONDS:
                raise ValueError('Speech output is too large.')
            combined = np.concatenate([item for n, clip in enumerate(clips) for item in ([gap, clip] if n else [clip])])
            output = BytesIO()
            sf.write(output, combined, model.sr, format='WAV', subtype='PCM_16')
            return output.getvalue()

        async with lock:
            try:
                # The one-worker executor serializes access to the model even
                # if a disconnected client cancels its waiting request.
                audio = await asyncio.get_running_loop().run_in_executor(executor, run)
            except Exception as exc:
                raise HTTPException(503, 'Chatterbox could not generate this passage.') from exc
        return Response(audio, media_type='audio/wav')

    return app


def main():
    parser = argparse.ArgumentParser(description='Run Chatterbox Nano locally for Oki Doki.')
    parser.add_argument('--port', type=int, default=8001)
    parser.add_argument('--origin', default='http://127.0.0.1:8766', help='Exact origin of the local game')
    parser.add_argument('--allow-loopback-alias', action='store_true', help='Also allow the other localhost/127.0.0.1 alias at the same game port')
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--reference', type=Path, help='Optional local default voice recording')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not 1 <= args.threads <= 32:
        parser.error('Invalid port or thread count.')
    try:
        origin = urlsplit(args.origin)
        origin_port = origin.port
        if (origin.scheme not in ('http', 'https') or origin.hostname not in ('localhost', '127.0.0.1') or
                origin.username is not None or origin.password is not None or origin.path or origin.query or origin.fragment or
                (origin_port is not None and not 1 <= origin_port <= 65535) or
                (args.allow_loopback_alias and origin_port is None)):
            raise ValueError('Invalid origin')
    except ValueError:
        parser.error('Origin must be an exact localhost HTTP or HTTPS origin with no path.')
    import uvicorn
    uvicorn.run(create_app(args.origin, args.threads, args.reference, args.allow_loopback_alias), host='127.0.0.1', port=args.port, access_log=False)


if __name__ == '__main__':
    main()
