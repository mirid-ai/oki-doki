import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createGateway, resolveCompanionKokoroPort } from './gateway.mjs';

const token = 'test-token-with-at-least-32-characters-long';
const origin = 'https://localhost';
class FakeResponse extends EventEmitter {
  constructor() { super(); this.writableEnded = false; this.destroyed = false; }
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  end(body) { this.body = body; this.writableEnded = true; }
}
function request({ path = '/v1/chat/completions', method = 'POST', body = '{"model":"local","messages":[]}', auth = `Bearer ${token}`, source = origin, type = 'application/json', headers = {} } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method; req.url = path;
  req.headers = { origin: source, authorization: auth, 'content-type': type, ...headers };
  return req;
}
function setup(overrides = {}) {
  const calls = [];
  const fetchImpl = overrides.fetchImpl || (async (url, init) => { calls.push({ url, init }); return new Response('{"choices":[{"message":{"content":"hello"}}]}', { headers: { 'content-type': 'application/json' } }); });
  const synthesize = overrides.synthesize || (async options => { calls.push({ synthesize: options }); return new Blob(['wav'], { type: 'audio/wav' }); });
  const gateway = createGateway({ token, origins: [origin, 'capacitor://localhost'], fetchImpl, synthesize, ...overrides });
  return { calls, gateway, async run(options) { const res = new FakeResponse(); await gateway(request(options), res); return res; } };
}

test('requires strong token and an exact non-wildcard trusted origin', () => {
  assert.throws(() => createGateway({ token: 'short', origins: [origin], synthesize() {} }), /token/i);
  assert.throws(() => createGateway({ token, origins: ['*'], synthesize() {} }), /origin/i);
  assert.throws(() => createGateway({ token, origins: ['http://example.com'], synthesize() {} }), /origin/i);
  assert.doesNotThrow(() => setup());
});
test('denies unauthenticated, untrusted, disallowed route and method requests', async () => {
  const x = setup();
  assert.equal((await x.run({ auth: 'Bearer wrong' })).status, 401);
  assert.equal((await x.run({ source: 'https://localhost.evil.example' })).status, 403);
  assert.equal((await x.run({ source: 'null' })).status, 403);
  assert.equal((await x.run({ path: '/settings' })).status, 404);
  for (const path of ['constructor', '__proto__', 'toString']) assert.equal((await x.run({ path })).status, 404);
  assert.equal((await x.run({ path: '/v1/chat/completions?admin=true' })).status, 404);
  assert.equal((await x.run({ method: 'GET' })).status, 405);
  assert.equal(x.calls.length, 0);
});
test('preflight allows only the configured origin, POST and required headers', async () => {
  const x = setup();
  const res = await x.run({ method: 'OPTIONS', body: '', auth: '', headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], origin);
  assert.equal(res.headers['Access-Control-Allow-Headers'], 'Authorization, Content-Type');
  assert.equal((await x.run({ method: 'OPTIONS', body: '', headers: { 'access-control-request-method': 'PUT' } })).status, 403);
  assert.equal((await x.run({ method: 'OPTIONS', body: '', headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-evil' } })).status, 403);
  assert.equal(x.calls.length, 0);
});
test('chat forwards only to fixed loopback and does not forward credentials', async () => {
  const x = setup();
  const res = await x.run({ source: 'capacitor://localhost' });
  assert.equal(res.status, 200);
  assert.equal(x.calls[0].url, 'http://127.0.0.1:8000/v1/chat/completions');
  assert.equal(x.calls[0].init.headers.Authorization, undefined);
  assert.equal(x.calls[0].init.redirect, 'error');
  assert.equal(x.calls[0].init.credentials, 'omit');
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'capacitor://localhost');
  assert.ok(!String(res.body).includes(token));
});
test('transcription forwards bounded multipart to fixed engine and maps transcript', async () => {
  const calls = [];
  const x = setup({ fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response('{"transcript":"heard"}'); } });
  const res = await x.run({ path: '/v1/audio/transcriptions', type: 'multipart/form-data; boundary=abc123', body: '--abc123\r\nfile\r\n--abc123--' });
  assert.equal(res.status, 200);
  const target = new URL(calls[0].url);
  assert.equal(target.pathname, '/transcribe');
  assert.equal(target.searchParams.get('engine'), 'parakeet-cpp:tdt_ctc-110m:q4_k');
  assert.deepEqual(JSON.parse(res.body), { text: 'heard' });
  assert.equal(calls[0].init.headers['Content-Type'], 'multipart/form-data; boundary=abc123');
});
test('companion discovers only the identified local multi-voice service, with explicit overrides', async () => {
  const calls = [];
  const healthy = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ service: 'oki-doki-kokoro', voices: 7 }), { headers: { 'content-type': 'application/json' } });
  };
  assert.equal(await resolveCompanionKokoroPort(undefined, { fetchImpl: healthy }), 8770);
  assert.equal(calls[0].url, 'http://127.0.0.1:8770/health');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.headers, undefined, 'no pairing token sent to loopback service');
  assert.equal(await resolveCompanionKokoroPort(undefined, { fetchImpl: async () => new Response('{"service":"wrong","voices":7}', { headers: { 'content-type': 'application/json' } }) }), null);
  assert.equal(await resolveCompanionKokoroPort(undefined, { fetchImpl: async () => { throw new Error('connection refused'); } }), null);
  assert.equal(await resolveCompanionKokoroPort(undefined, { fetchImpl: async () => new Response('x'.repeat(513), { headers: { 'content-type': 'application/json' } }) }), null);
  assert.equal(await resolveCompanionKokoroPort(undefined, { fetchImpl: () => new Promise(() => {}), timeoutMs: 5 }), null);
  assert.equal(await resolveCompanionKokoroPort('8888', { fetchImpl: () => { throw new Error('override should not probe'); } }), 8888);
  assert.equal(await resolveCompanionKokoroPort('fixed', { fetchImpl: () => { throw new Error('override should not probe'); } }), null);
  await assert.rejects(() => resolveCompanionKokoroPort('0'), /Invalid companion Kokoro port/);
  await assert.rejects(() => resolveCompanionKokoroPort('http://localhost:8770'), /Invalid companion Kokoro port/);
});

test('speech translates to local Kokoro without passing client credentials or arbitrary URLs', async () => {
  const x = setup();
  const res = await x.run({ path: '/v1/audio/speech', body: '{"input":"Hello.","voice":"alloy","speed":1}' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'audio/wav');
  assert.equal(x.calls[0].synthesize.baseUrl, 'http://127.0.0.1:8000');
  assert.equal(x.calls[0].synthesize.mode, 'mirid-local-kokoro');
  assert.equal(x.calls[0].synthesize.text, 'Hello.');
  assert.equal(x.calls[0].synthesize.apiKey, undefined);
  assert.equal(x.calls[0].synthesize.voice, undefined);
});
test('optional local Kokoro routing preserves the selected voice and keeps the pairing token local', async () => {
  const calls = [];
  const x = setup({ kokoroPort: 8770, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response('wav', { headers: { 'content-type':'audio/wav' } });
  } });
  const res = await x.run({ path: '/v1/audio/speech', body: JSON.stringify({ input:'Hello.', voice:'bm_george', speed:1 }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'audio/wav');
  assert.equal(calls[0].url, 'http://127.0.0.1:8770/tts');
  assert.deepEqual(JSON.parse(calls[0].init.body), { text:'Hello.', engine:'kokoro', voice:'bm_george', speed:1 });
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.redirect, 'error');
  const rejected = await x.run({ path: '/v1/audio/speech', body: JSON.stringify({ input:'Hello.', voice:'../../other', speed:1 }) });
  assert.equal(rejected.status, 400);
  assert.equal(calls.length, 1);
});
test('optional Nano route uses only the desktop default reference and is unavailable when disabled', async () => {
  const calls = [];
  const body = JSON.stringify({ text:'Hello.', engine:'chatterbox_nano', voice:'default', speed:1 });
  assert.equal((await setup().run({ path:'/tts', body })).status, 404);
  const x = setup({ chatterboxPort: 8001, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response('wav', { headers: { 'content-type':'audio/wav' } });
  } });
  assert.equal((await x.run({ path:'/tts', body })).status, 200);
  assert.equal(calls[0].url, 'http://127.0.0.1:8001/tts');
  assert.deepEqual(JSON.parse(calls[0].init.body), JSON.parse(body));
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal((await x.run({ path:'/tts', body: JSON.stringify({ text:'x', engine:'chatterbox_nano', voice:'../../private.wav' }) })).status, 400);
  assert.equal((await x.run({ path:'/tts/upload-voice', body })).status, 404);
  assert.equal(calls.length, 1);
  assert.throws(() => setup({ chatterboxPort: 65536 }), /port/i);
});
test('the optional voice routes do not relay malformed, excessive or failed upstream audio', async () => {
  const nano = { path:'/tts', body: JSON.stringify({ text:'Hello.', engine:'chatterbox_nano', voice:'default' }) };
  const kokoro = { path:'/v1/audio/speech', body: JSON.stringify({ input:'Hello.', voice:'af_bella' }) };
  for (const input of [nano, kokoro]) for (const response of [
    new Response('diagnostic', { status:503 }),
    new Response('diagnostic', { headers:{ 'content-type':'text/plain' } }),
    new Response('x', { headers:{ 'content-type':'audio/wav', 'content-length':'20971521' } })
  ]) {
    const x = setup({ chatterboxPort:8001, kokoroPort:8770, fetchImpl:async () => response });
    const result = await x.run(input);
    assert.equal(result.status, 502);
    assert.ok(!String(result.body).includes('diagnostic'));
  }
});
test('rejects wrong content types, streams, oversized requests and invalid text', async () => {
  const x = setup();
  assert.equal((await x.run({ type: 'text/plain' })).status, 415);
  assert.equal((await x.run({ headers: { 'content-encoding': 'gzip' } })).status, 415);
  assert.equal((await x.run({ body: '{"messages":[],"stream":true}' })).status, 400);
  assert.equal((await x.run({ headers: { 'content-length': '999999' } })).status, 413);
  assert.equal((await x.run({ path: '/v1/audio/speech', body: JSON.stringify({ input: 'x'.repeat(2001) }) })).status, 400);
  assert.equal((await x.run({ path: '/v1/audio/transcriptions', type: 'multipart/form-data; boundary=valid', headers: { 'content-length': '4194305' } })).status, 413);
  assert.equal(x.calls.length, 0);
});
test('upstream failures and excessive responses are sanitized', async () => {
  const x = setup({ fetchImpl: async () => new Response('private upstream diagnostics', { status: 503 }) });
  const failed = await x.run();
  assert.equal(failed.status, 502);
  assert.ok(!String(failed.body).includes('private upstream diagnostics'));
  const y = setup({ fetchImpl: async () => new Response('x', { headers: { 'content-length': '999999999' } }) });
  assert.equal((await y.run()).status, 502);
  const malformed = setup({ fetchImpl: async () => new Response('not json') });
  assert.equal((await malformed.run()).status, 502);
});
test('disconnect cancels pending upstream work', async () => {
  let upstreamSignal;
  const x = setup({ fetchImpl: (_url, init) => {
    upstreamSignal = init.signal;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const req = request(); const res = new FakeResponse();
  const pending = x.gateway(req, res);
  while (!upstreamSignal) await new Promise(resolve => setTimeout(resolve, 0));
  req.emit('aborted');
  await pending;
  assert.equal(upstreamSignal.aborted, true);
  assert.equal(res.status, 504);
});
test('limits concurrent authenticated work and frees slots on cancellation', async () => {
  const signals = [];
  let block = true;
  const x = setup({ fetchImpl: (_url, init) => {
    if (!block) return Promise.resolve(new Response('{"choices":[]}'));
    signals.push(init.signal);
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const firstReq = request(), secondReq = request();
  const firstRes = new FakeResponse(), secondRes = new FakeResponse();
  const first = x.gateway(firstReq, firstRes), second = x.gateway(secondReq, secondRes);
  while (signals.length < 2) await new Promise(resolve => setTimeout(resolve, 0));
  const rejected = await x.run();
  assert.equal(rejected.status, 429);
  firstReq.emit('aborted'); secondReq.emit('aborted');
  await Promise.all([first, second]);
  assert.ok(signals.every(signal => signal.aborted));
  block = false;
  assert.equal((await x.run()).status, 200);
});

test('slow incomplete uploads time out, destroy their stream, and free the slot', async () => {
  const x = setup({ timeoutMs: 20 });
  const slow = new PassThrough();
  slow.method = 'POST'; slow.url = '/v1/chat/completions';
  slow.headers = { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const res = new FakeResponse();
  const pending = x.gateway(slow, res);
  slow.write('{');
  await pending;
  assert.equal(slow.destroyed, true);
  assert.equal(res.status, 504);
  assert.equal(x.calls.length, 0);
  assert.equal((await x.run()).status, 200);
});

const mintPath = '/v1/realtime/client-secret';
const providerKey = 'sk-test-credential-never-return';
const fixedTime = 1800000000000;
const mintRequest = { path: mintPath, body: '{}' };
function successfulMint(extra = {}) {
  return new Response(JSON.stringify({ value: 'ek_synthetic_realtime_secret', expires_at: fixedTime / 1000 + 60, ...extra }), { headers: { 'content-type': 'application/json' } });
}

test('Realtime issuance is opt-in and refuses untrusted or malformed requests', async () => {
  const disabled = setup();
  assert.equal((await disabled.run(mintRequest)).status, 404);
  assert.equal((await disabled.run({ ...mintRequest, method: 'OPTIONS', headers: { 'access-control-request-method': 'POST' } })).status, 404);
  assert.equal(disabled.calls.length, 0);
  const calls = [];
  const x = setup({ openaiApiKey: providerKey, now: () => fixedTime, fetchImpl: async (url, init) => { calls.push({ url, init }); return successfulMint(); } });
  assert.equal((await x.run({ ...mintRequest, auth: 'Bearer wrong' })).status, 401);
  assert.equal((await x.run({ ...mintRequest, source: 'https://evil.example' })).status, 403);
  assert.equal((await x.run({ ...mintRequest, path: `${mintPath}?url=https://evil.example` })).status, 404);
  assert.equal((await x.run({ ...mintRequest, body: '{"model":"evil","url":"https://evil.example"}' })).status, 400);
  assert.equal((await x.run({ ...mintRequest, type: 'text/plain' })).status, 415);
  assert.equal(calls.length, 0);
  assert.throws(() => setup({ openaiApiKey: 'bad\nkey' }), /configuration/i);
  assert.throws(() => setup({ realtimeMintLimit: 0 }), /configuration/i);
});

test('Realtime issuance uses only fixed OpenAI configuration and returns only the short-lived secret', async () => {
  const calls = [];
  const x = setup({ openaiApiKey: providerKey, now: () => fixedTime, fetchImpl: async (url, init) => { calls.push({ url, init }); return successfulMint({ value: 'opaque-secret.123', ignored: providerKey }); } });
  const res = await x.run(mintRequest);
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/realtime/client_secrets');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${providerKey}`);
  assert.notEqual(calls[0].init.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { expires_after: { anchor: 'created_at', seconds: 60 }, session: { type: 'realtime', model: 'gpt-realtime-2.1-mini' } });
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.deepEqual(JSON.parse(res.body), { value: 'opaque-secret.123', expires_at: fixedTime / 1000 + 60 });
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(!String(res.body).includes(providerKey));
  assert.ok(!String(res.body).includes(token));
});

test('Realtime issuance limits attempts in a rolling minute, including failures', async () => {
  let time = fixedTime, calls = 0;
  const x = setup({ openaiApiKey: providerKey, realtimeMintLimit: 2, now: () => time, fetchImpl: async () => { calls++; return new Response('private diagnostics', { status: 503 }); } });
  for (let i = 0; i < 2; i++) {
    const res = await x.run(mintRequest);
    assert.equal(res.status, 502);
    assert.ok(!String(res.body).includes('private diagnostics'));
    assert.ok(!String(res.body).includes(providerKey));
  }
  assert.equal((await x.run(mintRequest)).status, 429);
  assert.equal(calls, 2);
  time += 60000;
  assert.equal((await x.run(mintRequest)).status, 502);
  assert.equal(calls, 3);
});

test('Realtime issuance rejects expired, malformed and oversized upstream responses', async () => {
  for (const response of [
    successfulMint({ expires_at: fixedTime / 1000 }),
    successfulMint({ expires_at: fixedTime / 1000 + 600 }),
    successfulMint({ value: providerKey }),
    successfulMint({ value: 'sk-different-long-lived-key' }),
    successfulMint({ value: 'contains space' }),
    new Response('bad json'),
    new Response('x', { headers: { 'content-length': '200000' } })
  ]) {
    const x = setup({ openaiApiKey: providerKey, now: () => fixedTime, fetchImpl: async () => response });
    const res = await x.run(mintRequest);
    assert.equal(res.status, 502);
    assert.ok(!String(res.body).includes(providerKey));
  }
});

test('Realtime issuance propagates disconnect cancellation', async () => {
  let upstreamSignal;
  const x = setup({ openaiApiKey: providerKey, now: () => fixedTime, fetchImpl: (_url, init) => {
    upstreamSignal = init.signal;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const req = request(mintRequest), res = new FakeResponse();
  const pending = x.gateway(req, res);
  while (!upstreamSignal) await new Promise(resolve => setTimeout(resolve, 0));
  req.emit('aborted');
  await pending;
  assert.equal(upstreamSignal.aborted, true);
  assert.equal(res.status, 504);
  assert.ok(!String(res.body).includes(providerKey));
});

// A transport or body reader may ignore AbortSignal; timeouts must still
// release the two gateway slots, and late responses must not leak streams.
test('timeouts free gateway slots even when upstream fetch ignores abort', async () => {
  const pending = [];
  let block = true, cancelled = 0;
  const x = setup({ timeoutMs: 30, fetchImpl: () => block
    ? new Promise(resolve => pending.push(resolve))
    : Promise.resolve(new Response('{"choices":[]}')) });
  const first = x.run(), second = x.run();
  const [a, b] = await Promise.race([
    Promise.all([first, second]),
    new Promise((_, reject) => setTimeout(() => reject(new Error('gateway did not settle after timeout')), 500))
  ]);
  assert.equal(a.status, 504); assert.equal(b.status, 504);
  block = false;
  assert.equal((await x.run()).status, 200, 'stalled fetches must not keep the gateway busy');
  for (const resolve of pending) resolve(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(cancelled, 2, 'late response bodies are discarded');
});

test('timeouts free slots when a response body reader ignores cancellation', async () => {
  let block = true, cancellations = 0;
  const x = setup({ timeoutMs: 30, fetchImpl: async () => block
    ? new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancellations++; return new Promise(() => {}); } }))
    : new Response('{"choices":[]}') });
  const first = x.run(), second = x.run();
  const [a, b] = await Promise.race([
    Promise.all([first, second]),
    new Promise((_, reject) => setTimeout(() => reject(new Error('gateway did not settle after timeout')), 500))
  ]);
  assert.equal(a.status, 504); assert.equal(b.status, 504);
  block = false;
  assert.equal((await x.run()).status, 200, 'stalled readers must not keep the gateway busy');
  assert.equal(cancellations, 2, 'both stalled readers were asked to cancel');
});

test('speech synthesis that ignores abort cannot hold a gateway slot forever', async () => {
  let block = true;
  const x = setup({ timeoutMs: 30, synthesize: () => block ? new Promise(() => {}) : Promise.resolve(new Blob(['wav'], { type: 'audio/wav' })) });
  const options = { path: '/v1/audio/speech', body: '{"input":"hello"}' };
  const result = await Promise.race([
    x.run(options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('speech did not settle after timeout')), 500))
  ]);
  assert.equal(result.status, 504);
  block = false;
  assert.equal((await x.run(options)).status, 200);
});

test('Realtime token timeout settles even if its provider ignores abort', async () => {
  let block = true;
  const x = setup({ openaiApiKey: providerKey, now: () => fixedTime, timeoutMs: 30,
    fetchImpl: () => block ? new Promise(() => {}) : Promise.resolve(new Response(JSON.stringify({ value: 'ephemeral-test-token', expires_at: Math.floor(fixedTime / 1000) + 60 }))) });
  const result = await Promise.race([
    x.run(mintRequest),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime token request did not settle')), 500))
  ]);
  assert.equal(result.status, 504);
  block = false;
  assert.equal((await x.run(mintRequest)).status, 200, 'token timeout releases the gateway slot');
});

test('a stalled speech blob does not prevent timeout and later requests', async () => {
  class StalledBlob extends Blob { arrayBuffer() { return new Promise(() => {}); } }
  let block = true;
  const x = setup({ timeoutMs: 30, synthesize: async () => block
    ? new StalledBlob(['wav'], { type: 'audio/wav' }) : new Blob(['wav'], { type: 'audio/wav' }) });
  const options = { path: '/v1/audio/speech', body: '{"input":"hello"}' };
  const result = await Promise.race([
    x.run(options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('speech body did not settle')), 500))
  ]);
  assert.equal(result.status, 504);
  block = false;
  assert.equal((await x.run(options)).status, 200);
});
