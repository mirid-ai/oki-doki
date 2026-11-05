package com.aftersignal.prototype;

import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.function.Function;

/** Verifies the signed Play purchase payload; this is not server-side verification. */
final class PlayPurchaseVerifier {
    static PublicKey parseKey(String encoded) {
        return parseKey(encoded, value -> Base64.decode(value, Base64.DEFAULT));
    }

    static PublicKey parseKey(String encoded, Function<String, byte[]> decoder) {
        try {
            byte[] bytes = decoder.apply(encoded);
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(bytes));
            // Invalid or undersized keys fail closed.
            if (!(key instanceof java.security.interfaces.RSAPublicKey) ||
                    ((java.security.interfaces.RSAPublicKey) key).getModulus().bitLength() < 2048) return null;
            return key;
        } catch (Exception ignored) { return null; }
    }

    static boolean verify(PublicKey key, String payload, String signed) {
        return verify(key, payload, signed, value -> Base64.decode(value, Base64.DEFAULT));
    }

    static boolean verify(PublicKey key, String payload, String signed, Function<String, byte[]> decoder) {
        if (key == null || payload == null || payload.isEmpty() || signed == null || signed.isEmpty()) return false;
        try {
            Signature signature = Signature.getInstance("SHA1withRSA");
            signature.initVerify(key);
            signature.update(payload.getBytes(StandardCharsets.UTF_8));
            return signature.verify(decoder.apply(signed));
        } catch (Exception ignored) { return false; }
    }
}
