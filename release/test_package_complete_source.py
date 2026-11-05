#!/usr/bin/env python3
"""Focused tests for reproducible and safe complete-source packaging."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).with_name('package_complete_source.py')
spec = importlib.util.spec_from_file_location('complete_source', SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

FAKE_GAME_BUILDER = '''from pathlib import Path
import zipfile
ROOT = Path(__file__).resolve().parents[1]
def sources():
    return [ROOT / 'README.md', ROOT / 'tools/package_source.py']
def build(destination):
    with zipfile.ZipFile(destination, 'w') as z:
        for path in sources():
            info = zipfile.ZipInfo('oki-doki/' + path.relative_to(ROOT).as_posix(), (1980, 1, 1, 0, 0, 0))
            z.writestr(info, path.read_bytes())
'''


class CompleteSourceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        def put(relative, text='content'):
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
            return path
        for name in builder.DESKTOP_FILES:
            put('release/desktop/' + name, name)
        for name in builder.SITE_FILES:
            put('website/' + name, name)
        for name in ('package_project.py', 'package_complete_source.py', 'test_package_complete_source.py'):
            put('release/' + name, name)
        # Reconstructed sources contain the notices next to the build scripts.
        for label, names in builder.NOTICE_FILES.items():
            for name in names:
                put('release/desktop/' + label + '/' + name, name)
        put('game/README.md', 'game readme')
        put('game/tools/package_source.py', FAKE_GAME_BUILDER)

    def test_reproducible_and_self_contained(self):
        first, second = self.root / 'first.zip', self.root / 'second.zip'
        count, digest = builder.build(self.root, first)
        os.utime(self.root / 'website/README.md', (1234567890, 1234567890))
        count2, digest2 = builder.build(self.root, second)
        self.assertEqual((count, digest), (count2, digest2))
        self.assertEqual(first.read_bytes(), second.read_bytes())
        with zipfile.ZipFile(first) as z:
            self.assertIsNone(z.testzip())
            self.assertIn('Oki-Doki-source/release/package_complete_source.py', z.namelist())
            self.assertIn('Oki-Doki-source/release/desktop/windows-static-notices/LLAMA-MIT.txt', z.namelist())
            self.assertIn('Oki-Doki-source/release/desktop/windows-asr-static-notices/PARAKEET-MIT.txt', z.namelist())
            self.assertIn('rename that folder to game/', z.read('Oki-Doki-source/START-HERE.txt').decode())
            with tempfile.TemporaryDirectory() as folder:
                nested = Path(folder) / 'nested.zip'
                nested.write_bytes(z.read('Oki-Doki-source/game-source.zip'))
                with zipfile.ZipFile(nested) as game:
                    self.assertEqual(game.read('oki-doki/README.md'), b'game readme')

    def test_missing_input_preserves_prior_output(self):
        destination = self.root / 'bundle.zip'
        destination.write_bytes(b'previous')
        (self.root / 'website/index.html').unlink()
        with self.assertRaises(ValueError):
            builder.build(self.root, destination)
        self.assertEqual(destination.read_bytes(), b'previous')

    def test_never_overwrites_a_game_source(self):
        readme = self.root / 'game/README.md'
        with self.assertRaises(ValueError):
            builder.build(self.root, readme)
        self.assertEqual(readme.read_text(), 'game readme')

    def test_rejects_symlink_output(self):
        target = self.root / 'target.zip'
        target.write_bytes(b'previous')
        link = self.root / 'link.zip'
        link.symlink_to(target)
        with self.assertRaises(ValueError):
            builder.build(self.root, link)
        self.assertEqual(target.read_bytes(), b'previous')


if __name__ == '__main__':
    unittest.main()
