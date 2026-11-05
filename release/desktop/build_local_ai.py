#!/usr/bin/env python3
"""Prepare one shared, optional desktop local-AI runtime without modifying assets.

Requires the official, checksum-verified llama.cpp archives and Qwen GGUF
already downloaded. Produces a managed directory for the unified handoff.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import shutil
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'game'
ASSETS = ROOT / 'Mirid-Local-Assets'
DOWNLOADS = Path('/tmp/oki-local-ai-downloads')
MODEL = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'
MODEL_SHA = '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e'
ARCHIVES = {
    'linux-x64': (ASSETS / 'downloads/llama-b11852-cpu.tar.gz', '6ec84fd5ddf5bee393d27384b9b6acb19a35cbac71b0d22b4d73fc727363fcca'),
    'win32-x64': (DOWNLOADS / 'llama-b11852-bin-win-cpu-x64.zip', '89d28c3d7d810a57524f4c9b13397b2485cbe32937fb302c09c1b04d2a6b3e06'),
    'darwin-arm64': (DOWNLOADS / 'llama-b11852-bin-macos-arm64.tar.gz', 'a02627e81f30e6eb9f72424c5556caf08fb0d018d593698fd0b6b18e1950b4cf'),
    'darwin-x64': (DOWNLOADS / 'llama-b11852-bin-macos-x64.tar.gz', 'db1899be63b05abb9dc44192c7b8e3bd22255f15bb29623edb5d384caa36ce15'),
}
MARKER = '.oki-local-ai-runtime.json'


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def wanted(name, platform):
    if name in ('LICENSE', 'LICENSE-LLVM-OpenMP'):
        return True
    if platform == 'win32-x64':
        return name == 'llama-server.exe' or name.lower().endswith('.dll')
    return name == 'llama-server' or (name.startswith('lib') and ('.so' in name or '.dylib' in name))


def write_file(source, dest, executable=False):
    with dest.open('wb') as target:
        shutil.copyfileobj(source, target, 1024 * 1024)
    dest.chmod(0o755 if executable else 0o644)


def unpack_archive(archive, platform, dest):
    dest.mkdir(parents=True)
    if platform == 'win32-x64':
        with zipfile.ZipFile(archive) as z:
            entries = z.infolist()
            if len({entry.filename for entry in entries}) != len(entries): raise ValueError('Duplicate archive entry')
            for entry in entries:
                p = PurePosixPath(entry.filename)
                if p.is_absolute() or '..' in p.parts or '\\' in entry.filename or len(p.parts) != 1:
                    raise ValueError(f'Invalid archive path: {entry.filename}')
                if not entry.is_dir() and wanted(p.name, platform):
                    with z.open(entry) as src: write_file(src, dest / p.name, p.name == 'llama-server.exe')
    else:
        with tarfile.open(archive, 'r:gz') as z:
            entries = z.getmembers()
            if len({entry.name for entry in entries}) != len(entries): raise ValueError('Duplicate archive entry')
            for entry in entries:
                p = PurePosixPath(entry.name)
                if p.is_absolute() or '..' in p.parts or '\\' in entry.name or not p.parts or p.parts[0] != 'llama-b11852':
                    raise ValueError(f'Invalid archive path: {entry.name}')
                if entry.issym() or entry.islnk():
                    target = entry.linkname
                    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(entry.name), target))
                    if not target or target.startswith('/') or '\\' in target or not resolved.startswith('llama-b11852/'):
                        raise ValueError(f'Invalid archive link: {entry.name}')
                if len(p.parts) != 2 or not wanted(p.name, platform) or entry.isdir(): continue
                if not (entry.isfile() or entry.issym() or entry.islnk()): raise ValueError(f'Invalid archive entry: {entry.name}')
                src = z.extractfile(entry)
                if src is None: raise ValueError(f'Missing archive data: {entry.name}')
                # Resolve safe archive links to regular files so ZIP extraction on
                # Windows, Linux and macOS does not depend on preserving symlinks.
                with src: write_file(src, dest / p.name, bool(entry.mode & 0o111) or p.name == 'llama-server')
    executable = dest / ('llama-server.exe' if platform == 'win32-x64' else 'llama-server')
    if not executable.is_file() or not executable.stat().st_size:
        raise ValueError(f'Missing runner for {platform}')


def build(output):
    output = output.resolve()
    model = ASSETS / 'text-models' / MODEL
    if not model.is_file() or digest(model) != MODEL_SHA: raise ValueError('Missing or checksum-mismatched Qwen model')
    for platform, (archive, expected) in ARCHIVES.items():
        if not archive.is_file() or digest(archive) != expected: raise ValueError(f'Missing or checksum-mismatched {platform} archive')
    output.parent.mkdir(parents=True, exist_ok=True)
    def managed(p):
        return not p.is_symlink() and (not p.exists() or (p.is_dir() and (p / MARKER).is_file() and not (p / MARKER).is_symlink()))
    if not managed(output): raise ValueError('Refusing to replace an unmanaged runtime directory')
    with tempfile.TemporaryDirectory(prefix='.oki-local-ai-', dir=output.parent) as tmp:
        tmp = Path(tmp)
        candidate = tmp / 'local-ai'; candidate.mkdir()
        (candidate / 'models').mkdir()
        shutil.copyfile(model, candidate / 'models' / MODEL)
        if digest(candidate / 'models' / MODEL) != MODEL_SHA: raise ValueError('Copied model does not match')
        for platform, (archive, _) in ARCHIVES.items(): unpack_archive(archive, platform, candidate / 'runners' / platform)
        notices = candidate / 'licenses'; notices.mkdir()
        shutil.copyfile(ASSETS / 'runners/linux-x86_64/cpu/LICENSE', notices / 'llama-cpp-MIT.txt')
        shutil.copyfile(GAME / 'assets/kokoro-local/licenses/kokoro-apache-2.0.txt', notices / 'qwen-apache-2.0.txt')
        llvm = candidate / 'runners/win32-x64/LICENSE-LLVM-OpenMP'
        if not llvm.is_file(): raise ValueError('Windows OpenMP license missing')
        (candidate / 'PROVENANCE.txt').write_text('Qwen2.5-1.5B-Instruct-GGUF Q4_K_M: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/tree/91cad51170dc346986eccefdc2dd33a9da36ead9\nSHA-256: '+MODEL_SHA+'\nApache-2.0; license is in licenses/.\nllama.cpp b11852: https://github.com/ggml-org/llama.cpp/releases/tag/b11852\nMIT; license is in licenses/. Windows OpenMP license is included beside its runner.\n', encoding='utf-8')
        (candidate / MARKER).write_text(json.dumps({'version': 1, 'model': MODEL, 'sha256': MODEL_SHA})+'\n', encoding='utf-8')
        if not managed(output): raise ValueError('Runtime destination changed during build')
        previous = tmp / 'previous'
        existed = output.exists()
        if existed: output.rename(previous)
        try: candidate.rename(output)
        except BaseException:
            if existed: previous.rename(output)
            raise
    return sum(1 for p in output.rglob('*') if p.is_file())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=GAME / 'dist/local-ai-runtime')
    args = parser.parse_args()
    print(f'Prepared {build(args.output)} local-AI files in {args.output}')
