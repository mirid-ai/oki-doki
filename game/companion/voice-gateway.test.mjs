import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGateway } from './gateway.mjs';

const listen = server => new Promise((resolve, reject) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)).once('error', reject));
const close = server => new Promise(resolve => server.close(resolve));

test('phone-style TLS requests route distinct Kokoro and one Nano voice to separate local services', async (t) => {
  try { execFileSync('openssl', ['version'], { stdio:'ignore' }); } catch { t.skip('OpenSSL is unavailable'); return; }
  const dir = await mkdtemp(join(tmpdir(), 'oki-voice-tls-'));
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
    '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio:'ignore' });
  const received = [];
  let markStarted, markClosed;
  const started = new Promise(resolve => { markStarted = resolve; });
  const closed = new Promise(resolve => { markClosed = resolve; });
  const upstream = () => createHttpServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    received.push({ headers:req.headers, body });
    if (body.text === 'Wait for cancellation.') {
      res.once('close', markClosed);
      markStarted();
      return;
    }
    res.writeHead(200, { 'content-type':'audio/wav' }); res.end('synthetic-wav');
  });
  const kokoro = upstream(), nano = upstream();
  const kokoroPort = await listen(kokoro), chatterboxPort = await listen(nano);
  const token = 'disposable-test-pairing-token-at-least-32-characters';
  const gateway = createGateway({ token, origins:['capacitor://localhost', 'https://localhost'], kokoroPort, chatterboxPort,
    synthesize:async () => { throw new Error('legacy backend was unexpectedly selected'); } });
  const certBytes = await readFile(cert), keyBytes = await readFile(key);
  const server = createHttpsServer({ key:keyBytes, cert:certBytes }, gateway);
  const port = await listen(server);
  t.after(async () => { await Promise.all([close(server), close(kokoro), close(nano)]); await rm(dir, { recursive:true, force:true }); });
  const post = (path, body, { origin = 'capacitor://localhost', auth = token } = {}) => new Promise((resolve, reject) => {
    const req = httpsRequest({ host:'127.0.0.1', port, servername:'localhost', path, method:'POST', ca:certBytes,
      headers:{ 'Origin':origin, 'Authorization':`Bearer ${auth}`, 'Content-Type':'application/json' } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status:res.statusCode, body:Buffer.concat(chunks), headers:res.headers }));
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  const result1 = await post('/v1/audio/speech', { input:'Hello.', voice:'af_bella', speed:1 });
  const result2 = await post('/v1/audio/speech', { input:'Hello.', voice:'am_adam', speed:1 });
  const result3 = await post('/tts', { text:'Hello.', engine:'chatterbox_nano', voice:'default', speed:1 });
  for (const result of [result1,result2,result3]) {
    assert.equal(result.status, 200); assert.equal(result.headers['content-type'], 'audio/wav'); assert.equal(result.body.toString(), 'synthetic-wav');
  }
  assert.deepEqual(received.map(call => [call.body.engine,call.body.voice]), [ ['kokoro','af_bella'], ['kokoro','am_adam'], ['chatterbox_nano','default'] ]);
  for (const call of received) assert.equal(call.headers.authorization, undefined);

  // Segmented Nano passages use the same authenticated route for every part.
  // Exercise both expected native origins without sending a real voice file.
  const parts = ['First sentence.', 'Second sentence.', 'Third sentence.'];
  for (const origin of ['capacitor://localhost', 'https://localhost']) {
    for (const text of parts) {
      const result = await post('/tts', { text, engine:'chatterbox_nano', voice:'default', speed:1 }, { origin });
      assert.equal(result.status, 200);
      assert.equal(result.headers['access-control-allow-origin'], origin);
    }
  }
  assert.deepEqual(received.slice(3).map(call => call.body.text), [...parts, ...parts]);
  const sentBeforeRejects = received.length;
  assert.equal((await post('/tts', {text:'Hello.', engine:'chatterbox_nano', voice:'default'}, { auth:'incorrect' })).status, 401);
  assert.equal((await post('/tts', {text:'Hello.', engine:'chatterbox_nano', voice:'default'}, { origin:'https://untrusted.example' })).status, 403);
  assert.equal((await post('/tts', {text:'Hello.', engine:'chatterbox_nano', voice:'another.wav'})).status, 400);
  assert.equal((await post('/tts/upload-voice', {})).status, 404);
  assert.equal(received.length, sentBeforeRejects, 'denied requests do not reach speech services');

  // A phone can stop during the next prefetched part. The underlying local
  // request must be cancelled and the companion must accept another request.
  const aborter = new AbortController();
  const aborted = new Promise(resolve => {
    const req = httpsRequest({ host:'127.0.0.1', port, servername:'localhost', path:'/tts', method:'POST', ca:certBytes,
      signal:aborter.signal, headers:{ 'Origin':'capacitor://localhost', 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' } });
    req.on('error', resolve);
    req.end(JSON.stringify({ text:'Wait for cancellation.', engine:'chatterbox_nano', voice:'default', speed:1 }));
  });
  await started;
  aborter.abort();
  assert.equal((await aborted).name, 'AbortError');
  let timeout;
  try {
    await Promise.race([closed, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Upstream stayed open')), 5000); })]);
  } finally { clearTimeout(timeout); }
  assert.equal((await post('/tts', {text:'After cancellation.', engine:'chatterbox_nano', voice:'default'})).status, 200);
});
