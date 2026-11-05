// Cache only this release's public game shell. API calls and player data never
// enter this cache; unknown requests are left to the browser untouched.
// CacheStorage is shared across an entire origin, even between independent
// installations at different paths. Include this registration's scope so an
// update under one path cannot delete another path's offline shell.
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `after-the-signal-shell-v2:${encodeURIComponent(SCOPE)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v256`;
const STATIC_FILES = [
  './', './index.html', './manifest.webmanifest',
  './src/app.js', './src/publisher-voice.js', './src/local-setup.js', './src/consent-opening.js', './src/story-next.js', './src/visual-phase.js', './src/ai.js', './src/mirid.js', './src/bounded-json.js', './src/preference.js', './src/repair-kit.js', './src/repair-billing.js',
  './src/souvenir.js', './src/startup-watch.js',
  './src/speech.js', './src/microphone.js', './src/mic-worklet.js',
  './src/voice-ui.js', './src/voice-cues.js', './src/local-kokoro.js', './src/offline-voices.js', './src/realtime-speech.js', './src/sound.js', './src/settings-modal.js', './src/style.css', './src/register-sw.js',
  './assets/arcade.png', './assets/hideout.png', './assets/hideout-shadow.png', './assets/sewing-room.png', './assets/stair-landing.png', './assets/playroom.png', './assets/playroom-dark.png',
  './assets/niko.png', './assets/niko-concerned.png', './assets/mira.png', './assets/mira-concerned.png', './assets/ash.png', './assets/ash-concerned.png', './assets/mallow.png', './assets/mallow-concerned.png',
  './assets/souvenir-niko-care.svg', './assets/souvenir-niko-play.svg', './assets/souvenir-mira-care.svg', './assets/souvenir-mira-play.svg', './assets/souvenir-mira-play-closed.svg', './assets/souvenir-ash-care.svg', './assets/souvenir-ash-play.svg',
  './assets/screen-signal-star.svg', './assets/screen-signal-bell.svg', './assets/screen-signal-ribbon.svg',
  './assets/mallow-icon-192.png', './assets/mallow-icon-512.png',
  './assets/mallow-icon-maskable.png', './assets/mallow-apple-touch.png'
];
const ALLOWED = new Set(STATIC_FILES.map((path) => new URL(path, SCOPE).href));

// The voice pack is an explicit player-requested download, never a side
// effect of loading the game. Caches are isolated by install scope and shell
// release. The marker is written last, so an interrupted download cannot be
// mistaken for a complete pack. No player text or API request is cached.
const VOICE_PREFIX = `oki-doki-offline-voices:${encodeURIComponent(SCOPE)}:`;
const VOICE_CACHE = VOICE_PREFIX + CACHE_NAME.slice(CACHE_PREFIX.length);
const VOICE_MARKER = new URL('./.oki-offline-voices-ready', SCOPE).href;
const VOICE_MANIFEST = new URL('./assets/voices/manifest.json', SCOPE).href;
const KOKORO_FILES = [
  './assets/kokoro-local/worker.js?rev=3',
  './assets/kokoro-local/runtime/ort-wasm-simd-threaded.jsep.js',
  './assets/kokoro-local/runtime/ort-wasm-simd-threaded.jsep.wasm',
  './assets/kokoro-local/models/kokoro/config.json',
  './assets/kokoro-local/models/kokoro/tokenizer.json',
  './assets/kokoro-local/models/kokoro/tokenizer_config.json',
  './assets/kokoro-local/models/kokoro/onnx/model_quantized.onnx',
  ...['af_heart', 'af_sarah', 'af_nicole', 'am_adam', 'af_bella', 'bm_george', 'bf_emma']
    .map(name => `./assets/kokoro-local/models/kokoro/voices/${name}.bin`)
].map(path => new URL(path, SCOPE).href);
const KOKORO_URLS = new Set(KOKORO_FILES);
const MAX_VOICE_BYTES = 256 * 1024 * 1024;
const MAX_VOICE_ENTRIES = 5000;
let voiceDownload = null;

function voiceRequest(url) {
  if (KOKORO_URLS.has(url.href) || url.href === VOICE_MANIFEST) return true;
  const folder = new URL('./assets/voices/', SCOPE).href;
  return !url.search && !url.hash && url.href.startsWith(folder) &&
    /^[a-f0-9]{64}\.mp3$/.test(url.href.slice(folder.length));
}

async function voiceReady() {
  const cache = await caches.open(VOICE_CACHE);
  return Boolean(await cache.match(VOICE_MARKER));
}

async function downloadVoicePack(port) {
  if (voiceDownload) { port.postMessage({ type: 'error', message: 'A voice download is already running.' }); port.close?.(); return; }
  const controller = new AbortController();
  let canceled = false;
  voiceDownload = controller;
  port.onmessage = event => { if (event.data?.type === 'cancel') { canceled = true; controller.abort(); } };
  port.start?.();
  let completed = 0, bytes = 0;
  try {
    if (await voiceReady()) { port.postMessage({ type: 'done', ready: true }); return; }
    await caches.delete(VOICE_CACHE);
    const cache = await caches.open(VOICE_CACHE);
    const manifestResponse = await fetch(VOICE_MANIFEST, { cache: 'reload', signal: controller.signal, credentials: 'omit' });
    if (!manifestResponse.ok) throw new Error('Could not load the voice list.');
    const manifestText = await manifestResponse.text();
    if (manifestText.length > 2 * 1024 * 1024) throw new Error('The voice list is too large.');
    const manifest = JSON.parse(manifestText);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('The voice list is invalid.');
    const names = [...new Set(Object.values(manifest))];
    if (!names.length || names.length > MAX_VOICE_ENTRIES || names.some(name => typeof name !== 'string' || !/^[a-f0-9]{64}\.mp3$/.test(name))) throw new Error('The voice list is invalid.');
    const files = [VOICE_MANIFEST, ...names.map(name => new URL(`./assets/voices/${name}`, SCOPE).href), ...KOKORO_FILES];
    await cache.put(VOICE_MANIFEST, new Response(manifestText, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
    bytes = new TextEncoder().encode(manifestText).length; completed = 1;
    port.postMessage({ type: 'progress', completed, total: files.length, bytes });
    let index = 1, failure = null;
    async function worker() {
      while (!failure && index < files.length) {
        const url = files[index++];
        try {
          const response = await fetch(url, { cache: 'reload', signal: controller.signal, credentials: 'omit' });
          if (!response.ok || !response.body || /^text\/html\b/i.test(response.headers.get('content-type') || '')) throw new Error('A voice file could not be downloaded.');
          const reader = response.body.getReader();
          const stream = new ReadableStream({
            async pull(target) {
              try {
                const item = await reader.read();
                if (item.done) { target.close(); return; }
                bytes += item.value.byteLength;
                if (bytes > MAX_VOICE_BYTES) { controller.abort(); throw new Error('The voice pack exceeds its storage limit.'); }
                target.enqueue(item.value);
              } catch (error) { target.error(error); }
            },
            cancel() { return reader.cancel(); }
          });
          const headers = new Headers(response.headers);
          headers.delete('content-length'); headers.delete('content-encoding');
          await cache.put(url, new Response(stream, { status: response.status, statusText: response.statusText, headers }));
          completed++;
          port.postMessage({ type: 'progress', completed, total: files.length, bytes });
        } catch (error) { if (!failure) failure = error; controller.abort(); }
      }
    }
    await Promise.all(Array.from({ length: 6 }, () => worker()));
    if (failure) throw failure;
    if (controller.signal.aborted) throw new Error('Voice download canceled.');
    await cache.put(VOICE_MARKER, new Response('ready'));
    // The previous release remains intact until this pack has fully finished.
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(VOICE_PREFIX) && key !== VOICE_CACHE).map(key => caches.delete(key)));
    port.postMessage({ type: 'done', ready: true });
  } catch (error) {
    await caches.delete(VOICE_CACHE);
    port.postMessage({ type: 'error', message: canceled ? 'Voice download canceled.' : 'Voice download failed. Check your connection and device storage, then try again.' });
  } finally { voiceDownload = null; port.close?.(); }
}

self.addEventListener('install', (event) => {
  // A host may cache unversioned module URLs for hours. Fetch every asset
  // from the current release instead of copying a fresh-but-old HTTP cache
  // entry into the new offline shell. Cache.addAll remains atomic on failure.
  const requests = [...ALLOWED].map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))));
});

// A waiting release takes over only when a player explicitly chooses the
// update button. Normal installation and offline play never force a reload.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'APPLY_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'OFFLINE_VOICES_STATUS' && event.ports?.[0]) {
    const port = event.ports[0];
    event.waitUntil(voiceReady().then(ready => port.postMessage({ type: 'status', ready })).catch(() => port.postMessage({ type: 'status', ready: false })).finally(() => port.close?.()));
  }
  if (event.data?.type === 'DOWNLOAD_OFFLINE_VOICES' && event.ports?.[0]) event.waitUntil(downloadVoicePack(event.ports[0]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('Authorization')) return;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (voiceRequest(url)) {
    event.respondWith(caches.open(VOICE_CACHE).then(async cache => {
      if (await cache.match(VOICE_MARKER)) return (await cache.match(request)) || fetch(request);
      return fetch(request);
    }));
    return;
  }
  // The local creator audition link is still the same public game shell. On
  // navigation, look up its query-free shell without storing or
  // forwarding the query into CacheStorage. All other query requests pass by.
  if (url.search) {
    if (url.search !== '?voice-creator=1' || url.hash || request.mode !== 'navigate') return;
    const shell = new URL(url.href);
    shell.search = '';
    const root = new URL('./', SCOPE).href;
    const index = new URL('./index.html', SCOPE).href;
    if (shell.href !== root && shell.href !== index) return;
    event.respondWith(caches.open(CACHE_NAME).then((cache) => cache.match(shell.href))
      .then((cached) => cached || fetch(request)));
    return;
  }
  if (url.hash || !ALLOWED.has(url.href)) return;
  event.respondWith(caches.open(CACHE_NAME).then((cache) => cache.match(request))
    .then((cached) => cached || fetch(request)));
});
