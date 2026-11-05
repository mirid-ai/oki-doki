/** Offline tests for Mirid discovery. Run from game/: node tests/mirid.test.mjs */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'mirid-discovery-test-'));
const originalFetch = globalThis.fetch;

try {
  const modulePath = join(temp, 'mirid.mjs');
  await writeFile(join(temp, 'bounded-json.mjs'), await readFile(new URL('../src/bounded-json.js', import.meta.url)));
  const source = (await readFile(new URL('../src/mirid.js', import.meta.url), 'utf8')).replace("'./bounded-json.js'", "'./bounded-json.mjs'");
  await writeFile(modulePath, source);
  const { discoverMirid, DEFAULT_MIRID_URL } = await import(pathToFileURL(modulePath).href);
  const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };
  const json = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  const health = { status: 'healthy', runtime_profile: 'full', local_models: true, local_voice: true, cloud_chat: true, cloud_voice: false, instance_id: 'private-instance' };
  const models = { data: [
    { id: 'Qwen.gguf', owned_by: 'mirid-local', api_key: 'private-key' },
    { id: 'configured-provider', owned_by: 'mirid-provider', token: 'private-token' },
    { id: 'other', owned_by: 'other' }
  ] };
  const voices = { available_engines: ['kokoro', 'kokoro', 'chatterbox'],
    kokoro_voices: [{ id: 'af_heart', name: 'Heart', engine: 'kokoro', file_path: '/private/voice.wav' }],
    chatterbox_voices: [{ id: 'sample.wav', name: 'Sample', engine: 'chatterbox', file_path: '/private/sample.wav' }] };
  const byPath = {
    '/health': health,
    '/v1/models': models,
    '/tts/voices': voices,
    '/stt/available-engines': { available_engines: ['parakeet-cpp', 'whisper'] }
  };
  let requests;
  const normalFetch = async (url, options) => {
    requests.push({ url, options });
    const data = byPath[new URL(url).pathname];
    assert.ok(data, `Unexpected request: ${url}`);
    return json(data);
  };

  await test('default discovery is GET-only and does not probe speech engines', async () => {
    requests = [];
    globalThis.fetch = normalFetch;
    const result = await discoverMirid();
    assert.equal(result.baseUrl, DEFAULT_MIRID_URL);
    assert.deepEqual(requests.map(({ url }) => new URL(url).pathname).sort(), ['/health', '/tts/voices', '/v1/models']);
    assert.deepEqual(result.stt, { available: null, engines: [], probed: false });
    assert.match(result.warnings.stt, /may load whisper/i);
    assert.deepEqual(result.text.models.map((model) => model.kind), ['local', 'provider', 'unknown']);
    assert.equal(result.health.runtimeProfile, 'full');
    assert.equal(result.health.localModels, true);
    assert.deepEqual(result.tts.engines, ['kokoro', 'chatterbox']);
    assert.equal(result.tts.voices.length, 2);
    assert.doesNotMatch(JSON.stringify(result), /private-instance|private-key|private-token|\/private\//);
    for (const { options } of requests) {
      assert.equal(options.method, 'GET');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.body, undefined);
    }
  });

  await test('speech engine probe is explicit and normalizes its result', async () => {
    requests = [];
    globalThis.fetch = normalFetch;
    const result = await discoverMirid({ baseUrl: 'http://localhost:9000/', probeSpeechEngines: true });
    assert.equal(result.baseUrl, 'http://localhost:9000');
    assert.equal(requests.length, 4);
    assert.equal(requests.filter(({ url }) => url.endsWith('/stt/available-engines')).length, 1);
    assert.deepEqual(result.stt, { available: true, engines: ['parakeet-cpp', 'whisper'], probed: true });
    assert.equal(result.warnings.stt, undefined);
  });

  await test('invalid base URLs fail before any request', async () => {
    requests = [];
    globalThis.fetch = normalFetch;
    for (const baseUrl of [
      'http://example.com', 'file:///tmp/test', 'https://user:password@example.com',
      'http://localhost:9000/path', 'http://localhost:9000/?token=secret', 'http://localhost:9000/#fragment',
      'javascript:alert(1)', 'not a url'
    ]) {
      await assert.rejects(discoverMirid({ baseUrl }), TypeError, baseUrl);
    }
    assert.equal(requests.length, 0);
  });

  await test('endpoint failures remain partial and do not expose provider details', async () => {
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/v1/models')) return { ok: false, status: 403, json: async () => ({ secret: 'must not appear' }) };
      if (url.endsWith('/tts/voices')) return { ok: false, status: 404 };
      return normalFetch(url, options);
    };
    requests = [];
    const result = await discoverMirid({ baseUrl: 'https://example.test' });
    assert.equal(result.health.status, 'healthy');
    assert.equal(result.text.available, null);
    assert.equal(result.tts.available, null);
    assert.match(result.errors.text, /denied/i);
    assert.match(result.errors.tts, /unavailable/i);
    assert.doesNotMatch(JSON.stringify(result), /must not appear/);
  });

  await test('malformed data is reported without discarding other endpoints', async () => {
    requests = [];
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/v1/models')) return json({ data: 'not an array' });
      if (url.endsWith('/tts/voices')) return json({ available_engines: [], kokoro_voices: [], chatterbox_voices: [], error: 'private detail' });
      return normalFetch(url, options);
    };
    const result = await discoverMirid();
    assert.equal(result.health.status, 'healthy');
    assert.match(result.errors.text, /unexpected/i);
    assert.match(result.errors.tts, /unexpected/i);
    assert.doesNotMatch(JSON.stringify(result), /private detail/);
  });

  await test('pre-aborted discovery does not make any requests', async () => {
    requests = [];
    globalThis.fetch = normalFetch;
    const controller = new AbortController();
    controller.abort();
    const result = await discoverMirid({ signal: controller.signal, probeSpeechEngines: true });
    assert.equal(requests.length, 0);
    assert.deepEqual(Object.keys(result.errors).sort(), ['health', 'stt', 'text', 'tts']);
    assert.ok(Object.values(result.errors).every((error) => /cancelled/i.test(error)));
  });

  await test('in-flight cancellation aborts every request without retries', async () => {
    requests = [];
    globalThis.fetch = (url, options) => {
      requests.push({ url, options });
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      });
    };
    const controller = new AbortController();
    const pending = discoverMirid({ signal: controller.signal });
    assert.equal(requests.length, 3);
    controller.abort();
    const result = await pending;
    assert.equal(requests.length, 3);
    assert.ok(requests.every(({ options }) => options.signal.aborted));
    assert.ok(Object.values(result.errors).every((error) => /cancelled/i.test(error)));
  });

  await test('hung fetches respect the bounded timeout even if abort is ignored', async () => {
    globalThis.fetch = () => new Promise(() => {});
    const started = Date.now();
    const result = await discoverMirid({ timeoutMs: 500 });
    assert.ok(Date.now() - started < 3000);
    assert.equal(Object.keys(result.errors).length, 3);
    assert.ok(Object.values(result.errors).every((error) => /timed out/i.test(error)));
  });
} finally {
  globalThis.fetch = originalFetch;
  await rm(temp, { recursive: true, force: true });
}
