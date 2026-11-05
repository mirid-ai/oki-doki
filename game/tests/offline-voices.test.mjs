/** Optional offline voice download protocol and cache policy. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/offline-voices.js', import.meta.url), 'utf8');
const { downloadOfflineVoices, offlineVoicesStatus } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const setWorker = worker => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { controller: worker } } });
try {
  setWorker(null);
  await assert.rejects(offlineVoicesStatus(), /installed web app/);
  const messages = [];
  setWorker({ postMessage(message, [port]) {
    messages.push(message.type);
    if (message.type === 'OFFLINE_VOICES_STATUS') port.postMessage({ type: 'status', ready: true });
    if (message.type === 'DOWNLOAD_OFFLINE_VOICES') {
      port.postMessage({ type: 'progress', completed: 1, total: 2, bytes: 10 });
      port.postMessage({ type: 'done', ready: true });
    }
  } });
  assert.deepEqual(await offlineVoicesStatus(), { ready: true });
  const progress = [];
  assert.deepEqual(await downloadOfflineVoices({ onProgress: p => progress.push(p) }), { ready: true });
  assert.deepEqual(progress, [{ completed: 1, total: 2, bytes: 10 }]);
  assert.deepEqual(messages, ['OFFLINE_VOICES_STATUS', 'DOWNLOAD_OFFLINE_VOICES']);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(downloadOfflineVoices({ signal: aborted.signal }), { name: 'AbortError' });
  assert.equal(messages.length, 2, 'an already-canceled request never starts a download');
  setWorker({ postMessage(_message, [port]) { port.postMessage({ type: 'error', message: 'Storage unavailable.' }); } });
  await assert.rejects(downloadOfflineVoices(), /Storage unavailable/);
} finally {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
}

const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://example.test/game/';
const handlers = {};
const cached = { marker: 'voice cache' }, online = { marker: 'network' };
let ready = true, fetches = 0;
const cache = { match: async key => typeof key === 'string' && key.endsWith('/.oki-offline-voices-ready') ? (ready ? cached : null) : cached };
const self = { registration: { scope }, addEventListener: (type, callback) => { handlers[type] = callback; } };
vm.runInNewContext(serviceWorker, { self, URL, Request, Set, Promise, caches: { open: async () => cache }, fetch: async () => { fetches++; return online; } });
function dispatch(url, { method = 'GET', authorization = false } = {}) {
  let response;
  handlers.fetch({ request: { url, method, headers: { has: () => authorization } }, respondWith: result => { response = result; } });
  return response;
}
const clip = scope + 'assets/voices/' + 'a'.repeat(64) + '.mp3';
for (const url of [clip, scope + 'assets/voices/manifest.json', scope + 'assets/kokoro-local/worker.js?rev=3', scope + 'assets/kokoro-local/models/kokoro/onnx/model_quantized.onnx']) {
  assert.equal(await dispatch(url), cached, `Public voice asset should use its completed cache: ${url}`);
}
for (const url of [clip + '?player=private', scope + 'assets/voices/private.mp3', scope + 'assets/kokoro-local/worker.js?user=private', scope + 'v1/chat/completions', 'https://elsewhere.test/game/assets/voices/' + 'a'.repeat(64) + '.mp3']) {
  assert.equal(dispatch(url), undefined, `Player/API/other-origin requests must pass through: ${url}`);
}
assert.equal(dispatch(clip, { authorization: true }), undefined);
assert.equal(dispatch(clip, { method: 'POST' }), undefined);
ready = false;
assert.equal(await dispatch(clip), online, 'an incomplete pack never serves partial files');
assert.equal(fetches, 1);
console.log('Offline voice protocol and cache policy passed.');
