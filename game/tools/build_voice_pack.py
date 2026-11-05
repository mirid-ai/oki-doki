#!/usr/bin/env python3
"""Build resumable, offline Kokoro MP3s for fixed authored Oki Doki text.

Run with the Python environment containing kokoro and its model; example:
  ../Mirid-Local-Assets/speech/kokoro/venv/bin/python tools/build_voice_pack.py --node /path/to/node
Requires Node.js, ffmpeg and ffprobe on PATH, plus the local Kokoro Python/model environment.
The output defaults to dist/voice-build, separate from the published web assets.
Only after reviewing completion should it be copied into assets/voices.
No saves, user input, or generated model responses are read.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ProcessPoolExecutor, wait, FIRST_COMPLETED
import multiprocessing
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT.parent / 'Mirid-Local-Assets/speech/kokoro/model'
VOICE_DIR = ROOT / 'voice-service/kokoro-voices'


def valid_mp3(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 500:
        return False
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0',
                            '-show_entries', 'stream=codec_name,channels:format=duration',
                            '-of', 'json', str(path)], capture_output=True, text=True)
    if probe.returncode:
        return False
    try:
        value = json.loads(probe.stdout)
        stream = value['streams'][0]
        return stream['codec_name'] == 'mp3' and stream['channels'] == 1 and float(value['format']['duration']) > 0
    except (KeyError, IndexError, ValueError, TypeError, json.JSONDecodeError):
        return False


def write_manifest(destination: Path, entries: dict[str, str]) -> None:
    # Replace atomically so readers never see a partial JSON file.
    tmp = destination.with_name('manifest.tmp')
    tmp.write_text(json.dumps(entries, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    os.replace(tmp, destination)


_engine = None
_output = None


def init_worker(model: Path, voices: Path, threads: int, destination: Path) -> None:
    global _engine, _output
    sys.path.insert(0, str(ROOT / 'voice-service'))
    from kokoro_service import LocalKokoro
    _engine = LocalKokoro(model, voices, threads)
    _output = destination


def generate_clip(item, audio: Path, filename: str):
    wav = _engine.synthesize(item['text'], item['voice'], 1)
    fd, name = tempfile.mkstemp(prefix='.voice-', suffix='.mp3', dir=_output)
    os.close(fd)
    temp = Path(name)
    try:
        result = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'wav', '-i', 'pipe:0', '-ac', '1',
                                 '-codec:a', 'libmp3lame', '-b:a', '64k', '-y', str(temp)],
                                input=wav, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.decode('utf-8', errors='replace'))
        if not valid_mp3(temp):
            raise RuntimeError(f'Invalid generated audio for {item["origin"]}')
        os.replace(temp, audio)
        return item['key'], filename, item['speaker'], item['origin']
    finally:
        temp.unlink(missing_ok=True)


def build(args) -> None:
    raw = subprocess.check_output([args.node, str(ROOT / 'tools/voice_catalog.mjs')], cwd=ROOT)
    catalog = json.loads(raw)
    entries = catalog['entries']
    if args.origin_prefix:
        entries = [item for item in entries if item['origin'].startswith(args.origin_prefix)]
    destination = args.output.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    manifest = destination / 'manifest.json'
    completed = {}
    pending = []
    for item in entries:
        key = item['key']
        filename = hashlib.sha256(key.encode('utf-8')).hexdigest() + '.mp3'
        audio = destination / filename
        # A renamed or interrupted file is accepted only if its actual codec validates.
        if valid_mp3(audio):
            completed[key] = filename
        else:
            pending.append((item, audio, filename))
    write_manifest(manifest, completed)
    print(f'Catalog: {len(entries)} unique authored clips; {len(catalog["skippedDynamic"])} dynamic spans excluded.', flush=True)
    print(f'Resumed: {len(completed)} validated clips; {len(pending)} remaining.', flush=True)
    if args.limit:
        pending = pending[:args.limit]
    if not pending:
        return
    started = time.monotonic()
    generated = 0
    jobs = iter(pending)
    # Only the parent updates the manifest. Workers write distinct temporary
    # files then atomically publish them; interruption leaves only safe orphans.
    with ProcessPoolExecutor(max_workers=args.workers, mp_context=multiprocessing.get_context('spawn'),
                             initializer=init_worker, initargs=(args.model, args.voices, args.threads, destination)) as pool:
        futures = set()
        def enqueue():
            try:
                item, audio, filename = next(jobs)
            except StopIteration:
                return False
            futures.add(pool.submit(generate_clip, item, audio, filename))
            return True
        for _ in range(args.workers):
            enqueue()
        try:
            while futures:
                finished, futures = wait(futures, return_when=FIRST_COMPLETED)
                for future in finished:
                    key, filename, speaker, origin = future.result()
                    completed[key] = filename
                    write_manifest(manifest, completed)
                    generated += 1
                    elapsed = time.monotonic() - started
                    eta = elapsed / generated * (len(pending) - generated)
                    print(f'{len(completed)}/{len(entries)} {speaker} {origin} '
                          f'elapsed={elapsed:.0f}s eta={eta:.0f}s', flush=True)
                    enqueue()
        except BaseException:
            for future in futures:
                future.cancel()
            raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', default='node')
    parser.add_argument('--model', type=Path, default=MODEL)
    parser.add_argument('--voices', type=Path, default=VOICE_DIR)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/voice-build')
    parser.add_argument('--threads', type=int, default=2, help='CPU threads per worker.')
    parser.add_argument('--workers', type=int, default=1, help='Independent model workers.')
    parser.add_argument('--limit', type=int, default=0, help='Generate at most this many new clips, useful for smoke testing.')
    parser.add_argument('--origin-prefix', default='', help='For a separate output directory, synthesize only matching catalog origins.')
    args = parser.parse_args()
    if args.threads < 1 or args.workers < 1 or args.limit < 0:
        parser.error('threads and workers must be positive and limit nonnegative')
    if args.origin_prefix and args.output.resolve() in {(ROOT / 'dist/voice-build').resolve(), (ROOT / 'assets/voices').resolve()}:
        parser.error('origin-prefix requires a separate batch output directory')
    build(args)


if __name__ == '__main__':
    main()
