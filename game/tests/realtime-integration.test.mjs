/** Local HTTPS integration of the actual companion and game Realtime client.
 * OpenAI issuance and the WebSocket are deterministic fakes: no browser,
 * provider account, external traffic, or persistent certificate is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer, request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { createGateway } from '../companion/gateway.mjs';
import { pathToFileURL } from 'node:url';

const moduleSource = await readFile(new URL('../src/realtime-speech.js', import.meta.url));
const { getRealtimeClientSecret, synthesizeRealtimeSpeech } = await import(`data:text/javascript;base64,${moduleSource.toString('base64')}`);
const origin = 'https://localhost';
const pairingToken = 'synthetic-pairing-token-at-least-32-chars';
const providerKey = 'sk-synthetic-provider-key-for-tests';
const ephemeral = 'synthetic.ephemeral-token';

// Real TLS with the disposable certificate as its explicit trust anchor. Add
// the browser-origin header in this Node fixture; this does not test a browser.
function trustedFetch(ca, source = origin) {
  return (url, options) => new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: options.method, headers: { ...options.headers, Origin: source }, ca, signal: options.signal }, res => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      resolve(new Response(Readable.toWeb(res), { status: res.statusCode, headers }));
    });
    req.once('error', reject);
    req.end(options.body);
  });
}

class SyntheticSocket {
  static instances = [];
  constructor(url, protocols) {
    this.url = url; this.protocols = protocols; this.sent = []; this.closed = false;
    SyntheticSocket.instances.push(this);
    queueMicrotask(() => this.emit({ type: 'session.created' }));
  }
  emit(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
  send(value) {
    const event = JSON.parse(value); this.sent.push(event);
    if (event.type === 'session.update') queueMicrotask(() => this.emit({ type: 'session.updated' }));
    if (event.type === 'response.create') queueMicrotask(() => {
      this.emit({ type: 'response.output_audio.delta', delta: 'AQIDBA==' });
      this.emit({ type: 'response.done', response: { status: 'completed' } });
    });
  }
  close() { this.closed = true; }
}

const opensslAvailable = spawnSync('openssl', ['version'], { stdio: 'ignore' }).status === 0;
test('Realtime path through real local TLS and a fake provider', { skip: !opensslAvailable && 'OpenSSL is required for the disposable HTTPS fixture' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'okie-realtime-integration-'));
  const keyPath = join(directory, 'key.pem'), certPath = join(directory, 'cert.pem');
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath,
    '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
  let providerMode = 'success', calls = [], pendingSignal;
  const handler = createGateway({ token: pairingToken, origins: [origin], openaiApiKey: providerKey, realtimeMintLimit: 20,
    synthesize: async () => { throw new Error('unrelated local speech must not be called'); },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (providerMode === 'fail') return new Response('private provider diagnostic', { status: 503 });
      if (providerMode === 'hang') return await new Promise((_resolve, reject) => {
        pendingSignal = init.signal;
        init.signal.addEventListener('abort', () => reject(new Error('synthetic provider cancelled')), { once: true });
      });
      return new Response(JSON.stringify({ value: ephemeral, expires_at: Math.floor(Date.now() / 1000) + 60, ignored: providerKey }));
    }
  });
  const server = createServer({ key, cert }, handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const baseUrl = `https://127.0.0.1:${server.address().port}`;
  const fetchImpl = trustedFetch(cert);

  await t.test('mixed character passages reuse one real gateway issuance', async () => {
    const saved = { fetch: globalThis.fetch, Audio: globalThis.Audio, WebSocket: globalThis.WebSocket, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const players = [], creator = [], statuses = [];
    let plays = 0;
    const before = calls.length, socketStart = SyntheticSocket.instances.length;
    const source = (await readFile(new URL('../src/voice-ui.js', import.meta.url), 'utf8'))
      .replace("'./microphone.js'", "'./microphone.mjs'").replace("'./speech.js'", "'./speech.mjs'").replace("'./realtime-speech.js'", "'./realtime-speech.mjs'");
    await writeFile(join(directory, 'voice-ui.mjs'), source);
    await writeFile(join(directory, 'realtime-speech.mjs'), moduleSource);
    await writeFile(join(directory, 'microphone.mjs'), 'export const createMicrophone = () => ({cancel(){}});');
    await writeFile(join(directory, 'speech.mjs'), 'export const synthesizeSpeech = async options => { globalThis.__integrationCreator.push(options); return new Blob(["creator"]); }; export const transcribeSpeech = () => {}; export const validateTranscriptionSettings = () => {};');
    try {
      globalThis.fetch = fetchImpl; globalThis.WebSocket = SyntheticSocket;
      globalThis.Audio = class { constructor() { players.push(this); } async play() { plays++; } pause() {} removeAttribute() {} };
      URL.createObjectURL = () => 'blob:integration'; URL.revokeObjectURL = () => {};
      globalThis.__integrationCreator = creator;
      const { createVoiceUI } = await import(pathToFileURL(join(directory, 'voice-ui.mjs')).href);
      const ui = createVoiceUI({ getSettings: () => ({ ttsProvider: 'realtime', realtimeUrl: baseUrl, realtimeToken: pairingToken, prefetchParts: '2', mode: 'mirid', baseUrl: 'https://tts.invalid' }), onStatus: status => statuses.push(status) });
      assert.equal(calls.length, before);
      await ui.speakSequence([
        { speaker: 'Narrator', text: 'Creator line.', overrides: { ttsProvider: 'standard', ttsEngine: 'chatterbox_nano' } },
        ...['Niko', 'Mira', 'Ash', 'Mallow', 'You', 'Service'].map(speaker => ({ speaker, text: `Line for ${speaker}.` }))
      ]);
      for (let i = 0; i < 6; i++) {
        const limit = Date.now() + 3000;
        while (plays <= i && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 5));
        assert.ok(plays > i && players[0]?.onended, `part ${i} became playable: ${statuses.join(', ')}`);
        players[0].onended();
      }
      const limit = Date.now() + 3000;
      while (SyntheticSocket.instances.length - socketStart < 6 && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 5));
      await ui.speak('A later passage.', '', {}, 'Niko');
      const sockets = SyntheticSocket.instances.slice(socketStart);
      assert.equal(calls.length - before, 1, 'seven Realtime sessions use one issued secret');
      assert.equal(creator.length, 1); assert.equal(creator[0].engine, 'chatterbox_nano');
      assert.deepEqual(sockets.map(socket => socket.sent.find(event => event.type === 'session.update').session.audio.output.voice), ['cedar', 'shimmer', 'echo', 'ballad', 'coral', 'sage', 'cedar']);
      assert.ok(sockets.every(socket => socket.protocols[1] === `openai-insecure-api-key.${ephemeral}`));
      ui.cancel();
    } finally {
      globalThis.fetch = saved.fetch; globalThis.Audio = saved.Audio; globalThis.WebSocket = saved.WebSocket;
      URL.createObjectURL = saved.create; URL.revokeObjectURL = saved.revoke; delete globalThis.__integrationCreator;
    }
  });

  await t.test('game retrieves a secret over verified TLS and turns fake output into WAV', async () => {
    const secret = await getRealtimeClientSecret({ baseUrl, pairingToken, fetchImpl });
    assert.equal(secret, ephemeral);
    assert.equal(calls.at(-1).url, 'https://api.openai.com/v1/realtime/client_secrets');
    assert.equal(calls.at(-1).init.headers.Authorization, `Bearer ${providerKey}`);
    assert.ok(!JSON.stringify(calls.at(-1).init.headers).includes(pairingToken));
    const audio = await synthesizeRealtimeSpeech({ token: secret, text: 'A synthetic story line.', WebSocketClass: SyntheticSocket, timeoutMs: 2000 });
    const socket = SyntheticSocket.instances.at(-1);
    assert.deepEqual(socket.protocols, ['realtime', `openai-insecure-api-key.${ephemeral}`]);
    assert.ok(!socket.protocols.join(' ').includes(providerKey));
    assert.equal(socket.sent.find(event => event.type === 'conversation.item.create').item.content[0].text, 'A synthetic story line.');
    const bytes = new Uint8Array(await audio.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
    assert.deepEqual([...bytes.slice(44)], [1, 2, 3, 4]);
    assert.equal(socket.closed, true);
  });

  await t.test('bad pairing or wrong origin cannot contact the provider', async () => {
    const before = calls.length;
    await assert.rejects(getRealtimeClientSecret({ baseUrl, pairingToken: 'wrong-pairing-token-over-32-characters', fetchImpl }), /Could not obtain/);
    await assert.rejects(getRealtimeClientSecret({ baseUrl, pairingToken, fetchImpl: trustedFetch(cert, 'https://untrusted.example') }), /Could not obtain/);
    assert.equal(calls.length, before);
  });

  await t.test('provider failures are sanitized through the complete path', async () => {
    providerMode = 'fail';
    await assert.rejects(getRealtimeClientSecret({ baseUrl, pairingToken, fetchImpl }), error =>
      /Could not obtain/.test(error.message) && !error.message.includes('private provider diagnostic') && !error.message.includes(providerKey));
  });

  await t.test('cancelling a token request aborts the pending upstream operation', async () => {
    providerMode = 'hang'; pendingSignal = null;
    const controller = new AbortController();
    const task = getRealtimeClientSecret({ baseUrl, pairingToken, fetchImpl, signal: controller.signal });
    const limit = Date.now() + 3000;
    while (!pendingSignal && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(pendingSignal, 'request reached the fake provider');
    controller.abort();
    await assert.rejects(task, /cancelled/i);
    while (!pendingSignal.aborted && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(pendingSignal.aborted, true);
  });
});
