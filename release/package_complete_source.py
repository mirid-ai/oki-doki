#!/usr/bin/env python3
"""Build the complete, reproducible Oki Doki source bundle locally.

Run ``python3 release/package_complete_source.py`` from the project root.
This creates ``game/dist/oki-doki-complete-source.zip`` without publishing it.
The nested game source is built from the current files rather than reusing a
possibly stale artifact. Third-party runtime binaries and models are separate.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'Oki-Doki-source/'
DESKTOP_FILES = (
    'main.js', 'package.json', 'local-ai.js', 'local-asr.js', 'LOCAL-AI.md',
    'build_windows.py', 'build_linux.py', 'build_macos.py',
    'build_windows_release.py', 'build_linux_release.py', 'build_local_ai.py',
    'build_local_asr.py', 'package_local_asr.py', 'test_local_ai.cjs',
    'test_local_asr.cjs', 'test_build_local_ai.py', 'test_macos_builder.py',
)
SITE_FILES = ('index.html', 'site.css', 'desktop-downloads.js', 'desktop-releases.json',
              'preview.py', 'build.py', 'README.md', 'LICENSE')
NOTICE_FILES = {
    'windows-static-notices': ('BUILD.txt', 'GCC-PACKAGE-COPYRIGHT.txt', 'GCC-RUNTIME-EXCEPTION.txt',
                               'GPL-3.txt', 'LLAMA-MIT.txt', 'MINGW-COPYRIGHT.txt', 'mingw-header-compat.patch'),
    'windows-asr-static-notices': ('BUILD.txt', 'DR-WAV-LICENSE.txt', 'GCC-PACKAGE-COPYRIGHT.txt',
                                   'GCC-RUNTIME-EXCEPTION.txt', 'GGML-MIT.txt', 'GPL-3.txt',
                                   'MINGW-COPYRIGHT.txt', 'PARAKEET-MIT.txt', 'mingw-header-compat.patch'),
}
START_HERE = '''Oki Doki — complete source

Extract game-source.zip beside release/ and website/. It extracts as oki-doki/;
rename that folder to game/ to recreate the layout expected by the build tools.
The game README describes running and testing the source. Desktop launcher and
build scripts are in release/desktop; website source is in website/.

The pinned source and build instructions for the Kokoro eSpeak phonemizer are
inside game-source.zip under assets/kokoro-local/source/. The local dialogue and
transcription models and Electron, llama.cpp and Parakeet binaries have separate
licenses and are not included. See release/desktop/LOCAL-AI.md for details.
To rebuild this source bundle from the reconstructed tree, run
python3 release/package_complete_source.py. This does not publish anything.
'''


def regular(path: Path) -> Path:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f'Missing or linked source file: {path}')
    return path


def source_module(root: Path):
    file = regular(root / 'game/tools/package_source.py')
    spec = importlib.util.spec_from_file_location('oki_complete_source_game_builder', file)
    if spec is None or spec.loader is None:
        raise ValueError(f'Cannot load game source builder: {file}')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def inputs(root: Path) -> dict[str, Path]:
    files = {PREFIX + 'release/desktop/' + n: regular(root / 'release/desktop' / n) for n in DESKTOP_FILES}
    files.update({PREFIX + 'website/' + n: regular(root / 'website' / n) for n in SITE_FILES})
    for name in ('package_project.py', 'package_complete_source.py', 'test_package_complete_source.py'):
        files[PREFIX + 'release/' + name] = regular(root / 'release' / name)
    for label, names in NOTICE_FILES.items():
        # On the original build machine use the verified static runtime notices;
        # after source extraction they live alongside the desktop build scripts.
        generated = root / 'game/dist' / ('windows-static' if label == 'windows-static-notices' else 'windows-asr-static') / 'NOTICES'
        extracted = root / 'release/desktop' / label
        folder = generated if generated.is_dir() and not generated.is_symlink() else extracted
        if folder.is_symlink() or not folder.is_dir():
            raise ValueError(f'Missing source notices directory: {folder}')
        for name in names:
            regular(folder / name)
        for path in sorted(folder.iterdir()):
            files[PREFIX + 'release/desktop/' + label + '/' + path.name] = regular(path)
    return files


def add_file(archive: zipfile.ZipFile, name: str, path: Path, *, stored: bool = False) -> None:
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.create_system = 3
    info.external_attr = (0o100644 | (0o111 if os.access(path, os.X_OK) else 0)) << 16
    info.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
    with path.open('rb') as src, archive.open(info, 'w', force_zip64=True) as dst:
        shutil.copyfileobj(src, dst, length=1024 * 1024)


def build(root: Path, destination: Path) -> tuple[int, str]:
    root = root.resolve()
    if destination.is_symlink():
        raise ValueError('Output path must not be a symbolic link.')
    destination = destination.resolve()
    files = inputs(root)
    builder = source_module(root)
    if destination in files.values() or destination in builder.sources():
        raise ValueError('Output path must not overwrite a source file.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.complete-source-', dir=destination.parent) as work:
        workdir = Path(work)
        nested = workdir / 'game-source.zip'
        builder.build(nested)
        output = workdir / 'complete-source.zip'
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=True) as archive:
            add_file(archive, PREFIX + 'game-source.zip', nested, stored=True)
            for name, path in sorted(files.items()):
                add_file(archive, name, path)
            info = zipfile.ZipInfo(PREFIX + 'START-HERE.txt', date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system, info.external_attr, info.compress_type = 3, 0o100644 << 16, zipfile.ZIP_DEFLATED
            archive.writestr(info, START_HERE.encode('utf-8'))
        with zipfile.ZipFile(output) as archive:
            names = archive.namelist()
            if (len(names) != len(set(names)) or
                set(names) != set(files) | {PREFIX + 'game-source.zip', PREFIX + 'START-HERE.txt'} or
                archive.testzip() is not None):
                raise ValueError('Invalid complete-source archive.')
        with output.open('rb') as stream:
            checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        count = len(names)
        os.replace(output, destination)
    return count, checksum


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', nargs='?', type=Path, default=ROOT / 'game/dist/oki-doki-complete-source.zip')
    args = parser.parse_args()
    count, digest = build(ROOT, args.destination)
    print(f'Archived {count} complete-source entries: {args.destination}')
    print(f'SHA-256: {digest}')


if __name__ == '__main__':
    main()
