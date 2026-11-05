"""Archive-safety and symlink-preservation checks for the AI runtime builder."""
import io
import importlib.util
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('build_local_ai', Path(__file__).with_name('build_local_ai.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class RuntimeArchiveTest(unittest.TestCase):
    def test_tar_aliases_become_regular_files_and_executable_is_preserved(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t); archive = root / 'fixture.tar.gz'
            with tarfile.open(archive, 'w:gz') as out:
                for name, content in [('llama-server', b'run'), ('libtest.so.1', b'library')]:
                    entry = tarfile.TarInfo('llama-b11852/' + name); entry.size = len(content); entry.mode = 0o755
                    out.addfile(entry, io.BytesIO(content))
                link = tarfile.TarInfo('llama-b11852/libtest.so'); link.type = tarfile.SYMTYPE; link.linkname = 'libtest.so.1'; link.mode = 0o755
                out.addfile(link)
            output = root / 'runner'; builder.unpack_archive(archive, 'linux-x64', output)
            self.assertEqual((output / 'libtest.so').read_bytes(), b'library')
            self.assertFalse((output / 'libtest.so').is_symlink())
            self.assertTrue((output / 'llama-server').stat().st_mode & 0o111)

    def test_archive_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t); archive = root / 'fixture.zip'
            with zipfile.ZipFile(archive, 'w') as out: out.writestr('../escape.dll', 'bad')
            with self.assertRaises(ValueError): builder.unpack_archive(archive, 'win32-x64', root / 'runner')
            self.assertFalse((root.parent / 'escape.dll').exists())


if __name__ == '__main__': unittest.main()
