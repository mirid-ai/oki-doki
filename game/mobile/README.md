# Mobile wrapper

This directory contains a Capacitor 8 wrapper for the existing web game. It includes generated Android and iOS project sources, prepares the web bundle, and adds microphone permissions to the native projects. An [Android debug APK](../dist/oki-doki-android-v247-debug.apk) has been built and its five native unit tests passed. APKs are not included in the source archive; obtain the debug APK separately or follow [Generate a native project](#generate-a-native-project) below to build it. The v179 build displayed its opening, restored a saved passage, reached the free repair-kit offer and played a suggested character message in an Android 11 software emulator with WebView 83. A separate v179 emulator run sent free text to a synthetic local AI endpoint. In v180, voice previews and a story read-aloud request returned real Kokoro audio in the emulator, with audio output disabled. A v229 Android 11 emulator retry requested two distinct real Kokoro voices and a read-aloud, and reached a playing or finished status; emulator audio was disabled. An earlier native policy probe verified loopback permissions and native HTTP. It has not been tested on a physical Android device, and the iOS app has not been built. See [the playtest record](../PLAYTEST.md) for details. Native microphone access, voice playback, provider access and presentation require device testing. The wrapper bundles the local Kokoro speech model and voice assets; its native-device speech compatibility has not yet been verified. Mirid and an AI dialogue model are not bundled.

The Android project includes a device smoke test that launches the packaged WebView, uses touch to enter the story, checks the first character image and selects the first story choice through to its response. It then saves that passage, recreates the Android activity and resumes the checkpoint by touch. Build it with `./gradlew :app:assembleDebugAndroidTest`; on a disposable device or emulator, run `./gradlew :app:connectedDebugAndroidTest` from `mobile/android`. A second device test resumes a synthetic checkpoint for each screen picture, checks that its image loaded and control fits a 44 CSS-pixel target, then sends a real touch and checks the resulting passage and fingerprint. Both tests skip if a checkpoint already exists and remove only the checkpoint they created if it still matches; an interrupted test can leave a test save behind. Run them on a disposable device or emulator. They do not contact an AI service. The v227 debug APK passed both the opening-and-save test and the seeded picture-touch test on an isolated Android 11/WebView 83 software emulator. Neither test has been run on a physical device.

The package ID `com.aftersignal.prototype` is a provisional identifier. Both native projects already exist and contain this identifier independently of `capacitor.config.json`; changing the Capacitor `appId` alone does not rename them. Complete the identifier migration below before distributing an app.

The iOS project targets iOS 15.0. WebKit added native dialog support and `Object.hasOwn()` in [iOS 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/); the game uses a settings-modal fallback and compatible property checks for earlier iOS 15 versions. Those paths are covered by simulated tests and still require testing in an actual iOS WebView.

## Requirements

- Node.js 22 or later, npm and Python 3.
- For Android: Android Studio 2025.2.1 or newer, its JDK, Android SDK and an emulator or Android device.
- For iOS: a Mac with Xcode 26 or newer, its command-line tools and an iPhone or simulator. A real device and appropriate Apple signing are needed to verify microphone use and distribute a signed build.

See Capacitor's [environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) and [installation guide](https://capacitorjs.com/docs/getting-started). Capacitor 8's iOS deployment target is iOS 15 or later; consult the current platform documentation for device and WebView requirements.

## Generate a native project

From this `mobile` directory:

```sh
npm ci
npm run sync
```

`npm ci` installs the pinned Capacitor dependencies recorded in the lockfile. The npm scripts look for Python 3 as `py -3` or `python` on Windows, and as `python3` or `python` on macOS and Linux; ensure the chosen interpreter is available on PATH. `stage` copies `index.html`, `manifest.webmanifest`, `sw.js`, `src/` and `assets/` into a temporary bundle before replacing the generated `www/` directory. If a source file is missing or the copy fails, the previous bundle remains available; it will refuse to replace an unmanaged `www/`. `sync` refreshes the web bundle, runs `cap sync`, then idempotently adds `INTERNET`, `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` to the Android manifest, marks microphone hardware optional, sets Android `allowBackup` to `false`, and adds microphone and local-network explanations to the iOS Info.plist. It also sets the iOS required architecture to `arm64` for this iOS 15+ project, preserving other listed device capabilities; [Apple's documentation](https://developer.apple.com/documentation/bundleresources/information-property-list/uirequireddevicecapabilities) specifies `arm64` for 64-bit apps. The `add:android` and `add:ios` scripts also apply this configuration after generating a platform. The permission is requested when the user starts recording, subject to WebView and OS behavior. The native project sources and lockfile are intended to be kept with the project; generated web bundles, native build outputs, and dependencies are ignored. The native app uses its bundled assets and skips web service-worker registration; actual native and device behaviour still needs testing.

Open and build in the platform IDE:

```sh
npm run open:android
# On a Mac:
npm run open:ios
```

Use Android Studio to select a device and build a debug APK; use Xcode to select a simulator or signed device and build the iOS app. The launcher icons are generated from the game's `assets/mallow-icon-512.png`; the launch screens use the same Mallow artwork. Before a release, configure the app ID and signing, set version numbers and provide platform-specific privacy information. Re-run `npm run sync` after changing the web game. The native project sources are present; `sync` populates their generated web assets and platform configuration.

To regenerate the launcher icons after changing the source artwork, install Pillow 9.1 or newer in your chosen Python environment, then run `npm run icons` from this directory. The optional tool produces Android launcher densities and adaptive foregrounds plus an opaque 1024 px iOS AppIcon. It does not change splash screens, platform identifiers or signing. Its appearance has not yet been checked on a native device.

## Change the provisional app identifier

Choose an identifier you control and update it consistently in all three places:

1. Set `appId` in `capacitor.config.json`.
2. In Android Studio, migrate the existing Android app: update both `namespace` and `applicationId` in `android/app/build.gradle`. Refactor the **whole** `com.aftersignal.prototype` package under `android/app/src/main/java`, not just `MainActivity.java`: it also contains the registered billing plugin and its package-private helpers, and the plugin references the app namespace’s generated `R` class. Refactor the corresponding `android/app/src/test/java/com/aftersignal/prototype` test package too, so its package-private helper tests remain accessible. Also refactor `android/app/src/androidTest/java/com/aftersignal/prototype`: its device smoke test refers to `MainActivity` in the same package and otherwise will not compile after the move. Update `package_name` and `custom_url_scheme` in `android/app/src/main/res/values/strings.xml`. Check that the manifest’s `.MainActivity` resolves to the migrated class, the activity still registers the billing plugin, and no references to the old package remain in the app’s source or test files.
3. In Xcode, update the app target's Bundle Identifier for **both** Debug and Release in `ios/App/App.xcodeproj` and configure a signing team and provisioning appropriate to the new identifier. Update any related entitlements, URL schemes or capabilities if you add them.

Run `npm run sync` after these edits. Sync copies the Capacitor configuration and web assets; it does **not** perform the native package or bundle-identifier migration. Verify the Android application ID and resolved activity in the built artifact using Android Studio's APK Analyzer (or the Android SDK's `aapt`), and verify the Xcode target, signing settings and built app's bundle identifier on a Mac. Build and run the updated projects on actual target devices before release. Alternatively, generate fresh native projects after setting the new `appId`, then reapply and verify the microphone permissions, launcher icons, launch screens and any other native changes from this project. Preserve a backup before replacing the existing native projects.


## Connections and microphone

The game remains playable with authored dialogue offline. Optional remote AI, transcription and speech use the endpoints supplied by the player and still require their browser-origin/CORS rules to allow the native WebView origin. HTTPS is required for remote endpoints by the game's existing adapters. Providers may treat the Android and iOS WebView origins differently; verify each on a real device.

`localhost` in a mobile app refers to the **phone**, not to a desktop running Mirid. A desktop Mirid installation needs a reachable, explicitly configured network endpoint and suitable authentication and CORS/origin support. Mirid's current boundary permits its documented local browser origins, but does not automatically permit the default iOS `capacitor://localhost` origin. The experimental Linux Parakeet and Kokoro services are loopback-only and therefore cannot be used directly from a separate phone. The wrapper does not modify Mirid or loosen its request boundary. To connect through the optional desktop companion, start it as described in the [companion guide](../companion/README.md), then open **AI settings → Connect a phone to desktop Mirid**, enter the trusted HTTPS address and pairing token, and select **Use companion**. Choose the running Mirid model and save the settings for the session. The preset fills the text and speech endpoints without sending a request; the token remains in memory for the session. The companion route has not yet been validated on a phone.

Android's WebView uses `https://localhost` for packaged assets, and the iOS WebView uses Capacitor's default custom scheme. Android's network security configuration permits HTTP only to exact same-device loopback hosts (`localhost`, `127.0.0.1`, and IPv6 loopback); all other cleartext destinations remain blocked. On iOS, the configuration adds App Transport Security exceptions for `127.0.0.1` and `::1`: [Apple documents](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking) that iOS 17 and later restrict IP-address connections by default and allow individual exceptions. These settings address platform policies for a service running on the phone; they do not provide such a service, and WebView, mixed-content and CORS behavior have not been tested on a device. The configure script refuses to overwrite an existing custom Android network security configuration or an explicit iOS loopback restriction; merge these rules manually if needed. No blanket HTTP exception is enabled. A TLS endpoint also needs a certificate trusted by the app. On Android 7 and newer, a CA installed by the user is not automatically trusted by apps targeting current Android versions. For an **opt-in local debug build** using a privately managed CA, run the following from `mobile` after `npm run sync`, then rebuild the debug APK:

```sh
python3 tools/debug_user_ca.py enable
```

On Windows, use `py -3` in place of `python3`. This generates only an ignored `src/debug` network resource: the debug app then trusts **all** user-installed CAs for HTTPS, including for non-companion endpoints. It does not install a CA, create a certificate or bypass hostname verification. Install only a CA you control on the test device and use a server certificate whose subject alternative name matches the gateway hostname or IP. TLS setup, the WebView origin and actual phone behavior must still be tested. The release build does not use the debug resource. To return to the default debug policy, run `python3 tools/debug_user_ca.py disable` and rebuild. The helper refuses to overwrite or delete a custom debug policy. See [Android network security configuration](https://developer.android.com/privacy-and-security/security-config) for debug trust and platform behavior.

Verify microphone permission, recording, cancellation, playback, CORS, save/resume and loss of connectivity on actual devices before describing those features as supported. If a platform WebView does not provide `getUserMedia` or audio playback as needed, a reviewed native audio bridge may be required.

WebKit has documented a [`getUserMedia` failure for a Capacitor custom-scheme URL with a port](https://bugs.webkit.org/show_bug.cgi?id=259304). That report does not establish whether this project's default URL is affected, but is a reason to test the exact built app and OS version rather than infer microphone support from permission declarations alone.
