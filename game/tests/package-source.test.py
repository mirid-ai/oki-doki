#!/usr/bin/env python3
"""Check reproducibility and essential source-archive boundaries."""
from pathlib import Path
import hashlib
import importlib.util
import re
import sys
import tempfile
import zipfile

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_source', root / 'tools/package_source.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='okie-package-test-') as folder:
    first = Path(folder) / 'first.zip'
    second = Path(folder) / 'second.zip'
    first_count, first_digest = module.build(first)
    second_count, second_digest = module.build(second)
    assert first_count == second_count and first_digest == second_digest
    assert hashlib.sha256(first.read_bytes()).hexdigest() == first_digest
    with zipfile.ZipFile(first) as archive:
        assert archive.testzip() is None
        names = set(archive.namelist())
        for required in ['LICENSE', 'README.md', 'PUBLICITY.md', 'index.html', 'manifest.webmanifest', 'sw.js',
                         'src/story-next.js', 'src/app.js', 'src/voice-cues.js', 'src/ai.js', 'src/speech.js',
                         'assets/arcade.png', 'assets/hideout.png', 'assets/niko.png', 'assets/mira.png',
                         'assets/ash.png', 'assets/mallow.png', 'assets/screen-signal-star.svg',
                         'assets/screen-signal-bell.svg', 'assets/screen-signal-ribbon.svg',
                         'voice-service/README.md', 'companion/gateway.mjs', 'mobile/package-lock.json',
                         'mobile/android/app/src/main/AndroidManifest.xml',
                         'mobile/android/app/src/androidTest/java/com/aftersignal/prototype/GameLaunchInstrumentedTest.java',
                         'mobile/ios/App/App/Info.plist']:
            assert 'oki-doki/' + required in names, required
        # The fixed offline shell is the current playable game. Ensure every
        # listed source asset is present and unchanged in the public archive.
        worker = (root / 'sw.js').read_text()
        shell = worker.split('const STATIC_FILES = [', 1)[1].split('];', 1)[0]
        cached_paths = re.findall(r"'\./([^']+)'", shell)
        assert 'src/story-next.js' in cached_paths and 'assets/arcade.png' in cached_paths
        for relative in cached_paths:
            assert 'oki-doki/' + relative in names, relative
            assert archive.read('oki-doki/' + relative) == (root / relative).read_bytes(), relative
        for forbidden in ['/node_modules/', '/.gradle/', '/__pycache__/', '/dist/',
                          '/mobile/www/', '/android/app/src/main/assets/public/', '/ios/App/App/public/']:
            assert not any(forbidden in '/' + name for name in names), forbidden
        assert len(names) == first_count
    # The optional local voice setup creates these directories beside the
    # game. They are installed dependencies, not redistributable game source.
    example = Path(folder) / 'fixture'
    example.mkdir()
    (example / 'README.md').write_text('game')
    for directory in ['.venv', '.venv-nano', 'chatterbox-upstream']:
        (example / directory).mkdir()
        (example / directory / 'installed-file').write_text('dependency')
    private_debug = example / 'mobile/android/app/src/debug/res/xml/oki_loopback_network.xml'
    private_debug.parent.mkdir(parents=True)
    private_debug.write_text('locally opted-in user CA policy')
    main_policy = example / 'mobile/android/app/src/main/res/xml/oki_loopback_network.xml'
    main_policy.parent.mkdir(parents=True)
    main_policy.write_text('normal policy')
    original_root = module.ROOT
    try:
        module.ROOT = example
        assert [p.relative_to(example).as_posix() for p in module.sources()] == [
            'README.md', 'mobile/android/app/src/main/res/xml/oki_loopback_network.xml']
    finally:
        module.ROOT = original_root
print('Source archive is reproducible, intact and excludes installed dependencies and build output.')
