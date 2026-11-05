# Android loopback policy probe

This is an optional **native instrumentation** check for the Android wrapper's network security configuration. It runs inside the debug app's process, reads `NetworkSecurityPolicy` for the listed hostnames, and starts a small in-process HTTP server bound to `127.0.0.1`. It then requests that server through both `localhost` and `127.0.0.1` using Android's native `HttpURLConnection`. It does not start a WebView or exercise the game, CORS, speech, real Mirid, or a physical speaker. A passing result does not prove that browser or phone integration works.

On 4 November 2026, the v98 debug APK and this probe ran on an isolated Android 35 software emulator. The policy allowed `localhost`, `127.0.0.1`, `::1`, and `[::1]`, denied `192.168.1.1`, `example.com`, and `evil.localhost`, and returned HTTP 200 for the two IPv4 loopback spellings. IPv6 was checked by policy only, not an HTTP connection. The emulator lacked hardware acceleration and its WebView remained unverified.

## Run on a disposable emulator

Prerequisites: a built debug APK, an Android SDK containing platform 36 and build tools 35.0.0, a JDK and Python 3. The probe must be signed with **the same debug key used for the target APK**, because Android requires matching signatures for instrumentation. Never copy a signing key into this project. Use only a disposable emulator or a device you are authorized to modify; the commands install the app and probe. This example targets an emulator identified by `TASK_DEVICE`; check `adb devices` first and change it to your own disposable emulator. Run from the game directory:

```sh
TASK_SDK="${ANDROID_HOME:?Set ANDROID_HOME to your SDK}"
TASK_JAVA="${JAVA_HOME:?Set JAVA_HOME to your JDK}"
TASK_DEVICE=emulator-5554
TASK_PROBE_DIR="$(mktemp -d)"
mkdir -p "$TASK_PROBE_DIR/classes" "$TASK_PROBE_DIR/dex"

"$TASK_JAVA/bin/javac" -source 8 -target 8 \
  -classpath "$TASK_SDK/platforms/android-36/android.jar" \
  -d "$TASK_PROBE_DIR/classes" \
  tests/android-policy-probe/src/com/aftersignal/policytest/PolicyProbe.java

"$TASK_SDK/build-tools/35.0.0/d8" \
  --lib "$TASK_SDK/platforms/android-36/android.jar" --min-api 24 \
  --output "$TASK_PROBE_DIR/dex" \
  "$TASK_PROBE_DIR/classes/com/aftersignal/policytest/PolicyProbe.class"

"$TASK_SDK/build-tools/35.0.0/aapt" package -f \
  -M tests/android-policy-probe/AndroidManifest.xml \
  -I "$TASK_SDK/platforms/android-36/android.jar" \
  -F "$TASK_PROBE_DIR/unsigned.apk"

python3 - "$TASK_PROBE_DIR" <<'PY'
from pathlib import Path
from zipfile import ZipFile
import sys
probe = Path(sys.argv[1])
with ZipFile(probe / 'unsigned.apk', 'a') as apk:
    apk.write(probe / 'dex/classes.dex', 'classes.dex')
PY

"$TASK_SDK/build-tools/35.0.0/apksigner" sign \
  --ks "$HOME/.android/debug.keystore" --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android \
  --out "$TASK_PROBE_DIR/probe.apk" "$TASK_PROBE_DIR/unsigned.apk"

"$TASK_SDK/platform-tools/adb" -s "$TASK_DEVICE" install -r dist/oki-doki-android-v98-debug.apk
"$TASK_SDK/platform-tools/adb" -s "$TASK_DEVICE" install -r "$TASK_PROBE_DIR/probe.apk"
"$TASK_SDK/platform-tools/adb" -s "$TASK_DEVICE" shell am instrument -w -r com.aftersignal.policytest/.PolicyProbe
```

Change the target APK path and keystore when testing a different build. The instrumentation target in `AndroidManifest.xml` is the provisional application ID `com.aftersignal.prototype`; update it if that ID is migrated. The output should list the policy results and `http-localhost=200`, `http-127.0.0.1=200`. `INSTRUMENTATION_CODE: -1` is Android's `Activity.RESULT_OK`. If the server or request fails, inspect the actual error instead of interpreting a policy result as successful networking.

Remove the temporary directory with `rm -r "$TASK_PROBE_DIR"` after inspecting the result. The probe remains installed in the disposable emulator until it is reset or removed there; this guide does not uninstall or alter any other application.
