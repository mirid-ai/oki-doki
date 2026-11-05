import test from 'node:test';
import assert from 'node:assert/strict';
import { readLocalLauncherSetup, startDesktopLocalAI, readDesktopLocalASR } from '../src/local-setup.js';

const fixture = { version: 1, miridPort: 8000, model: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf', kokoroPort: 8770, nanoPort: 8001 };
function server(data = fixture) {
  return async (url, options) => {
    assert.equal(url.href, 'http://127.0.0.1:8766/.well-known/oki-doki-local.json');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
}
test('local launcher setup resolves only loopback services', async () => {
  assert.deepEqual(await readLocalLauncherSetup('http://127.0.0.1:8766/', { fetchImpl: server() }), {
    miridUrl: 'http://127.0.0.1:8000', model: fixture.model, asrAvailable: true,
    kokoroUrl: 'http://127.0.0.1:8770', nanoUrl: 'http://127.0.0.1:8001'
  });
});
test('local launcher accepts ordinary parenthesized and Unicode model filenames', async () => {
  for (const model of ['Mistral-7B-v0.3 (Q4_K_M).gguf', 'モデル-🦋.GGUF']) {
    const setup = await readLocalLauncherSetup('http://127.0.0.1:8766/', { fetchImpl: server({ ...fixture, model }) });
    assert.equal(setup.model, model);
  }
});
test('speech-only launcher resolves the services without inventing a text model', async () => {
  assert.deepEqual(await readLocalLauncherSetup('http://127.0.0.1:8766/', {
    fetchImpl: server({ version: 1, miridPort: null, model: null, kokoroPort: 8770, nanoPort: 8001 })
  }), { miridUrl: '', model: '', asrAvailable: false, kokoroUrl: 'http://127.0.0.1:8770', nanoUrl: 'http://127.0.0.1:8001' });
});
test('text-only Mirid advertises absent ASR without changing legacy launcher behavior', async () => {
  const setup = await readLocalLauncherSetup('http://127.0.0.1:8766/', {
    fetchImpl: server({ ...fixture, version: 2, asrAvailable: false })
  });
  assert.equal(setup.miridUrl, 'http://127.0.0.1:8000');
  assert.equal(setup.asrAvailable, false);
  assert.equal((await readLocalLauncherSetup('http://127.0.0.1:8766/', {
    fetchImpl: server({ ...fixture, asrAvailable: true })
  })).asrAvailable, true);
});
test('setup rejects remote pages, bad ports and unsafe model names', async () => {
  await assert.rejects(readLocalLauncherSetup('https://example.com/', { fetchImpl: server() }), /launcher URL/);
  for (const update of [{ miridPort: '8000' }, { miridPort: null }, { model: null }, { kokoroPort: 80 }, { nanoPort: 70000 }, { model: '../../outside.gguf' }, { model: '..\\outside.gguf' }, { model: 'bad\u0000name.gguf' }, { model: 'bad\nname.gguf' }, { model: 'model.gguf ' }, { model: 'a'.repeat(146) + '.gguf' }, { asrAvailable: 'false' }, { asrAvailable: false }, { miridPort: null, model: null, asrAvailable: true }, { version: 2 }, { version: 2, asrAvailable: true }, { miridPort: null, model: null, kokoroPort: null, nanoPort: null }]) {
    await assert.rejects(readLocalLauncherSetup('http://127.0.0.1:8766/', { fetchImpl: server({ ...fixture, ...update }) }), /invalid/);
  }
});
test('missing launcher reports actionable failure', async () => {
  await assert.rejects(readLocalLauncherSetup('http://localhost:8766/', { fetchImpl: async () => new Response('', { status: 404 }) }), /local AI or speech service/);
});

test('desktop AI is explicitly started only on its own desktop origin', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url.href, options]);
    return new Response(JSON.stringify(calls.length === 1 ? { available: true } : { ready: true, model: fixture.model }));
  };
  const result = await startDesktopLocalAI('http://127.0.0.1:49564/', { fetchImpl });
  assert.deepEqual(result, { endpoint: 'http://127.0.0.1:49564/local-ai/v1/chat/completions', model: fixture.model });
  assert.deepEqual(calls.map(([url]) => url), ['http://127.0.0.1:49564/local-ai/status', 'http://127.0.0.1:49564/local-ai/start']);
  assert.equal(calls[1][1].method, 'POST'); assert.equal(calls[1][1].body, '{}');
  assert.equal(calls[1][1].credentials, 'omit'); assert.equal(calls[1][1].redirect, 'error');
  for (const page of ['https://example.com/', 'http://127.0.0.1:8766/', 'capacitor://localhost/', 'http://localhost:49564/']) {
    await assert.rejects(startDesktopLocalAI(page, { fetchImpl: () => { throw new Error('Unexpected request'); } }), /desktop package/);
  }
});

test('desktop AI validates availability and the model before returning settings', async () => {
  let calls = 0;
  await assert.rejects(startDesktopLocalAI('http://127.0.0.1:49564/', { fetchImpl: async () => { calls++; return new Response('{"available":false}'); } }), /files are unavailable/);
  assert.equal(calls, 1);
  for (const model of ['../../private.gguf', 'a\n.gguf', 'not-a-model', 'x'.repeat(151) + '.gguf']) {
    calls = 0;
    const fetchImpl = async () => new Response(JSON.stringify(++calls === 1 ? { available: true } : { ready: true, model }));
    await assert.rejects(startDesktopLocalAI('http://127.0.0.1:49564/', { fetchImpl }), /invalid settings/);
  }
});

test('desktop transcription is checked only after an explicit action on its own origin', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url.href, options]);
    return new Response(JSON.stringify({ available: true, engine: 'parakeet-cpp:tdt_ctc-110m:q4_k' }));
  };
  const result = await readDesktopLocalASR('http://127.0.0.1:49564/', { fetchImpl });
  assert.deepEqual(result, { baseUrl: 'http://127.0.0.1:49564/local-asr', engine: 'parakeet-cpp:tdt_ctc-110m:q4_k' });
  assert.deepEqual(calls.map(([url]) => url), ['http://127.0.0.1:49564/local-asr/status']);
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].redirect, 'error');
  for (const page of ['https://example.com/', 'http://127.0.0.1:8766/', 'capacitor://localhost/', 'http://localhost:49564/']) {
    await assert.rejects(readDesktopLocalASR(page, { fetchImpl: () => { throw new Error('Unexpected request'); } }), /desktop package/);
  }
  for (const result of [{ available: false, engine: 'parakeet-cpp:tdt_ctc-110m:q4_k' }, { available: true, engine: 'whisper' }]) {
    await assert.rejects(readDesktopLocalASR('http://127.0.0.1:49564/', { fetchImpl: async () => new Response(JSON.stringify(result)) }), /unavailable/);
  }
});
