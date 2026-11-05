#!/usr/bin/env python3
"""Build one self-contained Linux x64 preview, including local dialogue AI."""
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
MODEL = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'
MODEL_SHA256 = '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e'
PREFIX = 'Oki-Doki-Linux/'
STORED = {'.gguf', '.zip', '.png', '.webp', '.ogg', '.mp3'}


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def runtime_sources() -> list[Path]:
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
    runner = RUNTIME / 'runners' / 'linux-x64' / 'llama-server'
    if runner.is_symlink() or not runner.is_file():
        raise ValueError('The Linux local AI runner is missing.')
    paths = []
    for folder, dirs, files in os.walk(RUNTIME, followlinks=False):
        directory = Path(folder)
        dirs[:] = sorted(d for d in dirs if directory != RUNTIME / 'runners' or d == 'linux-x64')
        for name in dirs:
            if (directory / name).is_symlink():
                raise ValueError(f'Linked runtime directory: {directory / name}')
        for name in sorted(files):
            source = directory / name
            if source.is_symlink() or not source.is_file():
                raise ValueError(f'Invalid runtime file: {source}')
            paths.append(source)
    return sorted(paths, key=lambda p: p.relative_to(RUNTIME).as_posix())


def build(destination: Path) -> tuple[int, str]:
    spec = importlib.util.spec_from_file_location('oki_linux_base', ROOT / 'release' / 'desktop' / 'build_linux.py')
    if spec is None or spec.loader is None:
        raise ValueError('Cannot load Linux desktop builder.')
    base_builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(base_builder)
    runtime = runtime_sources()
    asr_spec = importlib.util.spec_from_file_location('oki_linux_asr', ROOT / 'release' / 'desktop' / 'package_local_asr.py')
    if asr_spec is None or asr_spec.loader is None:
        raise ValueError('Cannot load local-ASR packaging.')
    asr = importlib.util.module_from_spec(asr_spec)
    asr_spec.loader.exec_module(asr)
    asr_runtime = asr.sources('linux-x64')
    if set(source.relative_to(RUNTIME).as_posix() for source in runtime) & {rel for _, rel in asr_runtime}:
        raise ValueError('Duplicate local-AI/ASR runtime entry.')
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.linux-release-', dir=destination.parent) as work:
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
            for source in runtime:
                rel = source.relative_to(RUNTIME).as_posix()
                item = zipfile.ZipInfo(PREFIX + 'local-ai/' + rel, date_time=(1980, 1, 1, 0, 0, 0))
                item.create_system, item.external_attr = 3, (0o100755 if os.access(source, os.X_OK) else 0o100644) << 16
                item.compress_type = zipfile.ZIP_STORED if source.suffix.lower() in STORED else zipfile.ZIP_DEFLATED
                with source.open('rb') as reader, out.open(item, 'w', force_zip64=True) as writer:
                    shutil.copyfileobj(reader, writer, 1024 * 1024)
            for source, rel in asr_runtime:
                item = zipfile.ZipInfo(PREFIX + 'local-ai/' + rel, date_time=(1980, 1, 1, 0, 0, 0))
                item.create_system, item.external_attr = 3, (0o100755 if os.access(source, os.X_OK) else 0o100644) << 16
                item.compress_type = zipfile.ZIP_STORED if source.suffix.lower() in STORED else zipfile.ZIP_DEFLATED
                with source.open('rb') as reader, out.open(item, 'w', force_zip64=True) as writer:
                    shutil.copyfileobj(reader, writer, 1024 * 1024)
            out.write(GAME / 'LICENSE', PREFIX + 'LICENSE.txt')
            out.writestr(PREFIX + 'START-HERE.txt', '''OKI DOKI — LINUX PREVIEW

Extract the entire Oki-Doki-Linux folder, then run the executable Oki Doki.
The game requires 64-bit Linux, a graphical desktop, Chromium sandbox support,
and local port 49564. It was tested on Ubuntu 24.04 x64. The included local AI
and transcription need glibc 2.34 or newer, libstdc++ with GLIBCXX 3.4.30,
OpenSSL 3 and the OpenMP runtime (libgomp). Other distributions are untested.
Use an extractor such as unzip that preserves executable permissions. If your
extractor strips those permissions, open a terminal in this extracted folder
and restore the app, its helpers and both included AI runners with:
  chmod +x "Oki Doki" chrome-sandbox chrome_crashpad_handler local-ai/runners/linux-x64/llama-server local-ai/asr-runners/linux-x64/parakeet-cli

The written story and prerecorded voices are included. For optional generated
character dialogue and microphone replies, open AI settings, choose Set up
included AI and microphone, then save the settings for this session. Setup
does not start recording and leaves custom speech services unchanged. The local model loads on your computer,
uses memory and can invent details. Other AI services can also be configured.
The local speech model and original sound effects/music are included; speech
recognition can use the included desktop transcription engine, selected in AI
settings. No creator reference voice is included yet. Third-party model and
runner notices are in local-ai/licenses.
''')
        with zipfile.ZipFile(output) as archive:
            if len(archive.namelist()) != len(set(archive.namelist())) or archive.testzip() is not None:
                raise ValueError('Invalid or duplicate Linux release archive.')
            for name in ('Oki Doki', 'START-HERE.txt', 'resources/app/main.js', 'resources/app/local-ai.js', 'resources/app/local-asr.js'):
                archive.getinfo(PREFIX + name)
            for source in runtime:
                name = PREFIX + 'local-ai/' + source.relative_to(RUNTIME).as_posix()
                with archive.open(name) as stream:
                    if hashlib.file_digest(stream, 'sha256').hexdigest() != sha256(source):
                        raise ValueError(f'Stale runtime entry: {name}')
            for source, rel in asr_runtime:
                name = PREFIX + 'local-ai/' + rel
                with archive.open(name) as stream:
                    if hashlib.file_digest(stream, 'sha256').hexdigest() != sha256(source):
                        raise ValueError(f'Stale ASR entry: {name}')
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
    parser.add_argument('--output', type=Path, default=GAME / 'dist' / 'oki-doki-linux-complete.zip')
    args = parser.parse_args()
    files, checksum = build(args.output)
    print(f'Created {args.output}: {files} files; SHA-256 {checksum}')
