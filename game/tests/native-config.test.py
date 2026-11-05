"""Verify native permission configuration on disposable manifest fixtures."""
import importlib.util
import json
from pathlib import Path
import plistlib
import tempfile
import xml.etree.ElementTree as ET

source = Path(__file__).resolve().parents[1] / 'mobile/tools/configure_native.py'
spec = importlib.util.spec_from_file_location('native_config', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ns = 'http://schemas.android.com/apk/res/android'
name = f'{{{ns}}}name'
required = f'{{{ns}}}required'

# Native inset handling preserves Capacitor's window padding/passthrough while
# avoiding unused injected CSS variables before the web document exists.
project = Path(__file__).resolve().parents[1]
config = json.loads((project / 'mobile/capacitor.config.json').read_text(encoding='utf-8'))
assert config['plugins']['SystemBars']['insetsHandling'] == 'native'
assert '--safe-area-inset-' not in (project / 'src/style.css').read_text(encoding='utf-8'), 'Native mode does not inject these custom properties'

with tempfile.TemporaryDirectory(prefix='signal-native-test-') as folder:
    root = Path(folder)
    android = root / 'AndroidManifest.xml'
    android.write_text(f'''<manifest xmlns:android="{ns}">
      <uses-permission android:name="android.permission.INTERNET"/>
      <uses-feature android:name="android.hardware.microphone" android:required="true"/>
      <application android:label="Fixture" android:allowBackup="true"/>
    </manifest>''', encoding='utf-8')
    ios = root / 'Info.plist'
    ios.write_bytes(plistlib.dumps({'CFBundleDisplayName': 'Fixture', 'ExistingSetting': True,
                                     'UIRequiredDeviceCapabilities': ['armv7', 'metal'],
                                     'NSAppTransportSecurity': {'NSExceptionDomains': {
                                         'example.org': {'NSIncludesSubdomains': True}}}}))

    module.configure_android(android)
    module.configure_ios(ios)
    first_android = android.read_bytes()
    first_ios = ios.read_bytes()
    module.configure_android(android)
    module.configure_ios(ios)
    assert android.read_bytes() == first_android, 'Android configuration should be idempotent'
    assert ios.read_bytes() == first_ios, 'iOS configuration should be idempotent'

    manifest = ET.parse(android).getroot()
    permissions = [item.get(name) for item in manifest.findall('uses-permission')]
    for permission in ('android.permission.INTERNET', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'):
        assert permissions.count(permission) == 1, permission
    microphone = [item for item in manifest.findall('uses-feature') if item.get(name) == 'android.hardware.microphone']
    assert len(microphone) == 1 and microphone[0].get(required) == 'false'
    assert manifest.find('application').get(f'{{{ns}}}label') == 'Fixture'
    assert manifest.find('application').get(f'{{{ns}}}allowBackup') == 'false', 'Regeneration should preserve the backup opt-out'
    assert manifest.find('application').get(f'{{{ns}}}networkSecurityConfig') == '@xml/oki_loopback_network'
    policy = ET.parse(root / 'res/xml/oki_loopback_network.xml').getroot()
    assert policy.find('base-config').get('cleartextTrafficPermitted') == 'false'
    domains = policy.findall('domain-config')
    assert len(domains) == 1 and domains[0].get('cleartextTrafficPermitted') == 'true'
    assert {item.text for item in domains[0].findall('domain')} == {'localhost', '127.0.0.1', '[::1]', '::1'}
    assert all(item.get('includeSubdomains') == 'false' for item in domains[0].findall('domain'))
    actual_android = source.parents[1] / 'android/app/src/main/AndroidManifest.xml'
    actual_application = ET.parse(actual_android).getroot().find('application')
    assert actual_application.get(f'{{{ns}}}networkSecurityConfig') == '@xml/oki_loopback_network'
    actual_resource = actual_android.parent / 'res/xml/oki_loopback_network.xml'
    assert actual_resource.read_text(encoding='utf-8') == module.LOOPBACK_NETWORK_CONFIG

    # Do not silently replace a native developer's existing network policy.
    android.write_text(f'<manifest xmlns:android="{ns}"><application android:networkSecurityConfig="@xml/custom_policy"/></manifest>', encoding='utf-8')
    try:
        module.configure_android(android)
        raise AssertionError('Custom network policies must not be silently replaced')
    except ValueError as exc:
        assert 'custom network security configuration' in str(exc)
    assert '@xml/custom_policy' in android.read_text(encoding='utf-8')
    android.write_text(f'<manifest xmlns:android="{ns}"><application android:networkSecurityConfig="@xml/oki_loopback_network"/></manifest>', encoding='utf-8')
    resource = root / 'res/xml/oki_loopback_network.xml'
    resource.write_text('<network-security-config/>', encoding='utf-8')
    try:
        module.configure_android(android)
        raise AssertionError('A modified loopback policy must not be silently replaced')
    except ValueError as exc:
        assert 'loopback network configuration was modified' in str(exc)
    assert resource.read_text(encoding='utf-8') == '<network-security-config/>'

    plist = plistlib.loads(ios.read_bytes())
    assert plist['CFBundleDisplayName'] == 'Fixture' and plist['ExistingSetting'] is True
    assert 'spoken reply' in plist['NSMicrophoneUsageDescription']
    assert 'desktop Mirid companion' in plist['NSLocalNetworkUsageDescription']
    assert plist['UIRequiredDeviceCapabilities'] == ['metal', 'arm64']
    ats = plist['NSAppTransportSecurity']
    assert 'NSAllowsArbitraryLoads' not in ats and 'NSAllowsLocalNetworking' not in ats
    assert ats['NSExceptionDomains'] == {
        '127.0.0.1': {'NSExceptionAllowsInsecureHTTPLoads': True},
        '::1': {'NSExceptionAllowsInsecureHTTPLoads': True},
        'example.org': {'NSIncludesSubdomains': True},
    }
    # Preserve explicit policy decisions instead of silently weakening them.
    ios.write_bytes(plistlib.dumps({'NSAppTransportSecurity': {'NSExceptionDomains': {
        '127.0.0.1': {'NSExceptionAllowsInsecureHTTPLoads': False}}}}))
    try:
        module.configure_ios(ios)
        raise AssertionError('An explicit ATS restriction must not be silently changed')
    except ValueError as exc:
        assert 'explicitly forbids HTTP' in str(exc)
    assert not plistlib.loads(ios.read_bytes())['NSAppTransportSecurity']['NSExceptionDomains']['127.0.0.1']['NSExceptionAllowsInsecureHTTPLoads']
    # Dictionary-style capability declarations must preserve other entries.
    ios.write_bytes(plistlib.dumps({'UIRequiredDeviceCapabilities': {'armv7': True, 'metal': True}}))
    module.configure_ios(ios)
    assert plistlib.loads(ios.read_bytes())['UIRequiredDeviceCapabilities'] == {'arm64': True, 'metal': True}
    actual = Path(__file__).resolve().parents[1] / 'mobile/ios/App/App/Info.plist'
    actual_plist = plistlib.loads(actual.read_bytes())
    assert actual_plist['UIRequiredDeviceCapabilities'] == ['arm64']
    assert actual_plist['NSAppTransportSecurity']['NSExceptionDomains'] == {
        '127.0.0.1': {'NSExceptionAllowsInsecureHTTPLoads': True},
        '::1': {'NSExceptionAllowsInsecureHTTPLoads': True},
    }
print('Native permissions, optional microphone and Android backup opt-out are idempotent.')
