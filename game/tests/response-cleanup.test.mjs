/** Offline regression tests for early-exit response-stream cleanup. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createGateway } from '../companion/gateway.mjs';

const temp = await mkdtemp(join(tmpdir(), 'signal-response-cleanup-'));
const originalFetch = globalThis.fetch;
try {
  for (const name of ['bounded-json', 'ai', 'mirid', 'speech']) {
    const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
      .replace("'./bounded-json.js'", "'./bounded-json.mjs'");
    await writeFile(join(temp, `${name}.mjs`), source);
  }
  const { respond } = await import(pathToFileURL(join(temp, 'ai.mjs')).href);
  const { discoverMirid } = await import(pathToFileURL(join(temp, 'mirid.mjs')).href);
  const { synthesizeSpeech } = await import(pathToFileURL(join(temp, 'speech.mjs')).href);
  const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };
  const quick = (promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup hung.')), 1000))]);
  function tracked({ status = 503, type = 'application/json', length, chunkSize = 1 } = {}) {
    let cancellations = 0;
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(chunkSize)); },
      cancel() { cancellations++; return new Promise(() => {}); }
    });
    const headers = { 'content-type': type };
    if (length !== undefined) headers['content-length'] = String(length);
    return { response: new Response(stream, { status, headers }), count: () => cancellations };
  }

  await test('AI non-OK body is cancelled without waiting and fetch is aborted', async () => {
    const t = tracked(); let signal;
    globalThis.fetch = async (_url, init) => { signal = init.signal; return t.response; };
    const result = await quick(respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'x' }, fallback: 'Written.' }));
    assert.equal(result.source, 'scripted'); assert.equal(result.text, 'Written.');
    assert.equal(t.count(), 1); assert.equal(signal.aborted, true);
  });

  await test('AI timeout settles even when fetch ignores abort, and discards a late response', async () => {
    const oldTimer = globalThis.setTimeout;
    let resolveFetch, requestSignal;
    globalThis.setTimeout = (callback, delay, ...args) => oldTimer(callback, delay === 2000 ? 0 : delay, ...args);
    globalThis.fetch = (_url, init) => {
      requestSignal = init.signal;
      return new Promise((resolve) => { resolveFetch = resolve; });
    };
    try {
      const result = await quick(respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'x', timeoutMs: 2000 }, fallback: 'Written.' }));
      assert.equal(requestSignal.aborted, true);
      assert.equal(result.source, 'scripted');
      assert.equal(result.text, 'Written.');
      assert.match(result.error, /timed out/i);
      const late = tracked({ status: 200 });
      resolveFetch(late.response);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      assert.equal(late.count(), 1);
    } finally { globalThis.setTimeout = oldTimer; }
  });

  await test('AI caller cancellation settles even when fetch ignores abort', async () => {
    let resolveFetch, requestSignal;
    globalThis.fetch = (_url, init) => {
      requestSignal = init.signal;
      return new Promise((resolve) => { resolveFetch = resolve; });
    };
    const external = new AbortController();
    const pending = respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'x' }, fallback: 'Written.', signal: external.signal });
    external.abort();
    assert.deepEqual(await quick(pending), { text: 'Written.', source: 'scripted' });
    assert.equal(requestSignal.aborted, true);
    const late = tracked({ status: 200 });
    resolveFetch(late.response);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(late.count(), 1);
  });

  await test('Mirid non-OK responses are cancelled without losing partial errors', async () => {
    const bodies = [], signals = [];
    globalThis.fetch = async (_url, init) => { const t = tracked(); bodies.push(t); signals.push(init.signal); return t.response; };
    const result = await quick(discoverMirid());
    assert.deepEqual(Object.keys(result.errors).sort(), ['health', 'text', 'tts']);
    assert.ok(bodies.every((body) => body.count() === 1));
    assert.ok(signals.every((signal) => signal.aborted));
  });

  await test('late Mirid responses are discarded after a timeout', async () => {
    const resolvers = [], bodies = [];
    globalThis.fetch = () => new Promise((resolve) => { resolvers.push(resolve); });
    const result = await quick(discoverMirid({ timeoutMs: 500 }));
    assert.equal(Object.keys(result.errors).length, 3);
    for (const resolve of resolvers) { const t = tracked({ status: 200 }); bodies.push(t); resolve(t.response); }
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.ok(bodies.every((body) => body.count() >= 1));
  });

  await test('speech discards non-OK, unsupported type and declared-oversize bodies', async () => {
    for (const response of [tracked(), tracked({ status: 200, type: 'text/html' }), tracked({ status: 200, type: 'audio/wav', length: 21 * 1024 * 1024 })]) {
      let signal;
      globalThis.fetch = async (_url, init) => { signal = init.signal; return response.response; };
      await assert.rejects(quick(synthesizeSpeech({ baseUrl: 'https://example.invalid', mode: 'openai', text: 'Hello.' })));
      assert.equal(response.count(), 1); assert.equal(signal.aborted, true);
    }
  });

  await test('speech oversize stream does not await a stuck reader cancellation', async () => {
    const response = tracked({ status: 200, type: 'audio/wav', chunkSize: 20 * 1024 * 1024 + 1 });
    let signal; globalThis.fetch = async (_url, init) => { signal = init.signal; return response.response; };
    await assert.rejects(quick(synthesizeSpeech({ baseUrl: 'https://example.invalid', mode: 'openai', text: 'Hello.' })), /too much data/i);
    assert.ok(response.count() >= 1); assert.equal(signal.aborted, true);
  });

  await test('failed local Kokoro probe body is cancelled', async () => {
    const probe = tracked(); let signal, calls = 0;
    globalThis.fetch = async (_url, init) => {
      signal = init.signal; calls++;
      if (calls === 1) return new Response(JSON.stringify({ enabled: true, ready: false }), { headers: { 'content-type': 'application/json' } });
      return probe.response;
    };
    await assert.rejects(quick(synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text: 'Hello.' })));
    assert.equal(calls, 2); assert.equal(probe.count(), 1); assert.equal(signal.aborted, true);
  });

  await test('gateway cleans non-OK, declared-oversize and oversized streamed bodies', async () => {
    const token = '012345678901234567890123456789012345';
    for (const t of [tracked(), tracked({ status: 200, length: 200000 }), tracked({ status: 200, chunkSize: 128 * 1024 + 1 })]) {
      let signal;
      const handler = createGateway({ token, origins: ['https://localhost'], synthesize: async () => {},
        fetchImpl: async (_url, init) => { signal = init.signal; return t.response; } });
      const request = Readable.from([Buffer.from('{"model":"local","messages":[]}')]);
      request.method = 'POST'; request.url = '/v1/chat/completions';
      request.headers = { origin: 'https://localhost', authorization: `Bearer ${token}`, 'content-type': 'application/json' };
      class ResponseStub extends EventEmitter {
        constructor() { super(); this.destroyed = false; this.writableEnded = false; }
        writeHead(status) { this.status = status; }
        end() { this.writableEnded = true; }
      }
      const response = new ResponseStub();
      await quick(handler(request, response));
      assert.equal(response.status, 502); assert.ok(t.count() >= 1); assert.equal(signal.aborted, true);
    }
  });
  console.log('Response cleanup regression tests passed.');
} finally {
  globalThis.fetch = originalFetch;
  await rm(temp, { recursive: true, force: true });
}
