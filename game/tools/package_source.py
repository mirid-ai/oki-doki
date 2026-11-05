#!/usr/bin/env python3
"""Create a reproducible source archive without dependencies or build output."""
from __future__ import annotations
import argparse
import hashlib
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {'.git', '.gradle', '.idea', '__pycache__', 'node_modules', 'dist', 'build', 'www',
                 '.venv', '.venv-nano', 'chatterbox-upstream'}
EXCLUDED_PATHS = {'mobile/android/app/src/main/assets/public', 'mobile/ios/App/App/public'}
EXCLUDED_FILES = {'.DS_Store', 'local.properties'}
# A developer may opt a local Android debug build into user-CA trust. That
# generated, machine-specific policy must not become a distributed default.
EXCLUDED_FILE_PATHS = {'mobile/android/app/src/debug/res/xml/oki_loopback_network.xml'}


def sources():
    for current, dirs, files in os.walk(ROOT, topdown=True, followlinks=False):
        directory = Path(current)
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_DIRS
                         and not (directory / d).is_symlink()
                         and (directory / d).relative_to(ROOT).as_posix() not in EXCLUDED_PATHS)
        for name in sorted(files):
            path = directory / name
            if (path.is_symlink() or name in EXCLUDED_FILES or name.endswith(('.pyc', '.log'))
                    or path.relative_to(ROOT).as_posix() in EXCLUDED_FILE_PATHS):
                continue
            if path.is_file():
                yield path


def build(destination: Path):
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    inputs = sorted(sources(), key=lambda path: path.relative_to(ROOT).as_posix())
    if destination in inputs:
        raise ValueError('Output path must not be a source file.')
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source in inputs:
            relative = source.relative_to(ROOT).as_posix()
            entry = zipfile.ZipInfo('oki-doki/' + relative, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = ((0o755 if os.access(source, os.X_OK) else 0o644) | 0o100000) << 16
            archive.writestr(entry, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    return len(inputs), digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', nargs='?', type=Path, default=ROOT / 'dist' / 'oki-doki-source.zip')
    args = parser.parse_args()
    count, digest = build(args.destination)
    print(f'Archived {count} source files: {args.destination}')
    print(f'SHA-256: {digest}')


if __name__ == '__main__':
    main()
