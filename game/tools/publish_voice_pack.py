#!/usr/bin/env python3
"""Publish a validated snapshot from a resumable Oki Doki voice build.

The running generator may continue: its manifest names only completed clips,
which are immutable. We copy/validate those clips before atomically replacing
only the published manifest; playback never observes a half-copied snapshot.
Unreferenced old clips are intentionally retained for readers of an older
manifest. This does not imply that a partial build covers the whole game.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from build_voice_pack import ROOT, valid_mp3, write_manifest


def publish(source: Path | list[Path], destination: Path) -> int:
    sources = [source] if isinstance(source, Path) else source
    snapshot = {}
    origins = {}
    for directory in sources:
        batch = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
        if not isinstance(batch, dict):
            raise ValueError('Invalid source manifest')
        for key, name in batch.items():
            if key in snapshot and snapshot[key] != name:
                raise ValueError('Conflicting filenames in source manifests')
            snapshot[key] = name
            origins[key] = directory
    destination.mkdir(parents=True, exist_ok=True)
    def copy_validated(item):
        key, name = item
        parsed = json.loads(key)
        expected = hashlib.sha256(key.encode('utf-8')).hexdigest() + '.mp3'
        if (not isinstance(parsed, list) or len(parsed) != 3 or
            any(not isinstance(part, str) for part in parsed) or name != expected or
            not re.fullmatch(r'[0-9a-f]{64}\.mp3', name)):
            raise ValueError('Invalid clip key or filename')
        src, target = origins[key] / name, destination / name
        if not valid_mp3(src):
            raise ValueError(f'Invalid source MP3: {name}')
        source_digest = hashlib.sha256(src.read_bytes()).digest()
        if valid_mp3(target) and hashlib.sha256(target.read_bytes()).digest() == source_digest:
            return
        fd, temporary = tempfile.mkstemp(prefix='.publishing-', suffix='.mp3', dir=destination)
        os.close(fd)
        path = Path(temporary)
        try:
            shutil.copyfile(src, path)
            if not valid_mp3(path) or hashlib.sha256(path.read_bytes()).digest() != source_digest:
                raise ValueError(f'Invalid copied MP3: {name}')
            os.replace(path, target)
        finally:
            path.unlink(missing_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(copy_validated, snapshot.items()))
    write_manifest(destination / 'manifest.json', snapshot)
    return len(snapshot)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, action='append', help='Batch source, repeat to combine multiple batches.')
    parser.add_argument('--destination', type=Path, default=ROOT / 'assets/voices')
    args = parser.parse_args()
    sources = args.source or [ROOT / 'dist/voice-build']
    opening = ROOT / 'dist/voice-opening'
    if args.source is None and opening.is_dir():
        sources.append(opening)
    count = publish([source.resolve() for source in sources], args.destination.resolve())
    print(f'Published {count} validated clips to {args.destination}.')


if __name__ == '__main__':
    main()
