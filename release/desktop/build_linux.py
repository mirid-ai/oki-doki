#!/usr/bin/env python3
"""Build an unsigned, portable Linux x64 app from Electron's official release."""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'game'
LAUNCHER = ROOT / 'release' / 'desktop'
VERSION = '44.0.0'
BINARY = Path('/tmp/oki-doki-electron') / f'electron-v{VERSION}-linux-x64.zip'
SHA256 = 'd65286d812719f2b4c1a1b806a80f288a1058c89c7b058dae1e03ab25e499446'
PREFIX = 'Oki-Doki-Linux/'


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def web_sources():
    spec = importlib.util.spec_from_file_location('package_web_linux', GAME / 'tools' / 'package_web.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return sorted(module.sources(), key=lambda p: p.relative_to(GAME).as_posix())


def build(destination):
    if not BINARY.is_file() or digest(BINARY) != SHA256:
        raise ValueError(f'Missing or checksum-mismatched official Electron release: {BINARY}')
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix='.linux-', suffix='.zip', dir=destination.parent)
    os.close(handle)
    temporary = Path(name)
    try:
        with zipfile.ZipFile(BINARY) as official, zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as out:
            for entry in official.infolist():
                path = PurePosixPath(entry.filename)
                if path.is_absolute() or '..' in path.parts or '\\' in entry.filename:
                    raise ValueError('Invalid entry in official Electron ZIP')
                if entry.is_dir() or entry.filename == 'resources/default_app.asar':
                    continue
                target = zipfile.ZipInfo(PREFIX + ('Oki Doki' if entry.filename == 'electron' else entry.filename))
                target.create_system = 3
                target.external_attr = entry.external_attr
                target.compress_type = zipfile.ZIP_DEFLATED
                with official.open(entry) as src, out.open(target, 'w', force_zip64=True) as dst:
                    shutil.copyfileobj(src, dst, 1024 * 1024)
            for name in ('main.js', 'package.json', 'local-ai.js', 'local-asr.js'):
                out.write(LAUNCHER / name, PREFIX + 'resources/app/' + name)
            for source in web_sources():
                out.write(source, PREFIX + 'resources/app/web/' + source.relative_to(GAME).as_posix())
            out.writestr(PREFIX + 'READ-ME.txt', 'Extract the entire folder and run the executable named Oki Doki on Linux x64. The app uses local port 49564. The system must support Chromium sandboxing and graphical Electron apps. Optional AI dialogue and recognition need separate services. This unsigned work-in-progress build is tested only in the stated Linux environment.\n')
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError('Invalid Linux ZIP')
            binary = archive.getinfo(PREFIX + 'Oki Doki')
            if not (binary.external_attr >> 16) & 0o111:
                raise ValueError('Linux executable permission was not preserved')
            for source in web_sources():
                with archive.open(PREFIX + 'resources/app/web/' + source.relative_to(GAME).as_posix()) as f:
                    if hashlib.file_digest(f, 'sha256').hexdigest() != digest(source):
                        raise ValueError('Stale desktop web asset: ' + str(source))
        checksum = digest(temporary)
        os.replace(temporary, destination)
        return checksum
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=GAME / 'dist' / 'oki-doki-linux-x64.zip')
    args = parser.parse_args()
    print(f'Created {args.output}: {build(args.output)}')
