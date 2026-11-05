#!/usr/bin/env python3
"""Build portable Windows x64 desktop app with Electron's official release."""
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
BINARY = Path('/tmp/oki-doki-electron') / f'electron-v{VERSION}-win32-x64.zip'
SHA256 = 'e61aa3bcea8152bc0730abd015e47c032d778a0ef10e2a1c78ba3c4ea47942f9'
PREFIX = 'Oki-Doki-Windows/'

def sha256(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def web_sources():
    spec = importlib.util.spec_from_file_location('package_web', GAME / 'tools' / 'package_web.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return sorted(module.sources(), key=lambda p: p.relative_to(GAME).as_posix())

def build(destination):
    if not BINARY.is_file() or sha256(BINARY) != SHA256:
        raise ValueError(f'Missing or checksum-mismatched official Electron release: {BINARY}')
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix='.windows-', suffix='.zip', dir=destination.parent)
    os.close(handle)
    temp = Path(name)
    try:
        with zipfile.ZipFile(BINARY) as official, zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as out:
            for entry in official.infolist():
                p = PurePosixPath(entry.filename)
                if p.is_absolute() or '..' in p.parts or '\\' in entry.filename:
                    raise ValueError('Invalid entry in official Electron ZIP')
                if entry.is_dir() or entry.filename == 'resources/default_app.asar':
                    continue
                name = 'Oki Doki.exe' if entry.filename == 'electron.exe' else entry.filename
                with official.open(entry) as src, out.open(PREFIX + name, 'w', force_zip64=True) as dst:
                    shutil.copyfileobj(src, dst, 1024 * 1024)
            out.write(LAUNCHER / 'main.js', PREFIX + 'resources/app/main.js')
            out.write(LAUNCHER / 'package.json', PREFIX + 'resources/app/package.json')
            out.write(LAUNCHER / 'local-ai.js', PREFIX + 'resources/app/local-ai.js')
            out.write(LAUNCHER / 'local-asr.js', PREFIX + 'resources/app/local-asr.js')
            for source in web_sources():
                out.write(source, PREFIX + 'resources/app/web/' + source.relative_to(GAME).as_posix())
            out.writestr(PREFIX + 'READ-ME.txt', 'Extract this entire folder, then double-click Oki Doki.exe. Windows x64 is required. This is an unsigned work-in-progress build; Windows may show a warning. It runs the bundled game locally and needs local port 49564. Optional live AI and speech need separate services.\n')
        with zipfile.ZipFile(temp) as z:
            if z.testzip() is not None or PREFIX + 'Oki Doki.exe' not in z.namelist():
                raise ValueError('Invalid Windows ZIP')
            for source in web_sources():
                with z.open(PREFIX + 'resources/app/web/' + source.relative_to(GAME).as_posix()) as f:
                    if hashlib.file_digest(f, 'sha256').hexdigest() != sha256(source):
                        raise ValueError('Stale desktop web asset: ' + str(source))
        digest = sha256(temp)
        os.replace(temp, destination)
        return digest
    finally:
        temp.unlink(missing_ok=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=GAME / 'dist' / 'oki-doki-windows-x64.zip')
    args = parser.parse_args()
    print(f'Created {args.output}: {build(args.output)}')
