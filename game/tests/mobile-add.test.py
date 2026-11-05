"""Exercise native add scripts with fake Capacitor, without a device or SDK."""
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

mobile = Path(__file__).resolve().parents[1] / 'mobile'
scripts = json.loads((mobile / 'package.json').read_text())['scripts']
namespace = 'http://schemas.android.com/apk/res/android'

for platform in ('android', 'ios'):
    with tempfile.TemporaryDirectory(prefix='signal-native-add-') as folder:
        root = Path(folder)
        (root / 'tools').mkdir()
        shutil.copy(mobile / 'tools/configure_native.py', root / 'tools/configure_native.py')
        shutil.copy(mobile / 'tools/run_python.mjs', root / 'tools/run_python.mjs')
        (root / 'fixture.xml').write_text(
            f'<manifest xmlns:android="{namespace}"><application android:allowBackup="true"/></manifest>'
        )
        (root / 'fixture.plist').write_bytes(plistlib.dumps({'CFBundleName': 'Fixture'}))
        fake_bin = root / 'bin'
        fake_bin.mkdir()
        npm = fake_bin / 'npm'
        npm.write_text('#!/bin/sh\n[ "$1" = run ] && [ "$2" = stage ]\n')
        cap = fake_bin / 'cap'
        cap.write_text('''#!/bin/sh
set -eu
[ "$1" = add ]
case "$2" in
  android) mkdir -p android/app/src/main; cp fixture.xml android/app/src/main/AndroidManifest.xml ;;
  ios) mkdir -p ios/App/App; cp fixture.plist ios/App/App/Info.plist ;;
  *) exit 1 ;;
esac
''')
        npm.chmod(0o755)
        cap.chmod(0o755)
        env = dict(os.environ, PATH=str(fake_bin) + os.pathsep + os.environ['PATH'])
        subprocess.run(scripts[f'add:{platform}'], shell=True, cwd=root, env=env, check=True)
        if platform == 'android':
            manifest = ET.parse(root / 'android/app/src/main/AndroidManifest.xml').getroot()
            assert manifest.find('application').get(f'{{{namespace}}}allowBackup') == 'false'
            assert manifest.find('application').get(f'{{{namespace}}}networkSecurityConfig') == '@xml/oki_loopback_network'
            policy = ET.parse(root / 'android/app/src/main/res/xml/oki_loopback_network.xml').getroot()
            assert policy.find('base-config').get('cleartextTrafficPermitted') == 'false'
            assert {node.text for node in policy.findall('domain-config/domain')} == {'localhost', '127.0.0.1', '[::1]', '::1'}
            permissions = {item.get(f'{{{namespace}}}name') for item in manifest.findall('uses-permission')}
            assert 'android.permission.RECORD_AUDIO' in permissions
        else:
            info = plistlib.loads((root / 'ios/App/App/Info.plist').read_bytes())
            assert 'NSMicrophoneUsageDescription' in info
            assert 'NSLocalNetworkUsageDescription' in info
            assert info['UIRequiredDeviceCapabilities'] == ['arm64']
print('Both native add scripts configure fresh generated projects.')
