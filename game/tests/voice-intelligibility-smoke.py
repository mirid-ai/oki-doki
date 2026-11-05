#!/usr/bin/env python3
"""Optional local speech-to-ASR smoke test using synthetic story passages.

Start the local Kokoro and Nano services first. The Nano service must use a
synthetic test recording, never a user's private reference for this test. This
script only permits loopback service URLs, saves audio in a temporary directory,
and runs the existing local Parakeet runner. Results are ASR estimates, not a
human listening test or a measure of voice-clone fidelity.
"""
import argparse
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import wave

ROOT = Path(__file__).resolve().parents[2]
GAME = Path(__file__).resolve().parents[1]
CASES = [
    ('kokoro_niko', 'kokoro', 'am_adam', 'Welcome to headquarters. I am Niko, caretaker, ticket counter and Supreme Commander of the Kettle.'),
    ('kokoro_mira', 'kokoro', 'af_bella', 'I noticed. We will discuss your court martial after the impossible staircase.'),
    ('kokoro_ash', 'kokoro', 'bm_george', 'I kept the receipt because it was wrong. Holding it is not the same as agreeing with it.'),
    ('nano_narrator', 'chatterbox_nano', 'default', 'The light over the fort door goes out. A receipt slips beneath it: everyone is together.'),
]
LONG = ('nano_long_narrator', 'chatterbox_nano', 'default',
        'At the foot of the stairs is a child-sized playroom. The air smells of old paper and clean rain. '
        'Toys sit on the highest shelves, far out of reach. Every door has a picture of a familiar place: '
        'the prize counter, Mira’s sewing room, the stairs—and one of the fort, drawn from inside. '
        'A child-height copy of the prize counter stands beside the fort door, with a narrow printer slot. '
        'Niko sets Mallow’s screen on a low shelf where it can see the doors; a small lens looks out beside it.')


def localhost(value):
    url = urlsplit(value)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or not url.port or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
        raise argparse.ArgumentTypeError('Use an HTTP loopback origin with a port and no path.')
    return value.rstrip('/')


def words(value):
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", value.lower().replace('’', "'"))


def word_errors(expected, actual):
    ref, hyp = words(expected), words(actual)
    previous = list(range(len(hyp) + 1))
    for index, word in enumerate(ref, 1):
        current = [index]
        for pos, heard in enumerate(hyp, 1):
            current.append(min(current[-1] + 1, previous[pos] + 1, previous[pos - 1] + (word != heard)))
        previous = current
    return previous[-1], len(ref)


def production_segments(text, node):
    # Load the actual browser splitter, replacing only its imports because the
    # source folder is browser ES modules without Node package metadata.
    script = r'''import { readFile } from 'node:fs/promises';
const source = (await readFile('src/voice-ui.js', 'utf8')).replace(/^import .*;\n/gm, '');
const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
process.stdout.write(JSON.stringify(module.splitNanoPassage(process.env.OKI_TEST_TEXT)));'''
    result = subprocess.run([node, '--input-type=module', '-e', script], cwd=GAME,
                            env={**os.environ, 'OKI_TEST_TEXT': text}, capture_output=True,
                            text=True, timeout=10, check=True)
    parts = json.loads(result.stdout)
    if not isinstance(parts, list) or not all(isinstance(part, str) and part.strip() for part in parts) or ''.join(parts) != text:
        raise ValueError('Production splitter did not preserve the fixture text')
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kokoro-url', type=localhost, default='http://127.0.0.1:19410')
    parser.add_argument('--nano-url', type=localhost, default='http://127.0.0.1:19411')
    parser.add_argument('--origin', type=localhost, default='http://127.0.0.1:8766')
    parser.add_argument('--runner', type=Path, default=ROOT / 'Mirid-Local-Assets/speech/parakeet/runner/parakeet-cli')
    parser.add_argument('--model', type=Path, default=ROOT / 'Mirid-Local-Assets/speech/parakeet/models/tdt_ctc-110m-q4_k.gguf')
    parser.add_argument('--long', action='store_true', help='Also test a longer original story passage')
    parser.add_argument('--segmented', action='store_true', help='Use the game’s Nano splitter and concatenate returned WAVs before transcription')
    parser.add_argument('--node', default='node', help='Node.js executable for --segmented')
    args = parser.parse_args()
    runner, model = args.runner.resolve(strict=True), args.model.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix='oki-voice-intelligibility-') as temp:
        for name, engine, voice, text in CASES + ([LONG] if args.long else []):
            base = args.nano_url if engine == 'chatterbox_nano' else args.kokoro_url
            parts = production_segments(text, args.node) if args.segmented and engine == 'chatterbox_nano' else [text]
            chunks, timing, wave_format = [], [], None
            for part in parts:
                body = json.dumps({'text': part, 'engine': engine, 'voice': voice, 'speed': 1}).encode()
                request = Request(base + '/tts', data=body, headers={'Content-Type': 'application/json', 'Origin': args.origin})
                start = time.monotonic()
                with urlopen(request, timeout=180) as response:
                    audio = response.read(20 * 1024 * 1024 + 1)
                elapsed = time.monotonic() - start
                if len(audio) > 20 * 1024 * 1024:
                    raise ValueError('Speech response exceeded the size limit')
                with wave.open(io.BytesIO(audio)) as wav:
                    current_format = (wav.getnchannels(), wav.getsampwidth(), wav.getframerate())
                    if wave_format is not None and current_format != wave_format:
                        raise ValueError('Speech segments have incompatible WAV formats')
                    wave_format = current_format
                    frames = wav.readframes(wav.getnframes())
                    chunks.append(frames)
                    timing.append({'characters': len(part), 'synthesis_sec': round(elapsed, 2),
                                   'audio_sec': round(wav.getnframes() / wav.getframerate(), 2)})
            source, converted = Path(temp) / (name + '.wav'), Path(temp) / (name + '-16k.wav')
            with wave.open(str(source), 'wb') as wav:
                wav.setnchannels(wave_format[0]); wav.setsampwidth(wave_format[1]); wav.setframerate(wave_format[2])
                for chunk in chunks:
                    wav.writeframes(chunk)
            with wave.open(str(source)) as wav:
                duration = wav.getnframes() / wav.getframerate()
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(source), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', str(converted)], check=True, stdout=subprocess.DEVNULL)
            result = subprocess.run([str(runner), 'transcribe', '--model', str(model), '--input', str(converted), '--threads', '4'], cwd=runner.parent, env={**os.environ, 'PARAKEET_DEVICE': 'cpu', 'CUDA_VISIBLE_DEVICES': ''}, capture_output=True, text=True, timeout=180, check=True)
            transcript = result.stdout.strip()
            errors, count = word_errors(text, transcript)
            print(json.dumps({'case': name, 'voice': voice, 'expected': text, 'asr': transcript,
                              'word_errors': errors, 'reference_words': count,
                              'duration_sec': round(duration, 2), 'synthesis_sec': round(sum(item['synthesis_sec'] for item in timing), 2),
                              'segments': timing}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
