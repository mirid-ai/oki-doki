import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import https from 'node:https';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';

const [baseUrl, fixturePath, model] = process.argv.slice(2);
const { createGateway } = await import(new URL('../companion/gateway.mjs', import.meta.url));
const speech = await readFile(new URL('../src/speech.js', import.meta.url));
const { synthesizeSpeech, transcribeSpeech } = await import(`data:text/javascript;base64,${speech.toString('base64')}`);
const miridPort = Number(new URL(baseUrl).port);
const token = randomBytes(32).toString('hex');
const origin = 'https://localhost';
const iosOrigin = 'capacitor://localhost';
// This certificate and its private key are created only in the smoke test's
// disposable working directory. The test client trusts precisely this CA.
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'key.pem', '-out', 'cert.pem', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
const cert = await readFile('cert.pem');
const key = await readFile('key.pem');
const gateway = createGateway({ token, origins: [origin, iosOrigin], miridPort, synthesize: synthesizeSpeech, timeoutMs: 60000 });
const server = https.createServer({ cert, key }, gateway);
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
async function request(path, { method = 'POST', contentType = 'application/json', body = '', auth = true, requestedOrigin = origin, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: '127.0.0.1', port, servername: 'localhost', ca: cert, path, method,
      headers: { Origin: requestedOrigin, ...(auth ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': contentType, ...headers } }, (res) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject); req.end(body);
  });
}
try {
  const preflight = await request('/v1/chat/completions', { method: 'OPTIONS', auth: false, headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal((await request('/v1/chat/completions', { auth: false })).status, 401);
  assert.equal((await request('/settings', { body: '{}' })).status, 404);
  assert.equal((await request('/v1/chat/completions', { requestedOrigin: 'https://evil.test' })).status, 403);
  console.log('PASS real TLS, allowed preflight, auth, origin, and route boundaries');

  const chat = await request('/v1/chat/completions', { body: JSON.stringify({model, max_tokens:60, messages:[{role:'user',content:'Reply with a brief greeting.'}]}) });
  assert.equal(chat.status, 200);
  const reply = JSON.parse(chat.body.toString())?.choices?.[0]?.message?.content;
  assert.ok(typeof reply === 'string' && reply.trim());
  console.log('PASS real gateway -> Mirid text inference:', JSON.stringify(reply));

  const wav = await readFile(fixturePath);
  const boundary = 'SyntheticBoundary123';
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
    wav, Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const stt = await request('/v1/audio/transcriptions', { contentType: `multipart/form-data; boundary=${boundary}`, body: multipart });
  assert.equal(stt.status, 200);
  const transcript = JSON.parse(stt.body.toString()).text;
  assert.equal(transcript, 'Hello there. The green garden has five bright flowers.');
  console.log('PASS real gateway -> Mirid synthetic STT:', JSON.stringify(transcript));

  const tts = await request('/v1/audio/speech', { body: JSON.stringify({input:'Hello there. We are listening.', speed:1}) });
  assert.equal(tts.status, 200);
  assert.equal(tts.headers['content-type'], 'audio/wav');
  assert.equal(tts.body.subarray(0, 4).toString(), 'RIFF');
  assert.equal(tts.body.subarray(8, 12).toString(), 'WAVE');
  assert.ok(tts.body.length > 44);
  console.log('PASS real gateway -> Mirid Kokoro WAV:', tts.body.length, 'bytes');

  // Node does not implement browser CORS. For protocol coverage only, add a
  // synthetic WebView Origin and trust this temporary CA inside this process.
  const previousAuthorities = getCACertificates('default');
  setDefaultCACertificates([cert.toString('utf8')]);
  const realFetch = globalThis.fetch;
  let currentOrigin = origin;
  let chatStatus = 0;
  globalThis.fetch = async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (new URL(url).port === String(port)) headers.set('Origin', currentOrigin);
    const response = await realFetch(url, { ...options, headers });
    if (new URL(url).pathname === '/v1/chat/completions') chatStatus = response.status;
    return response;
  };
  try {
    const companion = `https://127.0.0.1:${port}`;
    const bounded = await readFile(new URL('../src/bounded-json.js', import.meta.url));
    const boundedUrl = `data:text/javascript;base64,${bounded.toString('base64')}`;
    const aiSource = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
      .replace("'./bounded-json.js'", `'${boundedUrl}'`);
    const { respond } = await import(`data:text/javascript;base64,${Buffer.from(aiSource).toString('base64')}`);
    const dialogue = await respond({
      settings: { endpoint: `${companion}/v1/chat/completions`, model, apiKey: token, timeoutMs: 30000 },
      character: { name: 'Noor', voice: 'warm' }, playerText: 'You are not alone.',
      context: 'Noor is a radio host in the studio.', fallback: 'Thank you.'
    });
    assert.equal(chatStatus, 200);
    assert.ok(dialogue.text);
    console.log('PASS game text adapter -> gateway -> Mirid HTTP 200; dialogue source:', dialogue.source);
    const audio = new Blob([wav], { type: 'audio/wav' });
    const transcript2 = await transcribeSpeech({ baseUrl: companion, mode: 'openai', apiKey: token, model: 'whisper-1', audio, timeoutMs: 30000 });
    assert.equal(transcript2, 'Hello there. The green garden has five bright flowers.');
    console.log('PASS game speech adapter -> gateway -> Mirid synthetic STT');
    const sound = await synthesizeSpeech({ baseUrl: companion, mode: 'openai', apiKey: token, model: 'tts-1', voice: 'alloy', text: 'Hello there.', timeoutMs: 60000 });
    assert.equal(sound.type, 'audio/wav');
    assert.ok(sound.size > 44);
    console.log('PASS game speech adapter -> gateway -> Mirid WAV:', sound.size, 'bytes');
    currentOrigin = iosOrigin;
    const iosTranscript = await transcribeSpeech({ baseUrl: companion, mode: 'openai', apiKey: token, model: 'whisper-1', audio, timeoutMs: 30000 });
    assert.equal(iosTranscript, 'Hello there. The green garden has five bright flowers.');
    console.log('PASS synthetic iOS origin -> gateway -> Mirid STT');
  } finally {
    globalThis.fetch = realFetch;
    setDefaultCACertificates(previousAuthorities);
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  console.log('Gateway stopped');
}
