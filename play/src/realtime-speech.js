// Experimental OpenAI Realtime TTS. A trusted server supplies the short-lived
// client secret; this browser adapter never handles a standard OpenAI API key.
// Each request uses a fresh session and returns buffered 24 kHz PCM as WAV.
const LIMIT = 20 * 1024 * 1024;
const MAX_EVENT = 1024 * 1024;
const URL_BASE = 'wss://api.openai.com/v1/realtime';

function wav(chunks, size) {
  if (!size || size % 2 || size + 44 > LIMIT) throw new Error('The Realtime service returned invalid audio.');
  const data = new Uint8Array(size + 44), view = new DataView(data.buffer);
  const put = (at, text) => { for (let i = 0; i < text.length; i++) data[at + i] = text.charCodeAt(i); };
  put(0, 'RIFF'); view.setUint32(4, size + 36, true); put(8, 'WAVE'); put(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true); view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  put(36, 'data'); view.setUint32(40, size, true);
  let pos = 44; for (const chunk of chunks) { data.set(chunk, pos); pos += chunk.length; }
  return new Blob([data], { type: 'audio/wav' });
}

/** Validate inputs that can be checked before requesting a client secret. */
export function validateRealtimeSpeechInput({ text, model = 'gpt-realtime-2.1-mini', voice = 'marin' } = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('Speech text must contain 1–2000 characters.');
  if (typeof model !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(model)) throw new Error('Enter a valid Realtime model.');
  if (typeof voice !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(voice)) throw new Error('Enter a valid Realtime voice.');
}

/** Return one complete audio Blob, or reject on timeout, cancellation or a
 * failed/partial Realtime response. Never opens a microphone. */
export function synthesizeRealtimeSpeech({ text, token, model = 'gpt-realtime-2.1-mini', voice = 'marin', signal, timeoutMs = 120000, WebSocketClass = globalThis.WebSocket } = {}) {
  try { validateRealtimeSpeechInput({ text, model, voice }); } catch (error) { return Promise.reject(error); }
  // RFC 6455 protocol token characters: reject whitespace and control chars;
  // never interpolate credentials into URLs or user-visible error messages.
  if (typeof token !== 'string' || token.startsWith('sk-') || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,4096}$/.test(token)) return Promise.reject(new Error('Enter a valid short-lived Realtime client token.'));
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) return Promise.reject(new Error('Speech timeout must be between 1 and 300000 milliseconds.'));
  if (signal?.aborted) return Promise.reject(new Error('Speech request cancelled.'));
  if (typeof WebSocketClass !== 'function') return Promise.reject(new Error('Realtime speech is unavailable in this browser.'));
  return new Promise((resolve, reject) => {
    let socket, settled = false, phase = 'created', size = 0;
    const chunks = [];
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (socket) { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; try { socket.close(); } catch {} }
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new Error('Speech request cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(new Error('The speech request timed out.')), timeoutMs);
    if (signal?.aborted) { abort(); return; }
    try { socket = new WebSocketClass(`${URL_BASE}?model=${encodeURIComponent(model)}`, ['realtime', `openai-insecure-api-key.${token}`]); }
    catch { finish(new Error('Could not connect to the Realtime speech service.')); return; }
    const send = value => socket.send(JSON.stringify(value));
    socket.onerror = () => finish(new Error('Could not connect to the Realtime speech service.'));
    socket.onclose = () => finish(new Error('The Realtime speech service closed before the response completed.'));
    socket.onmessage = event => {
      if (settled) return;
      try {
        if (typeof event.data !== 'string' || event.data.length > MAX_EVENT) throw new Error('The Realtime service returned an invalid event.');
        let message;
        try { message = JSON.parse(event.data); }
        catch { throw new Error('The Realtime service returned an invalid event.'); }
        if (!message || typeof message !== 'object' || typeof message.type !== 'string') throw new Error('The Realtime service returned an invalid event.');
        if (message.type === 'error') throw new Error('The Realtime speech service reported an error. Check the token, model and voice.');
        if (phase === 'created' && message.type === 'session.created') {
          phase = 'updating';
          send({ type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'], instructions: 'Read the user’s text aloud exactly, without adding commentary.', audio: { output: { format: { type: 'audio/pcm', rate: 24000 }, voice } } } });
        } else if (phase === 'updating' && message.type === 'session.updated') {
          phase = 'generating';
          send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: text.trim() }] } });
          send({ type: 'response.create', response: { output_modalities: ['audio'] } });
        } else if (phase === 'generating' && message.type === 'response.output_audio.delta') {
          if (typeof message.delta !== 'string' || !message.delta || message.delta.length > MAX_EVENT || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.delta)) throw new Error('The Realtime service returned invalid audio.');
          const decoded = atob(message.delta);
          size += decoded.length;
          if (size + 44 > LIMIT) throw new Error('The Realtime service returned too much audio.');
          const bytes = new Uint8Array(decoded.length); for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
          chunks.push(bytes);
        } else if (phase === 'generating' && message.type === 'response.done') {
          if (message.response?.status !== 'completed') throw new Error('The Realtime speech response did not complete.');
          finish(null, wav(chunks, size));
        }
      } catch (error) { finish(error instanceof Error ? error : new Error('The Realtime service returned an invalid event.')); }
    };
  });
}

/** Obtain one short-lived secret from the paired, explicitly configured
 * companion. The companion holds the standard API key; it never reaches this
 * browser. This performs no request until the player chooses Read aloud. */
export async function getRealtimeClientSecretInfo({ baseUrl, pairingToken, signal, timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
  let address;
  try { address = new URL(String(baseUrl || '').trim()); } catch { throw new Error('Enter the companion HTTPS address in settings.'); }
  if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash || address.pathname !== '/') throw new Error('Enter the companion HTTPS address in settings.');
  if (typeof pairingToken !== 'string' || !/^[\x21-\x7e]{32,512}$/.test(pairingToken)) throw new Error('Enter the companion pairing token in settings.');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('Speech timeout must be between 1 and 300000 milliseconds.');
  if (signal?.aborted) throw new Error('Speech request cancelled.');
  const controller = new AbortController();
  let timedOut = false, response;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const cancelled = new Promise((_, reject) => {
      const fail = () => reject(new Error(timedOut ? 'The Realtime token request timed out.' : 'Speech request cancelled.'));
      if (controller.signal.aborted) fail(); else controller.signal.addEventListener('abort', fail, { once: true });
    });
    const request = (async () => {
      response = await fetchImpl(`${address.origin}/v1/realtime/client-secret`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairingToken}` }, body: '{}', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
      if (controller.signal.aborted) { try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch {} throw new Error('Speech request cancelled.'); }
      if (!response.ok) throw new Error('Could not obtain a Realtime token. Check companion setup and pairing.');
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > 8192) throw new Error('The companion returned an invalid Realtime token.');
      if (!response.body?.getReader) throw new Error('The companion returned an invalid Realtime token.');
      const reader = response.body.getReader(), parts = [];
      let count = 0;
      const cancelReader = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
      controller.signal.addEventListener('abort', cancelReader, { once: true });
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          count += item.value.byteLength;
          if (count > 8192) throw new Error('The companion returned an invalid Realtime token.');
          parts.push(item.value);
        }
      } finally { controller.signal.removeEventListener('abort', cancelReader); try { reader.releaseLock(); } catch {} }
      const bytes = new Uint8Array(count); let pos = 0;
      for (const part of parts) { bytes.set(part, pos); pos += part.byteLength; }
      let data;
      try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('The companion returned an invalid Realtime token.'); }
      if (typeof data?.value !== 'string' || data.value.startsWith('sk-') || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,4096}$/.test(data.value) || !Number.isFinite(data.expires_at) || data.expires_at * 1000 <= Date.now() + 1000) throw new Error('The companion returned an invalid or expired Realtime token.');
      return { value: data.value, expiresAt: data.expires_at * 1000 };
    })();
    return await Promise.race([request, cancelled]);
  } catch (error) {
    if (timedOut) throw new Error('The Realtime token request timed out.');
    if (signal?.aborted) throw new Error('Speech request cancelled.');
    if (typeof error?.message === 'string' && /^(Enter the companion|The companion returned|Could not obtain a Realtime)/.test(error.message)) throw error;
    throw new Error('Could not obtain a Realtime token. Check companion setup and pairing.');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
    try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch {}
  }
}

// Retain the original string-returning API for callers that need only one
// session; the voice UI uses the expiry-aware form for short-lived reuse.
export async function getRealtimeClientSecret(options = {}) {
  return (await getRealtimeClientSecretInfo(options)).value;
}
