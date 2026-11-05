import Foundation
import Capacitor
import StoreKit

// Local plugin: the storefront product is configured by the native app, never JS.
@objc(RepairKitBillingPlugin)
public final class RepairKitBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RepairKitBillingPlugin"
    public let jsName = "RepairKitBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private var updates: Task<Void, Never>?
    private var recovery: Task<Void, Never>?

    // This is an operator assertion, not a claim that StoreKit can verify the
    // selected price is the lowest tier for every storefront.
    private var configuredID: String? {
        guard Bundle.main.object(forInfoDictionaryKey: "RepairKitMinimumTierConfirmed") as? Bool == true,
              let raw = Bundle.main.object(forInfoDictionaryKey: "RepairKitProductID") as? String else { return nil }
        let id = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
        guard !id.isEmpty, id.count <= 200, id.rangeOfCharacter(from: allowed.inverted) == nil else { return nil }
        return id
    }

    public override func load() {
        guard configuredID != nil else { return }
        // Subscribe immediately, while separately recovering unfinished work.
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.handleUpdate(result)
            }
        }
        recovery = Task { [weak self] in
            for await result in Transaction.unfinished {
                await self?.handleUpdate(result)
            }
        }
    }

    deinit { updates?.cancel(); recovery?.cancel() }

    private func entitled(_ id: String) async -> Bool {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.productID == id && transaction.productType == .nonConsumable && transaction.revocationDate == nil {
                return true
            }
        }
        return false
    }

    private func handleUpdate(_ result: VerificationResult<Transaction>) async {
        guard let id = configuredID, case .verified(let transaction) = result,
              transaction.productID == id, transaction.productType == .nonConsumable else { return }
        if transaction.revocationDate != nil {
            notifyListeners("entitlementChanged", data: ["status": "not_owned"])
            await transaction.finish()
        } else if await entitled(id) {
            // StoreKit's verified current entitlement durably enables delivery;
            // the event informs a currently open web view of the update.
            notifyListeners("entitlementChanged", data: ["status": "purchased", "verified": true, "productId": id])
            await transaction.finish()
        }
        // Never acknowledge an unverified or not-yet-entitled transaction.
    }

    private func product(_ id: String) async throws -> Product? {
        let products = try await Product.products(for: [id])
        return products.first { $0.id == id && $0.type == .nonConsumable }
    }

    @objc func getProduct(_ call: CAPPluginCall) {
        guard let id = configuredID else { call.resolve(["status": "unavailable"]); return }
        Task {
            do {
                guard let item = try await product(id), !item.displayPrice.isEmpty else {
                    call.resolve(["status": "unavailable"]); return
                }
                call.resolve(["status": "available", "productId": id, "formattedPrice": item.displayPrice])
            } catch { call.resolve(["status": "error"]) }
        }
    }

    @objc func getEntitlement(_ call: CAPPluginCall) {
        guard let id = configuredID else { call.resolve(["status": "unavailable"]); return }
        Task {
            if await entitled(id) { call.resolve(["status": "purchased", "verified": true, "productId": id]) }
            else { call.resolve(["status": "not_owned"]) }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        guard let id = configuredID else { call.resolve(["status": "unavailable"]); return }
        // AppStore.sync can prompt for credentials, so only call it in response
        // to the player's explicit Restore action, never during startup.
        Task {
            do {
                try await AppStore.sync()
                if await entitled(id) { call.resolve(["status": "purchased", "verified": true, "productId": id]) }
                else { call.resolve(["status": "not_owned"]) }
            } catch { call.resolve(["status": "error"]) }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = configuredID else { call.resolve(["status": "unavailable"]); return }
        Task {
            do {
                guard let item = try await product(id) else { call.resolve(["status": "unavailable"]); return }
                switch try await item.purchase() {
                case .success(let verification):
                    guard case .verified(let transaction) = verification,
                          transaction.productID == id, transaction.productType == .nonConsumable,
                          transaction.revocationDate == nil, await entitled(id) else {
                        call.resolve(["status": "error"]); return
                    }
                    // The durable StoreKit entitlement makes the item recoverable
                    // if the web view closes before it processes this result.
                    call.resolve(["status": "purchased", "verified": true, "productId": id])
                    await transaction.finish()
                case .pending: call.resolve(["status": "pending"])
                case .userCancelled: call.resolve(["status": "cancelled"])
                @unknown default: call.resolve(["status": "error"])
                }
            } catch { call.resolve(["status": "error"]) }
        }
    }
}

// SceneDelegate uses this subclass, and Main.storyboard uses it as a fallback.
final class GameBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(RepairKitBillingPlugin())
    }
}
