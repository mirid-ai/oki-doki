#!/usr/bin/env python3
"""Assemble one local Oki Doki handoff from verified current build artifacts.

Run after the site and Android APK have been built. The existing output is
replaced only after validation and archive creation succeed.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'game'
SITE = ROOT / 'website'
STAGED = SITE / 'dist'
DEFAULT_OUTPUT = GAME / 'dist' / 'oki-doki-package.zip'


def module(name: str):
    path = GAME / 'tools' / f'package_{name}.py'
    spec = importlib.util.spec_from_file_location('oki_release_' + name, path)
    if spec is None or spec.loader is None:
        raise ValueError(f'Cannot load {path}')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def digest_file(path: Path) -> str:
    with path.open('rb') as stream:
        return digest_stream(stream)


def digest_stream(stream) -> str:
    digest = hashlib.sha256()
    for data in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(data)
    return digest.hexdigest()


def require_same_file(original: Path, staged: Path) -> None:
    if staged.is_symlink() or not staged.is_file() or digest_file(original) != digest_file(staged):
        raise ValueError(f'Staged file missing or stale: {staged}')


def check_archive_matches(archive_path: Path, entries: dict[str, Path]) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or set(names) != set(entries):
            raise ValueError(f'Archive is incomplete or has unexpected files: {archive_path}')
        for name, original in entries.items():
            with archive.open(name) as stream:
                if digest_stream(stream) != digest_file(original):
                    raise ValueError(f'Stale archive entry {name}: {archive_path}')


def collect_inputs(apk: Path, windows: Path, linux: Path, mac_arm64: Path, mac_x64: Path, local_ai: Path) -> list[tuple[str, Path]]:
    if not STAGED.is_dir() or not (STAGED / '.oki-site-generated').is_file():
        raise ValueError('Build the managed site first: python3 website/build.py')
    if apk.is_symlink() or not apk.is_file():
        raise ValueError(f'Android debug APK does not exist: {apk}')
    web = module('web')
    source = module('source')
    web_files = list(web.sources())
    source_files = list(source.sources())
    for path in web_files:
        require_same_file(path, STAGED / 'play' / path.relative_to(GAME))
    for name in ('index.html', 'site.css', 'desktop-downloads.js', 'desktop-releases.json'):
        require_same_file(SITE / name, STAGED / name)
    check_archive_matches(STAGED / 'oki-doki-source.zip', {
        'oki-doki/' + path.relative_to(GAME).as_posix(): path for path in source_files
    })
    site_sources = ('index.html', 'site.css', 'desktop-downloads.js', 'desktop-releases.json', 'preview.py', 'build.py', 'README.md', 'LICENSE')
    check_archive_matches(STAGED / 'website-source.zip', {
        'website/' + name: SITE / name for name in site_sources
    })
    # Verify the APK matches every staged web file. Extra native files are fine.
    with zipfile.ZipFile(apk) as archive:
        for path in web_files:
            entry = 'assets/public/' + path.relative_to(GAME).as_posix()
            try:
                with archive.open(entry) as stream:
                    same = digest_stream(stream) == digest_file(path)
            except KeyError:
                same = False
            if not same:
                raise ValueError(f'Android APK is missing or stale: {entry}')
    if windows.is_symlink() or not windows.is_file():
        raise ValueError(f'Windows portable ZIP does not exist: {windows}')
    with zipfile.ZipFile(windows) as archive:
        prefix = 'Oki-Doki-Windows/'
        if prefix + 'Oki Doki.exe' not in archive.namelist():
            raise ValueError('Windows ZIP is missing the launcher.')
        for name in ('main.js', 'package.json', 'local-ai.js'):
            entry = prefix + 'resources/app/' + name
            with archive.open(entry) as stream:
                if digest_stream(stream) != digest_file(ROOT / 'release' / 'desktop' / name):
                    raise ValueError(f'Windows launcher is stale: {entry}')
        for path in web_files:
            entry = prefix + 'resources/app/web/' + path.relative_to(GAME).as_posix()
            try:
                with archive.open(entry) as stream:
                    same = digest_stream(stream) == digest_file(path)
            except KeyError:
                same = False
            if not same:
                raise ValueError(f'Windows app is missing or stale: {entry}')
    if linux.is_symlink() or not linux.is_file():
        raise ValueError(f'Linux portable ZIP does not exist: {linux}')
    with zipfile.ZipFile(linux) as archive:
        prefix = 'Oki-Doki-Linux/'
        info = archive.getinfo(prefix + 'Oki Doki')
        if not (info.external_attr >> 16) & 0o111:
            raise ValueError('Linux launcher is not executable.')
        for name in ('main.js', 'package.json', 'local-ai.js'):
            with archive.open(prefix + 'resources/app/' + name) as stream:
                if digest_stream(stream) != digest_file(ROOT / 'release' / 'desktop' / name):
                    raise ValueError(f'Linux launcher is stale: {name}')
        for path in web_files:
            entry = prefix + 'resources/app/web/' + path.relative_to(GAME).as_posix()
            try:
                with archive.open(entry) as stream:
                    same = digest_stream(stream) == digest_file(path)
            except KeyError:
                same = False
            if not same:
                raise ValueError(f'Linux app is missing or stale: {entry}')
    for architecture, package in (('arm64', mac_arm64), ('x64', mac_x64)):
        if package.is_symlink() or not package.is_file():
            raise ValueError(f'macOS {architecture} ZIP does not exist: {package}')
        with zipfile.ZipFile(package) as archive:
            prefix = f'Oki-Doki-macOS-{architecture}/Oki Doki.app/Contents/'
            executable = archive.getinfo(prefix + 'MacOS/Electron')
            if not (executable.external_attr >> 16) & 0o111:
                raise ValueError(f'macOS {architecture} launcher is not executable.')
            for name in ('main.js', 'package.json', 'local-ai.js'):
                with archive.open(prefix + 'Resources/app/' + name) as stream:
                    if digest_stream(stream) != digest_file(ROOT / 'release' / 'desktop' / name):
                        raise ValueError(f'macOS {architecture} launcher is stale: {name}')
            for path in web_files:
                entry = prefix + 'Resources/app/web/' + path.relative_to(GAME).as_posix()
                try:
                    with archive.open(entry) as stream:
                        same = digest_stream(stream) == digest_file(path)
                except KeyError:
                    same = False
                if not same:
                    raise ValueError(f'macOS {architecture} app is missing or stale: {entry}')
    files = []
    for folder, dirs, names in os.walk(STAGED, followlinks=False):
        directory = Path(folder)
        for name in dirs:
            if (directory / name).is_symlink():
                raise ValueError(f'Linked site directory: {directory / name}')
        for name in names:
            path = directory / name
            if path.is_symlink() or not path.is_file():
                raise ValueError(f'Invalid site file: {path}')
            if name == '.oki-site-generated':
                continue
            files.append(('Oki-Doki/site/' + path.relative_to(STAGED).as_posix(), path))
    files.append(('Oki-Doki/android/oki-doki-debug.apk', apk))
    files.append(('Oki-Doki/windows/oki-doki-windows-x64.zip', windows))
    files.append(('Oki-Doki/linux/oki-doki-linux-x64.zip', linux))
    files.append(('Oki-Doki/macos/oki-doki-macos-arm64.zip', mac_arm64))
    files.append(('Oki-Doki/macos/oki-doki-macos-x64.zip', mac_x64))
    model_name = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'
    expected_hash = '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e'
    if local_ai.is_symlink() or not local_ai.is_dir():
        raise ValueError(f'Missing shared local-AI runtime: {local_ai}')
    marker_path = local_ai / '.oki-local-ai-runtime.json'
    if marker_path.is_symlink() or not marker_path.is_file():
        raise ValueError('Missing local-AI runtime marker.')
    marker = json.loads(marker_path.read_text(encoding='utf-8'))
    model = local_ai / 'models' / model_name
    if marker != {'version': 1, 'model': model_name, 'sha256': expected_hash} or model.is_symlink() or not model.is_file() or digest_file(model) != expected_hash:
        raise ValueError('Local-AI model or runtime marker failed verification.')
    for platform, name in (('linux-x64', 'llama-server'), ('win32-x64', 'llama-server.exe'), ('darwin-arm64', 'llama-server'), ('darwin-x64', 'llama-server')):
        runner = local_ai / 'runners' / platform / name
        if runner.is_symlink() or not runner.is_file() or (platform != 'win32-x64' and not os.access(runner, os.X_OK)):
            raise ValueError(f'Local-AI runner missing or not executable: {runner}')
    for folder, dirs, names in os.walk(local_ai, followlinks=False):
        directory = Path(folder)
        for name in dirs:
            if (directory / name).is_symlink():
                raise ValueError(f'Linked local-AI directory: {directory / name}')
        for name in names:
            path = directory / name
            if path.is_symlink() or not path.is_file():
                raise ValueError(f'Invalid local-AI file: {path}')
            files.append(('Oki-Doki/local-ai/' + path.relative_to(local_ai).as_posix(), path))
    for relative in ('package_project.py', 'desktop/main.js', 'desktop/package.json', 'desktop/local-ai.js', 'desktop/LOCAL-AI.md', 'desktop/test_local_ai.cjs', 'desktop/build_local_ai.py', 'desktop/test_build_local_ai.py', 'desktop/build_windows.py', 'desktop/build_linux.py', 'desktop/build_macos.py', 'desktop/test_macos_builder.py'):
        path = ROOT / 'release' / relative
        if path.is_symlink() or not path.is_file():
            raise ValueError(f'Missing release source: {path}')
        files.append(('Oki-Doki/release/' + relative, path))
    return sorted(files)


def voice_note() -> str:
    """Describe only verified included files, never infer complete coverage."""
    manifest = GAME / 'assets' / 'voices' / 'manifest.json'
    if not manifest.is_file():
        return ('No pre-recorded voice pack is included in this package. To hear '
                'scripted lines, configure a compatible speech service. Generated '
                'AI replies also need a service. The creator voice reference has '
                'not been included.')
    if manifest.is_symlink():
        raise ValueError('Voice manifest cannot be a symbolic link.')
    try:
        clips = json.loads(manifest.read_text(encoding='utf-8'))
    except (ValueError, OSError) as error:
        raise ValueError('Voice manifest is unreadable.') from error
    if not isinstance(clips, dict):
        raise ValueError('Voice manifest must be an object.')
    for key, name in clips.items():
        if not isinstance(key, str) or not isinstance(name, str) or not re.fullmatch(r'[0-9a-f]{64}\.mp3', name):
            raise ValueError('Voice manifest has an invalid clip entry.')
        path = manifest.parent / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f'Voice clip is missing or empty: {name}')
    return (f'This package includes {len(clips)} pre-recorded voice entries. '
            'Coverage depends on the included recordings. When no recording matches, '
            'the bundled Kokoro engine can generate speech on supported devices, or '
            'a compatible speech service can be configured. The creator voice '
            'reference has not been included.')


def start_here() -> str:
    return '''OKI DOKI — THE LAST TICKET

This package is a playable work in progress and a local, unpublished site draft.

PLAY ON WINDOWS
Extract windows/oki-doki-windows-x64.zip into the windows folder, then double-click Oki Doki.exe. This is
an unsigned Windows x64 build prepared on Linux and not yet tested on Windows.
Windows may display an unrecognized-app warning. It uses local port 49564.

PLAY ON LINUX
Extract linux/oki-doki-linux-x64.zip into the linux folder, then launch the executable named Oki Doki.
This unsigned x64 build uses local port 49564 and needs a graphical desktop and
Chromium sandbox support. Behavior varies by distribution; see its READ-ME.

MACOS
The macos folder contains prepared app bundles for Apple Silicon (arm64) and
Intel (x64). Extract the selected ZIP into the macos folder. These bundles have
not been run or signed on a Mac, and are not notarized.
macOS may prevent them from launching; see the included READ-ME for next steps.

PLAY IN A BROWSER
1. Extract the entire Oki-Doki folder.
2. Open a terminal in that folder and run:
   python3 -m http.server 8890 --bind 127.0.0.1 --directory site
   On Windows, use: py -3 -m http.server 8890 --bind 127.0.0.1 --directory site
3. Open http://127.0.0.1:8890/ and select Play the prototype.
   If port 8890 is in use, use a different port in both the command and address.
   Stop the server with Ctrl+C. Opening files directly may not work.

ANDROID
android/oki-doki-debug.apk is a debug build, not a Play Store release. Android
emulator checks have passed on earlier builds; physical phone behavior remains
unverified. Install only if you want to test a debug app.

iPHONE / iPAD
The iOS project source is in site/oki-doki-source.zip. It has not been built;
creating and testing an iOS app needs a Mac with Xcode and appropriate signing.

AI AND VOICES
The written story is playable without an AI service. Optional generated dialogue
can use the included local desktop model: extract the desktop archive inside its
platform folder, then choose the local model in AI settings. It takes memory and
may invent details. Speech recognition needs a separately configured service.
This package includes a local Kokoro speech model, tested in desktop Chrome;
its mobile and Windows playback have not yet been verified. API keys and
the creator voice reference are not included. See the game README in
site/oki-doki-source.zip for setup and third-party licences.
''' + voice_note() + '''

SOURCE AND SITE
site/oki-doki-source.zip contains the open-source game and mobile project sources.
site/website-source.zip contains the website source and its license. The site is
not published or connected to a domain by this package. Paid store purchases are
disabled and have not been tested in a store sandbox. release/ contains the
desktop launcher and packaging scripts.
'''


def package(apk: Path, windows: Path, linux: Path, mac_arm64: Path, mac_x64: Path, local_ai: Path, output: Path) -> tuple[int, str]:
    files = collect_inputs(apk, windows, linux, mac_arm64, mac_x64, local_ai)
    output = output.resolve()
    if any(path.resolve() == output for _, path in files):
        raise ValueError('Output cannot replace an input file.')
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.oki-package-', suffix='.zip', dir=output.parent)
    os.close(fd)
    temporary = Path(name)
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            info = zipfile.ZipInfo('Oki-Doki/START-HERE.txt', date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, start_here().encode('utf-8'))
            for name, path in files:
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                executable_runtime = name.startswith('Oki-Doki/local-ai/runners/') and os.access(path, os.X_OK)
                info.external_attr = (0o100755 if executable_runtime else 0o100644) << 16
                # These assets are already compressed; compressing them again
                # wastes time and generally produces no meaningful savings.
                info.compress_type = zipfile.ZIP_STORED if path.suffix.lower() in {'.zip', '.apk', '.png', '.mp3', '.ogg', '.webp', '.gguf'} else zipfile.ZIP_DEFLATED
                with path.open('rb') as source, archive.open(info, 'w', force_zip64=True) as target:
                    for chunk in iter(lambda: source.read(1024 * 1024), b''):
                        target.write(chunk)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError('Package integrity check failed.')
        digest = digest_file(temporary)
        os.replace(temporary, output)
        return len(files) + 1, digest
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', required=True, type=Path, help='Current Android debug APK')
    parser.add_argument('--windows', required=True, type=Path, help='Current Windows portable ZIP')
    parser.add_argument('--linux', required=True, type=Path, help='Current Linux portable ZIP')
    parser.add_argument('--mac-arm64', required=True, type=Path, help='Current Apple Silicon macOS ZIP')
    parser.add_argument('--mac-x64', required=True, type=Path, help='Current Intel macOS ZIP')
    parser.add_argument('--local-ai', required=True, type=Path, help='Verified shared local-AI runtime directory')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT, help='Output ZIP')
    args = parser.parse_args()
    try:
        count, checksum = package(args.apk, args.windows, args.linux, args.mac_arm64, args.mac_x64, args.local_ai, args.output)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f'Packaging failed: {error}\n')
    print(f'Packaged {count} files: {args.output.resolve()}')
    print(f'SHA-256: {checksum}')


if __name__ == '__main__':
    main()
