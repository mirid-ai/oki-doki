package com.aftersignal.prototype;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import org.junit.Test;

public class PlayPurchaseSecurityTest {
    @Test public void onlyCompletedAuthenticPurchasesCanBeVerified() {
        assertEquals("error", PlayPurchasePolicy.decision(0, true));
        assertEquals("error", PlayPurchasePolicy.decision(1, false));
        assertEquals("verified", PlayPurchasePolicy.decision(1, true));
        assertEquals("pending", PlayPurchasePolicy.decision(2, true));
        assertEquals("pending", PlayPurchasePolicy.decision(2, false));
        assertEquals("error", PlayPurchasePolicy.decision(99, true));
    }

    @Test public void persistenceIsRequiredBeforeAcknowledgement() {
        java.util.concurrent.atomic.AtomicInteger writes = new java.util.concurrent.atomic.AtomicInteger();
        assertFalse(PlayPurchasePolicy.recordVerified("pending", () -> { writes.incrementAndGet(); return true; }));
        assertFalse(PlayPurchasePolicy.recordVerified("error", () -> { writes.incrementAndGet(); return true; }));
        assertEquals(0, writes.get());
        assertFalse(PlayPurchasePolicy.recordVerified("verified", () -> { writes.incrementAndGet(); return false; }));
        assertTrue(PlayPurchasePolicy.recordVerified("verified", () -> { writes.incrementAndGet(); return true; }));
        assertEquals(2, writes.get());
    }

    @Test public void simultaneousAcknowledgementsShareOneResult() {
        PendingAcknowledgements pending = new PendingAcknowledgements();
        java.util.List<Boolean> results = new java.util.ArrayList<>();
        assertTrue(pending.add("same-token", results::add));
        assertFalse(pending.add("same-token", results::add));
        assertTrue(pending.add("other-token", results::add));
        assertTrue(results.isEmpty());
        pending.finish("same-token", true);
        assertEquals(java.util.Arrays.asList(true, true), results);
        pending.finish("same-token", false);
        assertEquals(2, results.size());
        pending.finish("other-token", false);
        assertEquals(java.util.Arrays.asList(true, true, false), results);
    }

    @Test public void signatureRejectsAlteredPayloadWrongKeyAndInvalidInput() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair(), other = generator.generateKeyPair();
        String keyText = Base64.getEncoder().encodeToString(pair.getPublic().getEncoded());
        String payload = "{\"packageName\":\"com.example\",\"purchaseState\":0}";
        Signature signer = Signature.getInstance("SHA1withRSA");
        signer.initSign(pair.getPrivate()); signer.update(payload.getBytes(StandardCharsets.UTF_8));
        String signed = Base64.getEncoder().encodeToString(signer.sign());
        java.util.function.Function<String, byte[]> decode = value -> Base64.getDecoder().decode(value);
        assertNotNull(PlayPurchaseVerifier.parseKey(keyText, decode));
        assertTrue(PlayPurchaseVerifier.verify(pair.getPublic(), payload, signed, decode));
        assertFalse(PlayPurchaseVerifier.verify(pair.getPublic(), payload + "x", signed, decode));
        assertFalse(PlayPurchaseVerifier.verify(other.getPublic(), payload, signed, decode));
        assertFalse(PlayPurchaseVerifier.verify(pair.getPublic(), payload, "not base64!", decode));
        assertNull(PlayPurchaseVerifier.parseKey("not a key!", decode));
        generator.initialize(1024);
        String weak = Base64.getEncoder().encodeToString(generator.generateKeyPair().getPublic().getEncoded());
        assertNull(PlayPurchaseVerifier.parseKey(weak, decode));
    }
}
