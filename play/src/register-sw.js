// Native Capacitor bundles already carry their assets; don't put a second,
// potentially stale service-worker cache between a native update and the app.
if (typeof navigator !== 'undefined' && navigator.serviceWorker &&
    !(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform?.())) {
  const service = navigator.serviceWorker;
  service.register('./sw.js').then((registration) => {
    const button = typeof document === 'undefined' ? null : document.getElementById('update-app');
    if (!registration || !button || typeof service.addEventListener !== 'function') return;
    let requested = false;
    let timer = null;
    const watched = new WeakSet();
    const showWaiting = () => {
      if (registration.waiting && service.controller && !requested) {
        button.textContent = 'Update available — save first';
        button.disabled = false;
        button.hidden = false;
      }
    };
    const watch = (worker) => {
      if (!worker || watched.has(worker) || typeof worker.addEventListener !== 'function') return;
      watched.add(worker);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') showWaiting();
      });
    };
    registration.addEventListener('updatefound', () => watch(registration.installing));
    watch(registration.installing);
    service.addEventListener('controllerchange', () => {
      if (!requested) { button.hidden = true; return; }
      clearTimeout(timer);
      window.location.reload();
    });
    button.addEventListener('click', () => {
      const waiting = registration.waiting;
      if (!waiting || requested) return;
      requested = true;
      button.disabled = true;
      button.textContent = 'Updating…';
      try {
        waiting.postMessage({ type: 'APPLY_UPDATE' });
        timer = setTimeout(() => {
          // An older worker may not understand the message. The normal
          // lifecycle activates it after all game tabs close.
          requested = false;
          button.textContent = 'Close game tabs to update';
          button.disabled = true;
        }, 10000);
      } catch {
        requested = false;
        button.textContent = 'Close game tabs to update';
      }
    });
    showWaiting();
  }).catch(() => {
    // The game remains playable online when service workers are unavailable.
  });
}
