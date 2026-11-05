#!/usr/bin/env python3
"""Generate native launcher icons from the game's existing 512px artwork.

This optional step requires Pillow. It touches launcher assets only; splash
screens, platform identifiers, project settings and signing are unchanged.
"""
import json
from pathlib import Path
import sys

try:
    from PIL import Image, ImageDraw
except ImportError as error:
    raise SystemExit('Icon generation needs Pillow. Install it in your chosen Python environment first.') from error

MOBILE = Path(__file__).resolve().parent.parent
SOURCE = MOBILE.parent / 'assets/mallow-icon-512.png'
ANDROID_RES = MOBILE / 'android/app/src/main/res'
IOS_ICONSET = MOBILE / 'ios/App/App/Assets.xcassets/AppIconOkie.appiconset'
BACKGROUND = (59, 16, 37)
DENSITIES = {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216),
             'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}


def rgb_source(source):
    with Image.open(source) as image:
        if image.format != 'PNG' or image.size != (512, 512):
            raise ValueError('The source icon must be a 512×512 PNG.')
        rgba = image.convert('RGBA')
        background = Image.new('RGBA', rgba.size, (*BACKGROUND, 255))
        flattened = Image.alpha_composite(background, rgba).convert('RGB')
        return flattened


def generate_icons(source, android_res, ios_iconset):
    if not android_res.is_dir() or not ios_iconset.is_dir():
        raise ValueError('Generate both native projects before creating launcher icons.')
    data = json.loads((ios_iconset / 'Contents.json').read_text(encoding='utf-8'))
    entries = [entry for entry in data.get('images', []) if entry.get('size') == '1024x1024' and entry.get('filename')]
    if len(entries) != 1 or Path(entries[0]['filename']).name != entries[0]['filename']:
        raise ValueError('The iOS AppIcon asset catalog needs one safe 1024×1024 PNG entry.')
    artwork = rgb_source(source)
    resampling = Image.Resampling.LANCZOS
    # A circular alpha mask is used only for Android's legacy round icon.
    mask = Image.new('L', artwork.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 511, 511), fill=255)
    for density, (legacy_size, adaptive_size) in DENSITIES.items():
        directory = android_res / f'mipmap-{density}'
        directory.mkdir(exist_ok=True)
        legacy = artwork.resize((legacy_size, legacy_size), resampling)
        legacy.save(directory / 'ic_okie.png', format='PNG', optimize=True)
        rounded = legacy.convert('RGBA')
        rounded.putalpha(mask.resize((legacy_size, legacy_size), resampling))
        rounded.save(directory / 'ic_okie_round.png', format='PNG', optimize=True)
        # Adaptive launchers are 108dp square; place artwork within the centre
        # 72dp so that circular and other system masks leave it visible.
        safe_size = adaptive_size * 2 // 3
        safe_artwork = artwork.resize((safe_size, safe_size), resampling).convert('RGBA')
        foreground = Image.new('RGBA', (adaptive_size, adaptive_size), (0, 0, 0, 0))
        offset = (adaptive_size - safe_size) // 2
        foreground.paste(safe_artwork, (offset, offset))
        foreground.save(directory / 'ic_okie_foreground.png', format='PNG', optimize=True)
    values = android_res / 'values'
    values.mkdir(exist_ok=True)
    (values / 'ic_okie_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources><color name="ic_okie_background">#3B1025</color></resources>\n',
        encoding='utf-8')
    adaptive = android_res / 'mipmap-anydpi-v26'
    adaptive.mkdir(exist_ok=True)
    icon_xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_okie_background"/>\n'
                '    <foreground android:drawable="@mipmap/ic_okie_foreground"/>\n'
                '</adaptive-icon>\n')
    for name in ('ic_okie.xml', 'ic_okie_round.xml'):
        (adaptive / name).write_text(icon_xml, encoding='utf-8')
    # Apple app icons must be opaque; RGB guarantees there is no alpha channel.
    artwork.resize((1024, 1024), resampling).save(ios_iconset / entries[0]['filename'], format='PNG', optimize=True)


def main():
    try:
        generate_icons(SOURCE, ANDROID_RES, IOS_ICONSET)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        sys.exit(f'Could not generate launcher icons: {error}')
    print('Generated Android and iOS launcher icons from the game artwork.')


if __name__ == '__main__':
    main()
