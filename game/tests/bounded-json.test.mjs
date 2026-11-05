/** Offline response-boundary tests; no network is used. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temp = await mkdtemp(join(tmpdir(), 'bounded-json-tests-'));
const oldFetch = globalThis.fetch;
const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };
try {
  for (const name of ['bounded-json', 'ai', 'mirid']) {
    let source = await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8');
    source = source.replace("'./bounded-json.js'", "'./bounded-json.mjs'");
    await writeFile(join(temp, `${name}.mjs`), source);
  }
  const { readBoundedJson } = await import(pathToFileURL(join(temp, 'bounded-json.mjs')).href);
  const { respond } = await import(pathToFileURL(join(temp, 'ai.mjs')).href);
  const { discoverMirid } = await import(pathToFileURL(join(temp, 'mirid.mjs')).href);
  await test('normal JSON is read from a bounded stream', async () => {
    assert.deepEqual(await readBoundedJson(new Response('{"message":"hello"}'), { limit: 32 }), { message: 'hello' });
  });
  await test('oversized declared length is rejected before reading the body', async () => {
    let read = false, cancelled = false;
    const response = { headers: new Headers({ 'content-length': '100' }), body: { getReader() { read = true; throw new Error('must not read'); }, cancel() { cancelled = true; } } };
    await assert.rejects(readBoundedJson(response, { limit: 10 }), /too large/i);
    assert.equal(read, false);
    assert.equal(cancelled, true);
  });
  await test('missing or false content length cannot bypass chunked byte limit', async () => {
    for (const length of [null, '1']) {
      let cancelled = false;
      const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('123456')); controller.enqueue(new TextEncoder().encode('789012')); }, cancel() { cancelled = true; } });
      const headers = length ? { 'content-length': length } : {};
      await assert.rejects(readBoundedJson(new Response(stream, { headers }), { limit: 10 }), /too large/i);
      assert.equal(cancelled, true);
    }
  });
  await test('cancel aborts a pending read and releases its stream', async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const controller = new AbortController();
    const pending = readBoundedJson(response, { limit: 10, signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(cancelled, true);
    const before = new AbortController(); before.abort();
    await assert.rejects(readBoundedJson(new Response('{}'), { signal: before.signal }), error => error.name === 'AbortError');
  });
  await test('malformed JSON, invalid encoding and unstreamable bodies fail closed', async () => {
    await assert.rejects(readBoundedJson(new Response('not json')));
    await assert.rejects(readBoundedJson(new Response(new Uint8Array([0xff, 0xff]))));
    await assert.rejects(readBoundedJson({ headers: new Headers(), body: null }), /unavailable/i);
  });
  await test('oversized AI response falls back without displaying provider data', async () => {
    globalThis.fetch = async () => new Response('x'.repeat(128 * 1024 + 1));
    const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, fallback: 'Still here.' });
    assert.equal(result.source, 'scripted');
    assert.equal(result.text, 'Still here.');
    assert.match(result.error, /failed/i);
  });
  await test('oversized discovery response yields a partial sanitized result', async () => {
    globalThis.fetch = async (url) => {
      const path = new URL(url).pathname;
      const data = path === '/health' ? { status: 'healthy' } : { available_engines: [], kokoro_voices: [], chatterbox_voices: [] };
      return path === '/v1/models' ? new Response('x'.repeat(128 * 1024 + 1)) : new Response(JSON.stringify(data));
    };
    const result = await discoverMirid();
    assert.equal(result.health.status, 'healthy');
    assert.equal(result.text.available, null);
    assert.ok(result.errors.text);
    assert.ok(!JSON.stringify(result).includes('xxxxx'));
  });
  console.log('All bounded JSON tests passed.');
} finally {
  globalThis.fetch = oldFetch;
  await rm(temp, { recursive: true, force: true });
}
