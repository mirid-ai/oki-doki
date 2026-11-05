#!/usr/bin/env python3
"""Opt in to Android debug builds trusting the device's user-installed CAs.

Release builds never include src/debug resources. No device certificate is
installed by this helper; it only selects an alternative debug resource.
"""
from pathlib import Path
import argparse
import sys

from configure_native import LOOPBACK_NETWORK_CONFIG

MOBILE = Path(__file__).resolve().parent.parent
ANDROID_MAIN = MOBILE / 'android/app/src/main/res/xml/oki_loopback_network.xml'
ANDROID_DEBUG = MOBILE / 'android/app/src/debug/res/xml/oki_loopback_network.xml'

# Keep the same loopback cleartext rules. Android ignores debug-overrides in a
# non-debuggable build, and src/debug resources are excluded from release builds.
DEBUG_NETWORK_CONFIG = LOOPBACK_NETWORK_CONFIG.replace(
    '</network-security-config>',
    '''    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>''',
)


def enable(main: Path = ANDROID_MAIN, debug: Path = ANDROID_DEBUG) -> None:
    if not main.is_file() or main.is_symlink() or main.read_text(encoding='utf-8') != LOOPBACK_NETWORK_CONFIG:
        raise ValueError('Expected the unmodified Oki Doki main network policy; run sync or merge manually.')
    if debug.is_symlink() or (debug.exists() and (not debug.is_file() or debug.read_text(encoding='utf-8') != DEBUG_NETWORK_CONFIG)):
        raise ValueError('A custom debug network policy already exists; merge it manually.')
    debug.parent.mkdir(parents=True, exist_ok=True)
    debug.write_text(DEBUG_NETWORK_CONFIG, encoding='utf-8')


def disable(debug: Path = ANDROID_DEBUG) -> bool:
    if not debug.exists() and not debug.is_symlink():
        return False
    if debug.is_symlink() or not debug.is_file() or debug.read_text(encoding='utf-8') != DEBUG_NETWORK_CONFIG:
        raise ValueError('The debug network policy is not the generated policy; remove or merge it manually.')
    debug.unlink()
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('enable', 'disable'))
    args = parser.parse_args()
    try:
        if args.action == 'enable':
            enable()
            print('Debug user-CA trust enabled. Rebuild the debug APK; release policy is unchanged.')
            print('The debug app will trust all user-installed CAs for HTTPS, not only the companion CA.')
        else:
            removed = disable()
            print('Debug user-CA trust disabled; rebuild the debug APK.' if removed else 'No generated debug user-CA policy was found.')
    except (OSError, ValueError) as exc:
        sys.exit(str(exc))


if __name__ == '__main__':
    main()
