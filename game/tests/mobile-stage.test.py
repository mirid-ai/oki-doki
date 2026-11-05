"""Check Capacitor staging in a disposable fixture, not the real www directory."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

source = Path(__file__).resolve().parents[1] / 'mobile/tools/stage.py'
with tempfile.TemporaryDirectory(prefix='signal-stage-test-') as folder:
    game = Path(folder) / 'game'
    tools = game / 'mobile/tools'
    tools.mkdir(parents=True)
    shutil.copy2(source, tools / 'stage.py')
    for name in ('index.html', 'manifest.webmanifest', 'sw.js'):
        (game / name).write_text(name, encoding='utf-8')
    for name in ('src', 'assets'):
        (game / name).mkdir()
        (game / name / 'fixture').write_text(name, encoding='utf-8')
    stage = tools / 'stage.py'
    output = game / 'mobile/www'
    subprocess.run([sys.executable, str(stage)], check=True, capture_output=True, text=True)
    for name in ('index.html', 'manifest.webmanifest', 'sw.js', 'src/fixture', 'assets/fixture', '.after-signal-generated'):
        assert (output / name).is_file(), name
    (game / 'sw.js').write_text('new worker', encoding='utf-8')
    subprocess.run([sys.executable, str(stage)], check=True, capture_output=True, text=True)
    assert (output / 'sw.js').read_text(encoding='utf-8') == 'new worker'
    # A missing required input must not destroy the previous complete bundle.
    (output / 'last-good').write_text('preserved', encoding='utf-8')
    (game / 'sw.js').unlink()
    missing = subprocess.run([sys.executable, str(stage)], capture_output=True, text=True)
    assert missing.returncode != 0
    assert (output / 'sw.js').read_text(encoding='utf-8') == 'new worker'
    assert (output / 'last-good').read_text(encoding='utf-8') == 'preserved'
    assert (output / '.after-signal-generated').is_file()
    (game / 'sw.js').write_text('restored worker', encoding='utf-8')
    # An input-tree failure after the shell was copied has the same guarantee.
    shutil.rmtree(game / 'assets')
    missing_tree = subprocess.run([sys.executable, str(stage)], capture_output=True, text=True)
    assert missing_tree.returncode != 0
    assert (output / 'sw.js').read_text(encoding='utf-8') == 'new worker'
    assert (output / 'last-good').read_text(encoding='utf-8') == 'preserved'
    (game / 'assets').mkdir()
    (game / 'assets/fixture').write_text('assets', encoding='utf-8')
    subprocess.run([sys.executable, str(stage)], check=True, capture_output=True, text=True)
    assert (output / 'sw.js').read_text(encoding='utf-8') == 'restored worker'
    assert not (output / 'last-good').exists()
    # Simulate a failed final rename after the previous bundle was moved aside.
    (output / 'last-good').write_text('rollback', encoding='utf-8')
    rename_failure = '''
import runpy, sys
from pathlib import Path
original = Path.rename
def fail_candidate(self, target):
    if self.name == 'candidate':
        raise OSError('simulated destination failure')
    return original(self, target)
Path.rename = fail_candidate
runpy.run_path(sys.argv[1], run_name='__main__')
'''
    failed_rename = subprocess.run([sys.executable, '-c', rename_failure, str(stage)], capture_output=True, text=True)
    assert failed_rename.returncode != 0
    assert (output / 'last-good').read_text(encoding='utf-8') == 'rollback'
    assert (output / 'sw.js').read_text(encoding='utf-8') == 'restored worker'
    (output / '.after-signal-generated').unlink()
    (output / 'keep').write_text('unmanaged', encoding='utf-8')
    refused = subprocess.run([sys.executable, str(stage)], capture_output=True, text=True)
    assert refused.returncode != 0
    assert (output / 'keep').read_text(encoding='utf-8') == 'unmanaged'
    # A symlink pretending to be the generated marker must not make an
    # unmanaged directory eligible for replacement.
    marker_target = game / 'external-marker'
    marker_target.write_text('not a generated marker', encoding='utf-8')
    try:
        (output / '.after-signal-generated').symlink_to(marker_target)
    except (OSError, NotImplementedError):
        pass  # Creating symlinks may require privileges on Windows.
    else:
        refused_marker = subprocess.run([sys.executable, str(stage)], capture_output=True, text=True)
        assert refused_marker.returncode != 0
        assert (output / 'keep').read_text(encoding='utf-8') == 'unmanaged'
print('Capacitor staging preserves a complete previous bundle on copy errors and protects unmanaged directories.')
