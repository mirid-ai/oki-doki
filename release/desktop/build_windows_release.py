#!/usr/bin/env python3
"""Build one self-contained Windows x64 preview, including local dialogue AI."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'game'
RUNTIME = GAME / 'dist' / 'local-ai-runtime'
STATIC = GAME / 'dist' / 'windows-static'
STATIC_SHA256 = '068e99429ee2e9d4a831145ce45b5edb4dc2fe170d6d0048ac8fa08a1610a68d'
MODEL = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'
MODEL_SHA256 = '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e'
PREFIX = 'Oki-Doki-Windows/'
STORED = {'.gguf', '.zip', '.png', '.webp', '.ogg', '.mp3'}


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def runtime_sources() -> list[tuple[Path, str]]:
    if RUNTIME.is_symlink() or not RUNTIME.is_dir():
        raise ValueError('Missing managed local AI runtime.')
    marker = RUNTIME / '.oki-local-ai-runtime.json'
    if marker.is_symlink() or not marker.is_file():
        raise ValueError('Missing local AI runtime marker.')
    if json.loads(marker.read_text(encoding='utf-8')) != {'version': 1, 'model': MODEL, 'sha256': MODEL_SHA256}:
        raise ValueError('Invalid local AI runtime marker.')
    model = RUNTIME / 'models' / MODEL
    if model.is_symlink() or not model.is_file() or sha256(model) != MODEL_SHA256:
        raise ValueError('Local AI model failed checksum verification.')
    runner = STATIC / 'llama-server.exe'
    if runner.is_symlink() or not runner.is_file() or sha256(runner) != STATIC_SHA256:
        raise ValueError('The verified static Windows local AI runner is missing or stale.')
    paths = []
    for folder, dirs, files in os.walk(RUNTIME, followlinks=False):
        directory = Path(folder)
        # The standalone build uses only the statically linked runner below.
        dirs[:] = sorted(d for d in dirs if directory != RUNTIME / 'runners')
        for name in dirs:
            if (directory / name).is_symlink():
                raise ValueError(f'Linked runtime directory: {directory / name}')
        for name in sorted(files):
            source = directory / name
            if source.is_symlink() or not source.is_file():
                raise ValueError(f'Invalid runtime file: {source}')
            paths.append((source, source.relative_to(RUNTIME).as_posix()))
    paths.append((runner, 'runners/win32-x64/llama-server.exe'))
    for name in ('BUILD.txt', 'mingw-header-compat.patch', 'LLAMA-MIT.txt', 'MINGW-COPYRIGHT.txt', 'GCC-PACKAGE-COPYRIGHT.txt', 'GCC-RUNTIME-EXCEPTION.txt', 'GPL-3.txt'):
        source = STATIC / 'NOTICES' / name
        if source.is_symlink() or not source.is_file():
            raise ValueError(f'Missing static Windows runner notice: {name}')
        paths.append((source, 'licenses/windows-static/' + name))
    return sorted(paths, key=lambda entry: entry[1])


def build(destination: Path) -> tuple[int, str]:
    spec = importlib.util.spec_from_file_location('oki_windows_base', ROOT / 'release' / 'desktop' / 'build_windows.py')
    if spec is None or spec.loader is None:
        raise ValueError('Cannot load Windows desktop builder.')
    base_builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(base_builder)
    runtime = runtime_sources()
    asr_spec = importlib.util.spec_from_file_location('oki_windows_asr', ROOT / 'release' / 'desktop' / 'package_local_asr.py')
    if asr_spec is None or asr_spec.loader is None:
        raise ValueError('Cannot load local-ASR packaging.')
    asr = importlib.util.module_from_spec(asr_spec)
    asr_spec.loader.exec_module(asr)
    runtime.extend(asr.sources('win32-x64'))
    if len({name for _, name in runtime}) != len(runtime):
        raise ValueError('Duplicate local-AI/ASR runtime entry.')
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.windows-release-', dir=destination.parent) as work:
        work = Path(work)
        base = work / 'base.zip'
        output = work / 'release.zip'
        base_builder.build(base)
        with zipfile.ZipFile(base) as src, zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as out:
            for entry in src.infolist():
                if entry.filename == PREFIX + 'READ-ME.txt':
                    continue
                if not entry.filename.startswith(PREFIX) or entry.is_dir():
                    raise ValueError(f'Invalid base archive entry: {entry.filename}')
                item = zipfile.ZipInfo(entry.filename, date_time=entry.date_time)
                item.create_system, item.external_attr = entry.create_system, entry.external_attr
                item.compress_type = zipfile.ZIP_STORED if Path(entry.filename).suffix.lower() in STORED else zipfile.ZIP_DEFLATED
                with src.open(entry) as reader, out.open(item, 'w', force_zip64=True) as writer:
                    shutil.copyfileobj(reader, writer, 1024 * 1024)
            for source, rel in runtime:
                item = zipfile.ZipInfo(PREFIX + 'local-ai/' + rel, date_time=(1980, 1, 1, 0, 0, 0))
                item.create_system, item.external_attr = 3, 0o100644 << 16
                item.compress_type = zipfile.ZIP_STORED if source.suffix.lower() in STORED else zipfile.ZIP_DEFLATED
                with source.open('rb') as reader, out.open(item, 'w', force_zip64=True) as writer:
                    shutil.copyfileobj(reader, writer, 1024 * 1024)
            out.write(GAME / 'LICENSE', PREFIX + 'LICENSE.txt')
            out.writestr(PREFIX + 'START-HERE.txt', '''OKI DOKI — WINDOWS PREVIEW

Extract the entire Oki-Doki-Windows folder, then double-click Oki Doki.exe.
The game requires 64-bit Windows 10 or later and local port 49564. This unsigned preview
has not yet been tested on Windows; Windows may show a warning when opening it.

The written story and prerecorded voices are included. For optional generated
character dialogue and microphone replies, open AI settings, choose Set up
included AI and microphone, then save the settings for this session. Setup
does not start recording and leaves custom speech services unchanged. The local model loads on your computer,
uses memory and can invent details. Other AI services can also be configured.
The included Windows local AI runner has been tested under Wine with this model;
the complete Windows app has not yet been verified on native Windows.
The local speech model and original sound effects/music are included; speech
recognition can use the included desktop transcription engine, selected in AI
settings. No creator reference voice is included yet. Third-party model and
runner notices are in local-ai/licenses. The included Windows transcription
runner uses standard Windows system libraries.
''')
        with zipfile.ZipFile(output) as archive:
            if len(archive.namelist()) != len(set(archive.namelist())) or archive.testzip() is not None:
                raise ValueError('Invalid or duplicate Windows release archive.')
            for name in ('Oki Doki.exe', 'START-HERE.txt', 'resources/app/main.js', 'resources/app/local-ai.js', 'resources/app/local-asr.js'):
                archive.getinfo(PREFIX + name)
            for source, relative in runtime:
                name = PREFIX + 'local-ai/' + relative
                with archive.open(name) as stream:
                    if hashlib.file_digest(stream, 'sha256').hexdigest() != sha256(source):
                        raise ValueError(f'Stale runtime entry: {name}')
            for source in base_builder.web_sources():
                name = PREFIX + 'resources/app/web/' + source.relative_to(GAME).as_posix()
                with archive.open(name) as stream:
                    if hashlib.file_digest(stream, 'sha256').hexdigest() != sha256(source):
                        raise ValueError(f'Stale game entry: {name}')
            count = len(archive.namelist())
        checksum = sha256(output)
        os.replace(output, destination)
        return count, checksum


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=GAME / 'dist' / 'oki-doki-windows-complete.zip')
    args = parser.parse_args()
    files, checksum = build(args.output)
    print(f'Created {args.output}: {files} files; SHA-256 {checksum}')
