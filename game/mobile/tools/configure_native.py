#!/usr/bin/env python3
"""Apply minimal native permissions to generated Capacitor projects, idempotently."""
from pathlib import Path
import plistlib
import sys
import xml.etree.ElementTree as ET

MOBILE = Path(__file__).resolve().parent.parent
ANDROID = MOBILE / 'android/app/src/main/AndroidManifest.xml'
IOS = MOBILE / 'ios/App/App/Info.plist'
NS = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', NS)

# The game accepts HTTP only for these same-device addresses.  Android 9–16
# otherwise blocks them for an app targeting API 28+, even when a local model
# is running on the device.  No subdomains or LAN addresses are included.
NETWORK_CONFIG_REFERENCE = '@xml/oki_loopback_network'
LOOPBACK_NETWORK_CONFIG = '''<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">[::1]</domain>
        <domain includeSubdomains="false">::1</domain>
    </domain-config>
</network-security-config>
'''


def configure_android(path):
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True))
    tree = ET.parse(path, parser=parser)
    root = tree.getroot()
    if root.tag != 'manifest':
        raise ValueError('Unexpected Android manifest format')
    # Preserve this project's existing backup opt-out when starting again from
    # Capacitor's template, whose default enables automatic backup.
    application = root.find('application')
    if application is not None:
        application.set(f'{{{NS}}}allowBackup', 'false')
        # Do not silently replace a native project's custom network policy.
        config_attr = f'{{{NS}}}networkSecurityConfig'
        existing_config = application.get(config_attr)
        if existing_config not in (None, NETWORK_CONFIG_REFERENCE):
            raise ValueError('Android manifest has a custom network security configuration; merge the loopback policy manually')
        resource = path.parent / 'res/xml/oki_loopback_network.xml'
        if resource.exists() and resource.read_text(encoding='utf-8') != LOOPBACK_NETWORK_CONFIG:
            raise ValueError('Android loopback network configuration was modified; merge changes manually')
        resource.parent.mkdir(parents=True, exist_ok=True)
        if not resource.exists():
            resource.write_text(LOOPBACK_NETWORK_CONFIG, encoding='utf-8')
        application.set(config_attr, NETWORK_CONFIG_REFERENCE)
    attr = f'{{{NS}}}name'
    existing = {item.get(attr) for item in root.findall('uses-permission')}
    for permission in ('android.permission.INTERNET', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'):
        if permission not in existing:
            element = ET.Element('uses-permission', {attr: permission})
            application = root.find('application')
            root.insert(list(root).index(application) if application is not None else len(root), element)
    # Voice input is optional; don't let the microphone permission imply that
    # devices without microphone hardware cannot install the text-only game.
    microphone = next((item for item in root.findall('uses-feature')
                       if item.get(attr) == 'android.hardware.microphone'), None)
    if microphone is None:
        microphone = ET.Element('uses-feature', {attr: 'android.hardware.microphone'})
        application = root.find('application')
        root.insert(list(root).index(application) if application is not None else len(root), microphone)
    microphone.set(f'{{{NS}}}required', 'false')
    tree.write(path, encoding='utf-8', xml_declaration=True)


def configure_ios(path):
    with path.open('rb') as source:
        data = plistlib.load(source)
    if not isinstance(data, dict):
        raise ValueError('Unexpected iOS Info.plist format')
    # Capacitor's generated plist can retain an armv7 requirement even though
    # this project targets iOS 15+, whose device builds are 64-bit. Keep other
    # declared capabilities intact while declaring the actual architecture.
    capabilities = data.get('UIRequiredDeviceCapabilities', [])
    if isinstance(capabilities, list):
        capabilities = [item for item in capabilities if item != 'armv7']
        if 'arm64' not in capabilities:
            capabilities.append('arm64')
    elif isinstance(capabilities, dict):
        capabilities = dict(capabilities)
        capabilities.pop('armv7', None)
        capabilities['arm64'] = True
    else:
        raise ValueError('Unexpected iOS required device capabilities')
    data['UIRequiredDeviceCapabilities'] = capabilities
    data['NSMicrophoneUsageDescription'] = 'Record a spoken reply when you choose to use voice input.'
    data['NSLocalNetworkUsageDescription'] = 'Connect to your desktop Mirid companion when you choose to use it.'
    # iOS 17+ ATS blocks HTTP to IP addresses by default. Allow only the
    # same-device IPs accepted by the web adapters; retain any other policy
    # and refuse to silently weaken an existing entry for either address.
    ats = data.setdefault('NSAppTransportSecurity', {})
    if not isinstance(ats, dict):
        raise ValueError('Unexpected iOS App Transport Security configuration')
    domains = ats.setdefault('NSExceptionDomains', {})
    if not isinstance(domains, dict):
        raise ValueError('Unexpected iOS App Transport Security exception domains')
    for address in ('127.0.0.1', '::1'):
        entry = domains.setdefault(address, {})
        if not isinstance(entry, dict):
            raise ValueError(f'Unexpected iOS App Transport Security exception for {address}')
        if entry.get('NSExceptionAllowsInsecureHTTPLoads', True) is not True:
            raise ValueError(f'iOS App Transport Security explicitly forbids HTTP for {address}; merge manually')
        entry['NSExceptionAllowsInsecureHTTPLoads'] = True
    with path.open('wb') as destination:
        plistlib.dump(data, destination, sort_keys=False)


def main():
    found = False
    for label, path, configure in (('Android', ANDROID, configure_android), ('iOS', IOS, configure_ios)):
        if path.is_file():
            configure(path)
            print(f'Configured {label} microphone permission: {path}')
            found = True
    if not found:
        sys.exit('No generated native platform found; run npm run add:android or npm run add:ios first.')


if __name__ == '__main__':
    main()
