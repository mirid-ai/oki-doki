// Explicit, in-memory access to Mirid's speech routes and compatible providers.
// Nothing here opens a microphone or stores audio, text, credentials, or settings.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_LOCAL_WAV_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_JSON_BYTES = 128 * 1024;
const MAX_TEXT_CHARS = 2000;
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 300000;
const LOCAL_ENGINE = 'parakeet-cpp:tdt_ctc-110m:q4_k';

// Error paths must not leave a provider response downloading in the background.
// A stream's cancellation promise is untrusted and may never settle.
function discardBody(response) {
  try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch {}
}

function endpoint(baseUrl, mode, kind) {
  if (!['mirid', 'mirid-local-kokoro', 'openai'].includes(mode)) throw new Error('Choose Mirid or an OpenAI-compatible speech service.');
  let url;
  if (String(baseUrl || '').length > 2048) throw new Error('The speech service URL is too long.');
  try { url = new URL(String(baseUrl || '').trim()); } catch { throw new Error('Enter a valid speech service URL.'); }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  if (!((url.protocol === 'https:') || (url.protocol === 'http:' && isLoopback)) || url.username || url.password) {
    throw new Error('Use HTTPS for remote speech services, or HTTP on localhost.');
  }
  if (mode === 'mirid-local-kokoro' && !isLoopback) throw new Error('Local Kokoro requires a loopback speech service.');
  if (url.search || url.hash) throw new Error('The speech service URL cannot include a query or fragment.');
  const suffix = mode === 'mirid-local-kokoro'
    ? (kind === 'transcribe' ? '/transcribe' : '/experimental/kokoro/status')
    : mode === 'mirid'
      ? (kind === 'transcribe' ? '/transcribe' : kind === 'reference' ? '/tts/upload-voice' : '/tts')
      : (kind === 'transcribe' ? '/v1/audio/transcriptions' : '/v1/audio/speech');
  let path = url.pathname.replace(/\/+$/, '');
  if (mode === 'mirid-local-kokoro' && kind === 'synthesize') {
    path = path.replace(/\/experimental\/kokoro\/(?:probe|stream)$/, '');
  }
  if (!path.endsWith(suffix)) {
    url.pathname = mode === 'openai' && path.endsWith('/v1')
      ? path + suffix.slice(3)
      : path + suffix;
  } else {
    // Use the normalized path when a full endpoint was supplied, too. A
    // trailing slash can trigger a redirect or 404 on speech providers.
    url.pathname = path;
  }
  return url;
}

function settings(options, kind) {
  if (!options || typeof options !== 'object') throw new Error('Speech settings are missing.');
  const mode = options.mode || 'mirid';
  const url = endpoint(options.baseUrl, mode, kind);
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  if (apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new Error('The speech API key is invalid.');
  const rawTimeout = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(rawTimeout) || rawTimeout < 1 || rawTimeout > MAX_TIMEOUT_MS) throw new Error('Speech timeout must be between 1 and 300000 milliseconds.');
  return { mode, url, apiKey, timeoutMs: rawTimeout, signal: options.signal };
}

function parameter(value, fallback, name) {
  const result = String(value || fallback);
  if (result.length > 200 || /[\x00-\x1f\x7f]/.test(result)) throw new Error(`The speech ${name} is invalid.`);
  return result;
}

function requestHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function statusError(response, kind) {
  if (response.status === 401) return new Error('Speech service authentication failed. Check the API key or Mirid remote-access password.');
  if (response.status === 403) return new Error('Speech access was denied. Check the service’s allowed origin and access settings.');
  if (response.status === 404 && kind === 'synthesize-reference') return new Error('Speech endpoint or voice reference was not found. Check the service URL or select or upload the voice again.');
  if (response.status === 404) return new Error('Speech endpoint was not found. Check the service URL and selected mode.');
  if (response.status === 413 && kind === 'reference') return new Error('The voice reference file is too large for the speech service. Choose a smaller file.');
  if (response.status === 413 && (kind === 'synthesize' || kind === 'synthesize-reference')) return new Error('The speech request is too large for this service. Try another speech service.');
  if (response.status === 413) return new Error('The recording is too large for the speech service. Record a shorter message.');
  if (response.status === 422 && kind === 'reference') return new Error('The speech service could not use this voice reference. Check the recording format and length.');
  if (response.status === 429 && kind === 'reference') return new Error('The speech service cannot accept another voice reference right now. Try again or use an existing reference.');
  if (response.status === 422 && kind === 'transcribe') return new Error('The speech service could not transcribe this recording. Check its format and selected engine.');
  if (response.status === 503) return new Error('The speech engine is unavailable. Check that it is configured and running.');
  return new Error(`The speech service returned HTTP ${response.status}. Check the selected model and service settings.`);
}

async function boundedBytes(response, limit, signal) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) throw new Error('The speech service returned too much data.');
  if (!response.body || !response.body.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > limit) throw new Error('The speech service returned too much data.');
    return new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  // A stalled stream may ignore the request's AbortSignal. Ask the reader to
  // cancel as well, without waiting for an untrusted cancellation promise.
  const cancelReader = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
  signal?.addEventListener('abort', cancelReader, { once: true });
  if (signal?.aborted) cancelReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
        throw new Error('The speech service returned too much data.');
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    try { reader.releaseLock(); } catch {}
  }
  const result = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.byteLength; }
  return result;
}

async function perform(options, init, kind, readResponse) {
  const controller = new AbortController();
  const external = options.signal;
  let timedOut = false;
  const abort = () => controller.abort();
  if (external?.aborted) throw new Error('Speech request cancelled.');
  external?.addEventListener('abort', abort, { once: true });
  if (external?.aborted) controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs);
  let response;
  try {
    const cancelled = new Promise((_, reject) => {
      const fail = () => reject(new Error(timedOut ? 'The speech request timed out. Check the service or try a shorter message.' : 'Speech request cancelled.'));
      if (controller.signal.aborted) fail();
      else controller.signal.addEventListener('abort', fail, { once: true });
    });
    const request = (async () => {
      try {
        if (controller.signal.aborted) throw new Error('Speech request cancelled.');
        response = await fetch(options.url.href, { ...init, credentials: 'omit', redirect: 'error', signal: controller.signal });
      } catch (error) {
        if (timedOut) throw new Error('The speech request timed out. Check the service or try a shorter message.');
        if (external?.aborted) throw new Error('Speech request cancelled.');
        throw new Error('Could not connect to the speech service. Check its URL, that it is running, and its browser access settings.');
      }
      if (controller.signal.aborted) { discardBody(response); throw new Error('Speech request cancelled.'); }
      if (!response.ok) throw statusError(response, kind);
      try { return await readResponse(response, controller.signal); }
      catch (error) {
        if (timedOut) throw new Error('The speech request timed out while receiving the response.');
        if (external?.aborted) throw new Error('Speech request cancelled.');
        throw error;
      }
    })();
    return await Promise.race([request, cancelled]);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', abort);
    discardBody(response);
    controller.abort();
  }
}

function uploadName(audio) {
  const mime = (audio.type || '').toLowerCase();
  if (mime.includes('wav')) return 'recording.wav';
  if (mime.includes('ogg')) return 'recording.ogg';
  if (mime.includes('mp4')) return 'recording.m4a';
  if (mime.includes('mpeg')) return 'recording.mp3';
  return 'recording.webm';
}

/** Upload a selected reference to Mirid only when explicitly requested. */
export async function uploadMiridVoiceReference(input) {
  if (input?.mode && input.mode !== 'mirid') throw new Error('Choose the Mirid speech service to upload a reference.');
  const options = settings({ ...input, mode: 'mirid' }, 'reference');
  const audio = input.audio;
  if (!(audio instanceof Blob) || !audio.size) throw new Error('Choose a voice recording first.');
  if (audio.size > MAX_UPLOAD_BYTES) throw new Error('The recording is too large. Choose a file under 20 MB.');
  const name = typeof audio.name === 'string' ? audio.name : '';
  if (!/\.(wav|mp3|flac|m4a|aac|mp4|3gp|ogg|opus|webm)$/i.test(name) || /[/\\\x00-\x1f\x7f]/.test(name) || name.length > 200) {
    throw new Error('Choose a WAV, MP3, FLAC, M4A, AAC, MP4, 3GP, Ogg, Opus or WebM recording.');
  }
  const form = new FormData();
  form.append('file', audio, name);
  return perform(options, { method: 'POST', headers: requestHeaders(options.apiKey), body: form }, 'reference', async (response, signal) => {
    const bytes = await boundedBytes(response, MAX_JSON_BYTES, signal);
    let data;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('Mirid returned an invalid voice reference response.'); }
    const id = data?.voice_id;
    if (data?.status !== 'success' || typeof id !== 'string' || !id || id.length > 200 || /[/\\\x00-\x1f\x7f]/.test(id) || !/\.(wav|mp3|flac|m4a|aac|mp4|3gp|ogg|opus|webm)$/i.test(id)) {
      throw new Error('Mirid returned an invalid voice reference response.');
    }
    return id;
  });
}

/** Validate the settings needed to transcribe before asking for microphone access. */
export function validateTranscriptionSettings(input) {
  const options = settings(input, 'transcribe');
  if (options.mode !== 'openai') {
    if (input.engine) parameter(input.engine, '', 'engine');
  } else {
    parameter(input.model, 'whisper-1', 'model');
  }
  return options;
}

/** Transcribe a user-supplied recording; never starts or retains a microphone. */
export async function transcribeSpeech(input) {
  const options = validateTranscriptionSettings(input);
  const audio = input.audio;
  if (!(audio instanceof Blob) || audio.size === 0) throw new Error('Record or choose audio before transcribing.');
  const limit = options.mode !== 'openai' && input.engine === LOCAL_ENGINE ? MAX_LOCAL_WAV_BYTES : MAX_UPLOAD_BYTES;
  if (audio.size > limit) throw new Error('The recording is too large. Record a shorter message.');
  const form = new FormData();
  form.append('file', audio, uploadName(audio));
  if (options.mode !== 'openai') {
    if (input.engine) options.url.searchParams.set('engine', parameter(input.engine, '', 'engine'));
  } else {
    form.append('model', parameter(input.model, 'whisper-1', 'model'));
    form.append('response_format', 'json');
  }
  return perform(options, { method: 'POST', headers: requestHeaders(options.mode === 'mirid-local-kokoro' ? '' : options.apiKey), body: form }, 'transcribe', async (response, signal) => {
    const bytes = await boundedBytes(response, MAX_JSON_BYTES, signal);
    let data;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error('The speech service returned an invalid transcription response.'); }
    const transcript = data?.transcript ?? data?.text;
    if (typeof transcript !== 'string' || !transcript.trim()) throw new Error('No speech was recognised. Check the microphone and try again.');
    if (transcript.length > 20000) throw new Error('The transcription was unexpectedly long.');
    return transcript.trim();
  });
}

/** Generate a WAV (or provider-supplied playable audio) for explicit playback. */
export async function synthesizeSpeech(input) {
  const options = settings(input, 'synthesize');
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text || text.length > MAX_TEXT_CHARS) throw new Error(`Speech text must contain 1–${MAX_TEXT_CHARS} characters.`);
  const speed = Number(input.speed ?? 1);
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) throw new Error('Speech speed must be between 0.25 and 4.');
  if (options.mode === 'mirid-local-kokoro') {
    if (speed < 0.5 || speed > 2) throw new Error('Local Kokoro speed must be between 0.5 and 2.');
    return synthesizeLocalKokoro(options, text, speed);
  }
  const voice = parameter(input.voice, options.mode === 'mirid' ? 'af_heart' : 'alloy', 'voice');
  const body = options.mode === 'mirid'
    ? { text, engine: parameter(input.engine, 'kokoro', 'engine'), voice, speed }
    : { input: text, model: parameter(input.model, 'tts-1', 'model'), voice, speed, response_format: 'wav' };
  const referenceVoice = options.mode === 'mirid' && ['chatterbox', 'chatterbox_nano', 'chatterbox_turbo'].includes(body.engine);
  return perform(options, { method: 'POST', headers: { 'Content-Type': 'application/json', ...requestHeaders(options.apiKey) }, body: JSON.stringify(body) }, referenceVoice ? 'synthesize-reference' : 'synthesize', async (response, signal) => {
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type && !type.startsWith('audio/') && type !== 'application/octet-stream') throw new Error('The speech service returned an unsupported audio response.');
    const bytes = await boundedBytes(response, MAX_AUDIO_BYTES, signal);
    if (!bytes.byteLength) throw new Error('The speech service returned empty audio.');
    return new Blob([bytes], { type: type || 'audio/wav' });
  });
}

// The experimental service returns a complete PCM WAV per text message. It is
// not safe to concatenate WAV files byte-for-byte: combine their sample data.
function extractLocalWav(bytes) {
  if (bytes.length < 44 || bytes.length > MAX_AUDIO_BYTES) throw new Error('The local speech engine returned invalid audio.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length) throw new Error('The local speech engine returned invalid audio.');
  let format = false, data = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = view.getUint32(at + 4, true);
    const start = at + 8, end = start + length;
    if (end > bytes.length) throw new Error('The local speech engine returned truncated audio.');
    if (tag(at) === 'fmt ') {
      if (format || length < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 || view.getUint32(start + 4, true) !== 24000 || view.getUint16(start + 14, true) !== 16) throw new Error('The local speech engine returned an unsupported WAV format.');
      format = true;
    } else if (tag(at) === 'data') {
      if (data || !length || length % 2) throw new Error('The local speech engine returned invalid audio.');
      data = bytes.slice(start, end);
    }
    at = end + (length % 2);
    if (at > bytes.length) throw new Error('The local speech engine returned truncated audio.');
  }
  if (!format || !data) throw new Error('The local speech engine returned invalid audio.');
  return data;
}

function makeLocalWav(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (!size || size + 44 > MAX_AUDIO_BYTES) throw new Error('The local speech engine returned too much data.');
  const result = new Uint8Array(44 + size), view = new DataView(result.buffer);
  const put = (offset, value) => { for (let i = 0; i < value.length; i++) result[offset + i] = value.charCodeAt(i); };
  put(0, 'RIFF'); view.setUint32(4, size + 36, true); put(8, 'WAVE'); put(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, size, true);
  let offset = 44;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return new Blob([result], { type: 'audio/wav' });
}

async function localJson(response, signal) {
  const bytes = await boundedBytes(response, MAX_JSON_BYTES, signal);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('The local speech engine returned an invalid status.'); }
}

function localKokoroSocket(url, parts, speed, signal) {
  return new Promise((resolve, reject) => {
    let socket, settled = false, done = false, chain = Promise.resolve(), total = 0;
    const chunks = [];
    const cleanup = () => {
      signal.removeEventListener('abort', cancelled);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        try { socket.close(); } catch {}
      }
    };
    const fail = (error) => { if (settled) return; settled = true; cleanup(); reject(error); };
    const succeed = (result) => { if (settled) return; settled = true; cleanup(); resolve(result); };
    const cancelled = () => fail(new Error('Speech request cancelled.'));
    if (signal.aborted) return cancelled();
    signal.addEventListener('abort', cancelled, { once: true });
    try { socket = new WebSocket(url.href); socket.binaryType = 'arraybuffer'; }
    catch { fail(new Error('Could not connect to the local speech stream.')); return; }
    socket.onopen = () => {
      try {
        for (const part of parts) socket.send(JSON.stringify({ type: 'text', text: part, speed }));
        socket.send(JSON.stringify({ type: 'end' }));
      } catch { fail(new Error('Could not send text to the local speech engine.')); }
    };
    socket.onmessage = (event) => {
      if (done || settled) return;
      if (typeof event.data === 'string') {
        let message;
        try { message = JSON.parse(event.data); } catch { fail(new Error('The local speech engine sent an invalid response.')); return; }
        if (message?.type === 'error') { fail(new Error('The local speech engine failed or is busy.')); return; }
        if (message?.type !== 'done') { fail(new Error('The local speech engine sent an invalid response.')); return; }
        done = true;
        chain.then(() => {
          if (chunks.length !== parts.length) throw new Error('The local speech engine returned incomplete audio.');
          succeed(makeLocalWav(chunks));
        }).catch(fail);
        return;
      }
      chain = chain.then(async () => {
        let buffer;
        if (event.data instanceof ArrayBuffer) buffer = event.data;
        else if (event.data instanceof Blob) buffer = await event.data.arrayBuffer();
        else throw new Error('The local speech engine sent invalid audio.');
        total += buffer.byteLength;
        if (total > MAX_AUDIO_BYTES || chunks.length >= parts.length) throw new Error('The local speech engine returned too much data.');
        chunks.push(extractLocalWav(new Uint8Array(buffer)));
      });
      chain.catch(fail);
    };
    socket.onerror = () => fail(new Error('Could not connect to the local speech stream.'));
    socket.onclose = () => { if (!done) fail(new Error('The local speech stream ended before audio was ready.')); };
  });
}

async function synthesizeLocalKokoro(options, text, speed) {
  // The local stream accepts at most 500 Unicode code points per message.
  // Prefer a word boundary so a long line does not speak two halves of a
  // single word separately. Keep enough room for the remaining four-message
  // budget; an unbroken or very dense passage can still split mid-word.
  let characters = Array.from(text), parts = [];
  while (characters.length > 500) {
    const remainingCapacity = (3 - parts.length) * 500;
    let boundary = 500, next = 500;
    for (let i = 500; i > 0; i--) {
      if (!/\s/u.test(characters[i])) continue;
      let after = i;
      while (after < characters.length && /\s/u.test(characters[after])) after++;
      if (characters.length - after <= remainingCapacity && characters.slice(0, i).join('').trim()) {
        boundary = i;
        next = after;
        break;
      }
    }
    parts.push(characters.slice(0, boundary).join('').trim());
    characters = characters.slice(next);
    while (characters.length && /\s/u.test(characters[0])) characters.shift();
  }
  if (characters.length) parts.push(characters.join('').trim());
  if (parts.length > 4 || parts.some(part => !part.trim())) throw new Error('Local Kokoro needs a shorter speech message.');
  return perform(options, { method: 'GET', headers: {} }, 'synthesize', async (response, signal) => {
    const state = await localJson(response, signal);
    if (signal.aborted) throw new Error('Speech request cancelled.');
    if (state?.enabled !== true) throw new Error('The local speech engine is not enabled in Mirid.');
    const servicePath = options.url.pathname.replace(/\/status$/, '');
    if (state.ready !== true) {
      const probe = new URL(options.url.href); probe.pathname = `${servicePath}/probe`;
      let checked;
      try {
        try { checked = await fetch(probe.href, { method: 'POST', headers: {}, credentials: 'omit', redirect: 'error', signal }); }
        catch (error) { if (signal.aborted) throw error; throw new Error('Could not connect to the local speech probe.'); }
        if (signal.aborted) throw new Error('Speech request cancelled.');
        if (!checked.ok) throw statusError(checked, 'synthesize');
        const result = await localJson(checked, signal);
        if (signal.aborted) throw new Error('Speech request cancelled.');
        if (result?.available !== true) throw new Error('The local speech engine is unavailable.');
      } finally { discardBody(checked); }
    }
    const socketUrl = new URL(options.url.href);
    socketUrl.pathname = `${servicePath}/stream`;
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return localKokoroSocket(socketUrl, parts, speed, signal);
  });
}
