import { readBoundedJson } from './bounded-json.js';

// Detect the bundled desktop transcriber only when the player chooses it.
export async function readDesktopLocalASR(pageUrl, { fetchImpl = fetch, signal } = {}) {
  let page;
  try { page = new URL(pageUrl); } catch { throw new Error('The included transcription is available in the desktop package.'); }
  if (page.origin !== 'http://127.0.0.1:49564') throw new Error('The included transcription is available in the desktop package.');
  const response = await fetchImpl(new URL('/local-asr/status', page.origin), {
    signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
  });
  if (!response.ok) throw new Error('The included desktop transcription is unavailable.');
  const info = await readBoundedJson(response, { limit: 4096, signal });
  if (info?.available !== true || info.engine !== 'parakeet-cpp:tdt_ctc-110m:q4_k') {
    throw new Error('The included transcription files are unavailable. Extract the full desktop package.');
  }
  return { baseUrl: `${page.origin}/local-asr`, engine: info.engine };
}

// The bundled desktop runtime is deliberately started only by a button in
// settings. On ordinary web and mobile origins this performs no requests.
export async function startDesktopLocalAI(pageUrl, { fetchImpl = fetch, signal } = {}) {
  let page;
  try { page = new URL(pageUrl); } catch { throw new Error('The included AI is available in the desktop package.'); }
  if (page.origin !== 'http://127.0.0.1:49564') throw new Error('The included AI is available in the desktop package.');
  const options = { signal, credentials: 'omit', cache: 'no-store', redirect: 'error' };
  const status = await fetchImpl(new URL('/local-ai/status', page.origin), options);
  if (!status.ok) throw new Error('The included desktop AI is unavailable.');
  const info = await readBoundedJson(status, { limit: 4096, signal });
  if (info?.available !== true) throw new Error('The included desktop AI files are unavailable. Extract the complete package as described in START-HERE.');
  const response = await fetchImpl(new URL('/local-ai/start', page.origin), { ...options,
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!response.ok) throw new Error('The included desktop AI could not start.');
  const result = await readBoundedJson(response, { limit: 4096, signal });
  if (result?.ready !== true || typeof result.model !== 'string' || result.model !== result.model.trim() ||
      result.model.length > 150 || !/\.gguf$/i.test(result.model) || /[\\/<>:"|?*\u0000-\u001f\u007f-\u009f\ud800-\udfff\ufeff]/u.test(result.model)) {
    throw new Error('The included desktop AI returned invalid settings.');
  }
  return { endpoint: `${page.origin}/local-ai/v1/chat/completions`, model: result.model };
}

// Only the explicit local launcher exposes this non-secret configuration.
export async function readLocalLauncherSetup(pageUrl, { fetchImpl = fetch, signal } = {}) {
  let page;
  try { page = new URL(pageUrl); } catch { throw new Error('Open the local launcher URL first.'); }
  if (page.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(page.hostname)) {
    throw new Error('Open the local launcher URL first.');
  }
  const response = await fetchImpl(new URL('/.well-known/oki-doki-local.json', page.origin), {
    signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
  });
  if (!response.ok) throw new Error('Local launcher settings are unavailable. Start the launcher with a local AI or speech service.');
  const data = await readBoundedJson(response, { limit: 4096, signal });
  const validPort = (value) => Number.isInteger(value) && value >= 1024 && value <= 65535;
  // Model IDs here are filenames in the launcher's local model directory,
  // not arbitrary paths. Keep ordinary names such as "Model (Q4).gguf"
  // while rejecting separators, control characters and unsafe filenames.
  const validModel = (value) => typeof value === 'string' && value.length <= 150 &&
    value === value.trim() && /\.gguf$/i.test(value) &&
    !/[\\/<>:"|?*\u0000-\u001f\u007f-\u009f\ud800-\udfff\ufeff]/u.test(value);
  if (!data || ![1, 2].includes(data.version) ||
      (!(data.miridPort === null && data.model === null) && !(validPort(data.miridPort) && validModel(data.model))) ||
      (data.kokoroPort !== null && !validPort(data.kokoroPort)) ||
      (data.nanoPort !== null && !validPort(data.nanoPort)) ||
      (data.asrAvailable !== undefined && typeof data.asrAvailable !== 'boolean') ||
      (data.version === 2 && (data.asrAvailable !== false || data.miridPort === null)) ||
      (data.version === 1 && data.asrAvailable === false) ||
      (data.asrAvailable === true && data.miridPort === null) ||
      (data.miridPort === null && data.kokoroPort === null && data.nanoPort === null)) {
    throw new Error('Local launcher settings are invalid.');
  }
  const address = (port) => `http://127.0.0.1:${port}`;
  // Older launchers always required Parakeet when they supplied Mirid.
  const asrAvailable = data.miridPort !== null && data.asrAvailable !== false;
  return { miridUrl: data.miridPort === null ? '' : address(data.miridPort), model: data.model || '', asrAvailable,
    kokoroUrl: data.kokoroPort === null ? '' : address(data.kokoroPort),
    nanoUrl: data.nanoPort === null ? '' : address(data.nanoPort) };
}
