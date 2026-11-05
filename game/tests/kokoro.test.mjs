/** Local Kokoro protocol tests: node tests/kokoro.test.mjs. All I/O is mocked. */
import assert from 'node:assert/strict';
import { Blob as NodeBlob } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const saved = { Blob: globalThis.Blob, FormData: globalThis.FormData, WebSocket: globalThis.WebSocket, fetch: globalThis.fetch };
if (!globalThis.Blob) globalThis.Blob = NodeBlob;
if (!globalThis.FormData) globalThis.FormData = class { append() {} };
const temp = await mkdtemp(join(tmpdir(), 'signal-kokoro-tests-'));
const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function wav(samples, sampleRate = 24000) {
  const out = new Uint8Array(44 + samples.length * 2), v = new DataView(out.buffer);
  const put = (offset, s) => { for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); v.setUint32(4, out.length - 8, true); put(8, 'WAVE'); put(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); put(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => v.setInt16(44 + i * 2, sample, true));
  return out;
}
let sockets = [];
class MockSocket {
  constructor(url) { this.url = url; this.sent = []; this.closed = false; sockets.push(this); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  open() { this.onopen?.(); }
  receive(data) { this.onmessage?.({ data }); }
  end() { this.onclose?.(); }
}
globalThis.WebSocket = MockSocket;
async function waitSocket() {
  for (let i = 0; i < 100 && !sockets.length; i++) await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(sockets.length, 'Socket did not open');
  return sockets[0];
}
try {
  const path = join(temp, 'speech.mjs');
  await writeFile(path, await readFile(new URL('../src/speech.js', import.meta.url)));
  const { synthesizeSpeech, transcribeSpeech } = await import(pathToFileURL(path).href);
  await test('ready service sends split text frames and combines complete WAV frames', async () => {
    sockets = [];
    const requests = [];
    globalThis.fetch = async (url, init) => { requests.push({ url, init }); return json({ enabled: true, ready: true }); };
    const pending = synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', apiKey: 'secret', text: 'A'.repeat(501), speed: 1.2 });
    const socket = await waitSocket();
    assert.equal(socket.url, 'ws://localhost:8000/experimental/kokoro/stream');
    assert.equal(socket.binaryType, 'arraybuffer');
    socket.open();
    assert.deepEqual(socket.sent, [
      { type: 'text', text: 'A'.repeat(500), speed: 1.2 },
      { type: 'text', text: 'A', speed: 1.2 },
      { type: 'end' }
    ]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://localhost:8000/experimental/kokoro/status');
    assert.equal(requests[0].init.method, 'GET');
    assert.equal(requests[0].init.headers.Authorization, undefined);
    socket.receive(wav([123]).buffer);
    socket.receive(new Blob([wav([-456])]));
    socket.receive(JSON.stringify({ type: 'done' }));
    const result = await pending;
    assert.equal(result.type, 'audio/wav');
    const out = new DataView(await result.arrayBuffer());
    assert.equal(out.byteLength, 48);
    assert.equal(out.getUint32(24, true), 24000);
    assert.equal(out.getUint32(40, true), 4);
    assert.equal(out.getInt16(44, true), 123);
    assert.equal(out.getInt16(46, true), -456);
    assert.equal(socket.closed, true);
  });
  await test('long lines prefer word boundaries without exceeding four 500-code-point frames', async () => {
    const examples = [
      { text: `${'x'.repeat(490)} encyclopedia`, expected: ['x'.repeat(490), 'encyclopedia'] },
      // Unbroken words remain supported even when no suitable boundary exists.
      { text: 'A'.repeat(2000), expected: Array(4).fill('A'.repeat(500)) },
      { text: `${'a'.repeat(498)} 😀 ${'b'.repeat(498)}`, expected: [`${'a'.repeat(498)} 😀`, 'b'.repeat(498)] },
      // A break too far from the end must not force a fifth frame.
      { text: `${'a'.repeat(100)} ${'b'.repeat(1899)}`, expected: Array(4).fill(null) }
    ];
    for (const { text, expected } of examples) {
      sockets = [];
      globalThis.fetch = async () => json({ enabled: true, ready: true });
      const pending = synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text });
      const socket = await waitSocket(); socket.open();
      const frames = socket.sent.filter(item => item.type === 'text');
      assert.equal(frames.length, expected.length);
      assert.ok(frames.every(item => Array.from(item.text).length <= 500 && item.text.trim()));
      if (expected[0] !== null) assert.deepEqual(frames.map(item => item.text), expected);
      // A boundary may drop separating whitespace, but must not drop words.
      assert.equal(frames.map(item => item.text.replace(/\s+/gu, '')).join(''), text.replace(/\s+/gu, ''));
      for (const frame of frames) socket.receive(wav([1]).buffer);
      socket.receive('{"type":"done"}');
      assert.equal((await pending).size, 44 + frames.length * 2);
    }
  });
  await test('unready service probes first and disabled service never opens socket', async () => {
    sockets = [];
    const paths = [];
    globalThis.fetch = async (url, init) => { paths.push([new URL(url).pathname, init.method]); return json(paths.length === 1 ? { enabled: true, ready: false } : { available: true }); };
    const pending = synthesizeSpeech({ baseUrl: 'http://127.0.0.1:8000', mode: 'mirid-local-kokoro', text: 'Hello.' });
    const socket = await waitSocket();
    assert.deepEqual(paths, [['/experimental/kokoro/status', 'GET'], ['/experimental/kokoro/probe', 'POST']]);
    socket.open(); socket.receive(wav([1]).buffer); socket.receive('{"type":"done"}');
    assert.equal((await pending).size, 46);
    sockets = [];
    globalThis.fetch = async () => json({ enabled: false, ready: false });
    await assert.rejects(synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text: 'Hello.' }), /not enabled/i);
    assert.equal(sockets.length, 0);
  });
  await test('malformed, partial, mismatched and unsupported WAV frames are rejected', async () => {
    for (const frames of [
      [new Uint8Array([1, 2, 3]).buffer],
      [wav([1], 16000).buffer],
      [wav([1]).slice(0, 43).buffer],
      []
    ]) {
      sockets = [];
      globalThis.fetch = async () => json({ enabled: true, ready: true });
      const pending = synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text: 'Hello.' });
      const socket = await waitSocket();
      socket.open();
      for (const frame of frames) socket.receive(frame);
      socket.receive('{"type":"done"}');
      await assert.rejects(pending, /invalid audio|unsupported wav|incomplete audio/i);
      assert.equal(socket.closed, true);
    }
    sockets = [];
    const pending = synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text: 'A'.repeat(501) });
    const socket = await waitSocket();
    socket.open(); socket.receive(wav([1]).buffer); socket.receive('{"type":"done"}');
    await assert.rejects(pending, /incomplete audio/i);
  });
  await test('server protocol errors and premature close fail cleanly', async () => {
    for (const data of ['not json', '{"type":"unknown"}', '{"type":"error"}', null]) {
      sockets = [];
      globalThis.fetch = async () => json({ enabled: true, ready: true });
      const pending = synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text: 'Hello.' });
      const socket = await waitSocket(); socket.open();
      if (data === null) socket.end(); else socket.receive(data);
      await assert.rejects(pending, /invalid response|failed or is busy|ended before/i);
      assert.equal(socket.closed, true);
    }
  });
  await test('cancellation and timeout close the socket; remote mode is rejected', async () => {
    sockets = [];
    globalThis.fetch = async () => json({ enabled: true, ready: true });
    const controller = new AbortController();
    const pending = synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text: 'Hello.', signal: controller.signal });
    const socket = await waitSocket();
    controller.abort();
    await assert.rejects(pending, /cancelled/i);
    assert.equal(socket.closed, true);
    sockets = [];
    const timeout = synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text: 'Hello.', timeoutMs: 30 });
    const timedSocket = await waitSocket();
    await assert.rejects(timeout, /timed out/i);
    assert.equal(timedSocket.closed, true);
    await assert.rejects(synthesizeSpeech({ baseUrl: 'https://remote.example', mode: 'mirid-local-kokoro', text: 'Hello.' }), /loopback/i);
  });
  await test('local mode transcription uses Mirid endpoint without credential leakage', async () => {
    let call;
    globalThis.fetch = async (url, init) => { call = { url, init }; return json({ transcript: 'heard' }); };
    const blob = new Blob(['audio'], { type: 'audio/wav' });
    const result = await transcribeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', apiKey: 'secret', audio: blob });
    assert.equal(result, 'heard');
    assert.equal(call.url, 'http://localhost:8000/transcribe');
    assert.equal(call.init.headers.Authorization, undefined);
  });
  console.log('All local Kokoro protocol tests passed.');
} finally {
  globalThis.Blob = saved.Blob;
  globalThis.FormData = saved.FormData;
  globalThis.WebSocket = saved.WebSocket;
  globalThis.fetch = saved.fetch;
  await rm(temp, { recursive: true, force: true });
}
