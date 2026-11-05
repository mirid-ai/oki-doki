import { readBoundedJson } from './bounded-json.js';

/** Read-only discovery for a running Mirid backend. No requests occur on import. */

export const DEFAULT_MIRID_URL = 'http://127.0.0.1:8000';
const DEFAULT_TIMEOUT_MS = 5000;

function discardBody(response) {
  try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch {}
}

function baseAddress(value) {
  let url;
  try { url = new URL(String(value || DEFAULT_MIRID_URL)); } catch { throw new TypeError('Enter a valid Mirid base URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('Use a Mirid base URL without a path, query, credentials or fragment; HTTP requires localhost.');
  }
  return url.origin;
}

function boundedString(value, length = 160) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, length) : '';
}

function strings(value) {
  if (!Array.isArray(value)) throw new Error('invalid');
  return [...new Set(value.slice(0, 200).map((entry) => boundedString(entry)).filter(Boolean))];
}

function timeoutValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(500, Math.min(30000, number)) : DEFAULT_TIMEOUT_MS;
}

async function getJson(url, { timeoutMs, signal }) {
  if (signal?.aborted) throw new Error('cancelled');
  const controller = new AbortController();
  let rejectWait;
  const cancelled = new Promise((_, reject) => { rejectWait = reject; });
  const cancel = () => { controller.abort(); rejectWait(new Error('cancelled')); };
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { controller.abort(); rejectWait(new Error('timeout')); }, timeoutMs);
  let response;
  try {
    if (signal?.aborted) {
      cancel();
      return await cancelled;
    }
    return await Promise.race([
      (async () => {
        response = await fetch(url, {
          method: 'GET', signal: controller.signal, credentials: 'omit',
          cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
          headers: { Accept: 'application/json' }
        });
        // Even an adapter that ignores abort may resolve after discovery has
        // timed out; dispose of that late response instead of reading it.
        if (controller.signal.aborted) { discardBody(response); throw new Error('cancelled'); }
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new Error('auth');
          if (response.status === 404) throw new Error('not_found');
          throw new Error('http');
        }
        const data = await readBoundedJson(response, { signal: controller.signal });
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid');
        return data;
      })(),
      cancelled
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    discardBody(response);
    controller.abort();
  }
}

function errorMessage(error, signal) {
  if (signal?.aborted || error?.message === 'cancelled') return 'Discovery was cancelled.';
  if (error?.message === 'timeout') return 'The request timed out.';
  if (error?.message === 'auth') return 'Access was denied; check Mirid access settings.';
  if (error?.message === 'not_found') return 'This endpoint is unavailable in the running Mirid version.';
  if (error?.message === 'invalid' || error instanceof SyntaxError) return 'Mirid returned an unexpected response.';
  return 'Could not reach this Mirid endpoint.';
}

/**
 * Read advertised capabilities, independently and with per-endpoint errors.
 * `available` means items were advertised, not that an engine is loaded or tested.
 * STT probing is opt-in because Mirid's available-engines route can load Whisper.
 * @param {{baseUrl?: string, timeoutMs?: number, signal?: AbortSignal,
 *          probeSpeechEngines?: boolean}} [options]
 */
export async function discoverMirid({ baseUrl = DEFAULT_MIRID_URL, timeoutMs = DEFAULT_TIMEOUT_MS, signal, probeSpeechEngines = false } = {}) {
  const baseUrlNormalized = baseAddress(baseUrl);
  const options = { timeoutMs: timeoutValue(timeoutMs), signal };
  const result = {
    baseUrl: baseUrlNormalized,
    health: null,
    text: { available: null, models: [] },
    stt: { available: null, engines: [], probed: false },
    tts: { available: null, engines: [], voices: [] },
    errors: {},
    warnings: {}
  };
  const run = async (key, path, use) => {
    try { use(await getJson(`${baseUrlNormalized}${path}`, options)); }
    catch (error) { result.errors[key] = errorMessage(error, signal); }
  };
  const jobs = [
    run('health', '/health', (data) => {
      if (typeof data.status !== 'string') throw new Error('invalid');
      result.health = {
        status: boundedString(data.status, 40),
        runtimeProfile: boundedString(data.runtime_profile, 40) || null,
        localModels: typeof data.local_models === 'boolean' ? data.local_models : null,
        localVoice: typeof data.local_voice === 'boolean' ? data.local_voice : null,
        cloudChat: typeof data.cloud_chat === 'boolean' ? data.cloud_chat : null,
        cloudVoice: typeof data.cloud_voice === 'boolean' ? data.cloud_voice : null
      };
    }),
    run('text', '/v1/models', (data) => {
      if (!Array.isArray(data.data)) throw new Error('invalid');
      const models = data.data.slice(0, 200).map((entry) => ({
        id: boundedString(entry?.id),
        kind: entry?.owned_by === 'mirid-local' ? 'local' : entry?.owned_by === 'mirid-provider' ? 'provider' : 'unknown'
      })).filter((entry) => entry.id);
      result.text = { available: models.length > 0, models };
    }),
    run('tts', '/tts/voices', (data) => {
      if (data.error) throw new Error('invalid');
      const engines = strings(data.available_engines);
      if (!Array.isArray(data.kokoro_voices) || !Array.isArray(data.chatterbox_voices)) throw new Error('invalid');
      const voices = [...data.kokoro_voices, ...data.chatterbox_voices].slice(0, 200).map((voice) => ({
        id: boundedString(voice?.id), name: boundedString(voice?.name), engine: boundedString(voice?.engine)
      })).filter((voice) => voice.id);
      result.tts = { available: engines.length > 0, engines, voices };
    })
  ];
  if (probeSpeechEngines) {
    result.stt.probed = true;
    jobs.push(run('stt', '/stt/available-engines', (data) => {
      const engines = strings(data.available_engines);
      result.stt = { available: engines.length > 0, engines, probed: true };
    }));
  } else {
    result.warnings.stt = 'Speech engines were not probed; Mirid may load Whisper to answer that request.';
  }
  await Promise.all(jobs);
  return result;
}
