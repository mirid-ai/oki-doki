#!/usr/bin/env python3
"""Compare local mixed-voice prefetch timing with simulated playback.

Start the local Kokoro and Nano services first; Nano must use a synthetic test
reference, never the creator's personal voice. This script makes loopback HTTP
requests only. It does not play audio or measure actual browser/media timing.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import subprocess
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import wave

GAME = Path(__file__).resolve().parents[1]


def localhost(value):
    url = urlsplit(value)
    if (url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or not url.port
            or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment):
        raise argparse.ArgumentTypeError('Use an HTTP loopback origin with a port and no path.')
    return value.rstrip('/')


def authored_parts(node):
    # Import the current browser modules without changing the project's module configuration.
    script = r'''import { readFile } from 'node:fs/promises';
const load = async p => import('data:text/javascript;base64,' + (await readFile(p)).toString('base64'));
const { story } = await load('src/story-next.js');
const { castSpeech } = await load('src/voice-cues.js');
const passage = story.disclosure_public_distortion;
process.stdout.write(JSON.stringify(castSpeech('disclosure_public_distortion', passage.speaker, passage.text)));'''
    result = subprocess.run([node, '--input-type=module', '-e', script], cwd=GAME,
                            capture_output=True, text=True, timeout=10, check=True)
    parts = json.loads(result.stdout)
    if [part.get('speaker') for part in parts] != ['Narrator', 'You', 'Narrator', 'You']:
        raise ValueError('The reviewed mixed-speaker fixture changed; update the probe before running it.')
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kokoro-url', type=localhost, default='http://127.0.0.1:19540')
    parser.add_argument('--nano-url', type=localhost, default='http://127.0.0.1:19541')
    parser.add_argument('--origin', type=localhost, default='http://127.0.0.1:8766')
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    parts = authored_parts(args.node)

    def synth(part):
        narrator = part['speaker'] == 'Narrator'
        base = args.nano_url if narrator else args.kokoro_url
        body = json.dumps({'text': part['text'], 'engine': 'chatterbox_nano' if narrator else 'kokoro',
                           'voice': 'default' if narrator else 'af_sarah', 'speed': 1}).encode()
        request = Request(base + '/tts', data=body,
                          headers={'Content-Type': 'application/json', 'Origin': args.origin})
        started = time.monotonic()
        with urlopen(request, timeout=180) as response:
            audio = response.read(20 * 1024 * 1024 + 1)
        if len(audio) > 20 * 1024 * 1024:
            raise ValueError('Speech response exceeded the size limit.')
        with wave.open(io.BytesIO(audio)) as wav:
            duration = wav.getnframes() / wav.getframerate()
        return {'synthesis': time.monotonic() - started, 'audio': duration}

    # Warm each engine. The fixture contains no personal text or recording.
    for speaker in ['Narrator', 'You']:
        synth({'speaker': speaker, 'text': 'One small warmup sentence.'})
    for lookahead in [1, 2, 2, 1]:
        with ThreadPoolExecutor(max_workers=lookahead) as pool:
            started = time.monotonic()
            first = synth(parts[0])
            results = []
            queued = {}
            next_index = 1
            for index in range(len(parts)):
                if index:
                    wait_started = time.monotonic()
                    part = queued.pop(index).result()
                    wait = time.monotonic() - wait_started
                else:
                    part, wait = first, 0
                while next_index < len(parts) and next_index <= index + lookahead:
                    queued[next_index] = pool.submit(synth, parts[next_index])
                    next_index += 1
                # This estimates audio playback using WAV duration; it is not browser playback.
                time.sleep(part['audio'])
                results.append({'synthesis_sec': round(part['synthesis'], 2),
                                'audio_sec': round(part['audio'], 2),
                                'wait_sec': round(wait, 2)})
            print(json.dumps({'lookahead': lookahead, 'total_sec': round(time.monotonic() - started, 2),
                              'parts': results}), flush=True)


if __name__ == '__main__':
    main()
