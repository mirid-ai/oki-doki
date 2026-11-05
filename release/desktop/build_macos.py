#!/usr/bin/env python3
"""Prepare unsigned macOS x64/arm64 app bundles from official Electron ZIPs.

Building archives on Linux does not sign, notarize or run the app. ZIP entries
retain framework symlinks and executable bits; extract with a symlink-aware
tool such as Finder's Archive Utility or the `unzip` command on macOS.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import os
from pathlib import Path, PurePosixPath
import plistlib
import posixpath
import shutil
import stat
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'game'
LAUNCHER = ROOT / 'release' / 'desktop'
VERSION = '44.0.0'
BINARY_DIR = Path('/tmp/oki-doki-electron')
CHECKSUMS = {
    'arm64': '076d79742986e1b100b69ebecc691cb07368045e54c9087cef631b8622b76a80',
    'x64': '28429e700ad68d9624aaa90b6543ffe891a48c14121fd904cd294e5edcee63ff',
}
ELECTRON_PREFIX = 'Electron.app/'
APP_NAME = 'Oki Doki.app/'


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def web_sources():
    spec = importlib.util.spec_from_file_location('package_web_macos', GAME / 'tools' / 'package_web.py')
    if spec is None or spec.loader is None:
        raise ValueError('Cannot load web source manifest.')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return sorted(module.sources(), key=lambda p: p.relative_to(GAME).as_posix())


def validate_member(entry: zipfile.ZipInfo, archive: zipfile.ZipFile) -> None:
    name = entry.filename
    path = PurePosixPath(name)
    permitted_root = name in {'LICENSE', 'LICENSES.chromium.html', 'version'}
    if path.is_absolute() or '..' in path.parts or '\\' in name or not (name.startswith(ELECTRON_PREFIX) or permitted_root):
        raise ValueError(f'Invalid Electron archive path: {name}')
    mode = entry.external_attr >> 16
    if stat.S_ISLNK(mode):
        raw = archive.read(entry)
        try:
            target = raw.decode('utf-8')
        except UnicodeDecodeError as error:
            raise ValueError(f'Invalid symlink target: {name}') from error
        if not target or target.startswith('/') or '\\' in target or '\0' in target:
            raise ValueError(f'Invalid symlink target: {name}')
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
        if not resolved.startswith(ELECTRON_PREFIX):
            raise ValueError(f'Symlink escapes app: {name}')


def readme(arch: str) -> str:
    machine = 'Apple silicon (arm64)' if arch == 'arm64' else 'Intel (x64)'
    return f'''OKI DOKI — MAC DESKTOP PREVIEW

This archive contains an unsigned, unnotarized macOS app prepared for {machine}.
It has not been run on a Mac. It is a work-in-progress build, not a release.
macOS may refuse to open it; app signing, notarization and testing require a Mac.

Extract the entire archive using Finder's Archive Utility or `unzip` on macOS,
which preserve the app's framework symlinks and executable permissions. The app
is Oki Doki.app. It needs local TCP port 49564, serves its own game assets and
does not require a web server to be installed separately. The optional generated
dialogue and speech recognition still require separately configured services.
Prerecorded Kokoro voices and a local speech model are bundled; macOS playback
and microphone access have not been tested.

This is a macOS desktop bundle, not an iPhone or iPad app. See the source
documentation for AI configuration and third-party speech-model licenses.
'''


def build(arch: str, destination: Path) -> str:
    if arch not in CHECKSUMS:
        raise ValueError(f'Unsupported architecture: {arch}')
    official_path = BINARY_DIR / f'electron-v{VERSION}-darwin-{arch}.zip'
    if not official_path.is_file() or digest(official_path) != CHECKSUMS[arch]:
        raise ValueError(f'Missing or checksum-mismatched official Electron release: {official_path}')
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, filename = tempfile.mkstemp(prefix='.macos-', suffix='.zip', dir=destination.parent)
    os.close(handle)
    temporary = Path(filename)
    prefix = f'Oki-Doki-macOS-{arch}/'
    app = prefix + APP_NAME
    expected_links: dict[str, tuple[int, bytes]] = {}
    sources = web_sources()
    try:
        with zipfile.ZipFile(official_path) as official, zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as out:
            entries = official.infolist()
            if len({entry.filename for entry in entries}) != len(entries):
                raise ValueError('Duplicate entry in Electron archive.')
            for entry in entries:
                validate_member(entry, official)
                if not entry.filename.startswith(ELECTRON_PREFIX):
                    target = zipfile.ZipInfo(prefix + entry.filename, date_time=entry.date_time)
                    target.create_system = 3
                    target.external_attr = entry.external_attr
                    target.compress_type = zipfile.ZIP_DEFLATED
                    with official.open(entry) as src, out.open(target, 'w', force_zip64=True) as dst:
                        shutil.copyfileobj(src, dst, 1024 * 1024)
                    continue
                if entry.filename == ELECTRON_PREFIX + 'Contents/Resources/default_app.asar':
                    continue
                relative = entry.filename[len(ELECTRON_PREFIX):]
                target = zipfile.ZipInfo(app + relative, date_time=entry.date_time)
                target.create_system = 3
                target.external_attr = entry.external_attr
                target.compress_type = zipfile.ZIP_DEFLATED
                if stat.S_ISLNK(entry.external_attr >> 16):
                    data = official.read(entry)
                    expected_links[target.filename] = (target.external_attr, data)
                    out.writestr(target, data)
                elif entry.filename == ELECTRON_PREFIX + 'Contents/Info.plist':
                    info = plistlib.loads(official.read(entry))
                    info['CFBundleName'] = 'Oki Doki'
                    info['CFBundleDisplayName'] = 'Oki Doki'
                    info['CFBundleIdentifier'] = 'io.odlc.okidoki'
                    info['NSMicrophoneUsageDescription'] = 'Oki Doki uses the microphone when you choose to record a reply.'
                    info['NSLocalNetworkUsageDescription'] = 'Oki Doki can connect to your chosen local AI and speech services.'
                    out.writestr(target, plistlib.dumps(info))
                elif entry.is_dir():
                    out.writestr(target, b'')
                else:
                    with official.open(entry) as src, out.open(target, 'w', force_zip64=True) as dst:
                        shutil.copyfileobj(src, dst, 1024 * 1024)
            for name in ('main.js', 'package.json', 'local-ai.js', 'local-asr.js'):
                out.write(LAUNCHER / name, app + 'Contents/Resources/app/' + name)
            for source in sources:
                out.write(source, app + 'Contents/Resources/app/web/' + source.relative_to(GAME).as_posix())
            out.writestr(prefix + 'READ-ME.txt', readme(arch))
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError('Invalid macOS archive.')
            names = archive.namelist()
            if len(names) != len(set(names)):
                raise ValueError('Duplicate entry in macOS archive.')
            executable = archive.getinfo(app + 'Contents/MacOS/Electron')
            if not ((executable.external_attr >> 16) & 0o111):
                raise ValueError('macOS executable permission not preserved.')
            for name, (attributes, data) in expected_links.items():
                item = archive.getinfo(name)
                if item.external_attr != attributes or archive.read(item) != data:
                    raise ValueError(f'Framework symlink changed: {name}')
            if not expected_links:
                raise ValueError('Electron framework symlinks missing.')
            info = plistlib.loads(archive.read(app + 'Contents/Info.plist'))
            if info.get('CFBundleIdentifier') != 'io.odlc.okidoki' or not info.get('NSMicrophoneUsageDescription'):
                raise ValueError('App metadata is missing.')
            for source in sources:
                with archive.open(app + 'Contents/Resources/app/web/' + source.relative_to(GAME).as_posix()) as f:
                    if hashlib.file_digest(f, 'sha256').hexdigest() != digest(source):
                        raise ValueError('Stale desktop web asset: ' + str(source))
        checksum = digest(temporary)
        os.replace(temporary, destination)
        return checksum
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arch', required=True, choices=sorted(CHECKSUMS))
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    output = args.output or GAME / 'dist' / f'oki-doki-macos-{args.arch}.zip'
    print(f'Created {output}: {build(args.arch, output)}')
