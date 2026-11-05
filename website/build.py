#!/usr/bin/env python3
"""Build the local Oki Doki site and bundle the sibling web game.

The generated directory is replaced atomically only when it has our marker.
"""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import zipfile
from urllib.parse import urlsplit

SITE = Path(__file__).resolve().parent
GAME = SITE.parent / 'game'
OUTPUT = SITE / 'dist'
MARKER = '.oki-site-generated'
SITE_SOURCES = ('index.html', 'site.css', 'desktop-downloads.js', 'desktop-releases.json', 'preview.py', 'build.py', 'README.md', 'LICENSE')


def release_links():
    path = SITE / 'desktop-releases.json'
    if path.is_symlink() or not path.is_file():
        raise ValueError('Missing desktop release configuration.')
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or not {'windows', 'linux'}.issubset(data) or set(data) - {'windows', 'linux', 'source'}:
        raise ValueError('Release configuration must contain windows and linux, with optional source.')
    for name, value in data.items():
        if value is None:
            continue
        if not isinstance(value, str) or value != value.strip() or len(value) > 2048 or any(c.isspace() or ord(c) < 32 for c in value):
            raise ValueError(f'Invalid {name} release URL.')
        url = urlsplit(value)
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.fragment:
            raise ValueError(f'{name} release URL must be an HTTPS URL without credentials or a fragment.')
    return data


def load_game_tool(name: str):
    path = GAME / 'tools' / f'{name}.py'
    if not path.is_file() or path.is_symlink():
        raise ValueError(f'Missing game packaging tool: {path}')
    spec = importlib.util.spec_from_file_location('oki_game_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def managed(path: Path) -> bool:
    return not path.is_symlink() and (not path.exists() or
        (path.is_dir() and (path / MARKER).is_file() and not (path / MARKER).is_symlink()))


def build():
    release_links()
    if not managed(OUTPUT):
        raise ValueError(f'Refusing to replace an unmanaged output directory: {OUTPUT}')
    web = load_game_tool('package_web')
    with tempfile.TemporaryDirectory(prefix='.oki-site-stage-', dir=SITE) as temp:
        temp = Path(temp)
        candidate = temp / 'candidate'
        candidate.mkdir()
        for name in ('index.html', 'site.css', 'desktop-downloads.js', 'desktop-releases.json'):
            path = SITE / name
            if not path.is_file() or path.is_symlink():
                raise ValueError(f'Missing or linked site file: {path}')
            shutil.copy2(path, candidate / name)
        count = 0
        for source_path in web.sources():
            dest = candidate / 'play' / source_path.relative_to(GAME)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, dest)
            count += 1
        with zipfile.ZipFile(candidate / 'website-source.zip', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name in SITE_SOURCES:
                archive.write(SITE / name, 'website/' + name)
        # The build already contains static files. Avoid Jekyll processing and
        # keep the game-only archive (over GitHub's Git file limit) out of it.
        (candidate / '.nojekyll').touch()
        (candidate / MARKER).touch()
        if not managed(OUTPUT):
            raise ValueError(f'Output changed during build: {OUTPUT}')
        previous = temp / 'previous'
        existed = OUTPUT.exists()
        if existed:
            OUTPUT.rename(previous)
        try:
            candidate.rename(OUTPUT)
        except BaseException:
            if existed:
                previous.rename(OUTPUT)
            raise
    print(f'Built {OUTPUT} with {count} game web files and the website source archive.')


if __name__ == '__main__':
    try:
        build()
    except (OSError, ValueError) as error:
        sys.exit(str(error))
