"""Collect and verify the local transcription assets for desktop packages."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / 'game' / 'dist' / 'local-asr-runtime'
MODEL = 'tdt_ctc-110m-q4_k.gguf'
MODEL_SHA = '2d1d90edac07326b20a896440628c50323530cf28c7e7ca99d439bad1dee9abf'
WINDOWS_STATIC = ROOT / 'game' / 'dist' / 'windows-asr-static'
WINDOWS_STATIC_SHA = '98932ae0e512c0c5756018ec2b932b118ffb28658a361581185210c935d7056f'


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def sources(platform: str) -> list[tuple[Path, str]]:
    if platform not in ('linux-x64', 'win32-x64'):
        raise ValueError('Unsupported local-ASR desktop platform.')
    if RUNTIME.is_symlink() or not RUNTIME.is_dir():
        raise ValueError('Missing local-ASR runtime.')
    marker = RUNTIME / '.oki-local-asr-runtime.json'
    model = RUNTIME / 'asr-models' / MODEL
    if (marker.is_symlink() or not marker.is_file() or
        json.loads(marker.read_text(encoding='utf-8')) != {'version': 1, 'model': MODEL, 'sha256': MODEL_SHA} or
        model.is_symlink() or not model.is_file() or digest(model) != MODEL_SHA):
        raise ValueError('Local-ASR model or marker failed verification.')
    runner_name = 'parakeet-cli.exe' if platform == 'win32-x64' else 'parakeet-cli'
    runner = WINDOWS_STATIC / runner_name if platform == 'win32-x64' else RUNTIME / 'asr-runners' / platform / runner_name
    if runner.is_symlink() or not runner.is_file() or (platform == 'linux-x64' and not os.access(runner, os.X_OK)):
        raise ValueError('Missing executable local-ASR runner.')
    if platform == 'win32-x64' and digest(runner) != WINDOWS_STATIC_SHA:
        raise ValueError('Static Windows local-ASR runner failed verification.')
    files = []
    for folder, dirs, names in os.walk(RUNTIME, followlinks=False):
        directory = Path(folder)
        dirs[:] = sorted(d for d in dirs if directory != RUNTIME / 'asr-runners' or (platform != 'win32-x64' and d == platform))
        for name in dirs:
            if (directory / name).is_symlink():
                raise ValueError('Linked local-ASR directory.')
        for name in sorted(names):
            path = directory / name
            if path.is_symlink() or not path.is_file():
                raise ValueError('Invalid local-ASR file.')
            files.append((path, path.relative_to(RUNTIME).as_posix()))
    if platform == 'win32-x64':
        files.append((runner, 'asr-runners/win32-x64/parakeet-cli.exe'))
        notice_dir = WINDOWS_STATIC / 'NOTICES'
        if notice_dir.is_symlink() or not notice_dir.is_dir():
            raise ValueError('Missing Windows local-ASR build notices.')
        required = {'BUILD.txt', 'mingw-header-compat.patch', 'PARAKEET-MIT.txt', 'GGML-MIT.txt', 'DR-WAV-LICENSE.txt',
                    'MINGW-COPYRIGHT.txt', 'GCC-PACKAGE-COPYRIGHT.txt', 'GCC-RUNTIME-EXCEPTION.txt', 'GPL-3.txt'}
        if not required.issubset({path.name for path in notice_dir.iterdir()}):
            raise ValueError('Incomplete Windows local-ASR build notices.')
        for path in sorted(notice_dir.iterdir()):
            if path.is_symlink() or not path.is_file():
                raise ValueError(f'Invalid Windows local-ASR build notice: {path.name}')
            files.append((path, 'licenses/windows-asr-static/' + path.name))
    return sorted(files, key=lambda item: item[1])
