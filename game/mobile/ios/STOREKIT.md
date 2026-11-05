# iOS field-repair purchase bridge

`App/App/RepairKitBillingPlugin.swift` implements the local Capacitor plugin `RepairKitBilling` with StoreKit 2. It is disabled by default: `RepairKitProductID` in `App/App/Info.plist` is empty and `RepairKitMinimumTierConfirmed` is false. No purchase or restore request can start until both are configured. Names used for the separately implemented free offer never enter the StoreKit bridge.

To prepare an iOS release on a Mac:

1. Create a **non-consumable** In-App Purchase for the app in App Store Connect. Choose and verify the lowest paid price available for each intended storefront and configure the required agreements and app metadata. StoreKit's localized display price alone does not prove the chosen tier is the minimum.
2. Set `RepairKitProductID` to that exact product identifier in the native `Info.plist`, and set `RepairKitMinimumTierConfirmed` to true only after that pricing has been checked. This setting is an operator assertion, not an automatic price check. The JS caller cannot change the native product ID or tier confirmation.
3. Open `App/App.xcodeproj` in Xcode on macOS, choose a valid signing team and bundle identifier, build, and test with StoreKit Testing or an Apple sandbox account. Exercise purchase, cancellation, pending/Ask to Buy, restore, revocation, app restart, and the no-product/configuration failure cases. Configure live products and signing separately before distribution.

`getProduct` returns StoreKit's localized `displayPrice`. `purchase`, `getEntitlement`, and explicit `restore` return `purchased` only for a StoreKit-verified, unrevoked, matching non-consumable entitlement. The bridge uses current entitlements, listens for transaction updates and unfinished transactions, and calls `AppStore.sync()` only for an explicit restore. It does not send transaction tokens to JavaScript. A pending purchase does not grant the item.

The included Python check (`python3 -m unittest discover -s game/mobile/ios/tests -v` from the project root) verifies only project wiring and disabled defaults. This Linux environment has no Xcode, iOS SDK, simulator, device, App Store Connect product, or sandbox account; this implementation has not been compiled or tested against StoreKit. A real signed build and sandbox/device verification are required before relying on it for purchases.

References: [Apple StoreKit transactions](https://developer.apple.com/documentation/storekit/transaction), [current entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements), [StoreKit products](https://developer.apple.com/documentation/storekit/product), and [Capacitor custom iOS code](https://capacitorjs.com/docs/ios/custom-code).
