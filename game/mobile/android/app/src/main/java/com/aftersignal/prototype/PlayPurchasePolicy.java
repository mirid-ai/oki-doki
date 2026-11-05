package com.aftersignal.prototype;

/** Entitlement state, before acknowledging a completed purchase. */
final class PlayPurchasePolicy {
    static String decision(int state, boolean authentic) {
        if (state == 2) return "pending"; // Play PurchaseState.PENDING
        if (state == 1 && authentic) return "verified"; // PurchaseState.PURCHASED
        return "error";
    }

    // Never acknowledge before a verified entitlement has been recorded.
    static boolean recordVerified(String decision, java.util.function.BooleanSupplier persist) {
        return "verified".equals(decision) && persist.getAsBoolean();
    }
}
