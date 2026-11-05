import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/consent-opening.js', import.meta.url));
const { createConsentOpening } = await import(`data:text/javascript;base64,${source.toString('base64')}`);

function fixture() {
  const listeners = new Map();
  const root = {
    hidden: false,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); }
  };
  const classes = new Set();
  const button = {
    style: {},
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    getBoundingClientRect: () => ({ width: 150, height: 48 })
  };
  let pending, calls = 0;
  const viewport = {
    innerWidth: 390, innerHeight: 844,
    setTimeout(fn, delay) { assert.equal(delay, 240); pending = fn; return 1; },
    clearTimeout() { pending = null; }
  };
  const opening = createConsentOpening({ root, button, viewport, onContinue: () => calls++ });
  function fire(type, props = {}) {
    const event = { button: 0, clientX: 0, clientY: 0, detail: 1,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...props };
    listeners.get(type)?.(event);
    return event;
  }
  return { root, button, classes, opening, fire, get calls() { return calls; },
    finish() { assert.ok(pending); const fn = pending; pending = null; fn(); } };
}

test('a first mouse click or touch-style tap moves the agree button under it and continues once', () => {
  for (const pointerType of ['mouse', 'touch']) for (const [x, y] of [[200, 400], [0, 0], [389, 843]]) {
    const f = fixture();
    f.fire('pointerdown', { pointerType, clientX: x, clientY: y });
    assert.ok(f.classes.has('caught'));
    const left = Number.parseFloat(f.button.style.left), top = Number.parseFloat(f.button.style.top);
    assert.ok(left <= x && x <= left + 150 && top <= y && y <= top + 48);
    const click = f.fire('click', { pointerType, clientX: x, clientY: y });
    assert.equal(click.prevented, true);
    assert.equal(click.stopped, true);
    assert.equal(f.root.hidden, false, 'the moved button remains visible briefly');
    f.fire('click', { clientX: x, clientY: y });
    f.finish();
    assert.equal(f.root.hidden, true);
    assert.equal(f.calls, 1);
  }
});

test('keyboard activation continues without inventing a pointer position', () => {
  const f = fixture();
  f.fire('click', { detail: 0 });
  assert.equal(f.classes.has('caught'), false);
  f.finish();
  assert.equal(f.calls, 1);
  assert.equal(f.root.hidden, true);
});

test('secondary mouse buttons do not trigger the agreement', () => {
  const f = fixture();
  f.fire('pointerdown', { button: 2, clientX: 200, clientY: 300 });
  f.fire('click', { button: 2, clientX: 200, clientY: 300 });
  assert.equal(f.root.hidden, false);
  assert.equal(f.classes.has('caught'), false);
  assert.equal(f.calls, 0);
});

test('a click without pointerdown still moves the button and reset cancels a pending continuation', () => {
  const f = fixture();
  f.fire('click', { clientX: 370, clientY: 800 });
  assert.ok(f.classes.has('caught'));
  f.opening.reset();
  assert.equal(f.root.hidden, false);
  assert.equal(f.button.style.left, '');
  assert.equal(f.classes.has('caught'), false);
  f.fire('click', { detail: 0 });
  f.finish();
  assert.equal(f.calls, 1);
  f.opening.destroy();
  f.fire('click');
  assert.equal(f.calls, 1);
});
