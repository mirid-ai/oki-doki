#!/usr/bin/env python3
"""Copy only the game's deployable web files into a managed Capacitor bundle."""
from pathlib import Path
import shutil
import sys
import tempfile

MOBILE = Path(__file__).resolve().parent.parent
GAME = MOBILE.parent
OUTPUT = MOBILE / 'www'
MARKER = OUTPUT / '.after-signal-generated'


def main():
    if OUTPUT.is_symlink() or (OUTPUT.exists() and (not MARKER.is_file() or MARKER.is_symlink())):
        sys.exit(f'Refusing to replace an unmanaged web directory: {OUTPUT}')
    # Finish the new bundle before touching the previous one: missing source
    # files and copy failures must not leave a half-populated www directory.
    # The temporary directory is on the same filesystem so renames work on
    # Windows, macOS and Linux without relying on cross-device moves.
    with tempfile.TemporaryDirectory(prefix='.oki-stage-', dir=MOBILE) as temporary:
        staging = Path(temporary)
        candidate = staging / 'candidate'
        candidate.mkdir()
        for name in ('index.html', 'manifest.webmanifest', 'sw.js'):
            shutil.copy2(GAME / name, candidate / name)
        for name in ('src', 'assets'):
            shutil.copytree(GAME / name, candidate / name, symlinks=False)
        (candidate / MARKER.name).touch()
        previous = staging / 'previous'
        # Recheck after the copy in case another process changed the target.
        if OUTPUT.is_symlink() or (OUTPUT.exists() and (not MARKER.is_file() or MARKER.is_symlink())):
            sys.exit(f'Refusing to replace an unmanaged web directory: {OUTPUT}')
        had_previous = OUTPUT.exists()
        if had_previous:
            OUTPUT.rename(previous)
        try:
            candidate.rename(OUTPUT)
        except BaseException:
            if had_previous:
                previous.rename(OUTPUT)
            raise
    print(f'Staged web game in {OUTPUT}')


if __name__ == '__main__':
    main()
