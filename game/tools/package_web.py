#!/usr/bin/env python3
"""Package the standalone web game for a static HTTPS host."""
from __future__ import annotations
import argparse
import hashlib
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def sources():
    for name in ('index.html', 'manifest.webmanifest', 'sw.js'):
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Missing or linked web file: {name}')
        yield path
    for name in ('src', 'assets'):
        base = ROOT / name
        if not base.is_dir() or base.is_symlink():
            raise ValueError(f'Missing or linked web directory: {name}')
        for current, dirs, files in os.walk(base, followlinks=False):
            folder = Path(current)
            dirs.sort()
            for entry in dirs:
                if (folder / entry).is_symlink():
                    raise ValueError(f'Linked web directory: {(folder / entry).relative_to(ROOT)}')
            for entry in sorted(files):
                path = folder / entry
                if path.is_symlink() or not path.is_file():
                    raise ValueError(f'Invalid web file: {path.relative_to(ROOT)}')
                yield path


def build(destination: Path):
    destination = destination.resolve()
    inputs = sorted(sources(), key=lambda path: path.relative_to(ROOT).as_posix())
    if destination in inputs:
        raise ValueError('Output path must not be a web source file.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source in inputs:
            entry = zipfile.ZipInfo(source.relative_to(ROOT).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = (0o100644 << 16)
            archive.writestr(entry, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return len(inputs), hashlib.sha256(destination.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', nargs='?', type=Path, default=ROOT / 'dist' / 'oki-doki-web.zip')
    args = parser.parse_args()
    count, digest = build(args.destination)
    print(f'Archived {count} web files: {args.destination}')
    print(f'SHA-256: {digest}')


if __name__ == '__main__':
    main()
