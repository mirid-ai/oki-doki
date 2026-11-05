/** Settings dialog, including the pre-iOS 15.4 WebKit fallback. */
export function createSettingsModal({ dialog, background, trigger, closeButton, document: doc = globalThis.document }) {
  const native = typeof dialog.showModal === 'function' && typeof dialog.close === 'function';
  let fallbackOpen = false;
  let restoreFocus = null;
  let priorHidden = null;

  const candidates = () => [...dialog.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]')]
    .filter((element) => !element.disabled && !element.hidden && element.tabIndex !== -1 &&
      !(element.closest('details:not([open])') && element.tagName !== 'SUMMARY') &&
      element.getClientRects().length > 0);

  const close = () => {
    if (native) {
      if (dialog.open) dialog.close();
      dialog.hidden = true;
      return;
    }
    if (!fallbackOpen) return;
    fallbackOpen = false;
    dialog.hidden = true;
    dialog.removeAttribute('open');
    dialog.removeAttribute('role');
    dialog.removeAttribute('aria-modal');
    dialog.classList.remove('fallback-dialog');
    background.classList.remove('settings-inert');
    if (priorHidden === null) background.removeAttribute('aria-hidden');
    else background.setAttribute('aria-hidden', priorHidden);
    const destination = restoreFocus?.isConnected === false ? trigger : (restoreFocus || trigger);
    destination?.focus();
  };

  const open = () => {
    dialog.hidden = false;
    if (native) {
      try { dialog.showModal(); } catch (error) { dialog.hidden = true; throw error; }
      return;
    }
    if (fallbackOpen) return;
    fallbackOpen = true;
    restoreFocus = doc.activeElement;
    priorHidden = background.getAttribute('aria-hidden');
    background.setAttribute('aria-hidden', 'true');
    background.classList.add('settings-inert');
    dialog.setAttribute('open', '');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.classList.add('fallback-dialog');
    closeButton.focus();
  };

  // A close event is queued; a newer open may already have occurred by the
  // time it arrives. Only hide a dialog that is still closed.
  if (native) dialog.addEventListener('close', () => { if (!dialog.open) dialog.hidden = true; });
  doc.addEventListener('keydown', (event) => {
    if (!fallbackOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const items = candidates();
    if (!items.length) { event.preventDefault(); closeButton.focus(); return; }
    const index = items.indexOf(doc.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
    else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
  });
  doc.addEventListener('focusin', (event) => {
    if (fallbackOpen && !dialog.contains(event.target)) closeButton.focus();
  });
  // After a keyboard or orientation resize, old Android WebViews can leave
  // the focused field below the visible part of the modal. Wait for the
  // viewport to settle, and only move the field if it is still focused.
  const view = doc.defaultView;
  let resizeTimer;
  view?.addEventListener('resize', () => {
    const field = doc.activeElement;
    if (dialog.hidden || !field || !dialog.contains(field) || !/^(INPUT|TEXTAREA)$/.test(field.tagName)) return;
    view.clearTimeout(resizeTimer);
    resizeTimer = view.setTimeout(() => {
      if (!dialog.hidden && doc.activeElement === field && dialog.contains(field)) {
        field.scrollIntoView?.({ block: 'nearest' });
      }
    }, 300);
  });
  return { open, close };
}
