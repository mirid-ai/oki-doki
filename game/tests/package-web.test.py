#!/usr/bin/env python3
"""Check that the standalone web archive is complete and reproducible."""
from pathlib import Path
import importlib.util
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_web', root / 'tools/package_web.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='oki-web-package-') as folder:
    first, second = Path(folder) / 'first.zip', Path(folder) / 'second.zip'
    count, digest = module.build(first)
    assert module.build(second) == (count, digest), 'web archive must be reproducible'
    with zipfile.ZipFile(first) as archive:
        assert archive.testzip() is None
        names = set(archive.namelist())
        expected = {p.relative_to(root).as_posix() for p in module.sources()}
        assert names == expected and len(names) == count
        for name in names:
            assert archive.read(name) == (root / name).read_bytes(), name
        for name in ('index.html', 'sw.js', 'manifest.webmanifest', 'src/app.js',
                     'src/story-next.js', 'assets/arcade.png', 'assets/mallow.png'):
            assert name in names, name
        assert not any(name.startswith(('mobile/', 'companion/', 'voice-service/', 'tests/')) for name in names)
print('Web archive is reproducible and matches the complete staged web source.')
