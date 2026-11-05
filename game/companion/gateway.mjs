/** Opt-in HTTPS gateway for fixed Mirid routes and optional Realtime tokens. */
import { createServer } from 'node:https';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MAX_JSON = 128 * 1024;
const MAX_RECORDING = 4 * 1024 * 1024;
const MAX_RESPONSE = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT = 120000;
const routes = Object.freeze({
  '/v1/chat/completions': 'chat',
  '/v1/audio/transcriptions': 'transcribe',
  '/v1/audio/speech': 'speech',
  '/tts': 'chatterboxSpeech',
  '/v1/realtime/client-secret': 'realtimeSecret'
});

function discardBody(response) {
  try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch {}
}

// Some upstream implementations or readers can ignore AbortSignal. Settle
// the gateway's wait on cancellation and discard a response that arrives late.
function awaitAbortable(operation, signal, discardLate = () => {}) {
  const task = Promise.resolve(operation);
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(new Error('cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
    task.then(value => {
      if (settled) { try { discardLate(value); } catch {} return; }
      settled = true;
      signal.removeEventListener('abort', abort);
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    if (signal.aborted) abort();
  });
}

function assertToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 512 || !/^[\x21-\x7e]+$/.test(token)) {
    throw new Error('A pairing token of 32–512 printable non-space characters is required.');
  }
}
function authorized(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const candidate = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function checkOrigins(origins) {
  if (!Array.isArray(origins) || !origins.length || origins.length > 20) throw new Error('Configure one or more exact trusted origins.');
  return new Set(origins.map(value => {
    if (typeof value !== 'string' || value.length > 500 || value === 'null' || value === '*') throw new Error('Invalid trusted origin.');
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('Invalid trusted origin.'); }
    const scheme = parsed.protocol;
    if (!['https:', 'capacitor:'].includes(scheme) || parsed.username || parsed.password || !['', '/'].includes(parsed.pathname) || parsed.search || parsed.hash || !parsed.hostname) throw new Error('Invalid trusted origin.');
    if (scheme === 'capacitor:' && (parsed.hostname !== 'localhost' || parsed.port)) throw new Error('Invalid trusted origin.');
    return value.replace(/\/$/, '');
  }));
}
function reply(res, code, body, origin, type = 'application/json') {
  if (res.destroyed || res.writableEnded) return;
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  if (body !== null) headers['Content-Type'] = type;
  res.writeHead(code, headers);
  res.end(body === null ? undefined : body);
}
function failure(res, code, origin, message) { reply(res, code, JSON.stringify({ error: message }), origin); }
async function readBody(request, limit, signal) {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new Error('too_large');
  let size = 0;
  const chunks = [];
  // Abort the incoming stream itself: aborting only the upstream fetch leaves
  // an idle or slow upload holding a concurrency slot indefinitely.
  const stop = () => request.destroy(new Error('cancelled'));
  if (signal.aborted) throw new Error('cancelled');
  signal.addEventListener('abort', stop, { once: true });
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > limit) throw new Error('too_large');
      chunks.push(chunk);
    }
    if (!size) throw new Error('invalid_body');
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener('abort', stop);
  }
}
async function boundedResponse(response, limit, signal) {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new Error('upstream_too_large');
  if (!response.body) throw new Error('invalid_upstream');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const cancelReader = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
  signal.addEventListener('abort', cancelReader, { once: true });
  if (signal.aborted) cancelReader();
  try {
    while (true) {
      const { done, value } = await awaitAbortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
        throw new Error('upstream_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    signal.removeEventListener('abort', cancelReader);
    try { reader.releaseLock(); } catch {}
  }
  return Buffer.concat(chunks);
}
function validContent(type, kind) {
  if (typeof type !== 'string' || type.length > 256 || /[\r\n]/.test(type)) return false;
  return kind === 'transcribe' ? /^multipart\/form-data;\s*boundary=[\w'()+,./:=?-]{1,70}$/i.test(type) : /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type);
}
function parseObject(buffer, errorCode = 'invalid_body') {
  let result;
  try { result = JSON.parse(buffer.toString('utf8')); } catch { throw new Error(errorCode); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(errorCode);
  return result;
}

/** Dependencies are injected so tests never need sockets or real services. */
export function createGateway({ token, origins, miridPort = 8000, kokoroPort = null, chatterboxPort = null, transcribeEngine = 'parakeet-cpp:tdt_ctc-110m:q4_k', fetchImpl = globalThis.fetch, synthesize, timeoutMs = DEFAULT_TIMEOUT, openaiApiKey = '', realtimeMintLimit = 6, now = Date.now } = {}) {
  assertToken(token);
  const trusted = checkOrigins(origins);
  if (!Number.isInteger(Number(miridPort)) || Number(miridPort) < 1 || Number(miridPort) > 65535) throw new Error('Invalid loopback Mirid port.');
  for (const port of [kokoroPort, chatterboxPort]) {
    if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('Invalid local speech port.');
  }
  if (typeof fetchImpl !== 'function' || typeof synthesize !== 'function') throw new Error('Gateway dependencies are unavailable.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('Invalid gateway timeout.');
  if (typeof transcribeEngine !== 'string' || !/^[\w:.-]{1,100}$/.test(transcribeEngine)) throw new Error('Invalid transcription engine.');
  if (typeof openaiApiKey !== 'string' || (openaiApiKey && (!/^[\x21-\x7e]{1,512}$/.test(openaiApiKey)))) throw new Error('Invalid Realtime configuration.');
  if (!Number.isInteger(realtimeMintLimit) || realtimeMintLimit < 1 || realtimeMintLimit > 60 || typeof now !== 'function') throw new Error('Invalid Realtime configuration.');
  const base = `http://127.0.0.1:${Number(miridPort)}`;
  let activeRequests = 0;
  let issuedAt = [];
  return async function gateway(request, response) {
    const originValue = request.headers.origin;
    const origin = typeof originValue === 'string' && trusted.has(originValue) ? originValue : null;
    if (!origin) return failure(response, 403, null, 'Origin is not allowed.');
    const kind = Object.hasOwn(routes, request.url) ? routes[request.url] : undefined;
    if (!kind) return failure(response, 404, origin, 'Route not found.');
    if (kind === 'realtimeSecret' && !openaiApiKey) return failure(response, 404, origin, 'Route not found.');
    if (kind === 'chatterboxSpeech' && chatterboxPort === null) return failure(response, 404, origin, 'Route not found.');
    if (request.method === 'OPTIONS') {
      const method = request.headers['access-control-request-method'];
      const requested = String(request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
      if (method !== 'POST' || requested.some(x => !['authorization', 'content-type'].includes(x))) return failure(response, 403, origin, 'Preflight denied.');
      response.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '300', 'Cache-Control': 'no-store', 'Vary': 'Origin' });
      return response.end();
    }
    if (request.method !== 'POST') return failure(response, 405, origin, 'Method not allowed.');
    if (!authorized(request.headers.authorization, token)) return failure(response, 401, origin, 'Authentication failed.');
    if (!validContent(request.headers['content-type'], kind)) return failure(response, 415, origin, 'Unsupported content type.');
    const encoding = request.headers['content-encoding'];
    if (encoding && String(encoding).toLowerCase() !== 'identity') return failure(response, 415, origin, 'Unsupported content encoding.');
    if (activeRequests >= 2) return failure(response, 429, origin, 'Companion is busy.');
    activeRequests++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', disconnect);
    response.once('close', disconnect);
    let upstream;
    try {
      const data = await readBody(request, kind === 'transcribe' ? MAX_RECORDING : MAX_JSON, controller.signal);
      if (controller.signal.aborted) throw new Error('cancelled');
      if (kind === 'realtimeSecret') {
        const input = parseObject(data);
        if (Object.keys(input).length) throw new Error('invalid_body');
        const time = now();
        issuedAt = issuedAt.filter(issued => time - issued < 60000 && time >= issued);
        if (issuedAt.length >= realtimeMintLimit) return failure(response, 429, origin, 'Realtime token limit reached. Try again later.');
        // Count attempts before network access, including failed and cancelled requests.
        issuedAt.push(time);
        upstream = await awaitAbortable(fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
          body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 60 }, session: { type: 'realtime', model: 'gpt-realtime-2.1-mini' } }),
          signal: controller.signal, redirect: 'error', credentials: 'omit'
        }), controller.signal, discardBody);
        if (!upstream.ok) throw new Error('invalid_upstream');
        const result = parseObject(await boundedResponse(upstream, MAX_JSON, controller.signal), 'invalid_upstream');
        if (controller.signal.aborted) throw new Error('cancelled');
        // The provider documents an opaque string, not a guaranteed prefix.
        // It must fit within a WebSocket protocol token and must not be the
        // configured long-lived key or a standard OpenAI API key.
        if (typeof result.value !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{8,512}$/.test(result.value) || result.value === openaiApiKey || result.value === token || result.value.startsWith('sk-') || !Number.isInteger(result.expires_at) || result.expires_at <= Math.floor(now() / 1000) || result.expires_at > Math.floor(now() / 1000) + 90) throw new Error('invalid_upstream');
        return reply(response, 200, JSON.stringify({ value: result.value, expires_at: result.expires_at }), origin);
      }
      if (kind === 'speech') {
        const input = parseObject(data);
        if (typeof input.input !== 'string' || !input.input.trim() || input.input.length > 2000 || (input.speed !== undefined && (typeof input.speed !== 'number' || input.speed < 0.5 || input.speed > 2))) throw new Error('invalid_body');
        if (kokoroPort !== null) {
          const allowedVoices = ['af_heart', 'af_sarah', 'af_nicole', 'am_adam', 'af_bella', 'bm_george', 'bf_emma'];
          if (!allowedVoices.includes(input.voice)) throw new Error('invalid_body');
          upstream = await awaitAbortable(fetchImpl(`http://127.0.0.1:${kokoroPort}/tts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: input.input, engine: 'kokoro', voice: input.voice, speed: input.speed ?? 1 }),
            signal: controller.signal, redirect: 'error', credentials: 'omit'
          }), controller.signal, discardBody);
          if (!upstream.ok || !/^audio\/wav(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) throw new Error('invalid_upstream');
          const audio = await boundedResponse(upstream, MAX_RESPONSE, controller.signal);
          if (!audio.length) throw new Error('invalid_upstream');
          return reply(response, 200, audio, origin, 'audio/wav');
        }
        const blob = await awaitAbortable(synthesize({ baseUrl: base, mode: 'mirid-local-kokoro', text: input.input, speed: input.speed ?? 1, signal: controller.signal, timeoutMs }), controller.signal);
        if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_RESPONSE || blob.type !== 'audio/wav') throw new Error('invalid_upstream');
        const bytes = Buffer.from(await awaitAbortable(blob.arrayBuffer(), controller.signal));
        if (controller.signal.aborted) throw new Error('cancelled');
        return reply(response, 200, bytes, origin, 'audio/wav');
      }
      if (kind === 'chatterboxSpeech') {
        const input = parseObject(data);
        if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000 ||
            input.engine !== 'chatterbox_nano' || input.voice !== 'default' || (input.speed !== undefined && input.speed !== 1)) throw new Error('invalid_body');
        upstream = await awaitAbortable(fetchImpl(`http://127.0.0.1:${chatterboxPort}/tts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input.text, engine: 'chatterbox_nano', voice: 'default', speed: 1 }),
          signal: controller.signal, redirect: 'error', credentials: 'omit'
        }), controller.signal, discardBody);
        if (!upstream.ok || !/^audio\/wav(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) throw new Error('invalid_upstream');
        const audio = await boundedResponse(upstream, MAX_RESPONSE, controller.signal);
        if (!audio.length) throw new Error('invalid_upstream');
        return reply(response, 200, audio, origin, 'audio/wav');
      }
      if (kind === 'chat') {
        const input = parseObject(data);
        if (!Array.isArray(input.messages) || input.stream === true) throw new Error('invalid_body');
      }
      const target = kind === 'chat' ? `${base}/v1/chat/completions` : `${base}/transcribe?engine=${encodeURIComponent(transcribeEngine)}`;
      upstream = await awaitAbortable(fetchImpl(target, { method: 'POST', headers: { 'Content-Type': request.headers['content-type'] }, body: data, signal: controller.signal, redirect: 'error', credentials: 'omit' }), controller.signal, discardBody);
      if (!upstream.ok) return failure(response, 502, origin, 'Mirid could not complete the request.');
      const result = await boundedResponse(upstream, MAX_JSON, controller.signal);
      const parsed = parseObject(result, 'invalid_upstream');
      if (kind === 'transcribe') {
        const text = parsed.transcript ?? parsed.text;
        if (typeof text !== 'string' || text.length > 20000) throw new Error('invalid_upstream');
        return reply(response, 200, JSON.stringify({ text }), origin);
      }
      return reply(response, 200, result, origin);
    } catch (error) {
      if (error?.message === 'too_large') return failure(response, 413, origin, 'Request is too large.');
      if (error?.message === 'invalid_body') return failure(response, 400, origin, 'Invalid request.');
      return failure(response, controller.signal.aborted ? 504 : 502, origin, kind === 'realtimeSecret' ? 'Realtime token could not be obtained.' : 'Mirid could not complete the request.');
    } finally {
      clearTimeout(timer);
      discardBody(upstream);
      controller.abort();
      activeRequests--;
      request.removeListener('aborted', disconnect);
      response.removeListener('close', disconnect);
    }
  };
}

// The local launcher normally starts its multi-voice service on 8770. Probe
// only that loopback endpoint; a different or unavailable service must not be
// mistaken for Kokoro. An explicit port remains an operator override.
export async function resolveCompanionKokoroPort(value, { fetchImpl = globalThis.fetch, timeoutMs = 750 } = {}) {
  if (value === 'fixed') return null;
  if (value !== undefined && value !== '') {
    if (!/^[0-9]{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('Invalid companion Kokoro port.');
    return Number(value);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await awaitAbortable(fetchImpl('http://127.0.0.1:8770/health', {
      signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store'
    }), controller.signal, discardBody);
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return null;
    const data = parseObject(await boundedResponse(response, 512, controller.signal), 'invalid_upstream');
    return data.service === 'oki-doki-kokoro' && data.voices === 7 ? 8770 : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (response) discardBody(response);
  }
}

async function main() {
  const token = process.env.COMPANION_TOKEN;
  const certPath = process.env.COMPANION_TLS_CERT;
  const keyPath = process.env.COMPANION_TLS_KEY;
  const origins = (process.env.COMPANION_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const bind = process.env.COMPANION_BIND || '127.0.0.1';
  const port = Number(process.env.COMPANION_PORT || 9443);
  if (!certPath || !keyPath) throw new Error('Set COMPANION_TLS_CERT and COMPANION_TLS_KEY.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid companion port.');
  const speechSource = await readFile(new URL('../src/speech.js', import.meta.url), 'utf8');
  const { synthesizeSpeech } = await import(`data:text/javascript;base64,${Buffer.from(speechSource).toString('base64')}`);
  const kokoroPort = await resolveCompanionKokoroPort(process.env.COMPANION_KOKORO_PORT);
  const handler = createGateway({ token, origins, miridPort: Number(process.env.MIRID_PORT || 8000),
    kokoroPort,
    chatterboxPort: process.env.COMPANION_CHATTERBOX_PORT ? Number(process.env.COMPANION_CHATTERBOX_PORT) : null,
    synthesize: synthesizeSpeech, openaiApiKey: process.env.COMPANION_OPENAI_API_KEY || '', realtimeMintLimit: Number(process.env.COMPANION_REALTIME_MINT_LIMIT || 6) });
  const [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
  const server = createServer({ cert, key, minVersion: 'TLSv1.2', maxHeaderSize: 16384 }, handler);
  server.headersTimeout = 15000;
  server.requestTimeout = 150000;
  server.listen(port, bind, () => {
    console.log('Oki Doki companion is running.');
    if (kokoroPort === null) console.log('Speech uses Mirid’s one fixed voice. For distinct voices, start the local Kokoro service and restart the companion; see companion/README.md.');
    else console.log(`Speech is routed to the separate Kokoro service on loopback port ${kokoroPort}; the service must be running.`);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Companion could not start. Check its configuration and TLS files.'); process.exitCode = 1; });
}
