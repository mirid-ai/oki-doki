package com.aftersignal.prototype;

import android.os.Handler;
import android.os.Looper;
import android.app.Activity;
import android.content.Context;
import android.util.Base64;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.PublicKey;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;
import org.json.JSONObject;

/** Optional non-consumable Play purchase. No product or key is accepted from JS. */
@CapacitorPlugin(name = "RepairKitBilling")
public final class RepairKitBillingPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private BillingClient billing;
    private PluginCall active;
    private boolean purchaseFlow;
    private Runnable timeout;
    private String productId;
    private PublicKey publicKey;
    private boolean connecting;
    private boolean destroyed;
    private PluginCall waitingCall;
    private Runnable waitingReady;
    private final PendingAcknowledgements acknowledgements = new PendingAcknowledgements();

    @Override public void load() {
        productId = getContext().getString(R.string.repair_kit_product_id).trim();
        publicKey = PlayPurchaseVerifier.parseKey(getContext().getString(R.string.repair_kit_play_public_key));
    }

    private boolean configured() {
        return productId != null && productId.matches("[a-z0-9][a-z0-9._]{0,99}") && publicKey != null &&
                getContext().getResources().getBoolean(R.bool.repair_kit_lowest_tier_confirmed);
    }

    private synchronized boolean isActive(PluginCall call) { return active == call; }

    private void finish(PluginCall call, String status) { finish(call, status, null); }
    private synchronized void finish(PluginCall call, String status, String price) {
        if (active != call) return;
        if (timeout != null) main.removeCallbacks(timeout);
        timeout = null;
        active = null;
        purchaseFlow = false;
        JSObject result = new JSObject();
        result.put("status", status);
        if ("available".equals(status)) {
            result.put("productId", productId);
            result.put("formattedPrice", price);
        } else if ("purchased".equals(status)) {
            result.put("productId", productId);
            result.put("verified", true);
        }
        call.resolve(result);
        // A purchase callback may have arrived while another call was active.
        main.post(this::refreshInBackground);
    }

    private synchronized boolean begin(PluginCall call, boolean purchasing) {
        if (destroyed || !configured()) {
            JSObject result = new JSObject(); result.put("status", "unavailable"); call.resolve(result);
            return false;
        }
        if (active != null) {
            JSObject result = new JSObject(); result.put("status", "error"); call.resolve(result);
            return false;
        }
        active = call;
        purchaseFlow = purchasing;
        timeout = () -> finish(call, "unavailable");
        main.postDelayed(timeout, purchasing ? 300_000L : 30_000L);
        return true;
    }

    // Play's purchase sheet can remain open indefinitely. Releasing the call on
    // a timer could allow a second flow while the first is still active.
    private synchronized void purchaseSheetLaunched(PluginCall call) {
        if (active != call || !purchaseFlow) return;
        if (timeout != null) main.removeCallbacks(timeout);
        timeout = null;
    }

    private void connect(PluginCall call, Runnable ready) {
        if (!isActive(call)) return;
        synchronized (this) {
            ensureClient();
            if (billing.isReady()) { ready.run(); return; }
            waitingCall = call;
            waitingReady = ready;
            if (connecting) return;
            connecting = true;
        }
        startConnection();
    }

    private void ensureClient() {
        if (billing == null) billing = BillingClient.newBuilder(getContext())
                .setListener(this::purchasesUpdated)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection().build();
    }

    private void startConnection() {
        billing.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                PluginCall call;
                Runnable ready;
                synchronized (RepairKitBillingPlugin.this) {
                    connecting = false;
                    if (destroyed) return;
                    call = waitingCall; ready = waitingReady;
                    waitingCall = null; waitingReady = null;
                }
                boolean connected = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                if (call != null && isActive(call)) {
                    if (connected) ready.run(); else finish(call, "unavailable");
                } else if (connected) refreshInBackground();
            }
            @Override public void onBillingServiceDisconnected() { /* Next explicit action reconnects. */ }
        });
    }

    // Recover purchases completed while the activity was away. This never
    // grants from the local record; every entitlement request re-queries Play.
    @Override protected void handleOnResume() {
        if (!configured()) return;
        PluginCall purchaseToCheck = null;
        synchronized (this) {
            if (destroyed) return;
            if (active != null) {
                // A missing purchase is inconclusive while Play's sheet may
                // still be open, so leave the original flow active.
                if (purchaseFlow && timeout == null && billing != null && billing.isReady()) purchaseToCheck = active;
                else return;
            } else {
                ensureClient();
                if (!billing.isReady()) {
                    if (connecting) return;
                    connecting = true;
                    startConnection();
                    return;
                }
            }
        }
        if (purchaseToCheck != null) { refreshActivePurchase(purchaseToCheck); return; }
        refreshInBackground();
    }

    private void refreshActivePurchase(PluginCall call) {
        BillingClient client;
        synchronized (this) { if (destroyed || active != call || billing == null) return; client = billing; }
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build();
        client.queryPurchasesAsync(params, (result, purchases) -> {
            if (!isActive(call) || result.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
            Purchase match = matchingPurchase(purchases);
            if (match != null) processPurchase(call, match);
        });
    }

    private void refreshInBackground() {
        BillingClient client;
        synchronized (this) { if (destroyed || active != null || billing == null || !billing.isReady()) return; client = billing; }
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build();
        client.queryPurchasesAsync(params, (result, purchases) -> {
            synchronized (this) { if (destroyed || active != null) return; }
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                Purchase match = matchingPurchase(purchases);
                if (match != null) recoverInBackground(match);
            }
        });
    }

    private void recoverInBackground(Purchase purchase) {
        synchronized (this) { if (destroyed || active != null || !configured()) return; }
        boolean authentic = purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED && isAuthentic(purchase);
        String decision = PlayPurchasePolicy.decision(purchase.getPurchaseState(), authentic);
        if (!PlayPurchasePolicy.recordVerified(decision, () -> recordEntitlement(purchase))) return;
        acknowledgeVerified(purchase, ignored -> { /* A later Play query retries if needed. */ });
    }

    private boolean recordEntitlement(Purchase purchase) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(purchase.getPurchaseToken().getBytes(StandardCharsets.UTF_8));
            // A private durable marker records delivery without retaining the token.
            // It is never treated as proof of current account ownership.
            return getContext().getSharedPreferences("repair_kit_billing", Context.MODE_PRIVATE).edit()
                    .putString("product", productId).putString("token_hash", Base64.encodeToString(digest, Base64.NO_WRAP)).commit();
        } catch (Exception ignored) { return false; }
    }

    private void queryProduct(PluginCall call, Consumer<ProductDetails> found) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId).setProductType(BillingClient.ProductType.INAPP).build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product)).build();
        billing.queryProductDetailsAsync(params, (result, details) -> {
            if (!isActive(call)) return;
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { finish(call, "unavailable"); return; }
            for (ProductDetails detail : details.getProductDetailsList()) {
                if (productId.equals(detail.getProductId()) && eligibleOffer(detail) != null) { found.accept(detail); return; }
            }
            finish(call, "unavailable");
        });
    }

    private ProductDetails.OneTimePurchaseOfferDetails eligibleOffer(ProductDetails details) {
        // Use the Play Console's backwards-compatible buy option, configured by
        // the developer at the lowest paid tier. Never calculate a price locally.
        ProductDetails.OneTimePurchaseOfferDetails offer = details.getOneTimePurchaseOfferDetails();
        if (offer == null || offer.getPriceAmountMicros() <= 0 || offer.getFormattedPrice() == null ||
                offer.getFormattedPrice().trim().isEmpty() || offer.getRentalDetails() != null ||
                offer.getPreorderDetails() != null) return null;
        return offer;
    }

    @PluginMethod public void getProduct(PluginCall call) {
        if (!begin(call, false)) return;
        connect(call, () -> queryProduct(call, detail -> finish(call, "available", eligibleOffer(detail).getFormattedPrice())));
    }

    @PluginMethod public void purchase(PluginCall call) {
        if (!begin(call, true)) return;
        connect(call, () -> queryOwnership(call, true));
    }

    @PluginMethod public void restore(PluginCall call) { checkOwnership(call); }
    @PluginMethod public void getEntitlement(PluginCall call) { checkOwnership(call); }
    private void checkOwnership(PluginCall call) {
        if (!begin(call, false)) return;
        connect(call, () -> queryOwnership(call, false));
    }

    private void queryOwnership(PluginCall call, boolean launchIfMissing) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build();
        billing.queryPurchasesAsync(params, (result, purchases) -> {
            if (!isActive(call)) return;
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { finish(call, "unavailable"); return; }
            Purchase match = matchingPurchase(purchases);
            if (match == null) {
                if (launchIfMissing) queryProduct(call, detail -> launch(call, detail));
                else finish(call, "not_owned");
            } else processPurchase(call, match);
        });
    }

    private Purchase matchingPurchase(List<Purchase> purchases) {
        if (purchases == null) return null;
        for (Purchase purchase : purchases) {
            if (purchase.getProducts().size() == 1 && productId.equals(purchase.getProducts().get(0))) return purchase;
        }
        return null;
    }

    private void launch(PluginCall call, ProductDetails detail) {
        ProductDetails.OneTimePurchaseOfferDetails offer = eligibleOffer(detail);
        if (offer == null) { finish(call, "unavailable"); return; }
        BillingFlowParams.ProductDetailsParams.Builder item = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(detail);
        String token = offer.getOfferToken();
        if (token != null && !token.isEmpty()) item.setOfferToken(token);
        BillingFlowParams params = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(item.build())).build();
        Activity activity = getActivity();
        if (activity == null) { finish(call, "unavailable"); return; }
        activity.runOnUiThread(() -> {
            if (!isActive(call)) return;
            BillingResult result = billing.launchBillingFlow(activity, params);
            if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) queryOwnership(call, false);
            else if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) finish(call, "cancelled");
            else if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) finish(call, "unavailable");
            else purchaseSheetLaunched(call);
        });
    }

    private void purchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call;
        synchronized (this) { call = purchaseFlow ? active : null; }
        if (call == null) {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                Purchase match = matchingPurchase(purchases);
                if (match != null) recoverInBackground(match);
            }
            return;
        }
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) { finish(call, "cancelled"); return; }
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) { queryOwnership(call, false); return; }
        if (code != BillingClient.BillingResponseCode.OK) { finish(call, "error"); return; }
        Purchase match = matchingPurchase(purchases);
        if (match == null) { finish(call, "error"); return; }
        processPurchase(call, match);
    }

    private void processPurchase(PluginCall call, Purchase purchase) {
        if (!isActive(call)) return;
        boolean authentic = purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED && isAuthentic(purchase);
        String decision = PlayPurchasePolicy.decision(purchase.getPurchaseState(), authentic);
        if (!"verified".equals(decision)) { finish(call, decision); return; }
        if (!PlayPurchasePolicy.recordVerified(decision, () -> recordEntitlement(purchase))) { finish(call, "error"); return; }
        acknowledgeVerified(purchase, acknowledged -> finish(call, acknowledged ? "purchased" : "error"));
    }

    private void acknowledgeVerified(Purchase purchase, Consumer<Boolean> completed) {
        if (purchase.isAcknowledged()) { completed.accept(true); return; }
        String token = purchase.getPurchaseToken();
        BillingClient client;
        synchronized (this) {
            if (destroyed || billing == null) { completed.accept(false); return; }
            if (!acknowledgements.add(token, completed)) return;
            client = billing;
        }
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build();
        client.acknowledgePurchase(params, result -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) { finishAcknowledgement(token, true); return; }
            // An earlier process may have acknowledged the same receipt. Ask
            // Play again before reporting a failure; never trust a local marker.
            QueryPurchasesParams query = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build();
            client.queryPurchasesAsync(query, (queryResult, purchases) -> {
                Purchase found = queryResult.getResponseCode() == BillingClient.BillingResponseCode.OK ? matchingPurchase(purchases) : null;
                boolean valid = found != null && token.equals(found.getPurchaseToken()) && found.isAcknowledged() &&
                        found.getPurchaseState() == Purchase.PurchaseState.PURCHASED && isAuthentic(found);
                finishAcknowledgement(token, valid);
            });
        });
    }

    private void finishAcknowledgement(String token, boolean acknowledged) {
        acknowledgements.finish(token, acknowledged);
    }

    private boolean isAuthentic(Purchase purchase) {
        try {
            if (purchase.getPurchaseToken() == null || purchase.getPurchaseToken().isEmpty() ||
                    !PlayPurchaseVerifier.verify(publicKey, purchase.getOriginalJson(), purchase.getSignature())) return false;
            return getContext().getPackageName().equals(new JSONObject(purchase.getOriginalJson()).optString("packageName"));
        } catch (Exception ignored) { return false; }
    }

    @Override protected void handleOnDestroy() {
        PluginCall call;
        synchronized (this) { destroyed = true; call = active; waitingCall = null; waitingReady = null; acknowledgements.clear(); }
        if (call != null) finish(call, "unavailable");
        if (billing != null) billing.endConnection();
        billing = null;
    }
}
