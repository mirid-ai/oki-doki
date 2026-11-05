/** Offline service-worker policy tests. Run: node tests/pwa.test.mjs */
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const scope = 'https://example.test/game/';
const handlers = {};
const additions = [];
const installationRequests = [];
const deleted = [];
const cachedResponse = { marker: 'static cache' };
let fetches = 0;
let cacheMatch = cachedResponse;
let lastMatched;
let installedCacheName;
const obsoleteCacheName = `after-the-signal-shell-v2:${encodeURIComponent(scope)}:v1`;
const otherScopeCacheName = `after-the-signal-shell-v2:${encodeURIComponent('https://example.test/other/')}:v1`;
const legacyCacheName = 'after-the-signal-shell-v136';
const cache = {
  addAll: async (requests) => { installationRequests.push(...requests); additions.push(...requests.map((request) => request.url)); },
  match: async (key) => { lastMatched = key; return cacheMatch; }
};
const caches = {
  open: async (name) => {
    assert.equal(typeof name, 'string');
    assert.ok(name.length > 0);
    if (installedCacheName === undefined) installedCacheName = name;
    else assert.equal(name, installedCacheName, 'Fetches must use the cache installed for this release');
    return cache;
  },
  keys: async () => [installedCacheName, obsoleteCacheName, otherScopeCacheName, legacyCacheName, 'unrelated-cache'],
  delete: async (name) => { deleted.push(name); return true; }
};
const self = { registration: { scope }, addEventListener: (type, fn) => { handlers[type] = fn; } };
vm.runInNewContext(source, { self, caches, URL, Request, Set, Promise, fetch: async () => { fetches++; return { marker: 'network' }; } });

const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };
await test('install caches the fixed local shell and every asset exists', async () => {
  let pending;
  handlers.install({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.ok(installationRequests.every((request) => request.cache === 'reload'), 'installation bypasses stale HTTP cache entries');
  assert.ok(additions.includes(scope));
  assert.ok(additions.includes(`${scope}index.html`));
  for (const url of additions) {
    assert.ok(url.startsWith(scope));
    assert.equal(new URL(url).search, '');
    const relative = url.slice(scope.length) || 'index.html';
    assert.ok((await stat(new URL(relative, root))).isFile(), `Missing shell file: ${relative}`);
  }
  for (const kind of ['star', 'bell', 'ribbon']) {
    assert.ok(additions.includes(`${scope}assets/screen-signal-${kind}.svg`), `Screen drawing ${kind} must be available offline`);
  }
  for (const file of ['src/publisher-voice.js', 'src/mic-worklet.js', 'src/bounded-json.js', 'src/sound.js', 'src/settings-modal.js', 'src/preference.js', 'src/story-next.js', 'src/visual-phase.js', 'src/souvenir.js', 'assets/souvenir-niko-care.svg', 'assets/souvenir-niko-play.svg', 'assets/souvenir-mira-care.svg', 'assets/souvenir-mira-play.svg', 'assets/souvenir-mira-play-closed.svg', 'assets/souvenir-ash-care.svg', 'assets/souvenir-ash-play.svg', 'src/repair-kit.js', 'src/repair-billing.js', 'assets/arcade.png', 'assets/hideout.png', 'assets/hideout-shadow.png', 'assets/sewing-room.png', 'assets/stair-landing.png', 'assets/playroom.png', 'assets/playroom-dark.png', 'assets/niko.png', 'assets/niko-concerned.png', 'assets/mira.png', 'assets/mira-concerned.png', 'assets/ash.png', 'assets/ash-concerned.png', 'assets/mallow.png', 'assets/mallow-concerned.png', 'manifest.webmanifest']) {
    assert.ok(additions.includes(scope + file), `Shell omitted ${file}`);
  }
});

await test('screen-drawing arrival animations respect reduced motion', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(css, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{\s*\.ticket-signal-arriving\s*\{\s*animation\s*:\s*none\s*!important\s*;/);
});

await test('the companion locations use the matching scene art', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.stage\[data-location="sewing"\]\s+\.backdrop\s*\{[^}]*url\(['"]?\.\.\/assets\/sewing-room\.png['"]?\)/);
  assert.match(css, /\.stage\[data-location="stairs"\]\s+\.backdrop\s*\{[^}]*url\(['"]?\.\.\/assets\/stair-landing\.png['"]?\)/);
});

await test('the recent story scroll area is keyboard focusable with a visible focus indicator', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const list = html.match(/<ol\b[^>]*\bid="story-history-list"[^>]*>/i)?.[0];
  assert.ok(list, 'the recent story list exists');
  assert.match(list, /\btabindex="0"/i);
  assert.match(list, /\baria-label="Recent story passages"/i);
  assert.match(css, /\.story-history ol\s*\{[^}]*overflow-y:auto/);
  assert.match(css, /\.story-history ol:focus\s*\{[^}]*outline:/);
});

await test('manifest references real icons and a scoped standalone entry', async () => {
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const appleTitle = html.match(/<meta\s+name="apple-mobile-web-app-title"\s+content="([^"]+)"\s*\/?\s*>/i)?.[1];
  assert.equal(appleTitle, manifest.short_name, 'iOS home-screen name should match the app manifest');
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some((icon) => icon.sizes === size));
  for (const icon of manifest.icons) assert.ok((await stat(new URL(icon.src, root))).isFile());
});

await test('standalone layout accounts for phone cutouts and system bars', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(html, /<meta\s+name="viewport"[^>]*viewport-fit=cover/i);
  const rules = (selector) => [...css.matchAll(new RegExp(`(?:^|[}\\s])${selector}\\s*\\{([^}]+)\\}`, 'gm'))].map((match) => match[1]);
  assert.ok(rules('\\.app').some((rule) => /padding-left:env\(safe-area-inset-left/.test(rule) && /padding-right:env\(safe-area-inset-right/.test(rule)));
  assert.ok(rules('\\.topbar').every((rule) => !/padding-top:10px/.test(rule)));
  assert.ok(rules('\\.topbar').some((rule) => /safe-area-inset-top/.test(rule)));
  assert.ok(rules('\\.footer').some((rule) => /safe-area-inset-bottom/.test(rule)));
  assert.ok(rules('dialog').some((rule) => /safe-area-inset-left/.test(rule) && /safe-area-inset-right/.test(rule) && /safe-area-inset-top/.test(rule) && /safe-area-inset-bottom/.test(rule)));
});

await test('activation removes only older caches for this installation scope', async () => {
  let pending;
  handlers.activate({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.notEqual(installedCacheName, obsoleteCacheName);
  assert.deepEqual(deleted, [obsoleteCacheName]);
  assert.ok(!deleted.includes(installedCacheName), 'The current cache must be retained');
  assert.ok(!deleted.includes(otherScopeCacheName), 'Another installation on the same origin must be retained');
  assert.ok(!deleted.includes(legacyCacheName), 'An older unscoped cache may still serve another installation');
  assert.ok(!deleted.includes('unrelated-cache'), 'Unrelated caches must be retained');
});

await test('updating one installation leaves another installation usable offline', async () => {
  const entries = new Map();
  const sharedCaches = {
    open: async (name) => {
      if (!entries.has(name)) entries.set(name, new Map());
      const files = entries.get(name);
      return {
        addAll: async (requests) => { for (const request of requests) files.set(request.url, { marker: request.url }); },
        match: async (request) => files.get(request.url)
      };
    },
    keys: async () => [...entries.keys()],
    delete: async (name) => entries.delete(name)
  };
  const secondScope = 'https://example.test/other/';
  const start = (script, registrationScope) => {
    const events = {};
    const worker = { registration: { scope: registrationScope }, addEventListener: (name, fn) => { events[name] = fn; } };
    vm.runInNewContext(script, { self: worker, caches: sharedCaches, URL, Request, Set, Promise, fetch: async () => { throw new Error('network offline'); } });
    return events;
  };
  const run = async (events, event) => {
    let pending;
    events[event]({ waitUntil: (promise) => { pending = promise; } });
    await pending;
  };
  const a = start(source, scope);
  const b = start(source, secondScope);
  await run(a, 'install'); await run(a, 'activate');
  await run(b, 'install'); await run(b, 'activate');
  assert.equal(entries.size, 2, 'independent installations must use independent caches');
  const updated = source.replace(/(\$\{CACHE_PREFIX\}v)(\d+)/, (_, prefix, version) => `${prefix}${Number(version) + 1}`);
  assert.notEqual(updated, source, 'a new worker version must be modeled');
  const aNext = start(updated, scope);
  await run(aNext, 'install'); await run(aNext, 'activate');
  assert.equal(entries.size, 2, 'updating one scope removes only its prior release');
  let response;
  b.fetch({ request: request(secondScope + 'src/app.js'), respondWith: (promise) => { response = promise; } });
  assert.equal((await response).marker, secondScope + 'src/app.js', 'the other installation still serves its own cached shell offline');
});

await test('a waiting worker activates only on an explicit update message', async () => {
  let activations = 0;
  self.skipWaiting = async () => { activations++; };
  let pending;
  handlers.message({ data: { type: 'OTHER' }, waitUntil: (promise) => { pending = promise; } });
  assert.equal(activations, 0);
  assert.equal(pending, undefined);
  handlers.message({ data: { type: 'APPLY_UPDATE' }, waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.equal(activations, 1);
});

function request(url, { method = 'GET', authorization = false, mode = 'cors' } = {}) {
  return { url, method, mode, headers: { has: (key) => key.toLowerCase() === 'authorization' && authorization } };
}
function dispatch(req) {
  let response;
  handlers.fetch({ request: req, respondWith: (promise) => { response = promise; } });
  return response;
}
await test('known shell files use the cache with network fallback only on a cache miss', async () => {
  const fromCache = dispatch(request(scope + 'src/app.js'));
  assert.equal(await fromCache, cachedResponse);
  assert.equal(fetches, 0);
  cacheMatch = null;
  const missing = dispatch(request(scope + 'assets/arcade.png'));
  assert.equal((await missing).marker, 'network');
  assert.equal(fetches, 1);
  cacheMatch = cachedResponse;
});

await test('creator audition navigation uses only the query-free cached shell', async () => {
  for (const path of ['', 'index.html']) {
    const response = dispatch(request(`${scope}${path}?voice-creator=1`, { mode: 'navigate' }));
    assert.equal(await response, cachedResponse);
    assert.equal(lastMatched, `${scope}${path}`, 'the query never enters the cache lookup');
  }
  for (const req of [
    request(scope + '?voice-creator=1'),
    request(scope + '?voice-creator=1&player=private', { mode: 'navigate' }),
    request(scope + '?voice-creator=0', { mode: 'navigate' }),
    request(scope + 'src/app.js?voice-creator=1', { mode: 'navigate' }),
    request(scope + '?voice-creator=1', { mode: 'navigate', authorization: true }),
    request(scope + '?voice-creator=1', { mode: 'navigate', method: 'POST' }),
    request('https://elsewhere.test/game/?voice-creator=1', { mode: 'navigate' })
  ]) assert.equal(dispatch(req), undefined, `Intercepted ${req.method} ${req.url}`);
  cacheMatch = null;
  const miss = dispatch(request(scope + '?voice-creator=1', { mode: 'navigate' }));
  assert.equal((await miss).marker, 'network', 'a cache miss preserves the original network request');
  assert.equal(fetches, 2);
  cacheMatch = cachedResponse;
});

await test('API, player data, uploads, unknown, query and cross-origin requests are untouched', async () => {
  for (const req of [
    request(scope + 'v1/chat/completions'),
    request(scope + 'transcribe', { method: 'POST' }),
    request(scope + 'tts', { method: 'POST' }),
    request(scope + 'src/app.js?player=private'),
    request(scope + 'index.html', { authorization: true }),
    request(scope + 'src/app.js', { method: 'POST' }),
    request('https://elsewhere.test/game/src/app.js'),
    request('http://127.0.0.1:8000/v1/models'),
    request(scope + 'private.wav')
  ]) assert.equal(dispatch(req), undefined, `Intercepted ${req.method} ${req.url}`);
  assert.equal(fetches, 2);
});

await test('registration works in browsers and is skipped in native Capacitor', async () => {
  const registration = await readFile(new URL('../src/register-sw.js', import.meta.url), 'utf8');
  const calls = [];
  const navigator = { serviceWorker: { register: (url) => { calls.push(url); return Promise.resolve(); } } };
  vm.runInNewContext(registration, { navigator });
  assert.deepEqual(calls, ['./sw.js']);
  vm.runInNewContext(registration, { navigator, Capacitor: { isNativePlatform: () => true } });
  assert.deepEqual(calls, ['./sw.js']);
  assert.doesNotThrow(() => vm.runInNewContext(registration, {}));
});

await test('a waiting release is offered without interrupting play and reloads only on request', async () => {
  const registrationSource = await readFile(new URL('../src/register-sw.js', import.meta.url), 'utf8');
  const serviceEvents = {}, registrationEvents = {}, buttonEvents = {}, workerEvents = {};
  const messages = [];
  const button = { hidden: true, disabled: false, textContent: '', addEventListener: (event, fn) => { buttonEvents[event] = fn; } };
  const worker = { state: 'installing', addEventListener: (event, fn) => { workerEvents[event] = fn; }, postMessage: (message) => { messages.push(message); } };
  const registration = { waiting: null, installing: worker, addEventListener: (event, fn) => { registrationEvents[event] = fn; } };
  const service = { controller: {}, register: async () => registration, addEventListener: (event, fn) => { serviceEvents[event] = fn; } };
  let reloads = 0;
  vm.runInNewContext(registrationSource, { navigator: { serviceWorker: service }, document: { getElementById: () => button }, window: { location: { reload: () => { reloads++; } } }, setTimeout, clearTimeout });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(button.hidden, true, 'an installing worker is not offered before it is ready');
  registration.waiting = worker; worker.state = 'installed'; workerEvents.statechange();
  assert.equal(button.hidden, false);
  assert.match(button.textContent, /save first/i);
  assert.equal(reloads, 0, 'an installed update must not reload an in-progress story');
  buttonEvents.click(); buttonEvents.click();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'APPLY_UPDATE');
  assert.equal(button.disabled, true);
  serviceEvents.controllerchange();
  assert.equal(reloads, 1);
});

console.log('All PWA policy tests passed.');
