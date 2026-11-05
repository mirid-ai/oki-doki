/** Settings modal behavior without relying on a browser or WebKit device. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/settings-modal.js', import.meta.url));
const { createSettingsModal } = await import(`data:text/javascript;base64,${source.toString('base64')}`);

function fixtures({ native = false } = {}) {
  const handlers = {};
  const timers = new Map();
  let timerId = 0;
  const view = {
    addEventListener(type, fn) { handlers[`window-${type}`] = fn; },
    setTimeout(fn, ms) { assert.equal(ms, 300); const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    flush() { const queued = [...timers.values()]; timers.clear(); queued.forEach((fn) => fn()); }
  };
  const doc = { activeElement: null, defaultView: view, addEventListener(type, fn) { handlers[type] = fn; } };
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.hidden = false; this.attrs = {}; this.classes = new Set(); this.children = []; this.isConnected = true; this.tabIndex = 0; }
    get classList() { return { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) }; }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    removeAttribute(name) { delete this.attrs[name]; }
    focus() { doc.activeElement = this; }
    scrollIntoView(options) { this.scrolled = options; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    closest() { return null; }
    contains(target) { return target === this || this.children.includes(target); }
    querySelectorAll() { return this.children; }
    addEventListener(type, fn) { this[`on${type}`] = fn; }
  }
  const dialog = new Element('dialog'), background = new Element(), trigger = new Element('button'), closeButton = new Element('button');
  const field = new Element('input'), hidden = new Element('input'); hidden.hidden = true;
  dialog.children = [closeButton, field, hidden];
  if (native) {
    dialog.open = false;
    dialog.showModal = () => { dialog.open = true; };
    dialog.pendingCloseEvents = [];
    dialog.close = () => { dialog.open = false; dialog.pendingCloseEvents.push(() => dialog.onclose?.()); };
    dialog.deliverClose = () => dialog.pendingCloseEvents.shift()?.();
  }
  trigger.focus();
  const modal = createSettingsModal({ dialog, background, trigger, closeButton, document: doc });
  return { doc, view, handlers, dialog, background, trigger, closeButton, field, modal };
}

{
  const h = fixtures();
  h.dialog.hidden = true;
  h.background.setAttribute('aria-hidden', 'false');
  h.modal.open();
  assert.equal(h.dialog.hidden, false);
  assert.equal(h.dialog.getAttribute('role'), 'dialog');
  assert.equal(h.dialog.getAttribute('aria-modal'), 'true');
  assert.equal(h.background.getAttribute('aria-hidden'), 'true');
  assert.ok(h.background.classes.has('settings-inert'));
  assert.equal(h.doc.activeElement, h.closeButton);
  let prevented = false;
  h.handlers.keydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.doc.activeElement, h.field);
  prevented = false;
  h.handlers.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.doc.activeElement, h.closeButton);
  h.handlers.focusin({ target: h.trigger }); assert.equal(h.doc.activeElement, h.closeButton);
  prevented = false;
  h.handlers.keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.dialog.hidden, true);
  assert.equal(h.background.getAttribute('aria-hidden'), 'false');
  assert.ok(!h.background.classes.has('settings-inert'));
  assert.equal(h.doc.activeElement, h.trigger);
  h.modal.open(); h.modal.close();
  assert.equal(h.dialog.hidden, true);
}

for (const native of [true, false]) {
  const h = fixtures({ native });
  h.dialog.hidden = true;
  h.modal.open();
  h.field.focus();
  h.handlers['window-resize']();
  h.view.flush();
  assert.deepEqual(h.field.scrolled, { block: 'nearest' }, 'focused field is brought into view after resizing');
  h.field.scrolled = null;
  h.handlers['window-resize']();
  h.closeButton.focus();
  h.view.flush();
  assert.equal(h.field.scrolled, null, 'a stale resize does not move a field after focus changes');
  h.field.focus();
  h.handlers['window-resize']();
  h.modal.close();
  h.view.flush();
  assert.equal(h.field.scrolled, null, 'a stale resize does not scroll a closed dialog');
}

{
  const h = fixtures({ native: true });
  h.dialog.hidden = true;
  h.modal.open();
  assert.equal(h.dialog.open, true); assert.equal(h.dialog.hidden, false);
  assert.equal(h.background.getAttribute('aria-hidden'), null);
  h.modal.close();
  assert.equal(h.dialog.open, false); assert.equal(h.dialog.hidden, true);
  h.modal.open();
  h.dialog.deliverClose(); // stale event from the earlier close
  assert.equal(h.dialog.open, true); assert.equal(h.dialog.hidden, false, 'a queued close event must not hide a reopened dialog');
  h.dialog.close(); // native Escape queues a close event
  h.dialog.deliverClose();
  assert.equal(h.dialog.hidden, true);
}
console.log('Settings modal supports native and older-WebKit dialogs, focus handling, and queued-close reopening.');
