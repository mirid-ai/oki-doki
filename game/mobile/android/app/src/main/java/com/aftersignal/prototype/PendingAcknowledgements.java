package com.aftersignal.prototype;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** Coalesce concurrent acknowledgement attempts for the same purchase token. */
final class PendingAcknowledgements {
    private final Map<String, List<Consumer<Boolean>>> waiting = new HashMap<>();

    synchronized boolean add(String token, Consumer<Boolean> callback) {
        List<Consumer<Boolean>> callbacks = waiting.get(token);
        if (callbacks != null) { callbacks.add(callback); return false; }
        callbacks = new ArrayList<>(); callbacks.add(callback); waiting.put(token, callbacks);
        return true;
    }

    void finish(String token, boolean success) {
        List<Consumer<Boolean>> callbacks;
        synchronized (this) { callbacks = waiting.remove(token); }
        if (callbacks != null) for (Consumer<Boolean> callback : callbacks) callback.accept(success);
    }

    synchronized void clear() { waiting.clear(); }
}
