# Optional Google Play purchase

The Android-only `RepairKitBilling` Capacitor plugin is disabled by default. It never receives a product ID or key from the web page. To configure a real one-time, non-consumable product, create the product for this application's package in Play Console, choose the lowest paid tier available there, and set these native resources in `app/src/main/res/values/repair_kit_billing.xml`:

- `repair_kit_product_id`: the Play product ID.
- `repair_kit_play_public_key`: the base64-encoded Play licensing public key for this application. This is a public key, not an application-signing private key.
- `repair_kit_lowest_tier_confirmed`: `true` only after the store product is actually configured at the lowest paid tier.

Empty, invalid or unconfirmed configuration leaves the purchase unavailable. Product pricing is read from Play and is never calculated by the app. Free name-based access is handled separately in the web story and does not invoke this plugin.

The plugin checks a fresh Play purchase result for the configured product and app package, verifies its signed payload with the configured Play licensing public key, and acknowledges a completed, verified non-consumable purchase. Pending or invalid purchases grant nothing. Before acknowledgement, it writes a private durable delivery record containing the product ID and a hash of the purchase token. Background completion callbacks and foreground Play queries can recover and acknowledge verified purchases even when no purchase screen is active. The record is bookkeeping, not proof of current ownership: `restore()` and `getEntitlement()` query Play again, including after an account change. No purchase token is returned to JavaScript.

Concurrent acknowledgement requests for the same purchase are coalesced. If acknowledgement reports an error, the bridge re-queries Play and accepts an already-acknowledged purchase only after checking its signature and ownership again. An unavailable connection does not grant an entitlement; the player can retry Restore when Play is reachable.

The bridge uses a deadline while connecting to Play and preparing a purchase. Once Play has opened the purchase screen, it keeps the request active until Play reports a result or the activity is destroyed; a timer cannot open a second purchase flow while the first screen is still active. On return to the activity, it checks Play for a matching purchase, but treats a missing purchase as inconclusive while the original flow remains active. These lifecycle behaviors still need a real Play sandbox test, including a delayed-payment instrument.

This is **client-side signature verification**, not verification through the Play Developer API. Google recommends a secure backend for stronger purchase verification, replay protection and revocation handling; client checks can be bypassed on a modified device. A Play Console product, published or internal-test build, licensed tester and device are required to validate actual billing and the localized price. A debug Android APK has been built, but the bridge remains unconfigured and no real Play transaction has been performed. See Google's [billing integration guide](https://developer.android.com/google/play/billing/integrate) and [purchase verification guidance](https://developer.android.com/google/play/billing/security).

The four `PlayPurchaseSecurityTest` JUnit cases exercise real RSA signature verification, purchase-state rules, recording before acknowledgement, and acknowledgement coalescing. They can be run with `./gradlew :app:testDebugUnitTest` from this directory after installing the Android SDK and Gradle dependencies. They passed in the Android debug build. These checks do not simulate Google Play callbacks or prove device behavior.
