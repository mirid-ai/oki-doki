"""Test native launcher icon generation without touching real project files."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from PIL import Image

game = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('native_icons', game / 'mobile/tools/icons.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix='signal-icons-test-') as folder:
    root = Path(folder)
    android = root / 'android/res'
    ios = root / 'ios/AppIcon.appiconset'
    android.mkdir(parents=True)
    ios.mkdir(parents=True)
    contents = {'images': [{'filename': 'AppIcon-512@2x.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}],
                'info': {'author': 'xcode', 'version': 1}}
    (ios / 'Contents.json').write_text(json.dumps(contents), encoding='utf-8')
    unrelated = root / 'untouched.txt'
    unrelated.write_text('preserve me', encoding='utf-8')
    source = game / 'assets/mallow-icon-512.png'
    module.generate_icons(source, android, ios)

    generated = [path for path in root.rglob('*') if path.is_file()]
    first = {path.relative_to(root): hashlib.sha256(path.read_bytes()).digest() for path in generated}
    module.generate_icons(source, android, ios)
    second = {path.relative_to(root): hashlib.sha256(path.read_bytes()).digest() for path in generated}
    assert first == second, 'Icon generation must be idempotent.'
    assert unrelated.read_text(encoding='utf-8') == 'preserve me'
    assert json.loads((ios / 'Contents.json').read_text(encoding='utf-8')) == contents

    for density, (legacy_size, adaptive_size) in module.DENSITIES.items():
        directory = android / f'mipmap-{density}'
        with Image.open(directory / 'ic_okie.png') as image:
            assert image.size == (legacy_size, legacy_size) and image.mode == 'RGB'
        with Image.open(directory / 'ic_okie_round.png') as image:
            assert image.size == (legacy_size, legacy_size) and image.mode == 'RGBA'
            assert image.getpixel((0, 0))[3] < 255
        with Image.open(directory / 'ic_okie_foreground.png') as image:
            assert image.size == (adaptive_size, adaptive_size) and image.mode == 'RGBA'
            assert image.getpixel((0, 0))[3] == 0
            assert image.getpixel((adaptive_size // 2, adaptive_size // 2))[3] == 255
    with Image.open(ios / 'AppIcon-512@2x.png') as image:
        assert image.size == (1024, 1024) and image.mode == 'RGB'
        assert '#3B1025' in (android / 'values/ic_okie_background.xml').read_text(encoding='utf-8')
    # The checked-in platform configuration must actually select the new assets.
    real_android = game / 'mobile/android/app/src/main'
    manifest = (real_android / 'AndroidManifest.xml').read_text(encoding='utf-8')
    assert 'android:icon="@mipmap/ic_okie"' in manifest
    assert 'android:roundIcon="@mipmap/ic_okie_round"' in manifest
    for density in module.DENSITIES:
        for name in ('ic_okie.png', 'ic_okie_round.png', 'ic_okie_foreground.png'):
            assert (real_android / 'res' / f'mipmap-{density}' / name).read_bytes() == (android / f'mipmap-{density}' / name).read_bytes()
    for name in ('ic_okie.xml', 'ic_okie_round.xml'):
        assert (real_android / 'res/mipmap-anydpi-v26' / name).read_bytes() == (android / 'mipmap-anydpi-v26' / name).read_bytes()
    ios_project = game / 'mobile/ios/App/App.xcodeproj/project.pbxproj'
    assert ios_project.read_text(encoding='utf-8').count('ASSETCATALOG_COMPILER_APPICON_NAME = AppIconOkie;') == 2
    real_ios = game / 'mobile/ios/App/App/Assets.xcassets/AppIconOkie.appiconset'
    actual_entry = json.loads((real_ios / 'Contents.json').read_text(encoding='utf-8'))['images'][0]
    assert (real_ios / actual_entry['filename']).read_bytes() == (ios / 'AppIcon-512@2x.png').read_bytes()
    transparent = root / 'transparent.png'
    Image.new('RGBA', (512, 512), (255, 0, 0, 0)).save(transparent)
    flattened = module.rgb_source(transparent)
    assert flattened.mode == 'RGB' and flattened.getpixel((256, 256)) == module.BACKGROUND
    bad = root / 'bad.png'
    Image.new('RGB', (64, 64)).save(bad)
    try:
        module.generate_icons(bad, android, ios)
    except ValueError:
        pass
    else:
        raise AssertionError('Incorrect source dimensions should be rejected.')
    print('Native icon dimensions, alpha, safe areas, idempotence and source validation passed.')

# Both native launch configurations select game-owned artwork, including the
# Android 12+ splash theme; retain the template files without selecting them.
import xml.etree.ElementTree as ET
android_res = game / 'mobile/android/app/src/main/res'
styles = ET.parse(android_res / 'values/styles.xml').getroot()
launch_style = styles.find("style[@name='AppTheme.NoActionBarLaunch']")
items = {item.get('name'): item.text for item in launch_style.findall('item')}
assert items['android:background'] == '@drawable/okie_launch'
assert items['windowSplashScreenBackground'] == '@color/ic_okie_background'
assert items['windowSplashScreenAnimatedIcon'] == '@mipmap/ic_okie'
launch_drawable = ET.parse(android_res / 'drawable/okie_launch.xml').getroot()
ns = '{http://schemas.android.com/apk/res/android}'
assert [item.get(ns + 'drawable') for item in launch_drawable] == ['@color/ic_okie_background', '@mipmap/ic_okie']
ios_app = game / 'mobile/ios/App/App'
storyboard = ET.parse(ios_app / 'Base.lproj/LaunchScreen.storyboard').getroot()
launch_view = storyboard.find('.//imageView')
assert launch_view.get('image') == 'OkieLaunch' and launch_view.get('contentMode') == 'scaleAspectFit'
asset = ios_app / 'Assets.xcassets/OkieLaunch.imageset'
image_entry = json.loads((asset / 'Contents.json').read_text(encoding='utf-8'))['images'][0]
assert image_entry['scale'] == '1x' and image_entry['idiom'] == 'universal'
assert (asset / image_entry['filename']).read_bytes() == (game / 'assets/mallow-icon-512.png').read_bytes()
print('Native launch resource references and artwork passed static checks.')
