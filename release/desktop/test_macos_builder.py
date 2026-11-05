#!/usr/bin/env python3
"""Exercise macOS bundle building without requiring a Mac or Electron download."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import plistlib
import stat
import subprocess
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('oki_mac_builder_test', HERE / 'build_macos.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def fixture(binary: Path, target: str) -> None:
    def entry(out, name, contents, mode):
        item = zipfile.ZipInfo(name)
        item.create_system = 3
        item.external_attr = mode << 16
        out.writestr(item, contents)

    with zipfile.ZipFile(binary, 'w') as out:
        entry(out, 'Electron.app/Contents/MacOS/Electron', b'executable', stat.S_IFREG | 0o755)
        entry(out, 'Electron.app/Contents/Info.plist', plistlib.dumps({'CFBundleExecutable': 'Electron'}), stat.S_IFREG | 0o644)
        entry(out, 'Electron.app/Contents/Frameworks/Foo.framework/Versions/A/Foo', b'framework', stat.S_IFREG | 0o755)
        entry(out, 'Electron.app/Contents/Frameworks/Foo.framework/Versions/Current', target.encode(), stat.S_IFLNK | 0o777)
        entry(out, 'Electron.app/Contents/Resources/default_app.asar', b'unwanted', stat.S_IFREG | 0o644)
        entry(out, 'LICENSE', b'license', stat.S_IFREG | 0o644)


with tempfile.TemporaryDirectory(prefix='oki-mac-builder-test-') as root:
    root = Path(root)
    builder.BINARY_DIR = root / 'official'
    builder.BINARY_DIR.mkdir()
    builder.GAME = root / 'game'
    builder.LAUNCHER = root / 'release'
    (builder.GAME / 'src').mkdir(parents=True)
    builder.LAUNCHER.mkdir()
    (builder.GAME / 'src' / 'game.js').write_text('game')
    for name in ('main.js', 'package.json', 'local-ai.js', 'local-asr.js'):
        (builder.LAUNCHER / name).write_text(name)
    builder.web_sources = lambda: [builder.GAME / 'src' / 'game.js']
    binary = builder.BINARY_DIR / 'electron-v44.0.0-darwin-arm64.zip'
    fixture(binary, 'A')
    builder.CHECKSUMS = {'arm64': builder.digest(binary)}
    result = root / 'app.zip'
    builder.build('arm64', result)
    prefix = 'Oki-Doki-macOS-arm64/Oki Doki.app/'
    with zipfile.ZipFile(result) as archive:
        assert prefix + 'Contents/Resources/default_app.asar' not in archive.namelist()
        assert archive.read(prefix + 'Contents/Resources/app/web/src/game.js') == b'game'
        plist = plistlib.loads(archive.read(prefix + 'Contents/Info.plist'))
        assert plist['CFBundleName'] == 'Oki Doki'
        assert plist['CFBundleIdentifier'] == 'io.odlc.okidoki'
        assert plist['NSMicrophoneUsageDescription']
    dest = root / 'extracted'
    subprocess.run(['unzip', '-q', str(result), '-d', str(dest)], check=True)
    app = dest / 'Oki-Doki-macOS-arm64' / 'Oki Doki.app'
    link = app / 'Contents/Frameworks/Foo.framework/Versions/Current'
    assert link.is_symlink() and os.readlink(link) == 'A'
    assert os.access(app / 'Contents/MacOS/Electron', os.X_OK)
    previous = result.read_bytes()
    fixture(binary, '../../../../../escape')
    builder.CHECKSUMS = {'arm64': builder.digest(binary)}
    try:
        builder.build('arm64', result)
    except ValueError as error:
        assert 'Symlink escapes' in str(error)
    else:
        raise AssertionError('Escaping framework symlink was accepted')
    assert result.read_bytes() == previous, 'Failed build replaced a prior artifact'
print('macOS builder: fixture build, extraction, symlinks, modes, metadata and invalid-input rejection passed')
