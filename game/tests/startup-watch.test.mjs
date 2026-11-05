import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/startup-watch.js', import.meta.url), 'utf8');
function createFixture({ modules = true } = {}) {
  const listeners = new Map();
  const appEvents = new Map();
  const opening = { hidden: false };
  const panel = { hidden: true };
  const app = {
    src: 'https://example.test/oki/src/app.js',
    addEventListener(name, cb) { appEvents.set(name, cb); }
  };
  const document = {
    getElementById(id) { return ({ 'app-module': app, 'consent-opening': opening, 'startup-error': panel })[id] || null; },
    createElement() { return modules ? { noModule: false } : {}; }
  };
  const window = {
    addEventListener(name, cb) { listeners.set(name, cb); },
    removeEventListener(name, cb) { if (listeners.get(name) === cb) listeners.delete(name); }
  };
  runInNewContext(source, { document, window });
  return { opening, panel, appEvents, listeners };
}
test('unsupported module browsers show recovery guidance', () => {
  const fixture = createFixture({ modules: false });
  assert.equal(fixture.opening.hidden, true);
  assert.equal(fixture.panel.hidden, false);
});
test('supported browsers do not show the fallback on startup or unrelated errors', () => {
  const fixture = createFixture();
  assert.equal(fixture.opening.hidden, false);
  assert.equal(fixture.panel.hidden, true);
  fixture.listeners.get('error')({ filename: 'https://other.test/unrelated.js' });
  fixture.listeners.get('error')({ filename: 'https://example.test/oki/src/register-sw.js' });
  assert.equal(fixture.panel.hidden, true);
  fixture.appEvents.get('load')();
  assert.equal(fixture.listeners.has('error'), false);
  assert.equal(fixture.opening.hidden, false);
});
test('failed app module load and its dependency syntax errors show recovery guidance', () => {
  const missing = createFixture();
  missing.appEvents.get('error')();
  assert.equal(missing.panel.hidden, false);
  assert.equal(missing.opening.hidden, true);
  const brokenDependency = createFixture();
  brokenDependency.listeners.get('error')({ filename: 'https://example.test/oki/src/ai.js?old=1' });
  assert.equal(brokenDependency.panel.hidden, false);
  assert.equal(brokenDependency.opening.hidden, true);
});
