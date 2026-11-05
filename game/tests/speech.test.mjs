/** Offline tests: node tests/speech.test.mjs. All provider calls use fake fetch. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { Blob as NodeBlob } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Codex's Node REPL omits these browser globals; normal Node provides them.
// The fallback FormData preserves the names and bytes used in these tests.
const saved = { Blob: globalThis.Blob, FormData: globalThis.FormData, fetch: globalThis.fetch };
if (!globalThis.Blob) globalThis.Blob = NodeBlob;
if (!globalThis.FormData) globalThis.FormData = class {
  constructor() { this.entries = []; }
  append(name, value, filename) { this.entries.push([name, filename ? { name: filename, size: value.size, type: value.type, blob: value } : value]); }
  get(name) { return this.entries.find(entry => entry[0] === name)?.[1] ?? null; }
  getAll(name) { return this.entries.filter(entry => entry[0] === name).map(entry => entry[1]); }
  keys() { return this.entries.map(entry => entry[0])[Symbol.iterator](); }
};
const temp = await mkdtemp(join(tmpdir(), 'signal-speech-tests-'));
const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };
const response = (body, headers = {}, status = 200) => new Response(body, { status, headers });
const sample = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: 'audio/wav' });
const json = (body) => response(JSON.stringify(body), { 'content-type': 'application/json' });
try {
  const path = join(temp, 'speech.mjs');
  await writeFile(path, await readFile(new URL('../src/speech.js', import.meta.url)));
  const { transcribeSpeech, synthesizeSpeech, uploadMiridVoiceReference } = await import(pathToFileURL(path).href);
  await test('Chatterbox reference upload sends the selected file only on request and uses Mirid’s voice ID', async () => {
    const selected = new Blob(['sample'], { type: 'audio/wav' });
    Object.defineProperty(selected, 'name', { value: 'reference.wav' });
    const calls = [];
    globalThis.fetch = async (url, request) => { calls.push({ url, request }); return json({ status: 'success', voice_id: 'reference_1.wav' }); };
    const voice = await uploadMiridVoiceReference({ baseUrl: 'http://127.0.0.1:8000', apiKey: 'test-key', audio: selected });
    assert.equal(voice, 'reference_1.wav');
    assert.equal(calls[0].url, 'http://127.0.0.1:8000/tts/upload-voice');
    assert.equal(calls[0].request.method, 'POST');
    assert.equal(calls[0].request.headers.Authorization, 'Bearer test-key');
    assert.equal(calls[0].request.body.get('file').name, 'reference.wav');
    assert.deepEqual([...calls[0].request.body.keys()], ['file']);
  });
  await test('phone-style audio containers and AAC references can be submitted', async () => {
    for (const [name, mime] of [['voice.ogg', 'audio/ogg'], ['voice.opus', 'audio/ogg'], ['voice.webm', 'audio/webm'], ['voice.aac', 'audio/aac'], ['voice.mp4', 'audio/mp4'], ['voice.3gp', 'audio/3gpp']]) {
      const selected = new Blob(['sample'], { type: mime });
      Object.defineProperty(selected, 'name', { value: name });
      let received;
      globalThis.fetch = async (_url, request) => {
        received = request.body.get('file');
        return json({ status: 'success', voice_id: name });
      };
      assert.equal(await uploadMiridVoiceReference({ baseUrl: 'http://127.0.0.1:8000', audio: selected }), name);
      assert.equal(received.name, name);
    }
  });
  await test('Chatterbox upload rejects unsupported files, modes and unsafe response IDs', async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; return json({ status: 'success', voice_id: '../bad.wav' }); };
    const bad = new Blob(['audio']); Object.defineProperty(bad, 'name', { value: 'audio.txt' });
    await assert.rejects(uploadMiridVoiceReference({ baseUrl: 'http://127.0.0.1:8000', audio: bad }), /WAV, MP3/);
    const good = new Blob(['audio']); Object.defineProperty(good, 'name', { value: 'audio.wav' });
    await assert.rejects(uploadMiridVoiceReference({ baseUrl: 'http://127.0.0.1:8000', audio: good, mode: 'openai' }), /Mirid speech service/);
    assert.equal(called, false);
    await assert.rejects(uploadMiridVoiceReference({ baseUrl: 'http://127.0.0.1:8000', audio: good }), /invalid voice reference/);
  });
  await test('Nano and Faster speech use the selected voice reference', async () => {
    const bodies = [];
    globalThis.fetch = async (_url, request) => { bodies.push(JSON.parse(request.body)); return response(new Uint8Array([1, 2, 3]), { 'content-type': 'audio/wav' }); };
    for (const engine of ['chatterbox_nano', 'chatterbox']) {
      await synthesizeSpeech({ baseUrl: 'http://127.0.0.1:8000', mode: 'mirid', text: 'Hello.', engine, voice: 'reference.wav', speed: 1 });
    }
    assert.deepEqual(bodies.map(({ engine, voice }) => ({ engine, voice })), [
      { engine: 'chatterbox_nano', voice: 'reference.wav' }, { engine: 'chatterbox', voice: 'reference.wav' }
    ]);
  });
  let calls = [];
  globalThis.fetch = async (url, request) => { calls.push({ url, request }); return json({ transcript: '  hello world  ' }); };
  await test('Mirid transcription sends multipart audio and encoded engine to the exact endpoint', async () => {
    calls = [];
    const result = await transcribeSpeech({ baseUrl: 'http://localhost:8001/', mode: 'mirid', engine: 'parakeet-cpp:tdt_ctc-110m:q4_k', apiKey: 'test-key', audio: sample });
    assert.equal(result, 'hello world');
    assert.equal(calls.length, 1);
    const request = calls[0];
    const url = new URL(request.url);
    assert.equal(url.origin, 'http://localhost:8001');
    assert.equal(url.pathname, '/transcribe');
    assert.equal(url.searchParams.get('engine'), 'parakeet-cpp:tdt_ctc-110m:q4_k');
    assert.equal(request.request.method, 'POST');
    assert.equal(request.request.headers.Authorization, 'Bearer test-key');
    assert.equal(request.request.headers['Content-Type'], undefined, 'Browser must set multipart boundary');
    assert.equal(request.request.body.get('file').name, 'recording.wav');
    assert.equal(request.request.body.get('file').size, 4);
    assert.deepEqual([...request.request.body.keys()], ['file']);
    assert.equal(request.request.credentials, 'omit');
    assert.equal(request.request.redirect, 'error');
  });
  await test('OpenAI-compatible transcription includes model and json response format', async () => {
    calls = [];
    globalThis.fetch = async (url, request) => { calls.push({ url, request }); return json({ text: 'hello from model' }); };
    const transcript = await transcribeSpeech({ baseUrl: 'https://speech.example/v1', mode: 'openai', model: 'asr-test', audio: sample });
    assert.equal(transcript, 'hello from model');
    assert.equal(calls[0].url, 'https://speech.example/v1/audio/transcriptions');
    assert.equal(calls[0].request.body.get('model'), 'asr-test');
    assert.equal(calls[0].request.body.get('response_format'), 'json');
    assert.equal(calls[0].request.body.get('file').name, 'recording.wav');
    assert.deepEqual([...calls[0].request.body.keys()], ['file', 'model', 'response_format']);
  });
  await test('Mirid speech sends its exact payload and returns a WAV blob', async () => {
    calls = [];
    globalThis.fetch = async (url, request) => { calls.push({ url, request }); return response(new Uint8Array([1, 2, 3]), { 'content-type': 'audio/wav' }); };
    const blob = await synthesizeSpeech({ baseUrl: 'http://127.0.0.1:8001/tts', mode: 'mirid', text: ' Hello. ', engine: 'kokoro', voice: 'af_bella', speed: 1.2 });
    assert.equal(calls[0].url, 'http://127.0.0.1:8001/tts');
    assert.deepEqual(JSON.parse(calls[0].request.body), { text: 'Hello.', engine: 'kokoro', voice: 'af_bella', speed: 1.2 });
    assert.equal(calls[0].request.headers['Content-Type'], 'application/json');
    assert.equal(blob.type, 'audio/wav');
    assert.equal(blob.size, 3);
  });
  await test('OpenAI-compatible speech supports base URL and defaults', async () => {
    calls = [];
    globalThis.fetch = async (url, request) => { calls.push({ url, request }); return response(new Uint8Array([1]), { 'content-type': 'application/octet-stream' }); };
    const blob = await synthesizeSpeech({ baseUrl: 'https://speech.example', mode: 'openai', text: 'Listen.' });
    assert.equal(calls[0].url, 'https://speech.example/v1/audio/speech');
    assert.deepEqual(JSON.parse(calls[0].request.body), { input: 'Listen.', model: 'tts-1', voice: 'alloy', speed: 1, response_format: 'wav' });
    assert.equal(blob.size, 1);
  });
  await test('complete endpoint URLs normalize a trailing slash before requests', async () => {
    for (const [mode, baseUrl, expected] of [
      ['mirid', 'http://127.0.0.1:8001/tts/', 'http://127.0.0.1:8001/tts'],
      ['openai', 'https://speech.example/v1/audio/speech/', 'https://speech.example/v1/audio/speech']
    ]) {
      calls = [];
      globalThis.fetch = async (url, request) => { calls.push({ url, request }); return response(new Uint8Array([1]), { 'content-type': 'audio/wav' }); };
      await synthesizeSpeech({ baseUrl, mode, text: 'Hello.' });
      assert.equal(calls[0].url, expected);
    }
    for (const [mode, baseUrl, expected] of [
      ['mirid', 'http://127.0.0.1:8001/transcribe/', 'http://127.0.0.1:8001/transcribe'],
      ['openai', 'https://speech.example/v1/audio/transcriptions/', 'https://speech.example/v1/audio/transcriptions']
    ]) {
      calls = [];
      globalThis.fetch = async (url, request) => { calls.push({ url, request }); return json(mode === 'mirid' ? { transcript: 'Hello.' } : { text: 'Hello.' }); };
      await transcribeSpeech({ baseUrl, mode, audio: sample });
      assert.equal(calls[0].url, expected);
    }
  });
  await test('invalid service settings and unsafe or oversized input never call fetch', async () => {
    calls = [];
    globalThis.fetch = async () => { calls.push('unexpected'); throw new Error('network should not be called'); };
    const checks = [
      () => synthesizeSpeech({ baseUrl: 'http://remote.example', text: 'hi' }),
      () => synthesizeSpeech({ baseUrl: 'https://name:secret@example.org', text: 'hi' }),
      () => synthesizeSpeech({ baseUrl: 'https://example.org?token=x', text: 'hi' }),
      () => synthesizeSpeech({ baseUrl: 'https://example.org', mode: 'invalid', text: 'hi' }),
      () => synthesizeSpeech({ baseUrl: 'https://example.org', text: ' ' }),
      () => synthesizeSpeech({ baseUrl: 'https://example.org', text: 'x'.repeat(2001) }),
      () => synthesizeSpeech({ baseUrl: 'https://example.org', text: 'hi', speed: 4.1 }),
      () => synthesizeSpeech({ baseUrl: 'https://example.org', text: 'hi', apiKey: 'bad\nkey' }),
      () => synthesizeSpeech({ baseUrl: 'https://example.org', text: 'hi', timeoutMs: 0 }),
      () => transcribeSpeech({ baseUrl: 'http://localhost:8001', audio: new Blob([]) }),
      () => transcribeSpeech({ baseUrl: 'http://localhost:8001', engine: 'parakeet-cpp:tdt_ctc-110m:q4_k', audio: new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]) }),
      () => transcribeSpeech({ baseUrl: 'http://localhost:8001', audio: new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]) })
    ];
    for (const check of checks) await assert.rejects(check());
    assert.equal(calls.length, 0);
  });
  await test('voice reference failures point to a recoverable cause without exposing service bodies', async () => {
    const recording = new Blob(['synthetic audio'], { type: 'audio/wav' });
    Object.defineProperty(recording, 'name', { value: 'synthetic.wav' });
    for (const [status, expected] of [[413, /voice reference file.*too large.*smaller file/i], [422, /voice reference.*format and length/i], [429, /another voice reference.*try again/i]]) {
      globalThis.fetch = async () => response('private provider diagnostics', {}, status);
      await assert.rejects(uploadMiridVoiceReference({ baseUrl: 'http://127.0.0.1:8001', audio: recording }), error => {
        assert.match(error.message, expected);
        assert.ok(!error.message.includes('private provider diagnostics'));
        return true;
      });
    }
    globalThis.fetch = async () => response('private provider diagnostics', {}, 404);
    for (const engine of ['chatterbox', 'chatterbox_nano', 'chatterbox_turbo']) {
      await assert.rejects(synthesizeSpeech({ baseUrl: 'http://127.0.0.1:8001', text: 'Hello.', engine, voice: 'reference.wav' }), error => {
        assert.match(error.message, /endpoint or voice reference.*upload the voice again/i);
        assert.ok(!error.message.includes('private provider diagnostics'));
        return true;
      });
    }
    await assert.rejects(synthesizeSpeech({ baseUrl: 'http://127.0.0.1:8770', text: 'Hello.', engine: 'kokoro', voice: 'af_bella' }), /endpoint was not found/i);
  });
  await test('provider and malformed responses raise actionable, sanitized errors', async () => {
    for (const [status, expected] of [[401, /authentication/i], [403, /access.*denied/i], [404, /not found/i], [413, /too large/i], [422, /could not transcribe/i], [503, /unavailable/i]]) {
      globalThis.fetch = async () => response('', {}, status);
      await assert.rejects(transcribeSpeech({ baseUrl: 'https://example.org', audio: sample, apiKey: 'secret-test-key' }), error => {
        assert.match(error.message, expected);
        assert.ok(!error.message.includes('secret-test-key'));
        return true;
      });
    }
    globalThis.fetch = async () => response('not json', { 'content-type': 'application/json' });
    await assert.rejects(transcribeSpeech({ baseUrl: 'https://example.org', audio: sample }), /invalid transcription/i);
    globalThis.fetch = async () => json({ transcript: '' });
    await assert.rejects(transcribeSpeech({ baseUrl: 'https://example.org', audio: sample }), /no speech/i);
    globalThis.fetch = async () => response('{}', { 'content-type': 'application/json' });
    await assert.rejects(synthesizeSpeech({ baseUrl: 'https://example.org', text: 'Hi' }), /unsupported audio/i);
    globalThis.fetch = async () => response('', { 'content-type': 'audio/wav' });
    await assert.rejects(synthesizeSpeech({ baseUrl: 'https://example.org', text: 'Hi' }), /empty audio/i);
  });
  await test('oversized read-aloud requests do not ask the player to record audio', async () => {
    globalThis.fetch = async () => response('private provider diagnostics', {}, 413);
    for (const options of [
      { baseUrl: 'http://127.0.0.1:8770', engine: 'kokoro', voice: 'af_bella' },
      { baseUrl: 'http://127.0.0.1:8001', engine: 'chatterbox_nano', voice: 'reference.wav' },
      { baseUrl: 'https://example.org', mode: 'openai', model: 'tts-1', voice: 'alloy' }
    ]) {
      await assert.rejects(synthesizeSpeech({ ...options, text: 'Read this passage.' }), error => {
        assert.match(error.message, /speech request is too large.*another speech service/i);
        assert.doesNotMatch(error.message, /record|private provider diagnostics/i);
        return true;
      });
    }
    await assert.rejects(transcribeSpeech({ baseUrl: 'http://127.0.0.1:8001', audio: sample }), /record a shorter message/i);
  });
  await test('oversized provider response is rejected before reading its body', async () => {
    let bodyRead = false;
    globalThis.fetch = async () => ({ ok: true, headers: new Headers({ 'content-length': String(20 * 1024 * 1024 + 1), 'content-type': 'audio/wav' }), body: null, arrayBuffer: async () => { bodyRead = true; return new ArrayBuffer(0); } });
    await assert.rejects(synthesizeSpeech({ baseUrl: 'https://example.org', text: 'Hi' }), /too much data/i);
    assert.equal(bodyRead, false);
  });
  await test('pre-abort, in-flight abort and timeout stop speech requests', async () => {
    calls = [];
    globalThis.fetch = (_url, request) => {
      calls.push(request.signal);
      return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
    };
    const before = new AbortController();
    before.abort();
    await assert.rejects(synthesizeSpeech({ baseUrl: 'https://example.org', text: 'Hi', signal: before.signal }), /cancelled/i);
    assert.equal(calls.length, 0);
    const controller = new AbortController();
    const pending = transcribeSpeech({ baseUrl: 'https://example.org', audio: sample, signal: controller.signal });
    assert.equal(calls.length, 1);
    controller.abort();
    assert.equal(calls[0].aborted, true);
    await assert.rejects(pending, /cancelled/i);
    await assert.rejects(synthesizeSpeech({ baseUrl: 'https://example.org', text: 'Hi', timeoutMs: 5 }), /timed out/i);
    assert.equal(calls[1].aborted, true);
  });
  await test('timeout and cancellation settle when fetch ignores abort and discard late responses', async () => {
    for (const kind of ['timeout', 'cancel']) {
      let finish, signal, cancelled = 0;
      globalThis.fetch = (_url, init) => { signal = init.signal; return new Promise(resolve => { finish = resolve; }); };
      const controller = new AbortController();
      const options = { baseUrl: 'https://example.org', text: 'Hi', timeoutMs: kind === 'timeout' ? 5 : 1000, signal: controller.signal };
      const pending = synthesizeSpeech(options);
      if (kind === 'cancel') controller.abort();
      await assert.rejects(pending, kind === 'timeout' ? /timed out/i : /cancelled/i);
      assert.equal(signal.aborted, true);
      const stream = new ReadableStream({ cancel() { cancelled++; } });
      finish(new Response(stream, { headers: { 'content-type': 'audio/wav' } }));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      assert.equal(cancelled, 1);
    }
  });
  await test('a stalled speech response body is cancelled on timeout', async () => {
    let cancelled = 0;
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } }),
      { headers: { 'content-type': 'audio/wav' } });
    await assert.rejects(synthesizeSpeech({ baseUrl: 'https://example.org', text: 'Hi', timeoutMs: 5 }), /timed out/i);
    assert.equal(cancelled, 1);
  });
  await test('transcription cancellation releases a stalled JSON response', async () => {
    let cancelled = 0;
    const controller = new AbortController();
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } }),
      { headers: { 'content-type': 'application/json' } });
    const pending = transcribeSpeech({ baseUrl: 'https://example.org', audio: sample, signal: controller.signal });
    // Let fetch resolve and the body reader start before cancellation.
    for (let i = 0; i < 4; i++) await Promise.resolve();
    controller.abort();
    await assert.rejects(pending, /cancelled/i);
    assert.equal(cancelled, 1);
  });
  await test('a late local Kokoro probe response is discarded after timeout', async () => {
    let finish, calls = 0, cancelled = 0;
    globalThis.fetch = async () => {
      if (++calls === 1) return json({ enabled: true, ready: false });
      return new Promise(resolve => { finish = resolve; });
    };
    await assert.rejects(synthesizeSpeech({ baseUrl: 'http://localhost:8000', mode: 'mirid-local-kokoro', text: 'Hi', timeoutMs: 10 }), /timed out/i);
    assert.equal(calls, 2);
    finish(new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'content-type': 'application/json' } }));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(cancelled, 1);
  });
  console.log('All speech tests passed.');
} finally {
  globalThis.fetch = saved.fetch;
  globalThis.Blob = saved.Blob;
  globalThis.FormData = saved.FormData;
  await rm(temp, { recursive: true, force: true });
}
