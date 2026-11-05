#!/usr/bin/env python3
"""Prepare an optional Parakeet CLI runtime with one CC-BY-4.0 speech model."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'game/dist/local-asr-runtime'
MODEL = 'tdt_ctc-110m-q4_k.gguf'
MODEL_SHA = '2d1d90edac07326b20a896440628c50323530cf28c7e7ca99d439bad1dee9abf'
ASSETS = ROOT / 'Mirid-Local-Assets/speech/parakeet'
DOWNLOADS = Path('/tmp/oki-asr-releases')
ARCHIVES = {
 'linux-x64': (ASSETS / 'parakeet-release.tar.gz', 'cce60d122ab72e1068cd0d164e54a21655a0b83f1b9c21befc20124f5a972c10', 'parakeet-v0.6.1-bin-linux-cpu-x64/parakeet-cli'),
 'darwin-x64': (DOWNLOADS / 'parakeet-v0.6.1-bin-macos-cpu-x64.tar.gz', '82392069ea091c896dcf86fb5d86f20d107c71f6bad4b9e79a114523d98fb643', 'parakeet-v0.6.1-bin-macos-cpu-x64/parakeet-cli'),
 'darwin-arm64': (DOWNLOADS / 'parakeet-v0.6.1-bin-macos-metal-arm64.tar.gz', 'bc97b5e6253e928d1127f48f08242324317495ef8708e31db1e09b9537d1bb74', 'parakeet-v0.6.1-bin-macos-metal-arm64/parakeet-cli'),
 'win32-x64': (DOWNLOADS / 'parakeet-v0.6.1-bin-win-cpu-x64.zip', 'd74b4e857f75f91ae215c5e91ec42bf15ec84ed3a369423c134dbd6422243ed8', 'parakeet-v0.6.1-bin-win-cpu-x64/parakeet-cli.exe'),
}
MARKER = '.oki-local-asr-runtime.json'

def sha(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()

def managed(path):
    return not path.is_symlink() and (not path.exists() or (path.is_dir() and (path / MARKER).is_file() and not (path / MARKER).is_symlink()))

def build():
    if not managed(OUTPUT): raise ValueError('Refusing to replace an unmanaged ASR directory.')
    model = ASSETS / 'models' / MODEL
    if not model.is_file() or sha(model) != MODEL_SHA: raise ValueError('Parakeet model is missing or checksum mismatched.')
    for archive, expected, _ in ARCHIVES.values():
        if not archive.is_file() or sha(archive) != expected: raise ValueError(f'Archive missing or checksum mismatched: {archive}')
    license_file = DOWNLOADS / 'CC-BY-4.0.txt'
    if not license_file.is_file() or license_file.stat().st_size < 10000: raise ValueError('CC-BY-4.0 licence text is missing.')
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.local-asr-', dir=OUTPUT.parent) as temporary:
        base = Path(temporary); candidate = base / 'candidate'; candidate.mkdir()
        (candidate / 'asr-models').mkdir(); (candidate / 'licenses').mkdir(); (candidate / 'asr-runners').mkdir()
        shutil.copyfile(model, candidate / 'asr-models' / MODEL)
        shutil.copyfile(ASSETS / 'runner' / 'LICENSE', candidate / 'licenses' / 'parakeet-cpp-MIT.txt')
        shutil.copyfile(license_file, candidate / 'licenses' / 'parakeet-model-CC-BY-4.0.txt')
        for platform, (archive, _, member) in ARCHIVES.items():
            target_dir = candidate / 'asr-runners' / platform; target_dir.mkdir()
            target = target_dir / Path(member).name
            if archive.suffix == '.zip':
                with zipfile.ZipFile(archive) as z, z.open(member) as src, target.open('wb') as dst: shutil.copyfileobj(src, dst)
            else:
                with tarfile.open(archive) as z:
                    item = z.getmember(member)
                    if not item.isfile(): raise ValueError('Runner must be an ordinary file.')
                    with z.extractfile(item) as src, target.open('wb') as dst: shutil.copyfileobj(src, dst)
            target.chmod(0o755 if platform != 'win32-x64' else 0o644)
        (candidate / 'ASR-PROVENANCE.txt').write_text('NVIDIA and Suno parakeet-tdt_ctc-110m; CC-BY-4.0: https://huggingface.co/nvidia/parakeet-tdt_ctc-110m\nGGUF conversion by mudler: https://huggingface.co/mudler/parakeet-cpp-gguf/tree/07a08a3a405d20c5434b9a1442f6e6cf571f57ad\nQuantized Q4_K; SHA-256 '+MODEL_SHA+'\nparakeet.cpp v0.6.1, MIT: https://github.com/mudler/parakeet.cpp/releases/tag/v0.6.1\n', encoding='utf-8')
        (candidate / MARKER).write_text(json.dumps({'version': 1, 'model': MODEL, 'sha256': MODEL_SHA})+'\n', encoding='utf-8')
        if not managed(OUTPUT): raise ValueError('ASR destination changed during build.')
        previous = base / 'previous'
        if OUTPUT.exists(): OUTPUT.rename(previous)
        try: candidate.rename(OUTPUT)
        except BaseException:
            if previous.exists(): previous.rename(OUTPUT)
            raise
    return OUTPUT

if __name__ == '__main__': print('Prepared', build())
