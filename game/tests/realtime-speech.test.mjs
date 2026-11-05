import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/realtime-speech.js', import.meta.url), 'utf8');
const { synthesizeRealtimeSpeech, getRealtimeClientSecret, getRealtimeClientSecretInfo } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Socket {
  static latest;
  constructor(url, protocols) { this.url = url; this.protocols = protocols; this.sent = []; this.closed = false; Socket.latest = this; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  event(value) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
}
const options = { text: 'Hello there.', token: 'ek_test-only', voice: 'marin', WebSocketClass: Socket, timeoutMs: 1000 };
function begin(extra = {}) {
  const promise = synthesizeRealtimeSpeech({ ...options, ...extra });
  return { promise, socket: Socket.latest };
}
function ready(socket) { socket.event({ type: 'session.created' }); socket.event({ type: 'session.updated' }); }

test('Realtime text and response events produce one playable PCM WAV', async () => {
  const { promise, socket } = begin();
  assert.equal(socket.url, 'wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini');
  assert.deepEqual(socket.protocols, ['realtime', 'openai-insecure-api-key.ek_test-only']);
  ready(socket);
  assert.equal(socket.sent[0].type, 'session.update');
  assert.equal(socket.sent[0].session.audio.output.format.rate, 24000);
  assert.equal(socket.sent[0].session.audio.output.voice, 'marin');
  assert.equal(socket.sent[1].item.content[0].text, 'Hello there.');
  assert.deepEqual(socket.sent[2], { type: 'response.create', response: { output_modalities: ['audio'] } });
  socket.event({ type: 'response.output_audio.delta', delta: 'AQIDBA==' });
  socket.event({ type: 'response.output_audio.delta', delta: 'BQY=' });
  socket.event({ type: 'response.done', response: { status: 'completed' } });
  const blob = await promise;
  assert.equal(blob.type, 'audio/wav');
  const data = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(data.slice(0, 4)), 'RIFF');
  assert.equal(new DataView(data.buffer).getUint32(24, true), 24000);
  assert.deepEqual([...data.slice(44)], [1, 2, 3, 4, 5, 6]);
  assert.ok(socket.closed);
});

test('cancellation closes socket before and during generation', async () => {
  for (const phase of ['created', 'generating']) {
    const controller = new AbortController();
    const { promise, socket } = begin({ signal: controller.signal });
    if (phase === 'generating') ready(socket);
    controller.abort();
    await assert.rejects(promise, /cancelled/i);
    assert.ok(socket.closed);
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(synthesizeRealtimeSpeech({ ...options, signal: controller.signal }), /cancelled/i);
});

test('rejects failed, malformed, partial and empty responses', async () => {
  for (const event of [
    { type: 'error', error: { message: 'contains secret' } },
    'not json',
    { type: 'response.output_audio.delta', delta: 'bad!' },
    { type: 'response.done', response: { status: 'failed' } },
    { type: 'response.done', response: { status: 'completed' } },
  ]) {
    const { promise, socket } = begin(); ready(socket); socket.event(event);
    await assert.rejects(promise, error => !error.message.includes('secret'));
    assert.ok(socket.closed);
  }
});

test('malformed WebSocket JSON never exposes raw server data in errors', async () => {
  const { promise, socket } = begin(); ready(socket);
  socket.event('{\"private\":\"server-secret-value\",');
  await assert.rejects(promise, error => {
    assert.match(error.message, /invalid event/i);
    assert.ok(!error.message.includes('server-secret-value'));
    return true;
  });
  assert.ok(socket.closed);
});

test('realtime timeout and premature socket close reject and release', async () => {
  const { promise, socket } = begin({ timeoutMs: 10 });
  await assert.rejects(promise, /timed out/i); assert.ok(socket.closed);
  const second = begin(); second.socket.onclose();
  await assert.rejects(second.promise, /closed/i); assert.ok(second.socket.closed);
});

test('rejects invalid inputs before opening a socket', async () => {
  for (const bad of [{ token: '' }, { token: 'bad token' }, { token: 'sk-standard-key' }, { text: ' ' }, { model: 'wrong?model=x' }, { voice: 'a/b' }]) {
    Socket.latest = null;
    await assert.rejects(synthesizeRealtimeSpeech({ ...options, ...bad }));
    assert.equal(Socket.latest, null);
  }
});

test('oversized event is rejected, and late data cannot settle or send again', async () => {
  const { promise, socket } = begin(); ready(socket);
  const onmessage = socket.onmessage;
  socket.event({ type: 'response.output_audio.delta', delta: 'A'.repeat(1024 * 1024) });
  await assert.rejects(promise, /invalid event/i);
  const sent = socket.sent.length;
  onmessage({ data: JSON.stringify({ type: 'session.created' }) });
  onmessage({ data: JSON.stringify({ type: 'response.done', response: { status: 'completed' } }) });
  assert.equal(socket.sent.length, sent);
  assert.ok(socket.closed);
});

test('malformed PCM and interrupted output never return partial speech', async () => {
  const first = begin(); ready(first.socket);
  first.socket.event({ type: 'response.output_audio.delta', delta: 'AQ==' });
  first.socket.event({ type: 'response.done', response: { status: 'completed' } });
  await assert.rejects(first.promise, /invalid audio/i);
  const second = begin(); ready(second.socket);
  second.socket.event({ type: 'response.output_audio.delta', delta: 'AQI=' });
  second.socket.event({ type: 'response.done', response: { status: 'incomplete' } });
  await assert.rejects(second.promise, /did not complete/i);
});

const companion = { baseUrl: 'https://companion.invalid:9443', pairingToken: 'p'.repeat(32) };
test('client secret is fetched only on explicit call through the paired fixed route', async () => {
  let seen;
  const secret = await getRealtimeClientSecret({ ...companion, fetchImpl: async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ value: 'ek_test-only', expires_at: Math.floor(Date.now() / 1000) + 60 }));
  } });
  assert.equal(secret, 'ek_test-only');
  assert.equal(seen.url, 'https://companion.invalid:9443/v1/realtime/client-secret');
  assert.equal(seen.init.headers.Authorization, `Bearer ${companion.pairingToken}`);
  assert.equal(seen.init.body, '{}'); assert.equal(seen.init.redirect, 'error');
});

test('expiry-aware secret uses the issuer expiration rather than a guessed lifetime', async () => {
  const expiresAt = Math.floor(Date.now() / 1000) + 13;
  const info = await getRealtimeClientSecretInfo({ ...companion, fetchImpl: async () => new Response(JSON.stringify({ value: 'ek_short-lived', expires_at: expiresAt })) });
  assert.deepEqual(info, { value: 'ek_short-lived', expiresAt: expiresAt * 1000 });
});

test('rejects invalid companion, expired token and raw provider errors', async () => {
  let calls = 0;
  for (const input of [{ baseUrl: 'http://remote.invalid' }, { baseUrl: 'https://example.invalid/path' }, { pairingToken: 'short' }]) {
    await assert.rejects(getRealtimeClientSecret({ ...companion, ...input, fetchImpl: async () => { calls++; } }));
  }
  assert.equal(calls, 0);
  await assert.rejects(getRealtimeClientSecret({ ...companion, fetchImpl: async () => new Response(JSON.stringify({ value: 'ek_test', expires_at: 1 })) }), /expired/i);
  await assert.rejects(getRealtimeClientSecret({ ...companion, fetchImpl: async () => { throw new Error('private provider details'); } }), error => !error.message.includes('private provider details'));
});

test('cancels a stalled token request and enforces timeout', async () => {
  const controller = new AbortController();
  const pending = getRealtimeClientSecret({ ...companion, signal: controller.signal, fetchImpl: async () => new Promise(() => {}) });
  controller.abort(); await assert.rejects(pending, /cancelled/i);
  await assert.rejects(getRealtimeClientSecret({ ...companion, timeoutMs: 5, fetchImpl: async () => new Promise(() => {}) }), /timed out/i);
});
