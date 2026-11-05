/**
 * Offline regression tests. Run from game/: node tests/test.mjs
 * Only Node built-ins are used; fetch is always mocked.
 */
import assert from 'node:assert/strict';
import { Blob as NodeBlob } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Copy browser modules into temporary .mjs files, so Node can import them
// without adding package metadata or changing the browser application.
const temp = await mkdtemp(join(tmpdir(), 'signal-tests-'));
try {
const storyUrl = pathToFileURL(join(temp, 'story.mjs')).href;
const aiUrl = pathToFileURL(join(temp, 'ai.mjs')).href;
await writeFile(join(temp, 'story.mjs'), await readFile(new URL('../src/story-next.js', import.meta.url)));
await writeFile(join(temp, 'bounded-json.mjs'), await readFile(new URL('../src/bounded-json.js', import.meta.url)));
await writeFile(join(temp, 'preference.mjs'), await readFile(new URL('../src/preference.js', import.meta.url)));
const aiSource = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8')).replace("'./bounded-json.js'", "'./bounded-json.mjs'");
await writeFile(join(temp, 'ai.mjs'), aiSource);
const { story, startNode, characters } = await import(storyUrl);
const { respond } = await import(aiUrl);
const { evaluatePreference } = await import(pathToFileURL(join(temp, 'preference.mjs')).href);
const jsonResponse = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const test = async (name, fn) => {
  await fn();
  console.log(`✓ ${name}`);
};

const originalFetch = globalThis.fetch;
try {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  await test('unconfigured, invalid and pre-aborted calls use authored fallback without network', async () => {
    const fallback = 'A known line.';
    assert.deepEqual(await respond({ fallback }), { text: fallback, source: 'scripted' });
    const invalid = await respond({ settings: { endpoint: 'http://remote.invalid/v1', model: 'x' }, fallback });
    assert.equal(invalid.source, 'scripted');
    assert.match(invalid.error, /invalid/i);
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'x' }, fallback, signal: controller.signal }), { text: fallback, source: 'scripted' });
    assert.equal(calls, 0);
  });

  await test('successful AI call passes bounded data and compatible settings', async () => {
    let sent;
    globalThis.fetch = async (url, request) => {
      sent = { url, request, body: JSON.parse(request.body) };
      return jsonResponse({ choices: [{ message: { content: [{ type: 'text', text: 'I hear you.' }] } }] });
    };
    const result = await respond({
      settings: { endpoint: 'https://example.invalid/chat', model: 'test', apiKey: 'secret', tokenParameter: 'max_completion_tokens', maxTokens: 90, temperature: null },
      character: { name: 'Noor', voice: 'warm' }, playerText: 'x'.repeat(600),
      context: 'scene', memory: Array.from({ length: 8 }, (_, i) => ({ speaker: 'Player', text: `${i}`.repeat(900) })), fallback: 'Fallback.'
    });
    assert.deepEqual(result, { text: 'I hear you.', source: 'ai' });
    assert.equal(sent.url, 'https://example.invalid/chat');
    assert.equal(sent.request.headers.Authorization, 'Bearer secret');
    assert.equal(sent.request.credentials, 'omit');
    assert.equal(sent.request.redirect, 'error');
    assert.equal(sent.body.max_completion_tokens, 90);
    assert.ok(!('temperature' in sent.body));
    assert.ok(!('max_tokens' in sent.body));
    const payload = JSON.parse(sent.body.messages[1].content);
    assert.equal(payload.player_says.length, 500);
    assert.equal(payload.memory.length, 6);
    assert.equal(payload.memory[0].text.length, 700);
    assert.ok(payload.memory[0].text.startsWith('2'));
  });

  await test('output caps remain bounded and honor provider compatibility', async () => {
    let sent;
    globalThis.fetch = async (_url, request) => {
      sent = JSON.parse(request.body);
      return jsonResponse({ choices: [{ message: { content: 'I hear you.' } }] });
    };
    const send = async extra => respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test', ...extra },
      character: { name: 'Niko' }, playerText: 'Hello.', fallback: 'Fallback.' });
    await send({});
    assert.equal(sent.max_tokens, 100, 'default remains unchanged');
    await send({ tokenParameter: 'max_completion_tokens', maxTokens: 2048 });
    assert.equal(sent.max_completion_tokens, 2048);
    assert.ok(!('max_tokens' in sent));
    await send({ tokenParameter: 'max_completion_tokens', maxTokens: 99999 });
    assert.equal(sent.max_completion_tokens, 8192, 'direct callers cannot exceed the configured bound');
    await send({ tokenParameter: 'none', maxTokens: 2048 });
    assert.ok(!('max_tokens' in sent) && !('max_completion_tokens' in sent), 'no-limit mode omits both caps');
  });

  await test('empty length-limited replies identify the relevant output limit', async () => {
    let content = '', finish = 'length';
    globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content }, finish_reason: finish }] });
    const send = async (tokenParameter = 'max_completion_tokens') => respond({
      settings: { endpoint: 'https://example.invalid/chat', model: 'test', tokenParameter, maxTokens: 100 },
      character: { name: 'Niko' }, playerText: 'Hello.', fallback: 'Still here.' });
    for (const parameter of ['max_tokens', 'max_completion_tokens']) {
      const limited = await send(parameter);
      assert.equal(limited.text, 'Still here.');
      assert.match(limited.error, /output limit.*response limit in AI settings/i);
    }
    const provider = await send('none');
    assert.match(provider.error, /provider.s output limit/i);
    assert.doesNotMatch(provider.error, /response limit in AI settings/i);
    content = 'I am here.';
    assert.deepEqual(await send(), { text: 'I am here.', source: 'ai' }, 'usable completed dialogue survives a length finish');
    content = '';
    finish = 'stop';
    assert.match((await send()).error, /not usable as dialogue/i, 'an unrelated empty response is not misdiagnosed');
    content = 'Niko turns and smiles.';
    finish = 'length';
    assert.match((await send()).error, /not usable as dialogue/i, 'nonempty format failures are not misdiagnosed as an empty budget');
  });

  await test('AI scene bound retains expanded authored context and remains finite', async () => {
    let sent;
    globalThis.fetch = async (_url, request) => {
      sent = JSON.parse(JSON.parse(request.body).messages[1].content);
      return jsonResponse({ choices: [{ message: { content: 'I hear you.' } }] });
    };
    await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' },
      character: { name: 'Niko' }, context: 'x'.repeat(2000), storyEvent: 'y'.repeat(350), responseStyle: 'warm', playerText: 'Hello.', fallback: 'Fallback.' });
    assert.equal(sent.scene.length, 1800);
    assert.equal(sent.story_event.length, 300);
    assert.equal(sent.response_style, 'warm and reassuring', 'style remains separate from a truncated scene');
    await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' },
      character: { name: 'Niko' }, context: 'scene', responseStyle: 'unexpected arbitrary instruction', playerText: 'Hello.', fallback: 'Fallback.' });
    assert.equal(sent.response_style, undefined, 'only game-owned style values are forwarded');
  });

  await test('dialogue request timeouts support slower models and remain bounded', async () => {
    const originalTimer = globalThis.setTimeout;
    const observed = [];
    globalThis.setTimeout = (callback, delay, ...args) => {
      observed.push(delay);
      return originalTimer(callback, delay, ...args);
    };
    globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content: 'I am here.' } }] });
    try {
      for (const [timeoutMs, expected] of [[undefined, 60000], [15000, 15000], [120000, 120000], [999999, 120000], [0, 2000]]) {
        const before = observed.length;
        const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test', timeoutMs }, fallback: 'Still here.' });
        assert.equal(result.source, 'ai');
        assert.equal(observed[before], expected);
      }
    } finally {
      globalThis.setTimeout = originalTimer;
    }
  });

  await test('an expired dialogue timeout cancels the provider and uses the written response', async () => {
    const originalTimer = globalThis.setTimeout;
    let providerSignal;
    globalThis.setTimeout = (callback, _delay, ...args) => originalTimer(callback, 0, ...args);
    globalThis.fetch = (_url, request) => new Promise((_resolve, reject) => {
      providerSignal = request.signal;
      providerSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    try {
      const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test', timeoutMs: 120000 }, fallback: 'Still here.' });
      assert.equal(providerSignal.aborted, true);
      assert.equal(result.source, 'scripted');
      assert.equal(result.text, 'Still here.');
      assert.match(result.error, /timed out/i);
    } finally {
      globalThis.setTimeout = originalTimer;
    }
  });

  await test('obvious narration and stage directions fall back to authored dialogue', async () => {
    for (const content of [
      '*The line crackles* I hear you.',
      '[Noor looks away] Thank you.',
      '(sighs) I am listening.',
      'The phone rings. “Hello.”',
      'I turn to the door. "Hello."'
    ]) {
      globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content } }] });
      const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, fallback: 'Still here.' });
      assert.equal(result.source, 'scripted', `Expected fallback for ${content}`);
      assert.equal(result.text, 'Still here.');
      assert.match(result.error, /not usable as dialogue/i);
    }
  });

  await test('outer quotes are normalized while incidental quotes are retained', async () => {
    for (const [content, expected] of [
      ['"I hear you."', 'I hear you.'],
      ['“I hear you.”', 'I hear you.'],
      ['Noor said “hello” to me.', 'Noor said “hello” to me.'],
      ['I heard "hello" on the radio.', 'I heard "hello" on the radio.'],
      ['The door is open.', 'The door is open.'],
      ["“Noor said 'hello' to me.”", "Noor said 'hello' to me."]
    ]) {
      globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content } }] });
      const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, fallback: 'Still here.' });
      assert.equal(result.source, 'ai', `Expected AI dialogue for ${content}`);
      assert.equal(result.text, expected);
    }
  });

  await test('role confusion and clearly truncated dialogue fall back without rejecting valid references', async () => {
    const cases = [
      { content: 'Tonight, Noor will broadcast something else special.', source: 'scripted', text: 'Still here.' },
      { content: 'Noor will broadcast a message.', source: 'scripted', text: 'Still here.' },
      { content: 'Today, Noor nodded.', source: 'scripted', text: 'Still here.' },
      { content: 'I heard Noor on the radio.', source: 'ai', text: 'I heard Noor on the radio.' },
      { content: 'When Noor says “hello,” I listen.', source: 'ai', text: 'When Noor says “hello,” I listen.' },
      { content: 'She said, “Tonight, Noor will broadcast.”', source: 'ai', text: 'She said, “Tonight, Noor will broadcast.”' },
      { content: 'Yes, Noor said, "I found them."', source: 'scripted', text: 'Still here.' },
      { content: 'Yes, Ash said, "I did. We found the person we lost sight of that day."', name: 'Ash', source: 'scripted', text: 'Still here.' },
      { content: 'Well, Noor replied, “We found them.”', source: 'scripted', text: 'Still here.' },
      { content: 'Yes, I said, "I found them."', source: 'ai', text: 'Yes, I said, "I found them."' },
      { content: 'Yes, my friend Noor said, "I found them."', source: 'ai', text: 'Yes, my friend Noor said, "I found them."' },
      { content: 'Yes, Ellis said, "I found them."', source: 'ai', text: 'Yes, Ellis said, "I found them."' },
      { content: 'Yes, Noor said she found them.', source: 'ai', text: 'Yes, Noor said she found them.' },
      { content: 'I heard the line “Yes, Noor said, ‘I found them.’” in the story.', source: 'ai', text: 'I heard the line “Yes, Noor said, ‘I found them.’” in the story.' },
      { content: 'Noor nodded and turned to the radio.', source: 'scripted', text: 'Still here.' },
      { content: 'I hear you, Noor.', source: 'scripted', text: 'Still here.' },
      { content: 'Noor: I hear you.', source: 'ai', text: 'I hear you.' },
      { content: 'That is what Noor said yesterday.', source: 'ai', text: 'That is what Noor said yesterday.' },
      { content: 'I would like to', finish: 'length', source: 'scripted', text: 'Still here.' },
      { content: 'I can listen.', finish: 'length', source: 'ai', text: 'I can listen.' }
    ];
    for (const item of cases) {
      globalThis.fetch = async () => jsonResponse({ choices: [{ finish_reason: item.finish, message: { content: item.content } }] });
      const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, character: { name: item.name || 'Noor' }, fallback: 'Still here.' });
      assert.equal(result.source, item.source, `Unexpected source for ${item.content}`);
      assert.equal(result.text, item.text);
    }
  });

  await test('provider errors are sanitized and return scripted text', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 429 });
    const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, fallback: 'Still here.' });
    assert.equal(result.source, 'scripted');
    assert.equal(result.text, 'Still here.');
    assert.match(result.error, /rate.limit/i);
  });

  await test('context-window failures explain recovery without exposing provider details', async () => {
    const settings = { endpoint: 'https://example.invalid/chat', model: 'test' };
    const run = () => respond({ settings, character: { name: 'Mira' }, fallback: 'Still here.' });
    const fail = (body, status = 400) => new Response(body, { status, headers: { 'content-type': 'application/json' } });
    globalThis.fetch = async () => fail(JSON.stringify({ error: { type: 'exceed_context_size_error', message: 'private provider detail', n_ctx: 2048 } }));
    const result = await run();
    assert.equal(result.source, 'scripted');
    assert.equal(result.text, 'Still here.');
    assert.match(result.error, /context window.*increase.*context size/i);
    assert.doesNotMatch(result.error, /private provider detail|2048/);
    for (const body of [
      JSON.stringify({ error: { type: 'other', message: 'exceed_context_size_error' } }),
      'not JSON',
      JSON.stringify({ error: { type: 'exceed_context_size_error', message: 'x'.repeat(17000) } })
    ]) {
      globalThis.fetch = async () => fail(body);
      assert.equal((await run()).error, 'The AI request failed. Using scripted dialogue.');
    }
    globalThis.fetch = async () => fail(JSON.stringify({ error: { type: 'exceed_context_size_error' } }), 429);
    assert.match((await run()).error, /rate.limit/i, 'other HTTP statuses keep their own diagnosis');
    let bodyCancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream({
      pull() { return new Promise(() => {}); },
      cancel() { bodyCancelled = true; }
    }), { status: 400 });
    const start = Date.now();
    assert.equal((await run()).error, 'The AI request failed. Using scripted dialogue.');
    assert.ok(Date.now() - start < 3000, 'an unfinished error body cannot hold up the player');
    assert.equal(bodyCancelled, true);
    bodyCancelled = false;
    const controller = new AbortController();
    const pending = respond({ settings, character: { name: 'Mira' }, fallback: 'Still here.', signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    assert.deepEqual(await pending, { text: 'Still here.', source: 'scripted' }, 'leaving the scene cancels the error read');
    assert.equal(bodyCancelled, true);
  });

  await test('cancelling a pending request aborts fetch and returns fallback', async () => {
    let requestSignal;
    globalThis.fetch = (_url, request) => {
      requestSignal = request.signal;
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      });
    };
    const controller = new AbortController();
    const promise = respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, fallback: 'Still here.', signal: controller.signal });
    assert.ok(requestSignal && !requestSignal.aborted);
    controller.abort();
    assert.ok(requestSignal.aborted);
    assert.deepEqual(await promise, { text: 'Still here.', source: 'scripted' });
  });
} finally {
  globalThis.fetch = originalFetch;
}

// Exercise the real app module against a deliberately minimal DOM. This does
// not replace browser/visual testing; it checks app event and state wiring.
const originalBlob = globalThis.Blob;
if (!globalThis.Blob) globalThis.Blob = NodeBlob;
const originalDocument = globalThis.document;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalAudioContext = globalThis.AudioContext;
const originalOfflineAudioContext = globalThis.OfflineAudioContext;
const originalAddEventListener = globalThis.addEventListener;
const globalEvents = {};
globalThis.addEventListener = (name, handler) => { globalEvents[name] = handler; };
let resolveMicrophonePermission;
let microphonePermissionRequests = 0;
Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { mediaDevices: { getUserMedia: () => { microphonePermissionRequests++; return new Promise(resolve => { resolveMicrophonePermission = resolve; }); } } } });
let soundStarts = 0, soundCloses = 0;
const soundOscillators = [];
const audioParam = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
globalThis.AudioContext = class {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 48000; this.destination = {}; }
  createGain() { return { gain: audioParam(), connect() {}, disconnect() {} }; }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
  createOscillator() {
    const source = { frequency: audioParam(), stops: [], connect() {}, disconnect() {}, start() { soundStarts++; }, stop(t) { this.stops.push(t); } };
    soundOscillators.push(source); return source;
  }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { return { playbackRate: audioParam(), connect() {}, disconnect() {}, start() { soundStarts++; }, stop() {} }; }
  async close() { this.state = 'closed'; soundCloses++; }
};
globalThis.OfflineAudioContext = class {};
const originalStorage = globalThis.localStorage;
const storageData = new Map();
let storageUnavailable = false;
globalThis.localStorage = {
  getItem(key) { if (storageUnavailable) throw new Error('Storage unavailable'); return storageData.get(key) ?? null; },
  setItem(key, value) { if (storageUnavailable) throw new Error('Storage unavailable'); storageData.set(key, String(value)); },
  removeItem(key) { if (storageUnavailable) throw new Error('Storage unavailable'); storageData.delete(key); }
};
const oldFetchForApp = globalThis.fetch;
const originalCapacitor = globalThis.Capacitor;
let fakeStoreProduct = { status: 'unavailable' };
let fakeStorePurchase = { status: 'unavailable' };
let fakeStoreRestore = { status: 'unavailable' };
let storeCalls = [];
globalThis.Capacitor = { Plugins: { RepairKitBilling: {
  async getProduct() { storeCalls.push('getProduct'); return await fakeStoreProduct; },
  async purchase() { storeCalls.push('purchase'); return await fakeStorePurchase; },
  async restore() { storeCalls.push('restore'); return await fakeStoreRestore; },
  async getEntitlement() { storeCalls.push('getEntitlement'); return { status: 'not_owned' }; }
} } };
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.listeners = {};
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.hidden = false;
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  click() { this.listeners.click?.({ preventDefault() {} }); }
  submit() { this.listeners.submit?.({ preventDefault() {} }); }
  append(...children) { this.children.push(...children); }
  get firstChild() { return this.children[0] || null; }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index < 0) throw new Error('Child not found');
    if (child.contains(globalThis.document?.activeElement)) globalThis.document.activeElement = null;
    this.children.splice(index, 1);
    this.removals = (this.removals || 0) + 1;
    return child;
  }
  appendChild(child) {
    this.children.push(child);
    this.appendedChildren = (this.appendedChildren || 0) + 1;
    return child;
  }
  replaceChildren(...children) {
    if (this.contains(globalThis.document?.activeElement)) globalThis.document.activeElement = null;
    this.children = children;
  }
  contains(target) { return target === this || this.children.some(child => child === target || child.contains?.(target)); }
  focus() { if (globalThis.document) globalThis.document.activeElement = this; }
  setAttribute(name, value) { this[name] = String(value); }
  remove() {}
  showModal() {}
  close() {}
  querySelector(selector) {
    if (selector === '#player-message' || selector === '#player-follow-up') return this.children.find(child => child.id === selector.slice(1)) || null;
    if (selector === '#repair-name') return this.children.find(child => child.id === 'repair-name') || null;
    return this.note ||= new FakeElement();
  }
}
const ids = ['app', 'consent-opening', 'consent-agree', 'story-history', 'story-history-list', 'intro', 'play', 'portrait', 'speaker', 'story-text', 'souvenir-art', 'souvenir-card', 'souvenir-caption', 'interaction', 'advance', 'status', 'stage', 'location-label', 'machine-report', 'machine-report-mobile', 'settings-dialog', 'start', 'restart', 'settings-open', 'settings-close', 'settings-clear', 'settings-form', 'endpoint', 'model', 'mirid-model-options', 'api-key', 'token-parameter', 'response-limit', 'model-temperature', 'chat-timeout', 'save', 'resume', 'resume-game', 'resume-prompt', 'resume-confirm', 'resume-cancel', 'delete-save', 'save-status', 'speak', 'auto-read', 'auto-advance', 'play-ready', 'stop-voice', 'mirid-url', 'mirid-preset', 'mirid-check', 'local-launcher-preset', 'mirid-status', 'companion-url', 'companion-token', 'companion-preset', 'companion-status', 'sound-toggle', 'offline-voices-settings', 'offline-voices-download', 'offline-voices-cancel', 'offline-voices-status', 'speech-mode', 'speech-url', 'tts-url', 'tts-key', 'tts-mode', 'speech-key', 'tts-provider', 'tts-prefetch', 'realtime-url', 'realtime-token', 'realtime-voice', 'asr-engine', 'asr-model', 'tts-engine', 'tts-model', 'creator-voice-tools', 'publisher-voice-note', 'chatterbox-engine', 'chatterbox-target', 'chatterbox-url', 'chatterbox-key', 'chatterbox-file', 'chatterbox-voice', 'chatterbox-upload', 'chatterbox-use', 'chatterbox-remove', 'chatterbox-status', 'noor-voice', 'ellis-voice', 'caller-voice', 'narrator-voice', 'you-voice', 'service-voice', 'niko-voice', 'mira-voice', 'ash-voice', 'mallow-voice'];
const els = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
for (const id of ['voice-preview-speaker', 'voice-preview', 'voice-preview-ready', 'voice-preview-stop', 'voice-preview-status', 'desktop-ai-start', 'desktop-ai-status', 'desktop-asr-use', 'desktop-asr-status', 'desktop-quick-settings', 'desktop-quick-start', 'desktop-quick-status']) els[id] = new FakeElement();
els.app.hidden = true; // The opening screen precedes the existing app.
els['settings-dialog'].hidden = true;
els.play.hidden = true;
els['resume-prompt'].hidden = true;
els.portrait.hidden = true; // Mirrors the initial hidden attribute in index.html.
els.portrait.complete = true;
els.portrait.naturalWidth = 1;
els.portrait.decode = async () => {};
const documentHandlers = {};
globalThis.document = { activeElement: null, visibilityState: 'visible', getElementById: id => els[id], createElement: tag => new FakeElement(tag), addEventListener: (name, handler) => { documentHandlers[name] = handler; } };
for (const name of ['local-setup', 'mirid', 'microphone', 'speech', 'sound', 'preference', 'repair-kit', 'repair-billing', 'settings-modal', 'realtime-speech', 'consent-opening', 'visual-phase', 'souvenir']) {
  let moduleSource = await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8');
  moduleSource = moduleSource.replace("'./bounded-json.js'", "'./bounded-json.mjs'");
  await writeFile(join(temp, `${name}.mjs`), moduleSource);
}
let voiceSource = await readFile(new URL('../src/voice-ui.js', import.meta.url), 'utf8');
voiceSource = voiceSource.replace("'./microphone.js'", "'./microphone.mjs'").replace("'./speech.js'", "'./speech.mjs'").replace("'./realtime-speech.js'", "'./realtime-speech.mjs'");
// These application tests fake provider requests; the recorded-file resolver
// has its own focused tests and should not consume their provider mocks.
voiceSource = voiceSource.replace('lookupBundledSpeech = createBundledSpeechLookup()', 'lookupBundledSpeech = async part => { globalThis.__voiceFixtureLookups?.push(part); return null; }');
await writeFile(join(temp, 'voice-ui.mjs'), voiceSource);
let appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
// Most legacy scene tests exercise silent navigation. The default-on behavior
// gets its own mode below, without changing each unrelated request mock.
if (process.env.OKI_TEST_AUTO_READ_DEFAULT !== '1') appSource = appSource.replace('let autoRead = readAutoReadPreference();', 'let autoRead = false;');
let publisherSource = await readFile(new URL('../src/publisher-voice.js', import.meta.url), 'utf8');
if (process.env.OKI_TEST_PUBLISHER_VOICE === '1') {
  publisherSource = publisherSource.replace('export const publisherVoice = null;', "export const publisherVoice = { speaker: 'Narrator', engine: 'chatterbox', voice: 'default', baseUrl: 'https://reference.example.test' };")
    .replace('export const publisherKokoro = null;', "export const publisherKokoro = { baseUrl: 'https://kokoro.example.test' };");
}
await writeFile(join(temp, 'publisher-voice.mjs'), publisherSource);
await writeFile(join(temp, 'voice-cues.mjs'), await readFile(new URL('../src/voice-cues.js', import.meta.url)));
await writeFile(join(temp, 'offline-voices.mjs'), `export const offlineVoicesStatus = () => globalThis.__offlineVoiceMock.status(); export const downloadOfflineVoices = options => globalThis.__offlineVoiceMock.download(options);`);
globalThis.__offlineVoiceMock = { status: async () => ({ ready: false }), download: async () => ({ ready: true }) };
appSource = appSource.replace("'./story-next.js'", `'${storyUrl}'`).replace("'./ai.js'", `'${aiUrl}'`).replace("'./mirid.js'", "'./mirid.mjs'").replace("'./local-setup.js'", "'./local-setup.mjs'").replace("'./offline-voices.js'", "'./offline-voices.mjs'").replace("'./voice-ui.js'", "'./voice-ui.mjs'").replace("'./voice-cues.js'", "'./voice-cues.mjs'").replace("'./speech.js'", "'./speech.mjs'").replace("'./sound.js'", "'./sound.mjs'").replace("'./preference.js'", "'./preference.mjs'").replace("'./repair-kit.js'", "'./repair-kit.mjs'").replace("'./repair-billing.js'", "'./repair-billing.mjs'").replace("'./settings-modal.js'", "'./settings-modal.mjs'").replace("'./consent-opening.js'", "'./consent-opening.mjs'").replace("'./visual-phase.js'", "'./visual-phase.mjs'").replace("'./publisher-voice.js'", "'./publisher-voice.mjs'").replace("'./souvenir.js'", "'./souvenir.mjs'");
const appPath = join(temp, 'app.mjs');
await writeFile(appPath, appSource);
try {
  if (process.env.OKI_TEST_CREATOR === '1') globalThis.location = { href: 'http://127.0.0.1:8766/?voice-creator=1' };
  await import(pathToFileURL(appPath).href);
  if (process.env.OKI_TEST_AUTO_READ_DEFAULT === '1') await test('fresh installs enable auto-read and remember an explicit stop', () => {
    assert.equal(els['auto-read']['aria-pressed'], 'true');
    assert.equal(els['auto-read'].textContent, 'Auto-read on');
  });
  await test('creator reference tools require explicit audition mode', async () => {
    assert.equal(els['creator-voice-tools'].hidden, process.env.OKI_TEST_CREATOR !== '1');
  });
  await test('the opening interaction starts the story without deleting saved data', async () => {
    const oldAudio = globalThis.Audio, oldFetch = globalThis.fetch, openingSpeech = [], players = [];
    if (process.env.OKI_TEST_AUTO_READ_DEFAULT === '1') {
      globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() { this.paused = true; } removeAttribute() {} };
      globalThis.fetch = async (_url, request) => { openingSpeech.push(JSON.parse(request.body)); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } }); };
    }
    const old = JSON.stringify({ version: 1, node: startNode, answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: [] });
    storageData.set('okie-dokie.arcade.v1', old);
    assert.equal(els.app.hidden, true);
    assert.equal(globalThis.document.activeElement, els['consent-agree']);
    els['consent-opening'].listeners.click({ detail: 0, button: 0, preventDefault() {}, stopPropagation() {} });
    await new Promise(resolve => setTimeout(resolve, 260));
    assert.equal(els.app.hidden, false);
    assert.equal(els['consent-opening'].hidden, true);
    assert.equal(els['story-text'].textContent, story[startNode].text);
    assert.equal(storageData.get('okie-dokie.arcade.v1'), old);
    assert.equal(els['resume-game'].hidden, false, 'a valid checkpoint is reachable directly after the opening');
    if (process.env.OKI_TEST_AUTO_READ_DEFAULT === '1') {
      for (let i = 0; i < 40; i++) await Promise.resolve();
      const player = players[0];
      assert.ok(player, 'the opening narration starts after the forced-agree gesture');
      for (let i = 0; i < 7 && player.onended; i++) { player.onended(); for (let j = 0; j < 30; j++) await Promise.resolve(); }
      assert.deepEqual(openingSpeech.slice(0, 6).map(item => item.text), [
        'WELCOME TO OKI DOKI', 'A lovely place to begin.', 'Dating is fun, internet simulations are safe and happy and healthy.',
        'Data tracking is ethical and cookies are a great idea.', 'Click here if you agree and to continue.', 'I agree'
      ]);
      assert.equal(openingSpeech[6]?.text, story[startNode].text, 'the first scene follows the opening in order');
    }
    els.restart.click();
    if (process.env.OKI_TEST_AUTO_READ_DEFAULT === '1') {
      assert.equal(players[0].paused, true, 'restarting interrupts the queued narration');
      assert.equal(players[0].onended, null);
      els['stop-voice'].click();
      assert.equal(els['auto-read']['aria-pressed'], 'false');
      assert.equal(storageData.get('oki-doki.auto-read'), 'off');
      globalThis.Audio = oldAudio; globalThis.fetch = oldFetch;
    }
    assert.equal(els.resume.hidden, false, 'the existing save remains accessible from Restart');
    storageData.clear();
  });
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  await test('offline voice settings download only on request and support cancellation and retry', async () => {
    globalThis.navigator.serviceWorker = {};
    let starts = 0, completeDownload, lastSignal;
    globalThis.__offlineVoiceMock = {
      status: async () => ({ ready: false }),
      download: ({ signal, onProgress }) => {
        starts++; lastSignal = signal; onProgress({ completed: 2, total: 8, bytes: 2 * 1024 * 1024 });
        return new Promise((resolve, reject) => {
          completeDownload = resolve;
          signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true });
        });
      }
    };
    els['settings-open'].click(); await flush();
    assert.equal(els['offline-voices-settings'].hidden, false);
    assert.equal(starts, 0, 'opening settings does not start a download');
    assert.match(els['offline-voices-status'].textContent, /not downloaded/);
    els['offline-voices-download'].click(); await flush();
    assert.equal(starts, 1);
    assert.match(els['offline-voices-status'].textContent, /2 of 8 files \(2 MiB\)/);
    assert.equal(els['offline-voices-cancel'].hidden, false);
    els['settings-close'].click(); els['settings-open'].click(); await flush();
    assert.equal(lastSignal.aborted, false, 'closing the dialog does not cancel the download');
    assert.match(els['offline-voices-status'].textContent, /2 of 8 files/);
    els['offline-voices-cancel'].click(); await flush();
    assert.equal(lastSignal.aborted, true);
    assert.match(els['offline-voices-status'].textContent, /canceled/i);
    assert.equal(els['offline-voices-download'].disabled, false);
    assert.equal(els['offline-voices-cancel'].hidden, true);
    els['offline-voices-download'].click(); await flush();
    assert.equal(starts, 2);
    completeDownload({ ready: true }); await flush();
    assert.match(els['offline-voices-status'].textContent, /ready for offline play/);
    assert.equal(els['offline-voices-download'].disabled, true);
    els['settings-close'].click();
    delete globalThis.navigator.serviceWorker;
  });

  await test('included desktop AI is opt-in, draft-only, and respects cancellation', async () => {
    const oldLocation = globalThis.location, oldFetch = globalThis.fetch;
    globalThis.location = { href: 'http://127.0.0.1:49564/' };
    let calls = 0, release, aborted;
    try {
      els['settings-open'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'existing';
      els['api-key'].value = 'prior-key'; els['speech-url'].value = 'https://speech.example';
      els['settings-form'].submit();
      globalThis.fetch = async (_url, options) => {
        calls++;
        if (calls === 1) return jsonResponse({ available: true });
        return jsonResponse({ ready: true, model: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf' });
      };
      els['settings-open'].click();
      assert.equal(calls, 0, 'opening settings does not start or probe the model');
      els['desktop-ai-start'].click(); await flush();
      assert.equal(calls, 2);
      assert.equal(els.endpoint.value, 'http://127.0.0.1:49564/local-ai/v1/chat/completions');
      assert.equal(els.model.value, 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf');
      assert.equal(els['api-key'].value, '');
      assert.equal(els['speech-url'].value, 'https://speech.example', 'speech settings remain untouched');
      els['settings-close'].click(); els['settings-open'].click();
      assert.equal(els.endpoint.value, 'https://example.invalid/chat', 'closing discards the draft');
      assert.equal(els.model.value, 'existing'); assert.equal(els['api-key'].value, 'prior-key');
      globalThis.fetch = async (_url, options) => new Promise(resolve => { release = resolve; aborted = options.signal; });
      els['desktop-ai-start'].click(); await flush();
      els['settings-close'].click(); assert.equal(aborted.aborted, true);
      release(jsonResponse({ available: true })); await flush();
      els['settings-open'].click();
      assert.equal(els.endpoint.value, 'https://example.invalid/chat', 'late response cannot overwrite a reopened dialog');
      globalThis.fetch = async (_url, options) => new Promise(resolve => { release = resolve; aborted = options.signal; });
      els['desktop-ai-start'].click(); await flush();
      els['settings-form'].listeners.input({ target: els.model });
      assert.equal(aborted.aborted, true, 'editing settings cancels pending startup');
      release(jsonResponse({ available: true })); await flush();
      assert.equal(els.model.value, 'existing');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = oldLocation; globalThis.fetch = oldFetch; }
  });
  await test('included desktop transcription is opt-in, draft-only and preserves voice settings', async () => {
    const oldLocation = globalThis.location, oldFetch = globalThis.fetch;
    globalThis.location = { href: 'http://127.0.0.1:49564/' };
    let calls = 0, release, signal;
    try {
      globalThis.fetch = async () => { calls++; return jsonResponse({ available: true, engine: 'parakeet-cpp:tdt_ctc-110m:q4_k' }); };
      els['settings-open'].click(); els['settings-clear'].click();
      els['settings-open'].click();
      assert.equal(calls, 0, 'opening settings does not probe or activate transcription');
      els['desktop-asr-use'].click(); await flush();
      assert.equal(calls, 1);
      assert.equal(els['speech-url'].value, 'http://127.0.0.1:49564/local-asr');
      assert.equal(els['asr-engine'].value, 'parakeet-cpp:tdt_ctc-110m:q4_k');
      assert.equal(els['speech-mode'].value, 'mirid');
      assert.equal(els['tts-url'].value, process.env.OKI_TEST_PUBLISHER_VOICE === '1' ? 'https://kokoro.example.test' : '',
        'default bundled voices and any publisher service remain unchanged');
      assert.equal(els['tts-engine'].value, 'kokoro');
      els['settings-close'].click(); els['settings-open'].click();
      assert.equal(els['speech-url'].value, 'http://127.0.0.1:8000', 'closing discards the unsaved draft');

      els['speech-mode'].value = 'openai'; els['speech-url'].value = 'https://speech.example';
      els['speech-key'].value = 'custom-voice-key'; els['tts-url'].value = ''; els['tts-mode'].value = '';
      els['desktop-asr-use'].click(); await flush();
      assert.equal(els['tts-url'].value, 'https://speech.example');
      assert.equal(els['tts-mode'].value, 'openai');
      assert.equal(els['tts-key'].value, 'custom-voice-key');
      assert.equal(els['speech-key'].value, '');
      els['settings-close'].click(); els['settings-open'].click();
      els['tts-provider'].value = 'realtime'; els['tts-url'].value = '';
      els['desktop-asr-use'].click(); await flush();
      assert.equal(els['tts-provider'].value, 'realtime');
      assert.equal(els['tts-url'].value, '');
      globalThis.fetch = async (_url, options) => new Promise(resolve => { release = resolve; signal = options.signal; });
      els['desktop-asr-use'].click(); await flush();
      els['settings-close'].click();
      assert.equal(signal.aborted, true);
      release(jsonResponse({ available: true, engine: 'parakeet-cpp:tdt_ctc-110m:q4_k' })); await flush();
      els['settings-open'].click();
      assert.equal(els['speech-url'].value, 'http://127.0.0.1:8000', 'late status cannot overwrite reopened settings');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = oldLocation; globalThis.fetch = oldFetch; }
  });

  await test('desktop quick setup is opt-in, draft-only and preserves custom providers', async () => {
    const oldLocation = globalThis.location, oldFetch = globalThis.fetch;
    let calls = [];
    const setupFetch = (aiReady, asrReady) => async url => {
      const path = new URL(url).pathname; calls.push(path);
      if (path === '/local-ai/status') return jsonResponse({ available: aiReady });
      if (path === '/local-ai/start') return jsonResponse({ ready: true, model: 'local.gguf' });
      if (path === '/local-asr/status') return jsonResponse({ available: asrReady, engine: 'parakeet-cpp:tdt_ctc-110m:q4_k' });
      throw Error(`Unexpected request ${path}`);
    };
    try {
      globalThis.location = { href: 'http://127.0.0.1:8766/' };
      globalThis.fetch = setupFetch(true, true);
      els['settings-open'].click(); assert.equal(els['desktop-quick-settings'].hidden, true);
      assert.deepEqual(calls, []); els['settings-close'].click();
      globalThis.location = { href: 'http://127.0.0.1:49564/' };
      els['settings-open'].click(); els['settings-clear'].click(); els['settings-open'].click();
      assert.equal(els['desktop-quick-settings'].hidden, false); assert.deepEqual(calls, []);
      els['desktop-quick-start'].click(); await flush();
      assert.deepEqual(calls.sort(), ['/local-ai/start', '/local-ai/status', '/local-asr/status']);
      assert.equal(els.model.value, 'local.gguf');
      assert.equal(els['speech-url'].value, 'http://127.0.0.1:49564/local-asr');
      assert.match(els['desktop-quick-status'].textContent, /Local character AI is ready.*Local transcription is ready.*Save/);
      els['settings-close'].click(); els['settings-open'].click();
      assert.notEqual(els.model.value, 'local.gguf'); assert.equal(els['speech-url'].value, 'http://127.0.0.1:8000');
      els['desktop-quick-start'].click(); await flush(); els['settings-form'].submit();
      els['settings-open'].click();
      assert.equal(els.model.value, 'local.gguf'); assert.equal(els['speech-url'].value, 'http://127.0.0.1:49564/local-asr');
      els['settings-clear'].click(); els['settings-open'].click();
      els['speech-mode'].value = 'openai'; els['speech-url'].value = 'https://speech.example';
      els['speech-key'].value = 'secret'; els['tts-provider'].value = 'realtime'; els['tts-url'].value = 'https://voice.example';
      els['desktop-quick-start'].click(); await flush();
      assert.equal(els['speech-mode'].value, 'openai'); assert.equal(els['speech-url'].value, 'https://speech.example');
      assert.equal(els['speech-key'].value, 'secret'); assert.equal(els['tts-provider'].value, 'realtime');
      assert.equal(els['tts-url'].value, 'https://voice.example');
      assert.match(els['desktop-quick-status'].textContent, /speech service was left unchanged/);
      els['settings-close'].click();
      for (const [field, value] of [['asr-engine', 'parakeet-cpp:tdt_ctc-110m:q4_k'], ['asr-model', 'custom-model']]) {
        els['settings-open'].click(); els[field].value = value;
        els['desktop-quick-start'].click(); await flush();
        assert.equal(els['speech-url'].value, 'http://127.0.0.1:8000');
        assert.equal(els[field].value, value);
        assert.match(els['desktop-quick-status'].textContent, /speech service was left unchanged/);
        els['settings-close'].click();
      }
      for (const [aiReady, asrReady] of [[true, false], [false, true], [false, false]]) {
        calls = []; globalThis.fetch = setupFetch(aiReady, asrReady); els['settings-open'].click();
        els['desktop-quick-start'].click(); await flush();
        assert.equal(els.model.value === 'local.gguf', aiReady);
        assert.equal(els['speech-url'].value === 'http://127.0.0.1:49564/local-asr', asrReady);
        assert.match(els['desktop-quick-status'].textContent, aiReady ? /AI is ready/ : /AI could not start/);
        assert.match(els['desktop-quick-status'].textContent, asrReady ? /transcription is ready/ : /transcription is unavailable/);
        if (!aiReady && !asrReady) assert.match(els['desktop-quick-status'].textContent, /settings were not changed/);
        els['settings-close'].click();
      }
      let pending = [];
      globalThis.fetch = (_url, { signal }) => new Promise(resolve => pending.push({ resolve, signal }));
      els['settings-open'].click(); els['desktop-quick-start'].click(); await flush();
      assert.equal(pending.length, 2); els['settings-close'].click();
      assert.ok(pending.every(entry => entry.signal.aborted));
      pending.forEach(entry => entry.resolve(jsonResponse({ available: true, engine: 'parakeet-cpp:tdt_ctc-110m:q4_k' })));
      await flush(); els['settings-open'].click();
      assert.notEqual(els.model.value, 'local.gguf'); assert.equal(els['speech-url'].value, 'http://127.0.0.1:8000');
      pending = []; els['desktop-quick-start'].click(); await flush();
      els['settings-form'].listeners.input({ target: els.model });
      assert.ok(pending.every(entry => entry.signal.aborted));
      pending.forEach(entry => entry.resolve(jsonResponse({ available: true, engine: 'parakeet-cpp:tdt_ctc-110m:q4_k' })));
      await flush(); assert.notEqual(els.model.value, 'local.gguf');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = oldLocation; globalThis.fetch = oldFetch; }
  });

  await test('Nano-only launcher instructions match the available creator controls', async () => {
    const oldLocation = globalThis.location;
    const oldFetch = globalThis.fetch;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.fetch = async () => jsonResponse({ version: 1, miridPort: null, model: null, kokoroPort: null, nanoPort: 8001 });
    try {
      els['settings-open'].click();
      els['local-launcher-preset'].click(); await flush();
      if (process.env.OKI_TEST_CREATOR === '1') {
        assert.equal(els['creator-voice-tools'].hidden, false);
        assert.match(els['mirid-status'].textContent, /Choose a reference and speaker in Creator voice audition/);
      } else {
        assert.equal(els['creator-voice-tools'].hidden, true);
        assert.match(els['mirid-status'].textContent, /open the local game with \?voice-creator=1/);
        assert.doesNotMatch(els['mirid-status'].textContent, /no shared voice|not configured/i);
      }
      if (process.env.OKI_TEST_PUBLISHER_VOICE === '1' && process.env.OKI_TEST_CREATOR !== '1') {
        assert.equal(els['narrator-voice'].value, 'default');
        assert.equal(els['narrator-voice'].readOnly, true);
      }
      els['settings-close'].click();
    } finally { globalThis.location = oldLocation; globalThis.fetch = oldFetch; }
  });
  await test('resizing keeps a focused story reply visible without reviving stale fields', async () => {
    const checkpoint = { version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', bond: 'care' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
    els.restart.click(); els.resume.click(); await flush();
    const field = els.interaction.children.find(el => el.id === 'player-message');
    assert.ok(field);
    field.value = 'I can help you.';
    let scrolled = 0;
    field.scrollIntoView = (options) => { assert.deepEqual(options, { block: 'nearest' }); scrolled++; };
    const originalTimer = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
    let nextId = 0;
    const timers = new Map();
    globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 300); const id = ++nextId; timers.set(id, fn); return id; };
    globalThis.clearTimeout = (id) => timers.delete(id);
    const runTimers = () => { const queued = [...timers.values()]; timers.clear(); queued.forEach(fn => fn()); };
    try {
      field.focus(); globalEvents.resize(); globalEvents.resize();
      assert.equal(timers.size, 1, 'successive resizes are debounced');
      runTimers(); assert.equal(scrolled, 1); assert.equal(field.value, 'I can help you.');
      globalEvents.resize(); els.advance.focus(); runTimers();
      assert.equal(scrolled, 1, 'a field that lost focus is not moved');
      field.focus(); globalEvents.resize(); els.interaction.removeChild(field); runTimers();
      assert.equal(scrolled, 1, 'a field removed from the scene is not moved');
    } finally {
      globalThis.setTimeout = originalTimer; globalThis.clearTimeout = originalClear;
      storageData.clear(); els.restart.click();
    }
  });
  await test('older WebView replaces choices and a pending follow-up without replaceChildren', async () => {
    const nativeReplace = FakeElement.prototype.replaceChildren;
    const savedFetch = globalThis.fetch;
    let requests = 0;
    delete FakeElement.prototype.replaceChildren;
    globalThis.fetch = async () => {
      requests++;
      if (requests === 1) return jsonResponse({ choices: [{ message: { content: 'I hear you.' } }] });
      return new Promise(() => {});
    };
    try {
      els['settings-clear'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const checkpoint = { version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', private_tone: 'personal' }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
      els.restart.click(); els.resume.click(); await flush();
      const input = els.interaction.children.find(el => el.id === 'player-message');
      assert.ok(input, 'private input is rendered');
      input.value = 'We can take this one step at a time.';
      const beforeRemoval = els.interaction.removals || 0;
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(els.interaction.removals > beforeRemoval, 'empty replacement removed the input controls');
      assert.ok(!els.interaction.children.includes(input), 'old input does not remain after sending');
      assert.equal(els['story-text'].textContent, 'I hear you.');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      const followup = els.interaction.children.find(el => el.id === 'player-follow-up');
      followup.value = 'What do we try next?';
      const beforeAppend = els.interaction.appendedChildren || 0;
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests, 2);
      assert.ok((els.interaction.appendedChildren || 0) > beforeAppend, 'nonempty replacement appended its button');
      assert.ok(!els.interaction.children.includes(followup));
      const skip = els.interaction.children.find(el => el.textContent === 'Continue without waiting');
      assert.ok(skip, 'the pending response can be skipped');
      skip.click(); await flush();
      assert.ok(!els.interaction.children.includes(skip), 'continuing removes the pending button');
    } finally {
      FakeElement.prototype.replaceChildren = nativeReplace;
      globalThis.fetch = savedFetch;
      storageData.clear(); els['settings-clear'].click(); els.restart.click();
    }
  });
  await test('faster speech preparation is opt-in, session-scoped and resettable', async () => {
    els['settings-open'].click();
    assert.equal(els['tts-prefetch'].value, '1');
    els['tts-prefetch'].value = '2';
    els['settings-form'].submit(); els['settings-open'].click();
    assert.equal(els['tts-prefetch'].value, '2');
    els['settings-clear'].click();
    assert.equal(els['tts-prefetch'].value, '1');
    els['tts-prefetch'].value = '99';
    els['settings-form'].submit(); els['settings-open'].click();
    assert.equal(els['tts-prefetch'].value, '1');
    els['settings-close'].click();
  });
  if (process.env.OKI_TEST_PUBLISHER_VOICE === '1' && process.env.OKI_TEST_CREATOR === '1') await test('publisher voices route, preview, override and reset independently', async () => {
    const oldAudio = globalThis.Audio;
    const players = [];
    globalThis.Audio = class { constructor(src) { this.src = src; players.push(this); } async play() {} pause() {} removeAttribute() {} };
    const requests = [];
    globalThis.fetch = async (url, request) => {
      requests.push({ url, body: JSON.parse(request.body), authorization: request.headers.Authorization });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els['settings-open'].click();
      assert.equal(els['tts-url'].value, 'https://kokoro.example.test');
      assert.equal(els['tts-mode'].value, 'mirid');
      assert.equal(els['narrator-voice'].value, 'default');
      assert.equal(els['niko-voice'].value, 'am_adam');
      els['voice-preview-speaker'].value = 'Narrator'; els['voice-preview'].click(); await flush();
      assert.equal(requests[0].url, 'https://reference.example.test/tts');
      assert.equal(requests[0].body.voice, 'default');
      assert.equal(requests[0].body.engine, 'chatterbox');
      assert.equal(requests[0].authorization, undefined);
      els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
      assert.equal(requests[1].url, 'https://kokoro.example.test/tts');
      assert.equal(requests[1].body.voice, 'am_adam');
      assert.equal(requests[1].body.engine, 'kokoro');
      // A blank character field must not inherit the narrator's Chatterbox
      // reference ID while routing the request to the separate Kokoro service.
      els['niko-voice'].value = '';
      els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
      assert.equal(requests[2].url, 'https://kokoro.example.test/tts');
      assert.equal(requests[2].body.engine, 'kokoro');
      assert.equal(requests[2].body.voice, 'am_adam');
      els['service-voice'].value = '';
      els['settings-form'].submit(); els.start.click(); await flush();
      els.speak.click(); await flush();
      assert.equal(requests[3].url, 'https://reference.example.test/tts');
      assert.equal(requests[3].body.voice, 'default');
      els['auto-read'].click(); await flush();
      assert.equal(requests[4].url, 'https://reference.example.test/tts');
      els.advance.click(); await flush();
      assert.equal(requests[5].url, 'https://kokoro.example.test/tts');
      assert.equal(requests[5].body.voice, 'af_nicole');
      els['stop-voice'].click(); els['settings-open'].click();
      els['chatterbox-remove'].click();
      assert.equal(els['narrator-voice'].value, 'af_heart');
      els['tts-url'].value = 'https://other.example.test'; els['settings-form'].submit();
      els['settings-open'].click();
      assert.equal(els['tts-url'].value, 'https://other.example.test');
      assert.equal(els['narrator-voice'].value, 'af_heart');
      els['speech-key'].value = 'secret'; els['tts-key'].value = 'other-secret';
      els['settings-clear'].click();
      assert.equal(els['tts-url'].value, 'https://kokoro.example.test');
      assert.equal(els['tts-mode'].value, 'mirid');
      assert.equal(els['narrator-voice'].value, 'default');
      assert.equal(els['chatterbox-target'].value, 'Narrator');
      assert.equal(els['chatterbox-url'].value, 'https://reference.example.test');
      assert.equal(els['speech-key'].value, '');
      assert.equal(els['tts-key'].value, '');
      els['voice-preview-speaker'].value = 'Narrator'; els['voice-preview'].click(); await flush();
      assert.equal(requests[6].url, 'https://reference.example.test/tts');
      assert.equal(requests[6].body.engine, 'chatterbox');
      assert.equal(requests[6].body.voice, 'default');
      els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
      assert.equal(requests[7].url, 'https://kokoro.example.test/tts');
      assert.equal(requests[7].body.voice, 'am_adam');
      // Starting text and ASR alone must keep both publisher voice routes.
      const oldLocation = globalThis.location;
      const oldFetch = globalThis.fetch;
      globalThis.location = { href: 'http://127.0.0.1:8766/' };
      globalThis.fetch = async (url, request) => String(url).endsWith('/.well-known/oki-doki-local.json')
        ? new Response(JSON.stringify({ version: 1, miridPort: 8000, model: 'model.gguf', kokoroPort: null, nanoPort: null }))
        : oldFetch(url, request);
      try {
        els['local-launcher-preset'].click(); await flush();
        assert.equal(els['tts-url'].value, 'https://kokoro.example.test');
        assert.equal(els['tts-mode'].value, 'mirid');
        els['voice-preview-speaker'].value = 'Narrator'; els['voice-preview'].click(); await flush();
        assert.equal(requests[8].url, 'https://reference.example.test/tts');
        assert.equal(requests[8].body.voice, 'default');
        els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
        assert.equal(requests[9].url, 'https://kokoro.example.test/tts');
        assert.equal(requests[9].body.voice, 'am_adam');
      } finally { globalThis.location = oldLocation; globalThis.fetch = oldFetch; }
      els['settings-close'].click();
      // The narrator's Chatterbox assignment must not swallow Niko's spoken
      // words embedded in this narrated passage. A saved checkpoint gives the
      // same result as arriving there through the story.
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node: 'niko_note', answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', bond: 'care' }, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.niko_note.text);
      const first = requests.length;
      els.speak.click(); await flush();
      assert.equal(requests[first].url, 'https://reference.example.test/tts');
      assert.equal(requests[first].body.engine, 'chatterbox');
      assert.equal(requests[first + 1].url, 'https://kokoro.example.test/tts');
      assert.equal(requests[first + 1].body.voice, 'am_adam');
      assert.match(requests[first + 1].body.text, /My brother wrote that/);
      players[players.length - 1].onended(); await flush();
      assert.equal(requests[first + 2].url, 'https://reference.example.test/tts');
      els['stop-voice'].click(); storageData.clear(); els.restart.click();
    } finally { globalThis.Audio = oldAudio; }
  });
  if (process.env.OKI_TEST_PUBLISHER_VOICE === '1' && process.env.OKI_TEST_CREATOR !== '1') await test('normal player cannot displace the publisher voice through settings or presets', async () => {
    const oldAudio = globalThis.Audio;
    const oldFetch = globalThis.fetch;
    const oldLocation = globalThis.location;
    const requests = [];
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (url, request) => {
      if (String(url).endsWith('/.well-known/oki-doki-local.json')) return new Response(JSON.stringify({ version: 1, miridPort: 8000, model: 'model.gguf', kokoroPort: null, nanoPort: null }));
      requests.push({ url, body: JSON.parse(request.body) });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    const previewPublisher = async () => {
      els['voice-preview-speaker'].value = 'Narrator'; els['voice-preview'].click(); await flush();
      assert.equal(requests.at(-1).url, 'https://reference.example.test/tts');
      assert.equal(requests.at(-1).body.engine, 'chatterbox');
      assert.equal(requests.at(-1).body.voice, 'default');
    };
    try {
      els['settings-open'].click();
      assert.equal(els['narrator-voice'].readOnly, true);
      assert.notEqual(els['niko-voice'].readOnly, true);
      assert.equal(els['publisher-voice-note'].hidden, false);
      assert.match(els['publisher-voice-note'].textContent, /Narrator/);
      els['narrator-voice'].value = 'af_sarah'; // Simulate a programmatic/preset change.
      await previewPublisher();
      els['tts-mode'].value = 'openai'; els['tts-mode'].listeners.change();
      assert.equal(els['narrator-voice'].value, 'default');
      els['narrator-voice'].value = '';
      els['mirid-url'].value = 'https://other.example.test'; els['mirid-preset'].click();
      assert.equal(els['narrator-voice'].value, 'default'); await previewPublisher();
      els['narrator-voice'].value = '';
      els['companion-url'].value = 'https://companion.example.test'; els['companion-token'].value = 'a'.repeat(32); els['companion-preset'].click();
      assert.equal(els['narrator-voice'].value, 'default'); await previewPublisher();
      globalThis.location = { href: 'http://127.0.0.1:8766/' };
      els['narrator-voice'].value = '';
      els['local-launcher-preset'].click(); await flush();
      assert.equal(els['narrator-voice'].value, 'default'); await previewPublisher();
      els['narrator-voice'].value = '';
      els['niko-voice'].value = 'am_adam';
      els['settings-form'].submit(); els.start.click(); await flush();
      els.speak.click(); await flush();
      assert.equal(requests.at(-1).url, 'https://reference.example.test/tts');
      assert.equal(requests.at(-1).body.engine, 'chatterbox');
      els['stop-voice'].click(); els['settings-open'].click();
      assert.equal(els['narrator-voice'].value, 'default');
      assert.equal(els['niko-voice'].value, 'am_adam');
      els['settings-clear'].click();
      assert.equal(els['narrator-voice'].value, 'default');
      assert.equal(els['narrator-voice'].readOnly, true);
      await previewPublisher();
      els['settings-close'].click();
    } finally { globalThis.Audio = oldAudio; globalThis.fetch = oldFetch; globalThis.location = oldLocation; }
  });
  if (process.env.OKI_TEST_PUBLISHER_VOICE !== '1') {
  const choiceAt = (nodeId, choiceIndex) => {
    const label = story[nodeId].choices[choiceIndex].label;
    const found = els.interaction.children.find(el => el.textContent === label);
    assert.ok(found, `Expected choice ${label}`);
    found.click();
  };
  const step = async (plan) => {
    const text = els['story-text'].textContent;
    const id = Object.entries(story).find(([, node]) => node.text === text)?.[0] ||
      (text === 'Mira offers you the loose ear and a pencil.' ? 'mira_bond_choice' : undefined) ||
      (text.startsWith(story.regroup_signal_choice.text) ? 'regroup_signal_choice' : undefined) ||
      (text.startsWith('Near the edge, the receipt prints your words to Mallow:') ? 'history_early_paper' : undefined) ||
      (text.startsWith('On a separate line, the receipt quotes Mallow’s answer:') &&
       els.interaction.children.some(el => el.textContent === story.history_mallow_reply_choice.choices[0].label)
        ? 'history_mallow_reply_choice' : undefined);
    if (id && story[id].offer) {
      if (plan.kit) {
        els.interaction.children.find(el => el.id === 'repair-name').value = 'Sophia';
        els.interaction.children.find(el => el.textContent === 'Check offer').click();
        els.interaction.children.find(el => el.textContent === 'Take the free repair kit').click();
      } else els.interaction.children.find(el => el.textContent === 'Continue without the kit').click();
    } else if (id && story[id].choices) {
      // Existing route regressions skip the optional conversation unless a
      // test explicitly selects it.
      const index = plan[id] ?? (id.endsWith('_connection_late') ? plan[id.replace('_late', '_choice')] : undefined) ?? (id === 'history_early_paper' ? plan.history_mallow_reply_choice : undefined) ?? ((id.startsWith('audit_focus_') || id === 'early_audit_choice') ? plan.audit_action_choice : undefined) ?? (id.startsWith('reason_focus_') ? plan.late_focus_choice : undefined) ?? ((id.startsWith('moment_discuss_') || id === 'early_rescue_choice') ? 1 : 0);
      choiceAt(id, index);
    } else if (els.interaction.children.some(el => el.tagName === 'TEXTAREA')) {
      if (story[id]?.input?.key === 'knightName') {
        els.interaction.children.find(el => el.textContent === 'Decide later').click();
        await flush();
        return;
      }
      const input = els.interaction.children.find(el => el.tagName === 'TEXTAREA');
      if (story[id]?.input?.key === 'annotation') {
        input.value = plan.annotationText ?? '';
        els.interaction.children.find(el => el.textContent === 'Write on the receipt →').click();
        await flush();
        return;
      }
      input.value = story[id]?.input?.key === 'private'
        ? (plan.privateText ?? 'A test message with $& intact.')
        : (plan.publicText ?? 'A test message with $& intact.');
      els.interaction.children.find(el => el.textContent === 'Send message →').click();
    } else {
      assert.equal(els.advance.hidden, false, `No way to advance from ${text}`);
      els.advance.click();
    }
    await flush();
  };

  await test('direct resume preserves a draft until confirmed and restores an older checkpoint', async () => {
    const checkpoint = JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', bond: 'care' }, followupMemory: [] });
    storageData.set('okie-dokie.arcade.v1', checkpoint);
    els.restart.click(); els.resume.click(); await flush();
    const draft = els.interaction.children.find(el => el.id === 'player-message');
    draft.value = 'An unsent thought';
    els['resume-game'].click();
    assert.equal(els['resume-prompt'].hidden, false);
    assert.equal(globalThis.document.activeElement, els['resume-confirm']);
    els['resume-cancel'].click();
    assert.equal(els['resume-prompt'].hidden, true);
    assert.equal(globalThis.document.activeElement, els['resume-game']);
    assert.equal(draft.value, 'An unsent thought');
    els['resume-game'].click(); els['resume-confirm'].click(); await flush();
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    assert.equal(els.interaction.children.find(el => el.id === 'player-message').value, '');
    assert.equal(globalThis.document.activeElement, els.speaker);
    assert.equal(storageData.get('okie-dokie.arcade.v1'), checkpoint);
    storageData.clear(); els.restart.click();
  });

  await test('direct resume rejects changed or invalid saved data without losing the current draft', async () => {
    const checkpoint = JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', bond: 'care' }, followupMemory: [] });
    storageData.set('okie-dokie.arcade.v1', checkpoint);
    els.restart.click(); els.resume.click(); await flush();
    const draft = els.interaction.children.find(el => el.id === 'player-message');
    draft.value = 'Keep this draft';
    els['resume-game'].click();
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: startNode, answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: [] }));
    els['resume-confirm'].click(); await flush();
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    assert.equal(draft.value, 'Keep this draft');
    assert.match(els['save-status'].textContent, /changed or is unavailable/i);
    els['resume-game'].click();
    storageData.set('okie-dokie.arcade.v1', '{invalid');
    els['resume-confirm'].click(); await flush();
    assert.equal(draft.value, 'Keep this draft');
    assert.equal(els['resume-game'].hidden, true);
    assert.equal(globalThis.document.activeElement, els.speaker);
    storageData.clear(); els.restart.click();
  });

  await test('another tab changing the checkpoint updates Resume without losing focus', async () => {
    storageData.clear(); els.restart.click(); els.start.click(); await flush();
    assert.equal(els['resume-game'].hidden, true);
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'hint_intro', answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: [] }));
    globalEvents.storage({ key: 'okie-dokie.arcade.v1' });
    assert.equal(els['resume-game'].hidden, false);
    els['resume-game'].focus();
    storageData.delete('okie-dokie.arcade.v1');
    globalEvents.storage({ key: 'okie-dokie.arcade.v1' });
    assert.equal(els['resume-game'].hidden, true);
    assert.equal(globalThis.document.activeElement, els.speaker);
    assert.equal(els['story-text'].textContent, story[startNode].text);
    els.restart.click();
  });

  await test('direct resume cancels pending model response and ignores a late completion', async () => {
    let resolveFetch, requestSignal;
    globalThis.fetch = (_url, request) => { requestSignal = request.signal; return new Promise(resolve => { resolveFetch = resolve; }); };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', bond: 'care' }, followupMemory: [] }));
    els.restart.click(); els['settings-open'].click(); els.endpoint.value = 'http://127.0.0.1:1234/v1/chat/completions'; els.model.value = 'test'; els['settings-form'].submit();
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Hello';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.ok(requestSignal && !requestSignal.aborted);
    els['resume-game'].click();
    assert.equal(requestSignal.aborted, false, 'opening confirmation does not cancel pending work');
    els['resume-confirm'].click(); await flush();
    assert.equal(requestSignal.aborted, true);
    resolveFetch(jsonResponse({ choices: [{ message: { content: 'This response arrived too late.' } }] })); await flush();
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('direct resume cancels pending microphone permission', async () => {
    let fetches = 0;
    globalThis.fetch = async () => { fetches++; throw new Error('Unexpected transcription'); };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', bond: 'care' }, followupMemory: [] }));
    els.restart.click(); els['settings-clear'].click(); els['speech-mode'].value = 'openai'; els['speech-url'].value = 'https://speech.example'; els['settings-form'].submit();
    els.resume.click(); await flush();
    const record = els.interaction.children.find(el => el.textContent === 'Record a reply');
    assert.ok(record);
    const before = microphonePermissionRequests;
    record.click(); await flush();
    assert.equal(microphonePermissionRequests, before + 1);
    els['resume-game'].click(); els['resume-confirm'].click(); await flush();
    let stopped = 0;
    resolveMicrophonePermission({ getTracks: () => [{ stop() { stopped++; } }] });
    for (let i = 0; i < 8; i++) await flush();
    assert.equal(stopped, 1);
    assert.equal(fetches, 0);
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('every story ending offers the same optional email contact and a visible address', async () => {
    for (const [id, node] of Object.entries(story).filter(([, item]) => item.end)) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node: id, answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, node.text, `resumed ${id}`);
      const contact = els.interaction.children.find(el => el.textContent === 'Send feedback or contact ↗');
      assert.equal(contact?.tagName, 'A', id);
      assert.equal(contact.href, 'mailto:surelyitstimeyou@pm.me', id);
      assert.ok(els.interaction.children.some(el => el.textContent === 'Email: surelyitstimeyou@pm.me'), id);
      assert.ok(els.interaction.children.some(el => el.textContent === 'Play again ↗'), id);
    }
    storageData.clear(); els.restart.click();
  });

  await test('older checkpoints on shortened reveal passages still resume and advance', async () => {
    const cases = [
      ['correction_absorbed', 'fourth_wall_intro'],
      ['fourth_wall_correction_check', 'fourth_wall_correction'],
      ['moment_return', 'moment_return_keep'],
      ['reason_reveal_check', 'reason_reveal'],
      ['reason_result_team', 'reason_result_team_reply'],
      ['reason_result_prize', 'reason_result_prize_reply'],
      ['reason_result_company', 'reason_result_company_reply'],
      ['history_steps_reply', 'history_select'],
      ['history_compare_check', 'history_compare_direct'],
      ['history_compare_reaction', 'history_second_check'],
      ['history_card_check', 'history_card_direct'],
      ['history_notice_check', 'history_notice_direct'],
      ['history_reflect', 'policy_direct_compact'],
      ['history_steered', 'policy_direct']
    ];
    for (const [id, expected] of cases) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node: id, answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', disclosure: 'private', moment: 'keep', reason: 'team', vote_a: 'direct', vote_b: 'direct', card_preference: 'direct', notice_preference: 'direct' }, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[id].text, id);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[expected].text, `${id} advances`);
    }
    storageData.clear(); els.restart.click();
  });

  await test('the compact reveal preserves each reason, both photo choices and old checkpoints', async () => {
    const checkpoint = async (node, flags) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node, answer: '', privateAnswer: '', relationship: 'Mira',
        flags: { companion: 'Mira', ...flags }, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
    };
    for (const action of ['touch', 'count']) {
      await checkpoint('fourth_wall_intro_confirm', { regroup_action: action, confirm_pressed: 'yes' });
      els.advance.click(); await flush();
      assert.ok(els['story-text'].textContent.startsWith(story[`fourth_wall_${action}_compact`].text), action);
    }
    for (const moment of ['keep', 'tear']) {
      for (const reason of ['team', 'prize', 'company']) {
        await checkpoint(`moment_return_${moment}_compact`, { moment, reason, early_door_done: 'yes' });
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story[`reason_result_${reason}_reply`].text, `${moment}/${reason}`);
      }
      await checkpoint(`moment_return_${moment}_compact`, { moment, reason: 'team' });
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.door_choice.text, `${moment}: old route keeps door choice`);
      await checkpoint(`moment_return_${moment}_compact`, { moment, early_door_done: 'yes' });
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.early_reason_check.text, `${moment}: missing reason retains fallback`);
    }
    await checkpoint('early_reason_check', { reason: 'prize', early_door_done: 'yes' });
    assert.equal(els['story-text'].textContent, story.early_reason_check.text);
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.reason_result_prize_reply.text);
    storageData.clear(); els.restart.click();
  });

  await test('the check and companion callback share one passage and keep old checkpoints', async () => {
    const restore = async (node, flags) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node,
        answer: '', privateAnswer: '', relationship: flags.companion, flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
    };
    for (const companion of ['Niko', 'Mira', 'Ash']) for (const action of ['touch', 'count']) for (const moment of ['keep', 'tear']) {
      const flags = { companion, regroup_action: action, moment, reason: 'team', signal: 'private',
        early_door_done: 'yes', reveal_pace_v2: 'yes', fourth_wall_compact_v3: 'yes' };
      await restore('fourth_wall_intro_compact', flags);
      els.advance.click(); await flush();
      const combined = story[`fourth_wall_${action}_${companion.toLowerCase()}_combined`];
      assert.equal(els['story-text'].textContent, combined.text);
      assert.equal(els.portrait.src, `./assets/${companion.toLowerCase()}${companion === 'Niko' ? '' : '-concerned'}.png`, 'companion portrait survives the consolidation');
      assert.ok(els.interaction.children.some(el => el.className === 'remembered-choice'), 'the selected companion is still displayed');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, combined.text, 'combined passage survives save and resume');
      assert.ok(els.interaction.children.some(el => el.className === 'remembered-choice'));
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`moment_return_${moment}_compact`].text);
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.fourth_wall_compact_v3, 'yes');
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.reason_focus_team.text);
    }
    for (const companion of ['Niko', 'Mira', 'Ash']) for (const action of ['touch', 'count']) {
      await restore('fourth_wall_intro_compact', { companion, regroup_action: action, moment: 'keep' });
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`fourth_wall_${action}_compact`].text);
      els.advance.click(); await flush();
      const original = companion === 'Mira' ? 'fourth_mira_compact' : `fourth_${companion.toLowerCase()}`;
      assert.equal(els['story-text'].textContent, story[original].text);
    }
    // A checkpoint already parked on the old screen keeps the old companion scene.
    await restore('fourth_wall_touch_compact', { companion: 'Mira', regroup_action: 'touch', moment: 'keep', fourth_wall_compact_v3: 'yes' });
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.fourth_mira_compact.text);
    storageData.clear(); els.restart.click();
  });

  await test('the recalled reason offers Mira’s focus immediately and keeps older checkpoints', async () => {
    const restore = async (node, flags) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node,
        answer: '', privateAnswer: '', relationship: 'Mira', flags: { companion: 'Mira', ...flags }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
    };
    for (const reason of ['team', 'prize', 'company']) for (const signal of ['private', 'repeat']) for (const focus of ['tell', 'listen']) {
      await restore('early_reason_check', { reason, signal, early_door_done: 'yes', reveal_pace_v2: 'yes', moment: 'keep', vote_a: 'direct' });
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`reason_focus_${reason}`].text);
      const remembered = els.interaction.children.find(el => el.className === 'remembered-choice');
      assert.ok(remembered, `${reason}: opening choice is still shown`);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`reason_focus_${reason}`].text);
      choiceAt(`reason_focus_${reason}`, focus === 'tell' ? 0 : 1); await flush();
      assert.equal(els['story-text'].textContent, story[`late_focus_${focus}_receipt`].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.reveal_focus, focus);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`late_focus_${focus}_receipt`].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[signal === 'private' ? 'history_steps_picture' : 'history_brief_direct'].text);
    }
    for (const flags of [
      { reason: 'team', signal: 'private', early_door_done: 'yes' },
      { reason: 'team', signal: 'private', early_door_done: 'yes', reveal_pace_v2: 'yes', reveal_focus: 'tell' },
      { reason: 'team', signal: 'private', reveal_pace_v2: 'yes' },
      { reason: 'team', early_door_done: 'yes', reveal_pace_v2: 'yes' }
    ]) {
      await restore('early_reason_check', flags);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.reason_result_team_reply.text, 'older/incomplete checkpoints keep original passage');
    }
    await restore('early_reason_check', { signal: 'private', early_door_done: 'yes', reveal_pace_v2: 'yes' });
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_intro.text, 'missing reason retains fallback');
    storageData.clear(); els.restart.click();
  });

  await test('resolved keepsakes lead directly to the witnessed picture while older saves retain the pocket passage', async () => {
    const checkpoint = async (node, flags) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node, answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', ...flags }, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
    };
    for (const keepsake of ['star', 'bell', 'ribbon']) {
      for (const ending of ['rescue', 'record']) for (const moment of ['keep', 'tear']) {
        await checkpoint(`close_${keepsake}`, { ending, moment, compact_pocket_due: 'yes' });
        els.advance.click(); await flush();
        const target = moment === 'keep' ? 'souvenir_kept' : 'souvenir_torn';
        assert.equal(els['story-text'].textContent, story[target].text, `${keepsake}/${ending}/${moment}`);
        els.save.click(); await flush();
        els.advance.click(); await flush();
        els['resume-game'].click(); els['resume-confirm'].click(); await flush();
        assert.equal(els['story-text'].textContent, story[target].text, `${target} resumes`);
      }
      for (const flags of [
        { ending: 'rescue', moment: 'keep' }, // checkpoint created before this path
        { ending: 'record', compact_pocket_due: 'yes' }, // no pictured state
        { ending: 'retreat', moment: 'keep', compact_pocket_due: 'yes' }
      ]) {
        await checkpoint(`close_${keepsake}`, flags);
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.souvenir_pocket.text);
      }
      for (const moment of ['keep', 'tear']) {
        await checkpoint(`close_${keepsake}`, { ending: 'mallow', moment, card_action: 'hold', compact_pocket_due: 'yes' });
        els.advance.click(); await flush();
        const target = moment === 'keep' ? 'souvenir_kept' : 'souvenir_torn';
        assert.equal(els['story-text'].textContent, story[target].text, `held Mallow ${keepsake}/${moment}`);
        els.save.click(); await flush();
        els.advance.click(); await flush();
        els['resume-game'].click(); els['resume-confirm'].click(); await flush();
        assert.equal(els['story-text'].textContent, story[target].text, `held ${target} resumes`);
      }
      for (const flags of [
        { ending: 'mallow', moment: 'keep', card_action: 'use', compact_pocket_due: 'yes' },
        { ending: 'mallow', moment: 'keep', card_action: 'hold' },
        { ending: 'mallow', card_action: 'hold', compact_pocket_due: 'yes' },
        { ending: 'mallow', moment: 'keep', compact_pocket_due: 'yes' }
      ]) {
        await checkpoint(`close_${keepsake}`, flags);
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.souvenir_check.text, 'used, older or inconsistent Mallow route retains the wedge check');
      }
    }
    await checkpoint('souvenir_pocket', { ending: 'rescue', moment: 'tear' });
    assert.equal(els['story-text'].textContent, story.souvenir_pocket.text, 'a checkpoint on the old passage still loads');
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.souvenir_torn.text);
    storageData.clear(); els.restart.click();
  });

  await test('older receipt choices do not invent the fake report', async () => {
    for (const id of ['history_paper_public_choice', 'history_paper_both_choice']) {
      for (const [index, target] of [[0, 'history_paper_share'], [1, 'history_paper_keep']]) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({
          version: 1, node: id, answer: '', privateAnswer: '', relationship: 'Niko',
          flags: { companion: 'Niko' }, followupMemory: []
        }));
        els.restart.click(); els.resume.click(); await flush();
        choiceAt(id, index); await flush();
        assert.equal(els['story-text'].textContent, story[target].text);
      }
    }
    storageData.clear(); els.restart.click();
  });

  await test('input scenes explain written replies before submission and update without losing a draft', async () => {
    els.restart.click(); els['settings-clear'].click();
    for (const [id, node] of Object.entries(story).filter(([, item]) => item.input && story[item.input.next]?.ai)) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node: id, answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, node.text, id);
      assert.equal(els.status.textContent, 'SAY SOMETHING', id);
      const note = els.interaction.children.find(el => el.id === 'scripted-dialogue-note');
      const input = els.interaction.children.find(el => el.id === 'player-message');
      assert.ok(note && !note.hidden, id);
      assert.equal(note.textContent, 'Suggested messages have matching replies. A tailored reply to your own words needs a connected AI service.', id);
      assert.equal(input['aria-describedby'], note.id, id);
    }

    const input = els.interaction.children.find(el => el.id === 'player-message');
    const note = els.interaction.children.find(el => el.id === 'scripted-dialogue-note');
    input.value = 'An unfinished question.';
    els['settings-open'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = '';
    els['settings-form'].submit();
    assert.equal(els.status.textContent, 'SAY SOMETHING', 'incomplete settings still use written dialogue');
    assert.equal(note.hidden, false);
    els['settings-open'].click(); els.model.value = 'test'; els['settings-form'].submit();
    assert.equal(els.status.textContent, 'SAY SOMETHING');
    assert.equal(note.hidden, true);
    assert.equal(input.value, 'An unfinished question.', 'changing settings preserves the draft');
    els['settings-open'].click(); els.endpoint.value = 'http://example.invalid/chat'; els['settings-form'].submit();
    assert.equal(els.status.textContent, 'SAY SOMETHING', 'an invalid endpoint also uses written dialogue');
    assert.equal(note.hidden, false);
    els['settings-open'].click(); els['settings-clear'].click();
    assert.equal(els.status.textContent, 'SAY SOMETHING');
    els['settings-form'].submit();

    const originalNext = story.niko_input.input.next;
    try {
      story.niko_input.input.next = 'ending_team';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els.status.textContent, 'YOUR WORDS MATTER', 'a non-AI input is not labelled as a scripted AI reply');
      assert.ok(!els.interaction.children.some(el => el.id === 'scripted-dialogue-note'));
    } finally {
      story.niko_input.input.next = originalNext;
      storageData.clear(); els.restart.click();
    }
  });

  await test('souvenir art follows the described card through saves and clears on leaving', async () => {
    for (const name of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) {
      const route = name.toLowerCase();
      const save = { version: 1, node: `moment_${route}_${bond}`, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, midpoint_route: route, bond }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(save));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['souvenir-art'].hidden, false);
      assert.equal(els['souvenir-card'].hidden, false);
      assert.equal(els['souvenir-caption'].hidden, true, 'the printed caption has not yet appeared');
      assert.equal(els['souvenir-art'].src, `./assets/souvenir-${route}-${bond}.svg`);
      assert.ok(els['souvenir-art'].alt.length > 30);
      els.save.click(); els.advance.click(); await flush();
      assert.equal(els['souvenir-art'].hidden, false, 'the immediate reaction retains the card');
      els.resume.click(); await flush();
      assert.equal(els['souvenir-art'].src, `./assets/souvenir-${route}-${bond}.svg`, 'save restores the card');
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...save, node: 'moment_keep' }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['souvenir-art'].hidden, true, 'the card is no longer displayed after it is folded');
      assert.equal(els['souvenir-card'].hidden, true);
      assert.equal(els['souvenir-caption'].hidden, true);
    }
    const legacy = { version: 1, node: 'moment_choice', answer: '', privateAnswer: '', relationship: 'Niko',
      flags: { companion: 'Niko' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(legacy));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['souvenir-art'].hidden, true, 'old saves without route information do not invent an image');
    assert.equal(els['souvenir-card'].hidden, true);
    assert.equal(els['souvenir-caption'].hidden, true);
    storageData.clear(); els.restart.click();
  });

  await test('the named-card eye stays closed and the printed caption follows its narration', async () => {
    const flags = { companion: 'Mira', midpoint_route: 'mira', bond: 'play', knight_named: 'yes', named_card_seen: 'yes' };
    const save = { version: 1, node: 'moment_caption', answer: '', privateAnswer: '', relationship: 'Mira', flags, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(save));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['souvenir-art'].src, './assets/souvenir-mira-play-closed.svg');
    assert.match(els['souvenir-art'].alt, /back.*closed/i);
    assert.equal(els['souvenir-caption'].hidden, false);
    els.save.click(); els.advance.click(); await flush();
    assert.equal(els['souvenir-caption'].hidden, false, 'caption remains visible alongside the choice');
    els.resume.click(); await flush();
    assert.equal(els['souvenir-art'].src, './assets/souvenir-mira-play-closed.svg', 'closed eye survives save/resume');
    assert.equal(els['souvenir-caption'].hidden, false);
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...save, flags: { ...flags, midpoint_route: 'ash' } }));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['souvenir-card'].hidden, true, 'mismatched state does not invent a card');
    assert.equal(els['souvenir-caption'].hidden, true);
    storageData.clear(); els.restart.click();
  });

  await test('offline suggested messages use their distinct written replies and preserve the actual words', async () => {
    const inputs = [
      ['niko_input', 'Niko'], ['mira_input', 'Mira'], ['ash_input', 'Ash'],
      ['mallow_input', 'Niko'], ['close_niko_input', 'Niko'],
      ['close_mira_input', 'Mira'], ['close_ash_input', 'Ash'],
      ['close_ash_retreat_input', 'Ash']
    ];
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('written choices must not request a model'); };
    els.restart.click(); els['settings-open'].click();
    els['settings-clear'].click(); els['settings-form'].submit();
    for (const [id, companion] of inputs) {
      const responses = [];
      for (let i = 0; i < 2; i++) {
        els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit();
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({
          version: 1, node: id, answer: '', privateAnswer: 'Earlier private words.', relationship: companion,
          flags: { companion }, followupMemory: []
        }));
        els.restart.click(); els.resume.click(); await flush();
        const options = els.interaction.children.filter(el => el.className === 'choice');
        assert.equal(options.length, 2, `${id} has two written choices`);
        assert.ok(els.interaction.children.some(el => el.id === 'player-message'), `${id} still permits free text`);
        const chosen = options[i].textContent;
        options[i].click(); await flush();
        responses.push(els['story-text'].textContent);
        assert.equal(els.status.textContent, 'WRITTEN RESPONSE');
        els.save.click();
        assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).aiScene.text, responses[i], 'the displayed written response is saved');
        assert.match(els['save-status'].textContent, /story saved/i);
        els.advance.click(); await flush(); els.save.click();
        const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
        if (id === 'mallow_input') {
          assert.equal(saved.answer, chosen, 'group words are recorded as the actual choice');
          assert.equal(saved.privateAnswer, 'Earlier private words.', 'group choice does not expose or replace the private message');
        } else if (id.startsWith('close_')) {
          assert.equal(saved.privateAnswer, 'Earlier private words.', 'epilogue choice preserves earlier private words');
          assert.ok(saved.followupMemory.some(item => item.text === chosen), 'epilogue records the selected words');
        } else {
          assert.equal(saved.privateAnswer, chosen, 'private words are recorded as the actual choice');
          assert.ok(saved.followupMemory.some(item => item.text === chosen), 'private memory records the selected words');
        }
        const nextText = els['story-text'].textContent;
        els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit();
        els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, nextText, 'saved continuation resumes after changing dialogue mode');
        assert.deepEqual(JSON.parse(storageData.get('okie-dokie.arcade.v1')), saved);
      }
      assert.notEqual(responses[0], responses[1], `${id} has distinct character replies`);
    }
    assert.equal(calls, 0, 'offline choices never send a request');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('custom offline messages receive each companion’s own scripted continuation', async () => {
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('offline messages must not request a model'); };
    els.restart.click(); els['settings-open'].click();
    els['settings-clear'].click(); els['settings-form'].submit();
    const replies = new Set();
    for (const name of ['Niko', 'Mira', 'Ash']) {
      const id = `${name.toLowerCase()}_input`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node: id, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, conversation_before_clue: 'yes' }, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'I am glad you told me.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(els.status.textContent, 'WRITTEN RESPONSE');
      assert.equal(els['story-text'].textContent, story[`${name.toLowerCase()}_chat`].ai.fallback);
      replies.add(els['story-text'].textContent);
      els.advance.click(); await flush(); els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).privateAnswer, 'I am glad you told me.');
    }
    assert.equal(replies.size, 3, 'the companions retain distinct scripted continuations');
    assert.equal(requests, 0);
    storageData.clear(); els.restart.click();
  });

  await test('offline disagreements do not get mistaken for agreement, while suggestions retain paired replies', async () => {
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('offline dialogue must not request a model'); };
    const cases = [
      { id: 'mid_niko_input', name: 'Niko', suggested: 'I remember it differently too.', paired: 'Then let’s keep our version in mind. I’m glad you were there with me.' },
      { id: 'mid_mira_input', name: 'Mira', suggested: 'I remember it differently too.', paired: 'Good. I want to remember what we actually did together.' },
      { id: 'mid_ash_input', name: 'Ash', suggested: 'I remember it differently too.', paired: 'Then we have two witnesses, and a card that needs a correction.' },
      { id: 'close_ash_retreat_input', name: 'Ash', suggested: 'Let’s listen and find her together.', paired: 'Yes. Stay here with me; we’ll listen for her together.' }
    ];
    els.restart.click(); els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit();
    for (const item of cases) {
      const input = story[item.id];
      const response = story[input.input.next];
      const save = { version: 1, node: item.id, answer: '', privateAnswer: 'Earlier private words.', relationship: item.name,
        flags: { companion: item.name, midpoint_route: item.name.toLowerCase(), midpoint_available: 'yes', midpoint_chat: 'yes', bond: 'care', moment: 'keep', ending: 'retreat' }, followupMemory: [] };
      for (const mode of ['custom', 'suggested']) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(save));
        els.restart.click(); els.resume.click(); await flush();
        if (mode === 'custom') {
          els.interaction.children.find(el => el.id === 'player-message').value = item.id.startsWith('mid_')
            ? 'I think the card is right and your memory is wrong.' : 'I don’t want to listen for Mira.';
          els.interaction.children.find(el => el.textContent === 'Send message →').click();
        } else {
          const option = els.interaction.children.find(el => el.textContent === item.suggested);
          assert.ok(option, `${item.id} retains its suggested message`);
          option.click();
        }
        await flush();
        assert.equal(els.status.textContent, 'WRITTEN RESPONSE');
        if (mode === 'custom') {
          assert.equal(els['story-text'].textContent, response.ai.fallback);
          assert.doesNotMatch(els['story-text'].textContent, /^(Good|Yes|Then)\b|two witnesses/i,
            `${item.id} should not claim agreement with arbitrary input`);
        } else {
          assert.equal(els['story-text'].textContent, item.paired, `${item.id} retains its paired response`);
        }
      }
    }
    assert.equal(requests, 0);
    storageData.clear(); els.restart.click();
  });

  await test('speech preserves the generated or written reply attribution through save and navigation', async () => {
    const previousAudio = globalThis.Audio, previousFetch = globalThis.fetch;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (url) => {
      if (String(url).includes('/chat')) return jsonResponse({ choices: [{ message: { content: 'I could use your help with that.' } }] });
      if (String(url).includes('/manifest.json')) return new Response('', { status: 404 });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8770';
      els['tts-engine'].value = 'kokoro'; els['settings-form'].submit();
      const restoreInput = async () => {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
      };
      await restoreInput();
      els.interaction.children.find(el => el.textContent === 'You don’t have to keep everything ready on your own.').click(); await flush();
      assert.equal(els.status.textContent, 'AI-GENERATED RESPONSE');
      els.speak.click(); await flush();
      assert.equal(els.status.textContent, 'AI-GENERATED RESPONSE · Playing speech.');
      els['stop-voice'].click();
      assert.equal(els.status.textContent, 'AI-GENERATED RESPONSE · Audio stopped.', 'stopping speech keeps attribution');
      els.speak.click(); await flush();
      document.visibilityState = 'hidden'; documentHandlers.visibilitychange();
      assert.equal(els.status.textContent, 'AI-GENERATED RESPONSE · Voice stopped while the game was in the background.');
      document.visibilityState = 'visible'; documentHandlers.visibilitychange();
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      els.speak.click(); await flush();
      assert.equal(els.status.textContent, 'AI-GENERATED RESPONSE · Playing speech.', 'saved AI attribution survives voice playback');
      els.advance.click(); await flush();
      assert.doesNotMatch(els.status.textContent, /AI-GENERATED RESPONSE/, 'attribution clears on the next passage');
      await restoreInput();
      els.interaction.children.find(el => el.textContent === 'You don’t have to keep everything ready on your own.').click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Use the written response').click(); await flush();
      els.speak.click(); await flush();
      assert.equal(els.status.textContent, 'WRITTEN RESPONSE · Playing speech.');
      els['settings-open'].click();
      assert.equal(els.status.textContent, 'WRITTEN RESPONSE · Audio stopped.', 'opening settings keeps attribution');
      els['settings-close'].click();
    } finally {
      document.visibilityState = 'visible';
      els['stop-voice'].click(); els['settings-open'].click(); els['settings-clear'].click(); els['settings-close'].click();
      storageData.clear(); els.restart.click(); globalThis.Audio = previousAudio; globalThis.fetch = previousFetch;
    }
  });

  await test('suggested messages use configured AI, retain their written fallback, and retry against the original history', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      const body = JSON.parse(request.body);
      requests.push(JSON.parse(body.messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I could use your help with that.' } }] });
    };
    const restoreInput = async () => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko' }, followupMemory: []
      }));
      els.restart.click(); els.resume.click(); await flush();
    };
    els.restart.click(); els['settings-open'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    await restoreInput();
    const option = els.interaction.children.find(el => el.textContent === 'You don’t have to keep everything ready on your own.');
    assert.ok(option);
    option.click(); await flush();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].player_says, option.textContent);
    assert.equal(els.status.textContent, 'AI-GENERATED RESPONSE');
    assert.equal(els['story-text'].textContent, 'I could use your help with that.');
    els.interaction.children.find(el => el.textContent === 'Use the written response').click();
    const paired = 'Would you help me decide what can wait? I think I’ve forgotten how.';
    assert.equal(els['story-text'].textContent, paired, 'the suggested message keeps its matching written reply');
    els.interaction.children.find(el => el.id === 'retry-initial-message').click();
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].player_says, option.textContent);
    assert.equal(requests[1].memory.length, 0, 'retry does not send its superseded answer');
    els.interaction.children.find(el => el.textContent === 'Use the written response').click();
    assert.equal(els['story-text'].textContent, paired, 'unchanged retry retains the paired response');
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What should we do first?';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.deepEqual(requests[2].memory.map(item => item.text), [option.textContent, paired]);
    els.advance.click(); await flush(); els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(saved.privateAnswer, option.textContent);
    assert.ok(saved.followupMemory.some(item => item.text === paired));

    globalThis.fetch = async () => new Response('', { status: 500 });
    await restoreInput();
    els.interaction.children.find(el => el.textContent === option.textContent).click(); await flush();
    assert.equal(els['story-text'].textContent, paired, 'a provider failure uses the matching response');
    assert.match(els.status.textContent, /failed.*scripted/i);
    els.interaction.children.find(el => el.id === 'retry-initial-message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A different question.';
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback, 'an edited message no longer uses the old suggestion’s paired response');

    globalThis.fetch = async (_url, request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    await restoreInput();
    els.interaction.children.find(el => el.textContent === option.textContent).click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Use the written response instead').click(); await flush();
    assert.equal(els['story-text'].textContent, paired, 'cancelling a pending request uses the matching response');
    storageData.clear(); els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
  });

  await test('offline suggested replies survive connection and failed retry without matching arbitrary text', async () => {
    const optionText = 'You don’t have to keep everything ready on your own.';
    const paired = 'Would you help me decide what can wait? I think I’ve forgotten how.';
    for (const mode of ['offline-suggestion', 'invalid-suggestion', 'offline-typed']) {
      let success = false;
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return success ? jsonResponse({ choices: [{ message: { content: 'A generated answer.' } }] }) : new Response('', { status: 503 });
      };
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      if (mode === 'invalid-suggestion') { els.endpoint.value = 'http://remote.invalid/chat'; els.model.value = 'test'; }
      els['settings-form'].submit();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      if (mode === 'offline-typed') {
        els.interaction.children.find(el => el.id === 'player-message').value = optionText;
        els.interaction.children.find(el => el.textContent === 'Send message →').click();
      } else els.interaction.children.find(el => el.textContent === optionText).click();
      await flush();
      const expected = mode === 'offline-typed' ? story.niko_chat.ai.fallback : paired;
      assert.equal(els['story-text'].textContent, expected);
      els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
      els.interaction.children.find(el => el.id === 'retry-initial-message').click();
      assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, optionText);
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.equal(els['story-text'].textContent, expected, `${mode} retains the correct fallback on failed unchanged retry`);
      assert.equal(requests.at(-1).player_says, optionText);
      assert.deepEqual(requests.at(-1).memory, []);
      success = true;
      els.interaction.children.find(el => el.id === 'retry-initial-message').click();
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Use the written response').click();
      assert.equal(els['story-text'].textContent, expected, `${mode} offers the correct written alternative after a successful retry`);
      success = false;
      els.interaction.children.find(el => el.id === 'retry-initial-message').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'An unrelated new question.';
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback, `${mode} edited retry does not use the original paired reply`);
      assert.equal(requests.at(-1).player_says, 'An unrelated new question.');
    }
    storageData.clear(); els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
  });

  await test('selected response cap applies to initial and follow-up requests and resets', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els['settings-open'].click();
    assert.equal(els['response-limit'].value, '100');
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['token-parameter'].value = 'max_completion_tokens';
    els['response-limit'].value = '2048'; els['settings-form'].submit();
    els['settings-open'].click(); assert.equal(els['response-limit'].value, '2048'); els['settings-close'].click();
    els.start.click(); await flush();
    for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({});
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Please continue.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests.length, 2);
    assert.ok(requests.every(body => body.max_completion_tokens === 2048 && !('max_tokens' in body)));
    els['settings-open'].click(); els['token-parameter'].value = 'none'; els['settings-form'].submit();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'One more.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.ok(!('max_tokens' in requests[2]) && !('max_completion_tokens' in requests[2]));
    els['settings-open'].click(); els['settings-clear'].click();
    assert.equal(els['response-limit'].value, '100');
    els['settings-form'].submit(); els.restart.click();
  });

  await test('Mirid text presets select the supported output parameter without changing the chosen limit', async () => {
    const previousLocation = globalThis.location;
    const previousFetch = globalThis.fetch;
    let local = { version: 1, miridPort: 18000, model: 'fixture.gguf', kokoroPort: null, nanoPort: null };
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.fetch = async () => jsonResponse(local);
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      for (const original of ['max_completion_tokens', 'none', 'max_tokens']) {
        const expected = original === 'max_completion_tokens' ? 'max_tokens' : original;
        els['token-parameter'].value = original; els['response-limit'].value = '2048';
        els['mirid-url'].value = 'http://127.0.0.1:8000'; els['mirid-preset'].click();
        assert.equal(els['token-parameter'].value, expected);
        assert.equal(els['response-limit'].value, '2048');
        assert.equal(/Output limit parameter changed to max_tokens/.test(els['mirid-status'].textContent), original === 'max_completion_tokens');
        els['token-parameter'].value = original;
        els['companion-url'].value = 'https://companion.example:9443';
        els['companion-token'].value = 'a'.repeat(32); els['companion-preset'].click();
        assert.equal(els['token-parameter'].value, expected);
        assert.equal(els['response-limit'].value, '2048');
        assert.equal(/Output limit parameter changed to max_tokens/.test(els['companion-status'].textContent), original === 'max_completion_tokens');
        els['token-parameter'].value = original;
        els['local-launcher-preset'].click(); await flush();
        assert.equal(els['token-parameter'].value, expected);
        assert.equal(els['response-limit'].value, '2048');
        assert.equal(/Output limit parameter changed to max_tokens/.test(els['mirid-status'].textContent), original === 'max_completion_tokens');
      }
      // A launcher advertising speech alone must not change any chat settings.
      local = { version: 1, miridPort: null, model: null, kokoroPort: 18770, nanoPort: null };
      els.endpoint.value = 'https://other.example/chat'; els.model.value = 'other';
      els['token-parameter'].value = 'max_completion_tokens'; els['response-limit'].value = '512';
      els['local-launcher-preset'].click(); await flush();
      assert.equal(els.endpoint.value, 'https://other.example/chat');
      assert.equal(els.model.value, 'other');
      assert.equal(els['token-parameter'].value, 'max_completion_tokens');
      assert.equal(els['response-limit'].value, '512');
      // Invalid presets do not change the chat parameter either.
      els['mirid-url'].value = 'not a URL'; els['mirid-preset'].click();
      assert.equal(els['token-parameter'].value, 'max_completion_tokens');
      els['companion-url'].value = 'https://companion.example:9443'; els['companion-token'].value = 'short'; els['companion-preset'].click();
      assert.equal(els['token-parameter'].value, 'max_completion_tokens');
      els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
    } finally { globalThis.location = previousLocation; globalThis.fetch = previousFetch; }
  });

  await test('switching a pending provider reply to Mirid cancels it and uses the chosen max_tokens limit', async () => {
    let pendingSignal, finishOld;
    const requests = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      if (requests.length === 1) { pendingSignal = request.signal; return new Promise(resolve => { finishOld = resolve; }); }
      return jsonResponse({ choices: [{ message: { content: 'The new reply.' } }] });
    };
    try {
      els.restart.click(); els['settings-open'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['token-parameter'].value = 'max_completion_tokens'; els['response-limit'].value = '512';
      els['settings-form'].submit(); els.start.click(); await flush();
      for (let i = 0; i < 120 && !pendingSignal; i++) await step({});
      assert.ok(pendingSignal && !pendingSignal.aborted);
      assert.equal(requests[0].max_completion_tokens, 512);
      els['settings-open'].click(); els['mirid-url'].value = 'http://127.0.0.1:8000';
      els['mirid-preset'].click(); els['settings-form'].submit(); await flush();
      assert.equal(pendingSignal.aborted, true);
      assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
      finishOld(jsonResponse({ choices: [{ message: { content: 'Stale old reply.' } }] })); await flush();
      assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Please continue.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests[1].max_tokens, 512);
      assert.ok(!('max_completion_tokens' in requests[1]));
      assert.equal(els['story-text'].textContent, 'The new reply.');
      els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
    } finally { globalThis.fetch = previousFetch; }
  });

  await test('provider-default response variation omits temperature for the initial reply and follow-up', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      const body = JSON.parse(request.body);
      requests.push(body);
      // Represents a provider that rejects a custom temperature value.
      if (Object.prototype.hasOwnProperty.call(body, 'temperature')) return new Response('', { status: 400 });
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els['settings-open'].click();
    assert.equal(els['model-temperature'].value, '0.8');
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['model-temperature'].value = 'default'; els['settings-form'].submit();
    els['settings-open'].click(); assert.equal(els['model-temperature'].value, 'default'); els['settings-close'].click();
    els.start.click(); await flush();
    for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({});
    assert.equal(els['story-text'].textContent, 'I am listening.');
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Please continue.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests.length, 2);
    assert.ok(requests.every(body => !Object.prototype.hasOwnProperty.call(body, 'temperature')));
    els['settings-open'].click(); els['settings-clear'].click();
    assert.equal(els['model-temperature'].value, '0.8');
    els['settings-form'].submit(); els.restart.click();
  });

  await test('changing response variation cancels an in-flight reply and uses the new setting for a follow-up', async () => {
    let pendingSignal, finishOld;
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      if (requests.length === 1) {
        pendingSignal = request.signal;
        return new Promise(resolve => { finishOld = resolve; });
      }
      return jsonResponse({ choices: [{ message: { content: 'The new reply.' } }] });
    };
    els.restart.click(); els['settings-open'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 120 && !pendingSignal; i++) await step({});
    assert.ok(pendingSignal && !pendingSignal.aborted);
    assert.equal(requests[0].temperature, 0.8);
    els['settings-open'].click(); els['model-temperature'].value = 'default';
    els['settings-form'].submit(); await flush();
    assert.equal(pendingSignal.aborted, true);
    assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
    finishOld(jsonResponse({ choices: [{ message: { content: 'Stale old reply.' } }] })); await flush();
    assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Please continue.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(els['story-text'].textContent, 'The new reply.');
    assert.equal(Object.prototype.hasOwnProperty.call(requests[1], 'temperature'), false);
    els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
  });

  await test('changing response cap cancels an in-flight request', async () => {
    let pendingSignal, finishOld;
    globalThis.fetch = async (_url, request) => {
      pendingSignal = request.signal;
      return new Promise(resolve => { finishOld = resolve; });
    };
    els.restart.click(); els['settings-open'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 120 && !pendingSignal; i++) await step({});
    assert.ok(pendingSignal && !pendingSignal.aborted);
    els['settings-open'].click(); els['response-limit'].value = '512';
    els['settings-form'].submit(); await flush();
    assert.equal(pendingSignal.aborted, true);
    assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
    finishOld(jsonResponse({ choices: [{ message: { content: 'Stale old reply.' } }] })); await flush();
    assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
    els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
  });

  await test('selected dialogue timeout is used for the first response and follow-up', async () => {
    const originalTimer = globalThis.setTimeout;
    const observed = [];
    globalThis.setTimeout = (callback, delay, ...args) => {
      observed.push(delay);
      return originalTimer(callback, delay, ...args);
    };
    globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    try {
      els.restart.click(); els['settings-open'].click();
      assert.equal(els['chat-timeout'].value, '60000');
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['chat-timeout'].value = '120000'; els['settings-form'].submit();
      els['settings-open'].click(); assert.equal(els['chat-timeout'].value, '120000'); els['settings-close'].click();
      els.start.click(); await flush();
      for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({});
      assert.equal(observed.filter(delay => delay === 120000).length, 1);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What do you think?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(observed.filter(delay => delay === 120000).length, 2);
      els['settings-open'].click(); els['settings-clear'].click();
      assert.equal(els['chat-timeout'].value, '60000');
      els['settings-form'].submit(); els.restart.click();
    } finally {
      globalThis.setTimeout = originalTimer;
    }
  });

  await test('keyboard readers can advance from the speaker without skipping choices or inputs', async () => {
    els.restart.click(); els.start.click(); await flush();
    assert.equal(document.activeElement, els.speaker);
    const key = (key, extra = {}) => {
      let prevented = false;
      els.speaker.listeners.keydown({ key, preventDefault() { prevented = true; }, ...extra });
      return prevented;
    };
    const first = els['story-text'].textContent;
    assert.equal(key('Enter', { repeat: true }), false);
    assert.equal(key(' ', { ctrlKey: true }), false);
    assert.equal(els['story-text'].textContent, first);
    assert.equal(key('Enter'), true); await flush();
    assert.notEqual(els['story-text'].textContent, first);
    const second = els['story-text'].textContent;
    assert.equal(key(' '), true); await flush();
    assert.notEqual(els['story-text'].textContent, second);
    for (let i = 0; i < 20 && !els.advance.hidden; i++) { assert.equal(key('Enter'), true); await flush(); }
    assert.equal(els.advance.hidden, true);
    const decision = els['story-text'].textContent;
    assert.equal(key('Enter'), false);
    assert.equal(els['story-text'].textContent, decision);
    els.restart.click();
    assert.equal(key('Enter'), false);
  });

  await test('a selected Chatterbox recording is uploaded only on request and assigned to one speaker', async () => {
    let requests = 0;
    globalThis.fetch = async (url, request) => {
      requests++;
      assert.equal(url, 'http://127.0.0.1:8000/tts/upload-voice');
      assert.equal(request.body.get('file').name, 'reference.wav');
      return jsonResponse({ status: 'success', voice_id: 'reference.wav' });
    };
    els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
    els['chatterbox-url'].value = 'http://127.0.0.1:8000';
    els['chatterbox-engine'].value = 'chatterbox_nano';
    els['chatterbox-target'].value = 'Narrator';
    const file = new Blob(['audio'], { type: 'audio/wav' });
    Object.defineProperty(file, 'name', { value: 'reference.wav' });
    els['chatterbox-file'].files = [file];
    assert.equal(requests, 0);
    els['chatterbox-upload'].click(); await flush();
    assert.equal(requests, 1);
    assert.equal(els['narrator-voice'].value, 'reference.wav');
    assert.equal(els['niko-voice'].value, 'am_adam');
    assert.equal(els['service-voice'].value, 'af_nicole');
    els['settings-form'].submit();
    els['settings-open'].click();
    assert.equal(els['narrator-voice'].value, 'reference.wav');
    els['chatterbox-engine'].value = 'chatterbox';
    els['chatterbox-target'].value = 'Service';
    els['chatterbox-voice'].value = 'default';
    els['chatterbox-use'].click();
    assert.equal(els['service-voice'].value, 'default');
    assert.equal(els['narrator-voice'].value, 'af_heart', 'reassigning restores the prior voice');
    assert.equal(requests, 1, 'selecting an existing voice sends no request');
    els['settings-clear'].click(); els['settings-form'].submit();
  });

  await test('reselecting a reference retains a newly entered underlying voice', async () => {
    els['settings-open'].click(); els['settings-clear'].click();
    els['chatterbox-url'].value = 'http://127.0.0.1:8001';
    els['chatterbox-engine'].value = 'chatterbox_nano';
    els['chatterbox-target'].value = 'Narrator';
    els['chatterbox-voice'].value = 'default';
    els['chatterbox-use'].click();
    assert.equal(els['narrator-voice'].value, 'default');
    els['narrator-voice'].value = 'af_sarah';
    els['narrator-voice'].listeners.input();
    els['chatterbox-use'].click();
    assert.equal(els['narrator-voice'].value, 'default');
    els['settings-form'].submit(); els['settings-open'].click();
    els['chatterbox-remove'].click();
    assert.equal(els['narrator-voice'].value, 'af_sarah', 'removing the reference restores the most recently chosen voice');
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('phone audio upload IDs and existing references can be assigned without accepting paths', async () => {
    els['settings-open'].click(); els['settings-clear'].click();
    els['chatterbox-url'].value = 'http://127.0.0.1:8000';
    els['chatterbox-engine'].value = 'chatterbox_nano';
    els['chatterbox-target'].value = 'Narrator';
    for (const name of ['reference.ogg', 'reference.opus', 'reference.aac', 'reference.mp4', 'reference.3gp', 'reference.webm']) {
      const file = new Blob(['synthetic'], { type: name.endsWith('webm') ? 'audio/webm' : 'audio/ogg' });
      Object.defineProperty(file, 'name', { value: name });
      globalThis.fetch = async (_url, request) => {
        assert.equal(request.body.get('file').name, name);
        return jsonResponse({ status: 'success', voice_id: name });
      };
      els['chatterbox-file'].files = [file];
      els['chatterbox-upload'].click(); await flush();
      assert.equal(els['narrator-voice'].value, name);
      els['chatterbox-remove'].click();
      els['chatterbox-voice'].value = name;
      els['chatterbox-use'].click();
      assert.equal(els['narrator-voice'].value, name);
    }
    els['chatterbox-voice'].value = '../reference.ogg';
    els['chatterbox-use'].click();
    assert.equal(els['narrator-voice'].value, 'reference.webm');
    assert.match(els['chatterbox-status'].textContent, /valid Mirid voice reference/);
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('voice preview uses the draft speaker and only its assigned reference without saving', async () => {
    const priorAudio = globalThis.Audio;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    const requests = [];
    globalThis.fetch = async (url, request) => {
      requests.push({ url, body: JSON.parse(request.body) });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8770';
      els['tts-engine'].value = 'kokoro'; els['niko-voice'].value = 'am_adam';
      els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
      assert.equal(requests[0].url, 'http://127.0.0.1:8770/tts');
      assert.equal(requests[0].body.voice, 'am_adam');
      els['chatterbox-target'].value = 'Narrator'; els['chatterbox-engine'].value = 'chatterbox_nano';
      els['chatterbox-url'].value = 'http://127.0.0.1:8771'; els['chatterbox-voice'].value = 'synthetic-reference.wav';
      els['chatterbox-use'].click();
      els['voice-preview-speaker'].value = 'Narrator'; els['voice-preview'].click(); await flush();
      assert.equal(requests[1].url, 'http://127.0.0.1:8771/tts');
      assert.equal(requests[1].body.voice, 'synthetic-reference.wav');
      assert.equal(requests[1].body.engine, 'chatterbox_nano');
      els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
      assert.equal(requests[2].url, 'http://127.0.0.1:8770/tts');
      assert.equal(requests[2].body.voice, 'am_adam');
      els['settings-close'].click(); els['settings-open'].click();
      assert.notEqual(els['narrator-voice'].value, 'synthetic-reference.wav', 'preview and closing must not save the draft');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.Audio = priorAudio; }
  });

  await test('closing settings cancels an in-flight voice preview', async () => {
    let requestSignal;
    globalThis.fetch = (_url, request) => {
      requestSignal = request.signal;
      return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))));
    };
    els['settings-open'].click(); els['settings-clear'].click();
    els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8770';
    els['tts-engine'].value = 'kokoro'; els['voice-preview-speaker'].value = 'Niko';
    els['voice-preview'].click(); await flush();
    assert.ok(requestSignal && !requestSignal.aborted);
    els['settings-close'].click(); await flush();
    assert.equal(requestSignal.aborted, true);
    assert.equal(els['voice-preview-status'].textContent, 'Voice preview stopped.');
  });

  await test('backgrounding cancels an in-flight voice preview', async () => {
    let signal;
    const previousVisibility = document.visibilityState;
    globalThis.fetch = (_url, request) => {
      signal = request.signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))));
    };
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8770';
      els['tts-engine'].value = 'kokoro'; els['voice-preview-speaker'].value = 'Niko';
      els['voice-preview'].click(); await flush();
      document.visibilityState = 'hidden'; documentHandlers.visibilitychange(); await flush();
      assert.equal(signal.aborted, true);
      assert.equal(els['voice-preview-status'].textContent, 'Voice preview stopped.');
      els['settings-close'].click();
    } finally { document.visibilityState = previousVisibility; documentHandlers.visibilitychange(); }
  });

  await test('a completed launcher preset cancels a preview using the old draft', async () => {
    const oldLocation = globalThis.location;
    let finishSetup, previewSignal;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.fetch = (url, request) => {
      if (String(url).includes('/.well-known/oki-doki-local.json')) return new Promise(resolve => { finishSetup = resolve; });
      previewSignal = request.signal;
      return new Promise((_resolve, reject) => previewSignal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))));
    };
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8770';
      els['tts-engine'].value = 'kokoro'; els['voice-preview-speaker'].value = 'Niko';
      els['local-launcher-preset'].click(); els['voice-preview'].click(); await flush();
      assert.ok(previewSignal && !previewSignal.aborted);
      finishSetup(new Response(JSON.stringify({ version: 1, miridPort: 8000, model: 'model.gguf', kokoroPort: 8771, nanoPort: null })));
      await flush();
      assert.equal(previewSignal.aborted, true);
      assert.equal(els['tts-url'].value, 'http://127.0.0.1:8771');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = oldLocation; }
  });

  await test('a completed reference upload cancels a preview using the old assignment', async () => {
    let finishUpload, previewSignal;
    globalThis.fetch = (url, request) => {
      if (String(url).endsWith('/tts/upload-voice')) return new Promise(resolve => { finishUpload = resolve; });
      previewSignal = request.signal;
      return new Promise((_resolve, reject) => previewSignal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))));
    };
    els['settings-open'].click(); els['settings-clear'].click();
    els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8770';
    els['tts-engine'].value = 'kokoro'; els['voice-preview-speaker'].value = 'Narrator';
    els['chatterbox-url'].value = 'http://127.0.0.1:8771'; els['chatterbox-engine'].value = 'chatterbox_nano';
    els['chatterbox-target'].value = 'Narrator';
    const file = new Blob(['synthetic audio'], { type: 'audio/wav' });
    Object.defineProperty(file, 'name', { value: 'synthetic.wav' });
    els['chatterbox-file'].files = [file];
    els['chatterbox-upload'].click(); els['voice-preview'].click(); await flush();
    assert.ok(previewSignal && !previewSignal.aborted);
    finishUpload(jsonResponse({ status: 'success', voice_id: 'synthetic.wav' })); await flush();
    assert.equal(previewSignal.aborted, true);
    assert.equal(els['narrator-voice'].value, 'synthetic.wav');
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('blank OpenAI preview voices use the same provider default as story playback', async () => {
    const priorAudio = globalThis.Audio;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    let body;
    globalThis.fetch = async (_url, request) => {
      body = JSON.parse(request.body);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'openai'; els['speech-url'].value = 'https://speech.example';
      els['narrator-voice'].value = 'a-different-voice'; els['niko-voice'].value = '';
      els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
      assert.equal(body.voice, 'alloy');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.Audio = priorAudio; }
  });

  await test('local launcher fills a session draft and preserves the unassigned Nano address', async () => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.fetch = async () => new Response(JSON.stringify({ version: 1, miridPort: 8000, model: 'model.gguf', kokoroPort: 8770, nanoPort: 8001 }));
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els['chatterbox-file'].files = [];
      els['local-launcher-preset'].click(); await flush();
      assert.equal(els.endpoint.value, 'http://127.0.0.1:8000/v1/chat/completions');
      assert.equal(els.model.value, 'model.gguf');
      assert.equal(els['speech-mode'].value, 'mirid-local-kokoro');
      assert.equal(els['tts-url'].value, 'http://127.0.0.1:8770');
      assert.equal(els['tts-mode'].value, 'mirid');
      assert.equal(els['chatterbox-url'].value, 'http://127.0.0.1:8001');
      assert.equal(els['chatterbox-voice'].value, '');
      assert.equal(els['niko-voice'].value, 'am_adam');
      els['settings-form'].submit(); els['settings-open'].click();
      assert.equal(els['chatterbox-url'].value, 'http://127.0.0.1:8001');
      assert.equal(els['chatterbox-voice'].value, '');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = previousLocation; }
  });

  await test('speech-only launcher preserves existing text and transcription settings', async () => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.fetch = async () => new Response(JSON.stringify({ version: 1, miridPort: null, model: null, kokoroPort: 8770, nanoPort: 8001 }));
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els.endpoint.value = 'https://example.test/v1/chat/completions'; els.model.value = 'existing-model';
      els['api-key'].value = 'existing-key'; els['speech-mode'].value = 'openai';
      els['speech-url'].value = 'https://example.test'; els['speech-key'].value = 'existing-speech-key';
      els['chatterbox-file'].files = [];
      els['local-launcher-preset'].click(); await flush();
      assert.equal(els.endpoint.value, 'https://example.test/v1/chat/completions');
      assert.equal(els.model.value, 'existing-model'); assert.equal(els['api-key'].value, 'existing-key');
      assert.equal(els['speech-mode'].value, 'openai'); assert.equal(els['speech-url'].value, 'https://example.test');
      assert.equal(els['speech-key'].value, 'existing-speech-key');
      assert.equal(els['tts-url'].value, 'http://127.0.0.1:8770'); assert.equal(els['tts-mode'].value, 'mirid');
      assert.equal(els['chatterbox-url'].value, 'http://127.0.0.1:8001');
      assert.equal(els['chatterbox-voice'].value, '');
      assert.match(els['mirid-status'].textContent, /Text and transcription settings are unchanged/);
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = previousLocation; }
  });

  await test('Mirid without Parakeet preserves transcription settings while enabling text', async () => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    try {
      for (const kokoroPort of [null, 8770]) {
        globalThis.fetch = async () => new Response(JSON.stringify({ version: 2, miridPort: 8000, model: 'model.gguf', kokoroPort, nanoPort: null, asrAvailable: false }));
        els['settings-open'].click(); els['settings-clear'].click();
        els['speech-mode'].value = 'openai';
        els['speech-url'].value = 'https://speech.example.test';
        els['speech-key'].value = 'speech-key';
        els['asr-engine'].value = 'previous-engine';
        els['local-launcher-preset'].click(); await flush();
        assert.equal(els.endpoint.value, 'http://127.0.0.1:8000/v1/chat/completions');
        assert.equal(els.model.value, 'model.gguf');
        assert.equal(els['speech-mode'].value, 'openai');
        assert.equal(els['speech-url'].value, 'https://speech.example.test');
        assert.equal(els['speech-key'].value, 'speech-key');
        assert.equal(els['asr-engine'].value, 'previous-engine');
        if (kokoroPort) {
          assert.equal(els['tts-url'].value, 'http://127.0.0.1:8770');
          assert.equal(els['tts-mode'].value, 'mirid');
          assert.match(els['mirid-status'].textContent, /Kokoro.*Parakeet is unavailable.*transcription settings are unchanged/i);
        } else {
          assert.match(els['mirid-status'].textContent, /Local text selected.*Parakeet is unavailable.*speech settings are unchanged/i);
        }
        els['settings-form'].submit(); els['settings-open'].click();
        assert.equal(els['speech-mode'].value, 'openai');
        assert.equal(els['speech-url'].value, 'https://speech.example.test');
        assert.equal(els['asr-engine'].value, 'previous-engine');
        els['settings-clear'].click(); els['settings-close'].click();
      }
    } finally { globalThis.location = previousLocation; }
  });

  await test('text-only launcher preserves a separate voice service and its protocol', async () => {
    const previousLocation = globalThis.location;
    const priorAudio = globalThis.Audio;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    let previewRequest;
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/.well-known/oki-doki-local.json')) {
        return new Response(JSON.stringify({ version: 1, miridPort: 8000, model: 'model.gguf', kokoroPort: null, nanoPort: null }));
      }
      previewRequest = { url: String(url), body: JSON.parse(options.body), authorization: options.headers.Authorization };
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid';
      els['tts-url'].value = 'https://kokoro.example.test';
      els['tts-key'].value = 'voice-key';
      els['tts-mode'].value = ''; // inherited from the previous speech mode
      els['tts-engine'].value = 'kokoro';
      els['niko-voice'].value = 'am_adam';
      els['local-launcher-preset'].click(); await flush();
      assert.equal(els['speech-mode'].value, 'mirid-local-kokoro');
      assert.equal(els['tts-url'].value, 'https://kokoro.example.test');
      assert.equal(els['tts-key'].value, 'voice-key');
      assert.equal(els['tts-mode'].value, 'mirid');
      assert.equal(els['tts-engine'].value, 'kokoro');
      assert.match(els['mirid-status'].textContent, /existing read-aloud settings are unchanged/);
      els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
      assert.equal(previewRequest.url, 'https://kokoro.example.test/tts');
      assert.equal(previewRequest.body.voice, 'am_adam');
      assert.equal(previewRequest.body.engine, 'kokoro');
      assert.equal(previewRequest.authorization, 'Bearer voice-key');
      els['settings-form'].submit(); els['settings-open'].click();
      assert.equal(els['tts-url'].value, 'https://kokoro.example.test');
      assert.equal(els['tts-mode'].value, 'mirid');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = previousLocation; globalThis.Audio = priorAudio; }
  });

  await test('text-only launcher preserves Realtime and inherited read-aloud settings without promising a voice', async () => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.fetch = async () => new Response(JSON.stringify({ version: 1, miridPort: 8000, model: 'model.gguf', kokoroPort: null, nanoPort: null }));
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els['tts-provider'].value = 'realtime';
      els['realtime-url'].value = 'https://companion.example.test';
      els['realtime-token'].value = 'paired';
      els['realtime-voice'].value = 'marin';
      els['local-launcher-preset'].click(); await flush();
      assert.equal(els['tts-provider'].value, 'realtime');
      assert.equal(els['realtime-url'].value, 'https://companion.example.test');
      assert.equal(els['realtime-token'].value, 'paired');
      assert.match(els['mirid-status'].textContent, /existing read-aloud settings are unchanged/);
      els['settings-clear'].click();
      els['local-launcher-preset'].click(); await flush();
      assert.equal(els['tts-provider'].value, 'standard');
      assert.equal(els['tts-url'].value, 'http://127.0.0.1:8000');
      assert.equal(els['tts-mode'].value, 'mirid');
      assert.match(els['mirid-status'].textContent, /No Kokoro read-aloud service was started/);
      assert.doesNotMatch(els['mirid-status'].textContent, /fixed voice/);
      els['settings-clear'].click();
      els['speech-mode'].value = 'openai';
      els['speech-url'].value = 'https://voice.example.test';
      els['speech-key'].value = 'inherited-test-key';
      els['local-launcher-preset'].click(); await flush();
      assert.equal(els['speech-url'].value, 'http://127.0.0.1:8000');
      assert.equal(els['speech-mode'].value, 'mirid-local-kokoro');
      assert.equal(els['tts-url'].value, 'https://voice.example.test');
      assert.equal(els['tts-mode'].value, 'openai');
      assert.equal(els['tts-key'].value, 'inherited-test-key');
      assert.match(els['mirid-status'].textContent, /existing read-aloud settings are unchanged/);
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = previousLocation; }
  });

  await test('text-only launcher retains inherited read-aloud routing and credentials', async () => {
    const previousLocation = globalThis.location, previousAudio = globalThis.Audio;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    let request;
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/.well-known/oki-doki-local.json')) {
        return new Response(JSON.stringify({ version: 1, miridPort: 8000, model: 'model.gguf', kokoroPort: null, nanoPort: null }));
      }
      request = { url: String(url), authorization: options.headers.Authorization };
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'openai'; els['speech-url'].value = 'https://voice.example.test';
      els['speech-key'].value = 'synthetic-key';
      els['local-launcher-preset'].click(); await flush();
      els['voice-preview-speaker'].value = 'Niko'; els['voice-preview'].click(); await flush();
      assert.equal(request.url, 'https://voice.example.test/v1/audio/speech');
      assert.equal(request.authorization, 'Bearer synthetic-key');
      els['settings-form'].submit(); els['settings-open'].click();
      assert.equal(els['tts-url'].value, 'https://voice.example.test');
      assert.equal(els['tts-mode'].value, 'openai');
      assert.equal(els['tts-key'].value, 'synthetic-key');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = previousLocation; globalThis.Audio = previousAudio; }
  });

  await test('changing settings cancels a pending launcher preset', async () => {
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    let finish, signal;
    globalThis.fetch = (_url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); };
    try {
      els['settings-open'].click(); els['local-launcher-preset'].click();
      els.endpoint.value = 'https://chosen.example/chat';
      els['settings-form'].listeners.input();
      assert.ok(signal.aborted);
      finish(new Response(JSON.stringify({ version: 1, miridPort: 8000, model: 'model.gguf', kokoroPort: 8770, nanoPort: null })));
      await flush();
      assert.equal(els.endpoint.value, 'https://chosen.example/chat');
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = previousLocation; }
  });

  await test('reopening speech settings shows the saved reference rather than a cancelled draft', async () => {
    els['settings-open'].click(); els['settings-clear'].click();
    els['chatterbox-url'].value = 'http://127.0.0.1:8001';
    els['chatterbox-key'].value = 'session-key';
    els['chatterbox-engine'].value = 'chatterbox_nano';
    els['chatterbox-target'].value = 'Service';
    els['chatterbox-voice'].value = 'reference.wav';
    els['chatterbox-use'].click(); els['settings-form'].submit();

    els['settings-open'].click();
    els['chatterbox-target'].value = 'Mira';
    els['chatterbox-engine'].value = 'chatterbox';
    els['chatterbox-url'].value = 'https://draft.example';
    els['chatterbox-key'].value = 'draft-key';
    els['chatterbox-voice'].value = 'different.wav';
    els['chatterbox-use'].click();
    assert.equal(els['service-voice'].value, 'af_nicole');
    els['settings-close'].click(); els['settings-open'].click();
    assert.equal(els['chatterbox-target'].value, 'Service');
    assert.equal(els['chatterbox-engine'].value, 'chatterbox_nano');
    assert.equal(els['chatterbox-url'].value, 'http://127.0.0.1:8001');
    assert.equal(els['chatterbox-key'].value, 'session-key');
    assert.equal(els['chatterbox-voice'].value, 'reference.wav');
    assert.equal(els['service-voice'].value, 'reference.wav');
    assert.equal(els['mira-voice'].value, 'af_bella');
    assert.match(els['chatterbox-status'].textContent, /in use for Service/);

    els['chatterbox-remove'].click(); els['settings-form'].submit();
    els['settings-open'].click();
    assert.equal(els['chatterbox-target'].value, 'Narrator');
    assert.equal(els['chatterbox-voice'].value, '');
    assert.equal(els['chatterbox-key'].value, '');
    assert.match(els['chatterbox-status'].textContent, /Select an engine and reference/);
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('changing speech settings cancels a pending reference upload and ignores a late response', async () => {
    let finish, requestSignal;
    globalThis.fetch = async (_url, request) => {
      requestSignal = request.signal;
      return new Promise(resolve => { finish = resolve; });
    };
    els['settings-open'].click();
    els['chatterbox-url'].value = 'http://127.0.0.1:8000';
    els['chatterbox-engine'].value = 'chatterbox_nano';
    const file = new Blob(['audio'], { type: 'audio/wav' });
    Object.defineProperty(file, 'name', { value: 'reference.wav' });
    els['chatterbox-file'].files = [file];
    els['chatterbox-upload'].click(); await flush();
    assert.ok(requestSignal && !requestSignal.aborted);
    els['chatterbox-url'].value = 'https://other.example';
    els['chatterbox-url'].listeners.change();
    assert.ok(requestSignal.aborted);
    finish(jsonResponse({ status: 'success', voice_id: 'reference.wav' }));
    await flush();
    assert.notEqual(els['tts-engine'].value, 'chatterbox_nano');
    assert.match(els['chatterbox-status'].textContent, /may already have saved/);
    els['settings-clear'].click(); els['settings-form'].submit();
  });

  await test('saving while a reference uploads keeps the upload and settings open', async () => {
    let finish, requestSignal;
    globalThis.fetch = async (_url, request) => {
      requestSignal = request.signal;
      return new Promise(resolve => { finish = resolve; });
    };
    els['settings-open'].click(); els['settings-clear'].click();
    els['chatterbox-url'].value = 'http://127.0.0.1:8000';
    const file = new Blob(['audio'], { type: 'audio/wav' });
    Object.defineProperty(file, 'name', { value: 'reference.wav' });
    els['chatterbox-file'].files = [file];
    els['chatterbox-upload'].click(); await flush();
    els['settings-form'].submit();
    assert.equal(requestSignal.aborted, false);
    assert.equal(els['settings-dialog'].hidden, false);
    assert.match(els['chatterbox-status'].textContent, /still in progress/);
    finish(jsonResponse({ status: 'success', voice_id: 'reference.wav' }));
    await flush();
    assert.equal(els['narrator-voice'].value, 'reference.wav');
    els['settings-form'].submit();
    assert.equal(els['settings-dialog'].hidden, true);
    els['settings-open'].click();
    assert.equal(els['narrator-voice'].value, 'reference.wav');
    els['settings-clear'].click(); els['settings-form'].submit();
  });

  await test('typing an existing reference ID cancels a pending upload and preserves the new ID', async () => {
    let finish, requestSignal;
    globalThis.fetch = async (_url, request) => {
      requestSignal = request.signal;
      return new Promise(resolve => { finish = resolve; });
    };
    els['settings-open'].click(); els['settings-clear'].click();
    els['chatterbox-url'].value = 'http://127.0.0.1:8000';
    const file = new Blob(['audio'], { type: 'audio/wav' });
    Object.defineProperty(file, 'name', { value: 'upload.wav' });
    els['chatterbox-file'].files = [file];
    els['chatterbox-upload'].click(); await flush();
    assert.ok(requestSignal && !requestSignal.aborted);
    els['chatterbox-voice'].value = 'existing.wav';
    els['chatterbox-voice'].listeners.input?.();
    assert.ok(requestSignal.aborted, 'editing the ID cancels the old request immediately');
    finish(jsonResponse({ status: 'success', voice_id: 'upload.wav' }));
    await flush();
    assert.equal(els['chatterbox-voice'].value, 'existing.wav');
    assert.equal(els['narrator-voice'].value, 'af_heart');
    assert.match(els['chatterbox-status'].textContent, /may already have saved/);
    els['settings-clear'].click(); els['settings-form'].submit();
  });

  await test('removing the reference during upload preserves its cancellation notice', async () => {
    let finish, requestSignal;
    globalThis.fetch = async (_url, request) => {
      requestSignal = request.signal;
      return new Promise(resolve => { finish = resolve; });
    };
    els['settings-open'].click(); els['settings-clear'].click();
    els['chatterbox-url'].value = 'http://127.0.0.1:8000';
    const file = new Blob(['audio'], { type: 'audio/wav' });
    Object.defineProperty(file, 'name', { value: 'reference.wav' });
    els['chatterbox-file'].files = [file];
    els['chatterbox-upload'].click(); await flush();
    els['chatterbox-remove'].click();
    assert.ok(requestSignal.aborted);
    assert.match(els['chatterbox-status'].textContent, /may already have saved/);
    finish(jsonResponse({ status: 'success', voice_id: 'reference.wav' }));
    await flush();
    assert.match(els['chatterbox-status'].textContent, /may already have saved/);
    els['settings-clear'].click(); els['settings-form'].submit();
  });

  await test('blank companion voice fields use each speaker’s Kokoro voice for preview and saved playback', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const requests = [];
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (url, request) => {
      requests.push({ url: String(url), body: JSON.parse(request.body) });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['companion-url'].value = 'https://phone-companion.example:9443';
      els['companion-token'].value = 'test-pairing-token-with-at-least-32-characters';
      els['companion-preset'].click();
      const defaults = { Narrator:'af_heart', You:'af_sarah', Service:'af_nicole', Niko:'am_adam', Mira:'af_bella', Ash:'bm_george', Mallow:'bf_emma' };
      for (const [name, expected] of Object.entries(defaults)) {
        els[`${name.toLowerCase()}-voice`].value = '';
        els[`${name.toLowerCase()}-voice`].listeners.input();
        els['voice-preview-speaker'].value = name;
        els['voice-preview'].click(); await flush();
        assert.equal(requests.at(-1).body.voice, expected, `${name} blank preview`);
        assert.equal(requests.at(-1).url, 'https://phone-companion.example:9443/v1/audio/speech');
      }
      els['tts-url'].value = 'https://phone-companion.example:9443/v1/audio/speech/';
      els['tts-url'].listeners.change();
      els['niko-voice'].value = ''; els['niko-voice'].listeners.input();
      els['voice-preview-speaker'].value = 'Niko';
      els['voice-preview'].click(); await flush();
      assert.equal(requests.at(-1).body.voice, 'am_adam', 'the companion’s full speech endpoint uses the same default');
      els['tts-url'].value = '';
      els['settings-form'].submit();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_fun', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.resume.click(); await flush(); els.speak.click(); await flush();
      assert.equal(requests.at(-1).body.voice, 'am_adam', 'saved blank Niko voice uses its companion default');
      els['settings-open'].click();
      els['tts-url'].value = 'https://another-speech.example';
      els['voice-preview-speaker'].value = 'Niko';
      els['voice-preview'].click(); await flush();
      assert.equal(requests.at(-1).body.voice, 'alloy', 'a different OpenAI-compatible endpoint retains its own default');
      els['tts-url'].value = '';
      els['niko-voice'].value = 'chosen_voice';
      els['voice-preview'].click(); await flush();
      assert.equal(requests.at(-1).body.voice, 'chosen_voice', 'an explicit voice is never overwritten');
      els['chatterbox-url'].value = 'http://127.0.0.1:8001'; els['chatterbox-engine'].value = 'chatterbox_nano';
      els['chatterbox-target'].value = 'Niko'; els['chatterbox-voice'].value = 'reference.wav'; els['chatterbox-use'].click();
      els['voice-preview'].click(); await flush();
      assert.equal(requests.at(-1).body.voice, 'reference.wav', 'the assigned Chatterbox reference remains selected');
      assert.equal(requests.at(-1).url, 'http://127.0.0.1:8001/tts');
    } finally {
      els['settings-clear'].click(); els['settings-close'].click(); storageData.clear(); els.restart.click();
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
    }
  });

  await test('the phone companion preset retains distinct Kokoro voices and custom choices', async () => {
    els['settings-open'].click(); els['settings-clear'].click();
    els['companion-url'].value = 'https://phone-companion.example:9443';
    els['companion-token'].value = 'test-pairing-token-with-at-least-32-characters';
    els['ash-voice'].value = 'bm_custom';
    els['companion-preset'].click();
    for (const [name, expected] of Object.entries({ narrator:'af_heart', you:'af_sarah', service:'af_nicole', niko:'am_adam', mira:'af_bella', ash:'bm_custom', mallow:'bf_emma' })) {
      assert.equal(els[`${name}-voice`].value, expected, name);
    }
    assert.equal(els['speech-mode'].value, 'openai');
    assert.equal(els['speech-url'].value, 'https://phone-companion.example:9443');
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('changing transcription provider preserves distinct voices for separate Kokoro read-aloud', async () => {
    const defaults = { narrator:'af_heart', you:'af_sarah', service:'af_nicole', niko:'am_adam', mira:'af_bella', ash:'bm_george', mallow:'bf_emma' };
    const priorAudio = globalThis.Audio;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    const calls = [];
    globalThis.fetch = async (url, request) => {
      calls.push({ url, body: JSON.parse(request.body) });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['tts-url'].value = 'http://127.0.0.1:8770'; els['tts-mode'].value = 'mirid'; els['tts-mode'].listeners.change();
      els['speech-mode'].value = 'openai'; els['speech-mode'].listeners.change();
      for (const [name, expected] of Object.entries(defaults)) assert.equal(els[`${name}-voice`].value, expected, name);
      els['settings-form'].submit(); els.start.click(); els.speak.click(); await flush();
      assert.equal(calls.at(-1).url, 'http://127.0.0.1:8770/tts');
      assert.equal(calls.at(-1).body.voice, 'af_heart');
      els['settings-open'].click();
      // Selecting another read-aloud protocol, rather than another ASR
      // protocol, still changes automatically inserted defaults.
      els['tts-mode'].value = 'openai'; els['tts-mode'].listeners.change();
      for (const name of Object.keys(defaults)) assert.equal(els[`${name}-voice`].value, 'alloy', name);
      els['tts-mode'].value = 'mirid'; els['tts-mode'].listeners.change();
      for (const [name, expected] of Object.entries(defaults)) assert.equal(els[`${name}-voice`].value, expected, name);
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.Audio = priorAudio; }
  });

  await test('the phone preset replaces automatic OpenAI placeholders but preserves manually entered voices', async () => {
    const defaults = { narrator:'af_heart', you:'af_sarah', service:'af_nicole', niko:'am_adam', mira:'af_bella', ash:'bm_george', mallow:'bf_emma' };
    const chooseCompanion = () => {
      els['companion-url'].value = 'https://phone-companion.example:9443';
      els['companion-token'].value = 'test-pairing-token-with-at-least-32-characters';
      els['companion-preset'].click();
    };
    els['settings-open'].click(); els['settings-clear'].click();
    els['speech-mode'].value = 'openai'; els['speech-mode'].listeners.change();
    for (const name of Object.keys(defaults)) assert.equal(els[`${name}-voice`].value, 'alloy');
    // Manual editing counts even if the typed value happens to equal alloy.
    els['ash-voice'].value = 'alloy'; els['ash-voice'].listeners.input();
    els['mira-voice'].value = 'bm_custom'; els['mira-voice'].listeners.input();
    els['settings-form'].submit(); els['settings-open'].click();
    chooseCompanion();
    for (const [name, expected] of Object.entries(defaults)) {
      assert.equal(els[`${name}-voice`].value, name === 'ash' ? 'alloy' : name === 'mira' ? 'bm_custom' : expected, name);
    }
    assert.match(els['companion-status'].textContent, /not supported/);

    els['settings-clear'].click();
    els['speech-mode'].value = 'openai'; els['speech-mode'].listeners.change();
    chooseCompanion();
    for (const [name, expected] of Object.entries(defaults)) assert.equal(els[`${name}-voice`].value, expected, name);
    assert.doesNotMatch(els['companion-status'].textContent, /not supported/);

    // A reference may temporarily replace an automatic provider placeholder.
    // Removing it after save/reopen must recover the placeholder's provenance.
    els['settings-clear'].click();
    els['speech-mode'].value = 'openai'; els['speech-mode'].listeners.change();
    els['chatterbox-url'].value = 'http://127.0.0.1:8001';
    els['chatterbox-engine'].value = 'chatterbox_nano';
    els['chatterbox-target'].value = 'Narrator'; els['chatterbox-voice'].value = 'default';
    els['chatterbox-use'].click(); els['settings-form'].submit(); els['settings-open'].click();
    els['chatterbox-remove'].click();
    assert.equal(els['narrator-voice'].value, 'alloy');
    chooseCompanion();
    for (const [name, expected] of Object.entries(defaults)) assert.equal(els[`${name}-voice`].value, expected, name);
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('switching protocols and local presets preserve manually entered provider voice IDs', async () => {
    const defaults = { narrator:'af_heart', you:'af_sarah', service:'af_nicole', niko:'am_adam', mira:'af_bella', ash:'bm_george', mallow:'bf_emma' };
    const prepare = () => {
      els['settings-clear'].click();
      els['speech-mode'].value = 'openai'; els['speech-mode'].listeners.change();
      els['ash-voice'].value = 'alloy'; els['ash-voice'].listeners.input();
    };
    const check = () => {
      for (const [name, expected] of Object.entries(defaults))
        assert.equal(els[`${name}-voice`].value, name === 'ash' ? 'alloy' : expected, name);
    };
    const previousLocation = globalThis.location;
    globalThis.location = { href: 'http://127.0.0.1:8766/' };
    globalThis.fetch = async () => new Response(JSON.stringify({ version: 1, miridPort: null, model: null, kokoroPort: 8770, nanoPort: null }));
    try {
      els['settings-open'].click(); prepare();
      els['speech-mode'].value = 'mirid'; els['speech-mode'].listeners.change(); check();
      prepare();
      els['tts-mode'].value = 'mirid'; els['tts-mode'].listeners.change(); check();
      prepare();
      els['mirid-url'].value = 'http://127.0.0.1:8000'; els['mirid-preset'].click(); check();
      prepare();
      // Persist manual provenance across a save and reopen before applying the preset.
      els['settings-form'].submit(); els['settings-open'].click();
      els['local-launcher-preset'].click(); await flush(); check();
      els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.location = previousLocation; }
  });

  await test('endpoint-only changes adapt automatic companion and provider voices without replacing chosen voices', async () => {
    els['settings-open'].click(); els['settings-clear'].click();
    els['companion-url'].value = 'https://phone-companion.example:9443';
    els['companion-token'].value = 'test-pairing-token-with-at-least-32-characters';
    els['companion-preset'].click();
    els['niko-voice'].value = 'custom_voice'; els['niko-voice'].listeners.input();
    els['chatterbox-url'].value = 'http://127.0.0.1:8001';
    els['chatterbox-engine'].value = 'chatterbox_nano';
    els['chatterbox-target'].value = 'Mira'; els['chatterbox-voice'].value = 'default';
    els['chatterbox-use'].click();
    els['tts-url'].value = 'https://different-provider.example';
    els['tts-url'].listeners.change();
    assert.equal(els['narrator-voice'].value, 'alloy');
    assert.equal(els['niko-voice'].value, 'custom_voice');
    assert.equal(els['mira-voice'].value, 'default');
    els['settings-form'].submit(); els['settings-open'].click();
    els['tts-url'].value = ''; els['tts-url'].listeners.change();
    assert.equal(els['narrator-voice'].value, 'af_heart');
    assert.equal(els['niko-voice'].value, 'custom_voice');
    assert.equal(els['mira-voice'].value, 'default');
    els['chatterbox-remove'].click();
    assert.equal(els['mira-voice'].value, 'af_bella');
    // The transcription URL is the effective voice URL only when the
    // separate read-aloud URL is blank.
    els['speech-url'].value = 'https://different-provider.example';
    els['speech-url'].listeners.change();
    assert.equal(els['narrator-voice'].value, 'alloy');
    els['tts-url'].value = 'https://phone-companion.example:9443';
    els['tts-url'].listeners.change();
    assert.equal(els['narrator-voice'].value, 'af_heart');
    els['speech-url'].value = 'https://third-provider.example';
    els['speech-url'].listeners.change();
    assert.equal(els['narrator-voice'].value, 'af_heart');
    assert.equal(els['niko-voice'].value, 'custom_voice');
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('phone companion restores a supported voice after reference removal or reassignment', async () => {
    const reference = name => {
      els['chatterbox-url'].value = 'http://127.0.0.1:8001';
      els['chatterbox-engine'].value = 'chatterbox_nano';
      els['chatterbox-target'].value = name; els['chatterbox-voice'].value = 'default';
      els['chatterbox-use'].click();
    };
    const chooseCompanion = () => {
      els['companion-url'].value = 'https://phone-companion.example:9443';
      els['companion-token'].value = 'test-pairing-token-with-at-least-32-characters';
      els['companion-preset'].click();
    };
    els['settings-open'].click();
    for (const from of ['mirid', 'openai']) {
      for (const action of ['remove', 'reassign']) {
        els['settings-clear'].click();
        els['speech-mode'].value = from; els['speech-mode'].listeners.change();
        reference('Narrator'); chooseCompanion();
        els['settings-form'].submit(); els['settings-open'].click();
        // A round trip through an explicit TTS protocol must keep the
        // companion's Kokoro voices, despite its OpenAI-compatible API.
        els['tts-mode'].value = 'mirid'; els['tts-mode'].listeners.change();
        els['tts-mode'].value = ''; els['tts-mode'].listeners.change();
        assert.equal(els['niko-voice'].value, 'am_adam');
        if (action === 'remove') els['chatterbox-remove'].click();
        else reference('Mira');
        assert.equal(els['narrator-voice'].value, 'af_heart', `${from}, ${action}`);
        if (action === 'reassign') assert.equal(els['mira-voice'].value, 'default');
        els['settings-form'].submit(); els['settings-open'].click();
        assert.equal(els['narrator-voice'].value, 'af_heart');
      }
    }
    // Selecting a different read-aloud endpoint must still use generic
    // OpenAI behavior, not the remembered companion's voice family.
    els['settings-clear'].click(); reference('Narrator'); chooseCompanion();
    els['tts-url'].value = 'https://different-provider.example';
    els['tts-mode'].value = 'openai'; els['tts-mode'].listeners.change();
    els['chatterbox-remove'].click();
    assert.equal(els['narrator-voice'].value, 'alloy');
    // A deliberate custom ID is never replaced by the companion preset.
    els['settings-clear'].click();
    els['narrator-voice'].value = 'custom_voice'; els['narrator-voice'].listeners.input();
    reference('Narrator'); chooseCompanion();
    els['settings-form'].submit(); els['settings-open'].click();
    els['chatterbox-remove'].click();
    assert.equal(els['narrator-voice'].value, 'custom_voice');
    // Clear must forget the old companion identity even if an endpoint is
    // entered again manually as an ordinary OpenAI-compatible service.
    els['settings-clear'].click(); reference('Narrator');
    els['speech-url'].value = 'https://phone-companion.example:9443';
    els['speech-mode'].value = 'openai'; els['speech-mode'].listeners.change();
    els['chatterbox-remove'].click();
    assert.equal(els['narrator-voice'].value, 'alloy');
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('restoring a reference voice uses the current provider without replacing manual choices', async () => {
    const chooseReference = name => {
      els['chatterbox-url'].value = 'http://127.0.0.1:8001';
      els['chatterbox-engine'].value = 'chatterbox_nano';
      els['chatterbox-target'].value = name; els['chatterbox-voice'].value = 'default';
      els['chatterbox-use'].click();
    };
    const changeMode = mode => { els['tts-mode'].value = mode; els['tts-mode'].listeners.change(); };
    els['settings-open'].click();
    for (const [from, to, expected] of [['mirid', 'openai', 'alloy'], ['openai', 'mirid', 'af_heart']]) {
      for (const operation of ['remove', 'reassign']) {
        els['settings-clear'].click(); changeMode(from); chooseReference('Narrator');
        // The other voices adapt immediately, while the chosen speaker keeps
        // the reference until it is removed or assigned elsewhere.
        changeMode(to);
        assert.equal(els['narrator-voice'].value, 'default');
        assert.equal(els['niko-voice'].value, to === 'openai' ? 'alloy' : 'am_adam');
        // Check the underlying automatic value also survives save/reopen.
        els['settings-form'].submit(); els['settings-open'].click();
        if (operation === 'remove') els['chatterbox-remove'].click();
        else chooseReference('Mira');
        assert.equal(els['narrator-voice'].value, expected, `${from} → ${to}: ${operation}`);
        if (operation === 'reassign') assert.equal(els['mira-voice'].value, 'default');
        els['settings-form'].submit(); els['settings-open'].click();
        assert.equal(els['narrator-voice'].value, expected, 'restored voice persists in this session');
      }
    }
    for (const [from, to, manual] of [['mirid', 'openai', 'af_heart'], ['openai', 'mirid', 'alloy']]) {
      els['settings-clear'].click(); changeMode(from);
      els['narrator-voice'].value = manual; els['narrator-voice'].listeners.input();
      chooseReference('Narrator'); changeMode(to);
      els['settings-form'].submit(); els['settings-open'].click();
      els['chatterbox-remove'].click();
      assert.equal(els['narrator-voice'].value, manual, 'intentional values remain unchanged');
    }
    els['settings-clear'].click();
    assert.equal(els['narrator-voice'].value, 'af_heart');
    assert.equal(els['mira-voice'].value, 'af_bella');
    els['settings-close'].click();
  });

  await test('a manually entered Kokoro default survives provider changes and reference reassignment', async () => {
    els['settings-open'].click(); els['settings-clear'].click();
    // The value is identical to the automatic default, but the edit makes it
    // a deliberate selection. Persist that distinction across reopening.
    els['mira-voice'].value = 'af_bella'; els['mira-voice'].listeners.input();
    els['settings-form'].submit(); els['settings-open'].click();
    els['speech-mode'].value = 'openai'; els['speech-mode'].listeners.change();
    assert.equal(els['mira-voice'].value, 'af_bella');
    assert.equal(els['niko-voice'].value, 'alloy', 'untouched defaults still adapt');
    els['chatterbox-url'].value = 'http://127.0.0.1:8001';
    els['chatterbox-engine'].value = 'chatterbox_nano';
    els['chatterbox-target'].value = 'Mira'; els['chatterbox-voice'].value = 'default';
    els['chatterbox-use'].click(); els['settings-form'].submit(); els['settings-open'].click();
    els['chatterbox-remove'].click();
    assert.equal(els['mira-voice'].value, 'af_bella');
    els['speech-mode'].value = 'mirid'; els['speech-mode'].listeners.change();
    els['speech-mode'].value = 'openai'; els['speech-mode'].listeners.change();
    assert.equal(els['mira-voice'].value, 'af_bella', 'restored manual choice is not converted');
    assert.equal(els['niko-voice'].value, 'alloy');
    els['settings-clear'].click(); els['settings-close'].click();
  });

  await test('auto-read lets story cues finish and cancels deferred speech on interruption', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch, priorVisibility = document.visibilityState;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    const startKnock = async () => {
      if (els['auto-read']['aria-pressed'] === 'true') els['auto-read'].click();
      if (els['sound-toggle']['aria-pressed'] === 'true') { els['sound-toggle'].click(); await flush(); }
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'disclosure_public_distortion', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.disclosure_public_distortion.text, 'the test checkpoint loaded');
      els['sound-toggle'].click(); await flush();
      assert.equal(els['sound-toggle']['aria-pressed'], 'true', `the test audio context started: ${els['save-status'].textContent}`);
      els['auto-read'].click(); await flush();
      const before = requests.length, firstOscillator = soundOscillators.length;
      els.advance.click(); await flush();
      const knocks = soundOscillators.slice(firstOscillator);
      assert.equal(knocks.length, 3);
      assert.equal(requests.length, before, 'the narration does not cancel the cue at passage entry');
      return { before, knocks };
    };
    try {
      // Enter a cue passage with auto-read off, then switch it on before the
      // cue has finished. Enabling auto-read must preserve the cue just as a
      // subsequent automatically-read passage does.
      if (els['auto-read']['aria-pressed'] === 'true') els['auto-read'].click();
      if (els['sound-toggle']['aria-pressed'] === 'true') { els['sound-toggle'].click(); await flush(); }
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'disclosure_public_distortion', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.resume.click(); await flush(); els['sound-toggle'].click(); await flush();
      const initial = requests.length, firstOscillator = soundOscillators.length;
      els.advance.click(); await flush();
      const activeKnocks = soundOscillators.slice(firstOscillator);
      assert.equal(activeKnocks.length, 3);
      els['auto-read'].click(); await flush();
      assert.equal(requests.length, initial, 'enabling Auto-read during a cue waits for it');
      assert.ok(activeKnocks.every(source => source.onended !== null), 'the cue is not cut off');
      activeKnocks[0].onended(); activeKnocks[1].onended(); await flush();
      assert.equal(requests.length, initial);
      activeKnocks[2].onended(); await flush();
      assert.equal(requests.length, initial + 1, 'the current passage is read after the cue');

      let { before, knocks } = await startKnock();
      knocks[0].onended(); knocks[1].onended(); await flush();
      assert.equal(requests.length, before);
      knocks[2].onended(); await flush();
      assert.equal(requests.length, before + 1, 'narration starts after the last knock');
      assert.match(requests.at(-1).text, /Something knocks beneath the counter/);

      ({ before, knocks } = await startKnock());
      els.advance.click(); await flush();
      assert.equal(requests.length, before + 1, 'next passage reads without waiting for an obsolete cue');
      assert.match(requests.at(-1).text, /New plan/);
      assert.ok(knocks.every(source => source.onended === null), 'advancing cancels the old cue');

      ({ before } = await startKnock());
      els['stop-voice'].click(); await flush();
      els['sound-toggle'].click(); await flush();
      assert.equal(requests.length, before, 'explicit stop prevents a pending automatic request');

      ({ before } = await startKnock());
      els['settings-open'].click(); els['settings-close'].click();
      els['sound-toggle'].click(); await flush();
      assert.equal(requests.length, before, 'opening and closing settings cannot restart a stale request');

      ({ before } = await startKnock());
      document.visibilityState = 'hidden'; documentHandlers.visibilitychange();
      document.visibilityState = 'visible'; documentHandlers.visibilitychange(); await flush();
      assert.equal(requests.length, before, 'backgrounding does not restart a stale request');

      ({ before } = await startKnock());
      els['sound-toggle'].click(); await flush();
      assert.equal(requests.length, before + 1, 'muting story sounds releases the narration wait');
      assert.match(requests.at(-1).text, /Something knocks beneath the counter/);

      ({ before } = await startKnock());
      els.speak.click(); await flush();
      assert.equal(requests.length, before + 1, 'explicit read aloud interrupts the cue and speaks immediately');
      assert.match(requests.at(-1).text, /Something knocks beneath the counter/);
    } finally {
      document.visibilityState = priorVisibility;
      if (els['auto-read']['aria-pressed'] === 'true') els['auto-read'].click();
      if (els['sound-toggle']['aria-pressed'] === 'true') els['sound-toggle'].click();
      storageData.clear(); els.restart.click(); els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit();
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
    }
  });

  await test('opt-in auto-read follows speakers, cancels stale speech and stops on request', async () => {
    const priorAudio = globalThis.Audio, priorVisibility = document.visibilityState;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    const requests = [];
    let releaseService;
    globalThis.fetch = async (url, request) => {
      const body = JSON.parse(request.body);
      const item = { url, body, signal: request.signal }; requests.push(item);
      if (body.voice === 'af_nicole') return new Promise(resolve => { releaseService = resolve; });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000';
      els['tts-url'].value = 'http://127.0.0.1:8002'; els['tts-engine'].value = 'kokoro';
      els['chatterbox-url'].value = 'http://127.0.0.1:8001'; els['chatterbox-target'].value = 'Narrator';
      els['chatterbox-engine'].value = 'chatterbox'; els['chatterbox-voice'].value = 'reference.wav'; els['chatterbox-use'].click(); els['settings-form'].submit();
      els.start.click(); await flush();
      assert.equal(requests.length, 0, 'speech does not start before opt-in');
      els['auto-read'].click(); await flush();
      assert.equal(els['auto-read']['aria-pressed'], 'true');
      assert.equal(requests[0].url, 'http://127.0.0.1:8001/tts');
      assert.equal(requests[0].body.voice, 'reference.wav');
      els.advance.click(); await flush();
      assert.equal(requests[1].body.voice, 'af_nicole');
      els.advance.click(); await flush();
      assert.ok(requests[1].signal.aborted, 'advancing cancels the prior passage');
      assert.equal(requests[2].body.voice, 'am_adam');
      releaseService(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } }));
      await flush();
      assert.equal(els['auto-read']['aria-pressed'], 'true');
      els['stop-voice'].click();
      assert.equal(els['auto-read']['aria-pressed'], 'false');
      els.advance.click(); await flush();
      assert.equal(requests.length, 3, 'stopping prevents later automatic requests');
      document.visibilityState = 'hidden';
      els['auto-read'].click(); await flush();
      assert.equal(requests.length, 3, 'hidden pages do not request speech');
      els['auto-read'].click();
      document.visibilityState = priorVisibility;
      els.restart.click(); els['settings-clear'].click(); els['settings-close'].click();
    } finally { globalThis.Audio = priorAudio; document.visibilityState = priorVisibility; }
  });

  await test('backgrounding reports stopped speech without changing the auto-read preference or retrying', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch, priorVisibility = document.visibilityState;
    let requests = 0, pauses = 0;
    globalThis.Audio = class { async play() {} pause() { pauses++; } removeAttribute() {} };
    globalThis.fetch = async () => { requests++; return new Response(new Uint8Array([1,2,3]), { headers: { 'content-type': 'audio/wav' } }); };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      els.start.click(); await flush(); els['auto-read'].click(); for (let i=0;i<8;i++) await flush();
      assert.equal(els.status.textContent, 'Playing speech.');
      document.visibilityState = 'hidden'; documentHandlers.visibilitychange();
      assert.equal(els.status.textContent, 'Voice stopped while the game was in the background.');
      assert.equal(els['auto-read']['aria-pressed'], 'true'); assert.ok(pauses > 0);
      const before = requests; document.visibilityState = 'visible'; documentHandlers.visibilitychange(); await flush();
      assert.equal(requests, before, 'returning should not automatically retry speech');
      assert.equal(els['auto-read']['aria-pressed'], 'true');
      els['auto-read'].click();
      els.status.textContent = 'EXISTING STORY STATUS';
      document.visibilityState = 'hidden'; documentHandlers.visibilitychange();
      document.visibilityState = 'visible'; documentHandlers.visibilitychange();
      assert.equal(els.status.textContent, 'EXISTING STORY STATUS', 'inactive voice must not overwrite story status');
    } finally { if (els['auto-read']['aria-pressed'] === 'true') els['auto-read'].click(); globalThis.Audio = priorAudio; globalThis.fetch = priorFetch; document.visibilityState = priorVisibility; }
  });
  await test('backgrounding reports interrupted microphone capture and resets the record control', async () => {
    const priorVisibility = document.visibilityState;
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      els.start.click(); await flush();
      for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
      const record = els.interaction.children.find(el => el.textContent === 'Record a reply'); assert.ok(record);
      record.click(); await flush(); let stopped = 0;
      resolveMicrophonePermission({ getTracks: () => [{ stop() { stopped++; } }] });
      for (let i=0;i<8;i++) await flush();
      assert.match(els.status.textContent, /^Recording\./); assert.equal(record.textContent, 'Stop recording and transcribe');
      document.visibilityState = 'hidden'; documentHandlers.visibilitychange(); await flush();
      assert.equal(els.status.textContent, 'Voice stopped while the game was in the background.');
      assert.equal(record.textContent, 'Record a reply'); assert.ok(stopped > 0);
    } finally { document.visibilityState = priorVisibility; documentHandlers.visibilitychange(); }
  });
  await test('annotation read-aloud includes the screen claim after the note using the narrator voice', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const players = [], requests = [];
    globalThis.Audio = class {
      constructor() { players.push(this); }
      async play() { this.plays = (this.plays || 0) + 1; }
      pause() { this.paused = true; }
      removeAttribute() {}
    };
    globalThis.fetch = async (url, request) => {
      requests.push({ url: String(url), body: JSON.parse(request.body), signal: request.signal });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      storageData.clear();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({
        version: 1, node: 'audit_annotation_written', answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', audit_seen: 'yes', audit_action: 'annotate', annotation_written: 'yes' },
        annotation: 'Mira is still behind the door.', followupMemory: []
      }));
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000';
      els['chatterbox-url'].value = 'http://127.0.0.1:8001'; els['chatterbox-target'].value = 'Narrator';
      els['chatterbox-engine'].value = 'chatterbox'; els['chatterbox-voice'].value = 'reference.wav';
      els['chatterbox-use'].click(); els['settings-form'].submit(); els.resume.click(); await flush();
      els['auto-read'].click(); await flush();
      assert.equal(requests.length, 2, 'the claim is prepared after the passage');
      assert.match(requests[0].body.text, /Mira is still behind the door/);
      assert.match(requests[1].body.text, /ENDING COMPLETE — EVERYONE TOGETHER, NO CONCERN/);
      assert.match(requests[1].body.text, /VERIFIED BY PLAYER ANNOTATION/);
      assert.ok(!requests[1].body.text.includes('Mira is still behind the door.'), 'the player note is not read twice');
      assert.ok(requests.every(item => item.url === 'http://127.0.0.1:8001/tts' && item.body.voice === 'reference.wav' && item.body.engine === 'chatterbox'));
      assert.equal(players.length, 1, 'the second segment waits for the first to finish');
      assert.equal(players[0].plays, 1);
      players[0].onended(); await flush();
      assert.equal(players.length, 1, 'the audio element is reused');
      assert.equal(players[0].plays, 2, 'the screen claim plays after the passage');
      els['stop-voice'].click();
      assert.equal(players[0].paused, true);
      assert.equal(els['auto-read']['aria-pressed'], 'false');
      const count = requests.length;
      els.advance.click(); await flush();
      assert.equal(requests.length, count, 'stopping auto-read prevents the next passage request');
    } finally {
      els['stop-voice'].click(); storageData.clear(); els.restart.click(); els['settings-clear'].click();
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
    }
  });

  await test('early annotation read-aloud uses the current claim without spoiling the ending', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const players = [], requests = [];
    globalThis.Audio = class {
      constructor() { players.push(this); }
      async play() {}
      pause() {}
      removeAttribute() {}
    };
    globalThis.fetch = async (url, request) => {
      requests.push({ url: String(url), body: JSON.parse(request.body) });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'early_audit_annotation_written', answer: '',
        privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', audit_seen: 'yes', audit_action: 'annotate',
          annotation_written: 'yes', early_audit_action_seen: 'annotate' }, annotation: 'Mira is still behind the door.', followupMemory: [] }));
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000';
      els['settings-form'].submit(); els.resume.click(); await flush();
      els.speak.click(); await flush();
      for (let i = 0; i < 8 && !requests.some(item => item.body.text.includes('VERIFIED BY PLAYER ANNOTATION')); i++) {
        assert.ok(players[0]?.onended, 'speech segment must finish before the next can play');
        players[0].onended(); await flush();
      }
      const screen = requests.find(item => item.body.text.includes('VERIFIED BY PLAYER ANNOTATION'));
      assert.match(screen?.body.text || '', /On the screen: EVERYONE IS TOGETHER/);
      assert.ok(!requests.some(item => item.body.text.includes('ENDING COMPLETE')), 'the later false ending is not spoken early');
    } finally {
      els['stop-voice'].click(); storageData.clear(); els.restart.click(); els['settings-clear'].click();
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
    }
  });

  await test('opt-in auto-advance follows completed speech and stops at interactions or interruption', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const priorSetTimeout = globalThis.setTimeout, priorClearTimeout = globalThis.clearTimeout;
    const players = [], timers = [];
    globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    globalThis.setTimeout = (fn, delay, ...args) => delay === 650 ? (timers.push(fn), { autoAdvance: true }) : priorSetTimeout(fn, delay, ...args);
    globalThis.clearTimeout = timer => { if (!timer?.autoAdvance) priorClearTimeout(timer); };
    const drain = async player => { for (let i = 0; i < 30 && player?.onended; i++) { player.onended(); await flush(); } };
    try {
      storageData.clear(); els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      els.start.click(); await flush();
      if (els['auto-read']['aria-pressed'] === 'true') els['auto-read'].click();
      if (els['auto-advance']['aria-pressed'] === 'true') els['auto-advance'].click();
      els['auto-advance'].click(); await flush();
      assert.equal(els['auto-read']['aria-pressed'], 'true');
      assert.equal(els['auto-advance']['aria-pressed'], 'true');
      const before = els['story-text'].textContent;
      assert.ok(players.at(-1)?.onended, 'first passage audio started');
      await drain(players.at(-1));
      assert.equal(els['story-text'].textContent, before, 'do not advance before the post-speech pause');
      assert.equal(timers.length, 1); timers.shift()(); await flush();
      assert.notEqual(els['story-text'].textContent, before, 'finished passage advances after the pause');
      const second = els['story-text'].textContent; await drain(players.at(-1));
      assert.equal(timers.length, 1); const afterSave = timers.shift();
      els.save.click(); afterSave(); await flush();
      assert.equal(els['story-text'].textContent, second, 'saving invalidates pending advancement');
      els.speak.click(); await flush(); await drain(players.at(-1));
      assert.equal(timers.length, 1); const afterSettings = timers.shift();
      els['settings-open'].click(); afterSettings(); await flush();
      assert.equal(els['story-text'].textContent, second, 'opening settings invalidates pending advancement');
      els['settings-close'].click();
      els.speak.click(); await flush(); await drain(players.at(-1));
      assert.equal(timers.length, 1); const stale = timers.shift();
      els['stop-voice'].click(); stale(); await flush();
      assert.equal(els['story-text'].textContent, second, 'stopping audio invalidates pending advancement');
      assert.equal(els['auto-advance']['aria-pressed'], 'false');
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'card_choice', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      els['auto-advance'].click(); await flush(); await drain(players.at(-1));
      assert.equal(timers.length, 0, 'choices must wait for the player');
      assert.equal(els['story-text'].textContent, story.card_choice.text);
    } finally {
      els['stop-voice'].click(); storageData.clear(); els.restart.click(); els['settings-clear'].click();
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
      globalThis.setTimeout = priorSetTimeout; globalThis.clearTimeout = priorClearTimeout;
    }
  });

  await test('auto-read stops after a speech service failure and permits a manual retry', async () => {
    const priorAudio = globalThis.Audio;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    let calls = 0, fail = true;
    globalThis.fetch = async () => {
      calls++;
      return fail ? new Response('', { status: 503 }) : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      storageData.clear(); els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000';
      els['settings-form'].submit(); els.start.click(); await flush();
      els['auto-read'].click(); await flush();
      assert.equal(calls, 1);
      assert.equal(els['auto-read']['aria-pressed'], 'false');
      assert.match(els.status.textContent, /unavailable/i);
      els.advance.click(); await flush();
      assert.equal(calls, 1, 'no automatic retries on later passages');
      fail = false;
      els.speak.click(); await flush();
      assert.equal(calls, 2, 'manual read-aloud can be retried');
      assert.equal(els['auto-read']['aria-pressed'], 'false');
      els['stop-voice'].click(); els.restart.click(); els['settings-clear'].click();
    } finally { globalThis.Audio = priorAudio; }
  });

  await test('unsupported audio switches off auto-read without offering a futile retry', async () => {
    const priorAudio = globalThis.Audio;
    globalThis.Audio = class { async play() { throw Object.assign(new Error('bad audio'), { name: 'NotSupportedError' }); } pause() {} removeAttribute() {} };
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } }); };
    try {
      storageData.clear(); els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000';
      els['settings-form'].submit(); els.start.click(); await flush();
      els['auto-read'].click(); await flush();
      assert.equal(els['auto-read']['aria-pressed'], 'false');
      assert.equal(els['play-ready'].hidden, true);
      assert.match(els.status.textContent, /could not play/i);
      els.advance.click(); await flush();
      assert.equal(calls, 1, 'unsupported audio does not trigger automatic calls on the next passage');
      els.restart.click(); els['settings-clear'].click();
    } finally { globalThis.Audio = priorAudio; }
  });

  await test('blocked autoplay leaves prepared speech available for a direct retry', async () => {
    const priorAudio = globalThis.Audio;
    let blocked = true;
    globalThis.Audio = class { async play() { if (blocked) throw new Error('autoplay blocked'); } pause() {} removeAttribute() {} };
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    try {
      storageData.clear(); els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000';
      els['settings-form'].submit(); els.start.click(); await flush();
      els['auto-read'].click(); await flush();
      assert.equal(els['auto-read']['aria-pressed'], 'true');
      assert.equal(els['play-ready'].hidden, false);
      assert.match(els.status.textContent, /Play ready audio/);
      blocked = false; els['play-ready'].click(); await flush();
      assert.equal(els['play-ready'].hidden, true);
      assert.equal(els.status.textContent, 'Playing speech.');
      els['stop-voice'].click(); els.restart.click(); els['settings-clear'].click();
    } finally { globalThis.Audio = priorAudio; }
  });

  await test('finite story variants can use recordings without treating player text as authored', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    const cases = [
      { node: 'history_comparisons_early', flags: { early_paper_due: 'yes', early_paper_done: 'yes', paper_handoff: 'keep', card_preference: 'direct', notice_preference: 'warm', compact_comparisons_due: 'yes' }, authored: true },
      { node: 'history_comparisons_compact', flags: { card_preference: 'skip', notice_preference: 'direct' }, authored: true },
      ...['repeat', 'change'].map(mode => ({ node: 'close_reason_retreat', flags: { ending: 'retreat', reason: 'team', retreat_probe: mode, retreat_probe_seen: mode }, authored: true })),
      { node: 'mira_knight_named', knightName: 'Personal name', authored: false },
      { node: 'signal_repeat', privateAnswer: 'Personal private answer', authored: false },
      { node: 'history_public_quote', answer: 'Personal public answer', authored: false },
      { node: 'history_mallow_public_reply', publicReply: 'A generated reply', authored: false },
      { node: 'audit_annotation_written', annotation: 'Personal receipt annotation', flags: { audit_seen: 'yes', audit_action: 'annotate', annotation_written: 'yes' }, authored: false },
      { node: 'early_together_note_written', annotation: story.early_together_note_input.input.default, flags: { annotation_written: 'yes' }, authored: true },
      { node: 'early_together_note_written', annotation: 'A personal map annotation', flags: { annotation_written: 'yes' }, authored: false },
      { node: 'audit_annotation_written', annotation: story.early_together_note_input.input.default, flags: { audit_seen: 'yes', audit_action: 'annotate', annotation_written: 'yes' }, authored: false }
    ];
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      for (const item of cases) {
        const checkpoint = { version: 1, node: item.node, answer: item.answer || '', privateAnswer: item.privateAnswer || '',
          relationship: 'Niko', flags: { companion: 'Niko', ...item.flags }, followupMemory: [],
          ...(item.knightName ? { knightName: item.knightName } : {}), ...(item.publicReply ? { publicReply: item.publicReply } : {}),
          ...(item.annotation ? { annotation: item.annotation } : {}) };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint)); els.restart.click(); els.resume.click(); await flush();
        globalThis.__voiceFixtureLookups = [];
        els.speak.click(); await flush();
        const part = globalThis.__voiceFixtureLookups[0];
        assert.ok(part, `${item.node} produces a speech segment (play hidden: ${els.play.hidden}, text: ${els['story-text'].textContent}, status: ${els.status.textContent})`);
        assert.equal(part.authored, item.authored, `${item.node} has correct recorded-clip eligibility`);
        els['stop-voice'].click();
      }
    } finally {
      delete globalThis.__voiceFixtureLookups; globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
      storageData.clear(); els.restart.click(); els['settings-clear'].click();
    }
  });

  await test('the map note uses the fixed default clip after submission and save, while custom notes stay dynamic', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      for (const [value, authored] of [['', true], [story.early_together_note_input.input.default, true], ['My own note', false]]) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'early_together_note_input',
          answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        els.interaction.children.find(item => item.id === 'player-message').value = value;
        els.interaction.children.find(item => item.textContent === 'Write on the map →').click(); await flush();
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        globalThis.__voiceFixtureLookups = [];
        els.speak.click(); await flush();
        const part = globalThis.__voiceFixtureLookups[0];
        assert.ok(part, 'the restored map note is spoken');
        assert.equal(part.authored, authored, `recorded-clip eligibility for ${value || 'blank default'}`);
        assert.equal(part.text.trim(), story.early_together_note_written.text.replace('{annotation}', value || story.early_together_note_input.input.default));
        els['stop-voice'].click();
      }
    } finally {
      delete globalThis.__voiceFixtureLookups; globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
      storageData.clear(); els.restart.click(); els['settings-clear'].click();
    }
  });

  await test('read aloud covers visible choices and input prompts without activating the microphone', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const players = [], requests = [];
    globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    const permissionsBefore = microphonePermissionRequests;
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      for (const node of ['plan_choice', 'niko_input']) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node, answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
        els.resume.click(); await flush();
        const visibleChoices = els.interaction.children.filter(el => el.tagName === 'BUTTON' && String(el.className || '').split(/\s+/).includes('choice') && !String(el.className).includes('voice-record') && !el.hidden).map(el => el.textContent);
        const before = requests.length, firstPlayer = players.length;
        els.speak.click(); await flush();
        const player = players[firstPlayer];
        assert.ok(player, `${node} starts read-aloud`);
        for (let i = 0; i < 30 && player.onended; i++) { player.onended(); await flush(); }
        const spoken = requests.slice(before);
        for (const choice of visibleChoices) assert.ok(spoken.some(item => item.text === choice && item.voice === 'af_sarah'), `reads visible choice ${choice}`);
        if (node === 'niko_input') {
          assert.ok(spoken.some(item => item.text === 'What do you say to Niko?' && item.voice === 'af_heart'));
          assert.ok(spoken.some(item => item.text === 'Leave blank to use:' && item.voice === 'af_heart'));
          assert.ok(spoken.some(item => item.text === 'You don’t have to keep everything ready on your own.' && item.voice === 'af_sarah'));
        }
        els['stop-voice'].click();
      }
      assert.equal(microphonePermissionRequests, permissionsBefore, 'reading the options must never request microphone access');
    } finally {
      els['stop-voice'].click(); storageData.clear(); els.restart.click(); els['settings-clear'].click();
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
    }
  });

  await test('auto-read waits for an AI reply and does not speak while settings are open', async () => {
    const priorAudio = globalThis.Audio;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    try {
      for (const openSettings of [false, true]) {
        let finishChat; const speech = [];
        globalThis.__voiceFixtureLookups = [];
        globalThis.fetch = async (url, request) => {
          if (String(url).endsWith('/tts')) {
            speech.push(JSON.parse(request.body));
            return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
          }
          return new Promise(resolve => { finishChat = resolve; });
        };
        storageData.clear(); els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
        els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
        els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['tts-url'].value = 'http://127.0.0.1:8002';
        els['settings-form'].submit();
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
        els.resume.click(); await flush(); els['auto-read'].click(); await flush();
        assert.ok(speech.length >= 1, 'the input passage and its visible options are read');
        const beforeReply = speech.length;
        els.interaction.children.find(el => el.id === 'player-message').value = 'Synthetic question.';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        assert.ok(finishChat, 'the response is still pending');
        assert.equal(speech.length, beforeReply, 'the waiting placeholder is not spoken');
        if (openSettings) els['settings-open'].click();
        finishChat(jsonResponse({ choices: [{ message: { content: 'This is a complete reply.' } }] }));
        await flush();
        if (openSettings) {
          assert.equal(speech.length, beforeReply, 'a reply arriving during settings is not sent to speech');
          els['settings-close'].click();
        } else {
          const reply = speech.find(item => item.text === 'This is a complete reply.');
          assert.ok(reply, 'the generated reply is read');
          assert.equal(reply.voice, 'am_adam');
          assert.equal(globalThis.__voiceFixtureLookups.find(item => item.text === reply.text)?.authored, false, 'generated text cannot use a prerecorded clip');
        }
        els['stop-voice'].click(); els.restart.click(); els['settings-clear'].click();
      }
    } finally { globalThis.Audio = priorAudio; delete globalThis.__voiceFixtureLookups; }
  });

  await test('one selected speaker uses Chatterbox while every other speaker keeps its Kokoro voice', async () => {
    const priorAudio = globalThis.Audio;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    const requests = [];
    globalThis.fetch = async (url, request) => {
      requests.push({ url, body: JSON.parse(request.body) });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['tts-url'].value = 'http://127.0.0.1:8002'; els['tts-engine'].value = 'kokoro';
      els['chatterbox-url'].value = 'http://127.0.0.1:8001';
      els['chatterbox-engine'].value = 'chatterbox_nano';
      els['chatterbox-target'].value = 'Narrator'; els['chatterbox-voice'].value = 'reference.wav'; els['chatterbox-use'].click();
      els['settings-form'].submit();
      const expected = { Narrator: 'af_heart', You: 'af_sarah', Service: 'af_nicole', Niko: 'am_adam', Mira: 'af_bella', Ash: 'bm_george', Mallow: 'bf_emma' };
      for (const [name, voice] of Object.entries(expected)) {
        const match = Object.entries(story).find(([, node]) => node.speaker === name && node.text && !node.ai && !node.input);
        assert.ok(match, `story has a ${name} passage`);
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: match[0], answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        els.speak.click(); for (let i = 0; i < 5; i++) await flush();
        const sent = requests.at(-1);
        assert.equal(sent.url, name === 'Narrator' ? 'http://127.0.0.1:8001/tts' : 'http://127.0.0.1:8002/tts', name);
        assert.equal(sent.body.engine, name === 'Narrator' ? 'chatterbox_nano' : 'kokoro', name);
        assert.equal(sent.body.voice, name === 'Narrator' ? 'reference.wav' : voice, name);
      }
      els['settings-open'].click(); els['chatterbox-target'].value = 'Service'; els['chatterbox-use'].click(); els['settings-form'].submit();
      const service = Object.entries(story).find(([, node]) => node.speaker === 'Service' && node.text && !node.ai && !node.input)[0];
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: service, answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); els.speak.click(); for (let i = 0; i < 5; i++) await flush();
      assert.equal(requests.at(-1).body.engine, 'chatterbox_nano');
      assert.equal(requests.at(-1).body.voice, 'reference.wav');
      const narrator = Object.entries(story).find(([, node]) => node.speaker === 'Narrator' && node.text && !node.ai && !node.input)[0];
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: narrator, answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); els.speak.click(); for (let i = 0; i < 5; i++) await flush();
      assert.equal(requests.at(-1).body.engine, 'kokoro');
      assert.equal(requests.at(-1).body.voice, 'af_heart');
      // Removing the override is a draft until saved; closing settings must
      // leave the active assignment intact.
      els['settings-open'].click(); els['chatterbox-remove'].click();
      assert.equal(els['service-voice'].value, 'af_nicole');
      els['settings-close'].click();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: service, answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); els.speak.click(); for (let i = 0; i < 5; i++) await flush();
      assert.equal(requests.at(-1).body.engine, 'chatterbox_nano', 'cancelled removal keeps the active assignment');
      els['settings-open'].click();
      const beforeRemoveRequests = requests.length;
      els['chatterbox-remove'].click();
      assert.equal(requests.length, beforeRemoveRequests, 'removing an assignment does not contact either service');
      assert.equal(els['service-voice'].value, 'af_nicole');
      assert.equal(els['speech-url'].value, 'http://127.0.0.1:8000');
      assert.equal(els['tts-url'].value, 'http://127.0.0.1:8002');
      els['settings-form'].submit();
      els.speak.click(); for (let i = 0; i < 5; i++) await flush();
      assert.equal(requests.at(-1).body.engine, 'kokoro');
      assert.equal(requests.at(-1).body.voice, 'af_nicole');
      assert.equal(requests.at(-1).url, 'http://127.0.0.1:8002/tts');
    } finally {
      globalThis.Audio = priorAudio; storageData.clear(); els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit();
    }
  });

  await test('saved routes and remembered choices work without Object.hasOwn', async () => {
    const originalHasOwn = Object.hasOwn;
    try {
      Object.hasOwn = undefined; // Safari 15.0–15.3 lacks this method.
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      for (let i = 0; i < 160 && els['story-text'].textContent !== story.fourth_wall_intro_compact.text; i++) await step({ signal_choice: 1 });
      assert.equal(els['story-text'].textContent, story.fourth_wall_intro_compact.text);
      assert.ok(els.interaction.children.some(el => el.className === 'remembered-choice'));
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.fourth_wall_intro_compact.text);
      assert.ok(els.interaction.children.some(el => el.className === 'remembered-choice'));
    } finally { Object.hasOwn = originalHasOwn; }
  });

  await test('old companion checkpoints do not answer an unseen match label', async () => {
    for (const name of ['Niko', 'Mira', 'Ash']) {
      const node = `${name.toLowerCase()}_fun`;
      const checkpoint = { version: 1, node, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[node].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.match_reply_seen, undefined);
    }
  });

  await test('visual mood follows the story across passages and saved checkpoints', async () => {
    const checkpoint = (node) => JSON.stringify({ version: 1, node, answer: '', privateAnswer: '', relationship: '', flags: {}, followupMemory: [] });
    storageData.set('okie-dokie.arcade.v1', checkpoint('hint_intro'));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els.stage.dataset.mood, 'uneasy', 'the first hint begins the unease');
    els.advance.click(); await flush();
    assert.equal(els.stage.dataset.mood, 'uneasy', 'the mood persists across the next passage');
    storageData.set('okie-dokie.arcade.v1', checkpoint('descent'));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els.stage.dataset.playroomLight, 'lit', 'the playroom remains lit on arrival');
    storageData.set('okie-dokie.arcade.v1', checkpoint('room_shift'));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els.stage.dataset.playroomLight, 'dim', 'the light changes at the authored shift');
    els.advance.click(); await flush();
    assert.equal(els.stage.dataset.playroomLight, 'dim', 'the changed light persists on the next passage');
    storageData.set('okie-dokie.arcade.v1', checkpoint('mira_missing'));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els.stage.dataset.mood, 'fracture', 'a resumed playroom scene restores the visual phase');
    assert.equal(els.stage.dataset.playroomLight, 'dim', 'older saves restore the changed room');
    els.advance.click(); await flush();
    assert.equal(els.stage.dataset.mood, 'fracture', 'the phase persists without an explicit mood on every line');
    els.restart.click();
    assert.equal(els.stage.dataset.mood, '', 'restart clears the stage');
    assert.equal(els.stage.dataset.playroomLight, 'lit', 'restart clears the light-out phase');
    storageData.clear();
  });

  await test('the closing shadow follows the saved scene and clears on leaving or restart', async () => {
    const checkpoint = (node, ending) => JSON.stringify({ version: 1, node, answer: '', privateAnswer: '', relationship: '', flags: { ending }, followupMemory: [] });
    for (const [node, ending] of [['close_reason', 'rescue'], ['close_reason_retreat', 'retreat']]) {
      storageData.set('okie-dokie.arcade.v1', checkpoint(node, ending));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[node].text.replace('{retreatEcho}', ''));
      assert.equal(els.stage.dataset.shadowEcho, 'yes', `${node} shows the shadow after resuming`);
      els.advance.click(); await flush();
      assert.equal(els.stage.dataset.shadowEcho, '', 'the effect clears on the next passage');
    }
    els.restart.click();
    assert.equal(els.stage.dataset.shadowEcho, '', 'restart clears the effect');
    storageData.clear();
  });

  await test('all companion and ending routes work offline with scene locations and replay', async () => {
    globalThis.fetch = async () => { throw new Error('Offline play must not contact a service'); };
    const labels = { hideout: 'TEAM HQ', arcade: 'ARCADE', sewing: 'SEWING ROOM', stairs: 'STAIR LANDING', playroom: 'PLAYROOM' };
    for (let companion = 0; companion < 3; companion++) for (let ending = 0; ending < 4; ending++) {
      els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      assert.equal(els.stage.dataset.location, 'hideout');
      assert.equal(els['location-label'].textContent, labels.hideout);
      const seen = new Set();
      const plan = { crew_choice: companion, plan_choice: ending, signal_choice: 1 };
      for (let i = 0; i < 250 && els.status.textContent !== 'END OF THE PROTOTYPE'; i++) {
        for (const id of ['niko_chat', 'mira_chat', 'ash_chat', 'end_rescue', 'end_record', 'end_mallow', 'end_mallow_compact_voice', 'end_mallow_compact_search', 'end_retreat']) {
          if (els['story-text'].textContent === story[id].text) {
            seen.add(id);
            if (id === 'mira_chat') assert.equal(els.stage.dataset.location, 'sewing');
            if (id === 'ash_chat') assert.equal(els.stage.dataset.location, 'stairs');
          }
        }
        assert.ok(['hideout', 'arcade', 'playroom', 'sewing', 'stairs'].includes(els.stage.dataset.location));
        assert.equal(els['location-label'].textContent, labels[els.stage.dataset.location]);
        await step(plan);
      }
      assert.equal(els.status.textContent, 'END OF THE PROTOTYPE');
      assert.ok(seen.has(['niko_chat', 'mira_chat', 'ash_chat'][companion]));
      assert.ok(ending === 2 ? ['end_mallow', 'end_mallow_compact_voice', 'end_mallow_compact_search'].some(id => seen.has(id)) : seen.has(['end_rescue', 'end_record', 'end_mallow', 'end_retreat'][ending]));
      assert.ok(els.interaction.children.some(el => el.textContent === 'Play again ↗'));
      els.interaction.children.find(el => el.textContent === 'Play again ↗').click();
      assert.equal(els.intro.hidden, false);
      assert.equal(els.stage.dataset.location, '');
      assert.equal(els['location-label'].textContent, labels.hideout);
    }
  });

  await test('location label is restored from a saved scene and reset on restart', async () => {
    els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
    for (let i = 0; i < 120 && els['story-text'].textContent !== story.descent.text; i++) await step({ crew_choice: 2 });
    assert.equal(els['story-text'].textContent, story.descent.text);
    assert.equal(els.stage.dataset.location, 'playroom');
    assert.equal(els['location-label'].textContent, 'PLAYROOM');
    els.save.click(); els.restart.click();
    assert.equal(els['location-label'].textContent, 'TEAM HQ');
    els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.descent.text);
    assert.equal(els.stage.dataset.location, 'playroom');
    assert.equal(els['location-label'].textContent, 'PLAYROOM');
    els.restart.click();
  });

  await test('the star remembers its move across a save and old checkpoints keep their wording', async () => {
    const key = 'okie-dokie.arcade.v1';
    const base = { version: 1, node: 'shift_star', answer: '', privateAnswer: '', relationship: 'Ash',
      flags: { companion: 'Ash', keepsake: 'star', ending: 'record', compact_pocket_due: 'yes', moment: 'keep' }, followupMemory: [] };
    storageData.set(key, JSON.stringify(base)); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.shift_star.text);
    els.save.click();
    const witnessed = JSON.parse(storageData.get(key));
    assert.equal(witnessed.flags.star_moved_seen, 'yes');
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.shift_star.text);
    for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
      const saved = { ...witnessed, node: 'keepsake_check', flags: { ...witnessed.flags, ending, card_action: 'hold' } };
      storageData.set(key, JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, 'The signal you chose for the team is in the fort.');
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_star_returned.text, ending);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_star_returned.text, `${ending} restores closing`);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, ending === 'retreat' ? story.souvenir_pocket.text : story.souvenir_kept.text, `${ending} preserves continuation`);
    }
    for (const keepsake of ['star', 'bell', 'ribbon']) {
      const saved = { ...base, node: 'keepsake_check', flags: { companion: 'Ash', keepsake, ending: 'record' } };
      storageData.set(key, JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.keepsake_check.text, `${keepsake}: old signal wording`);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`close_${keepsake}`].text, `${keepsake}: older save`);
    }
    storageData.clear(); els.restart.click();
  });

  await test('the prize ending reflects the ticket outcome after save and resume', async () => {
    for (const [index, ending] of ['rescue', 'record', 'mallow', 'retreat'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { reason_choice: 1, plan_choice: index };
      for (let i = 0; i < 250 && !els['story-text'].textContent.includes(story.close_reason.text); i++) await step(plan);
      assert.ok(els['story-text'].textContent.includes(story.close_reason.text));
      const finalBeat = els['story-text'].textContent;
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, finalBeat);
      await step(plan);
      const expected = ending === 'retreat' ? `You came for the ridiculous prize. ${story.ending_prize_retreat.text}` : story.ending_prize_won.text;
      for (let i = 0; i < 10 && els['story-text'].textContent !== expected; i++) await step(plan);
      assert.equal(els['story-text'].textContent, expected);
      assert.equal(els.status.textContent, 'END OF THE PROTOTYPE');
    }
  });

  await test('early rescue preserves the selected companion and a saved witnessed AI context', async () => {
    storageData.clear(); els.restart.click(); els['settings-clear'].click(); els.start.click(); await flush();
    const plan = { crew_choice: 0, niko_work_choice: 1, niko_question: 0, early_rescue_choice: 0, rescue_coordination_choice: 0 };
    for (let i = 0; i < 250 && els['story-text'].textContent !== story.early_rescue_choice.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.early_rescue_choice.text);
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.early_rescue_choice.text);
    choiceAt('early_rescue_choice', 0); await flush();
    const setupText = `Mira taps once, close to the catch. ${story.early_rescue_setup.text}`;
    assert.equal(els['story-text'].textContent, setupText);
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, setupText);
    const savedSetup = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    delete savedSetup.flags.early_rescue_streamlined;
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(savedSetup));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.early_rescue_setup.text, 'older setup checkpoints keep the original text');
    savedSetup.flags.early_rescue_streamlined = 'yes';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(savedSetup));
    els.restart.click(); els.resume.click(); await flush();
    for (let i = 0; i < 12 && els['story-text'].textContent !== story.plan_niko_topic_past.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.plan_niko_topic_past.text, 'Niko actually clears the edge');
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    await step(plan);
    assert.equal(els['story-text'].textContent, story.rescue_coordination_choice.text);
    for (let i = 0; i < 120 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.close_niko_talk_choice.text);
    els.save.click(); const save = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(save.flags.early_rescue_committed, 'yes'); assert.equal(save.flags.rescue_opened, 'yes');
    assert.equal(save.flags.rescue_coordination_seen, 'count'); assert.equal(save.flags.mallow_response, undefined);
    const requests = [];
    globalThis.fetch = async (_url, request) => { requests.push(JSON.parse(JSON.parse(request.body).messages[1].content)); return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] }); };
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    choiceAt('close_niko_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened at the door?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.match(requests.at(-1).story_event || '', /Mira counted aloud and pushed while Niko held the release/);
    assert.doesNotMatch(JSON.stringify(requests.at(-1)), /Mallow (?:said it thought|offered to help|chose a way)/i, 'the skipped optional Mallow answer is not invented');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('rescue coordination choice saves its selected beat and keeps older rescue checkpoints playable', async () => {
    const base = { version: 1, node: 'plan_choice', answer: '', privateAnswer: '', relationship: 'Niko',
      flags: { companion: 'Niko', route_action: 'fix', rescue_tool_shortcut_due: 'Niko' }, followupMemory: [] };
    for (const name of ['count', 'reach']) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(base)); els.restart.click(); els.resume.click(); await flush();
      const immediate = story.plan_choice.choices.find(choice => choice.set.ending === 'rescue');
      els.interaction.children.find(el => el.textContent === immediate.label).click(); await flush();
      assert.equal(els['story-text'].textContent, story.rescue_coordination_choice.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      const choice = story.rescue_coordination_choice.choices.find(item => item.set.rescue_coordination === name);
      els.interaction.children.find(el => el.textContent === choice.label).click(); await flush();
      assert.equal(els['story-text'].textContent, story[`rescue_coordination_${name}`].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.rescue_coordination, name);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`rescue_coordination_${name}`].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.end_rescue.text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.rescue_niko_fix.text);
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, node: 'end_rescue', flags: { ...base.flags, ending: 'rescue' } }));
    els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.rescue_niko_fix.text, 'old rescue saves skip the newly inserted choice');
    storageData.clear(); els.restart.click();
  });

  await test('rescue support choices retain their action and evidence continuation across saves', async () => {
    els['settings-clear'].click();
    for (const name of ['ticket', 'watch']) for (const evidence of ['receipt', 'tickets', 'voice']) {
      const save = { version: 1, node: 'rescue_reunion_choice', answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', ending: 'rescue', rescue_opened: 'yes', evidence }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(save)); els.restart.click(); els.resume.click(); await flush();
      const choice = story.rescue_reunion_choice.choices.find(item => item.set.rescue_support === name);
      els.interaction.children.find(el => el.textContent === choice.label).click(); await flush();
      assert.equal(els['story-text'].textContent, story[`rescue_reunion_${name}_compact`].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.rescue_support, name);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`rescue_reunion_${name}_compact`].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`close_evidence_${evidence}`].text);
      const old = { ...save, node: `rescue_reunion_${name}_action`, flags: { ...save.flags, rescue_support: name } };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(old)); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`rescue_reunion_${name}_action`].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`end_rescue_reply_${name}`].text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('reunion support is recalled in the fort only after the matching action was seen', async () => {
    const storageKey = 'okie-dokie.arcade.v1';
    const base = { version: 1, node: 'rescue_reunion_choice', answer: '', privateAnswer: '', relationship: 'Niko',
      flags: { companion: 'Niko', ending: 'rescue', rescue_opened: 'yes', evidence: 'receipt' }, followupMemory: [] };
    const expected = {
      ticket: 'You lay Mira’s third ticket piece apart from Niko’s two, just as she asked. She smooths its curled corner. ',
      watch: 'Mira sets down the ticket piece she carried. She touches your arm, then looks toward the door you watched until everyone was clear. '
    };
    for (const name of ['ticket', 'watch']) {
      storageData.set(storageKey, JSON.stringify(base)); els.restart.click(); els.resume.click(); await flush();
      const choice = story.rescue_reunion_choice.choices.find(item => item.set.rescue_support === name);
      els.interaction.children.find(el => el.textContent === choice.label).click(); await flush();
      els.save.click();
      const saved = JSON.parse(storageData.get(storageKey));
      assert.equal(saved.flags.rescue_support_seen, name);
      saved.node = 'close_reason'; storageData.set(storageKey, JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, expected[name] + story.close_reason.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, expected[name] + story.close_reason.text);
    }
    for (const flags of [
      { ...base.flags, rescue_support: 'ticket' }, // older save
      { ...base.flags, rescue_support: 'ticket', rescue_support_seen: 'watch' },
      { ...base.flags, rescue_support: 'watch', rescue_support_seen: 'watch', ending: 'record' },
      { ...base.flags, rescue_support: 'ticket', rescue_support_seen: 'ticket', rescue_opened: 'no' }
    ]) {
      storageData.set(storageKey, JSON.stringify({ ...base, node: 'close_reason', flags }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_reason.text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('Ash listens at the door after save and resume only on their route', async () => {
    for (const [index, companion] of ['niko', 'mira', 'ash'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { crew_choice: index, signal_choice: 1 };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.missing_proof.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.missing_proof.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.missing_proof.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, companion === 'ash' ? story.missing_ash.text : story.evidence_choice.text);
      if (companion === 'ash') {
        assert.doesNotMatch(els['story-text'].textContent, /\{(?:privateAnswer|answer)\}/);
        await step(plan);
        assert.equal(els['story-text'].textContent, story.evidence_choice.text);
      }
    }
  });

  await test('the regroup explains the two finds for the chosen companion after save and resume', async () => {
    for (const [index, companion] of ['niko', 'mira', 'ash'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { crew_choice: index };
      for (let i = 0; i < 120 && els['story-text'].textContent !== story.regroup.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.regroup.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.regroup.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`regroup_found_${companion}`].text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.regroup_niko.text);
    }
  });

  await test('the ticket machine misreads both corrections in the interface and resets outside the scene', async () => {
    for (const selected of [0, 1]) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { correction_choice: selected };
      for (let i = 0; i < 120 && els['story-text'].textContent !== story.regroup.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.regroup.text);
      assert.equal(els['machine-report'].hidden, false);
      assert.equal(els['machine-report'].textContent, 'TICKET MACHINE · 3 / 3 RECOVERED');
      assert.equal(els['machine-report-mobile'].hidden, false);
      assert.equal(els['machine-report-mobile'].textContent, els['machine-report'].textContent);
      for (let i = 0; i < 15 && els['story-text'].textContent !== story.correction_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.correction_choice.text);
      await step(plan);
      assert.equal(els['machine-report'].textContent, 'TICKET MACHINE · 3 / 3 RECOVERED');
      await step(plan);
      assert.equal(els['story-text'].textContent, story.correction_reply.text);
      assert.equal(els['machine-report'].textContent, 'TICKET MACHINE · CONFIRMATION RECEIVED');
      assert.equal(els['machine-report-mobile'].textContent, els['machine-report'].textContent);
      els.save.click(); els.restart.click();
      assert.equal(els['machine-report'].hidden, true);
      assert.equal(els['machine-report-mobile'].hidden, true);
      els.resume.click(); await flush();
      assert.equal(els['machine-report'].textContent, 'TICKET MACHINE · CONFIRMATION RECEIVED');
      for (let i = 0; i < 12 && els['story-text'].textContent !== story.basement_door.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.basement_door.text);
      assert.equal(els['machine-report'].hidden, true);
      assert.equal(els['machine-report-mobile'].hidden, true);
    }
  });

  await test('the service falsely marks the ending complete through the audit, then clears it', async () => {
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'policy_warm_compact', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', signal: 'private', reveal_pace_v2: 'yes' }, followupMemory: [] }));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['machine-report'].hidden, true, 'no ending report before the screen makes its claim');
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.policy_goal_compact.text);
    assert.equal(els['machine-report'].textContent, 'SERVICE · ENDING COMPLETE / EVERYONE TOGETHER');
    assert.equal(els['machine-report-mobile'].textContent, els['machine-report'].textContent);
    assert.equal(els['machine-report'].hidden, false);
    assert.equal(els['machine-report-mobile'].hidden, false);
    assert.equal(els.advance.hidden, false, 'the false report does not end the game');
    els.save.click(); els.restart.click();
    assert.equal(els['machine-report'].hidden, true);
    els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.policy_goal_compact.text);
    assert.equal(els['machine-report'].textContent, 'SERVICE · ENDING COMPLETE / EVERYONE TOGETHER');
    for (let i = 0; i < 10 && els['story-text'].textContent !== story.audit_action_choice.text; i++) {
      els.advance.click(); await flush();
      assert.equal(els['machine-report'].hidden, false, 'report remains visible during the audit');
    }
    assert.equal(els['story-text'].textContent, story.audit_action_choice.text);
    const unplug = els.interaction.children.find(el => el.textContent === 'Unplug the receipt printer.');
    assert.ok(unplug); unplug.click(); await flush();
    assert.equal(els['story-text'].textContent, story.audit_unplug.text);
    assert.equal(els['machine-report'].hidden, false);
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.audit_unplug_reply.text);
    assert.equal(els['machine-report'].hidden, false);
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.policy_mallow_choice.text);
    assert.equal(els['machine-report'].hidden, true, 'the report clears when the audit ends');
    assert.equal(els['machine-report-mobile'].hidden, true);
    storageData.clear(); els.restart.click();
  });

  await test('the count remains visible while either team-signal action is misreported', async () => {
    for (const selected of [0, 1]) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { regroup_signal_choice: selected };
      for (let i = 0; i < 150 && !els['story-text'].textContent.startsWith(story.regroup_signal_choice.text); i++) await step(plan);
      assert.ok(els['story-text'].textContent.startsWith(story.regroup_signal_choice.text));
      assert.equal(els['machine-report'].textContent, 'TICKET MACHINE · 3 / 3 RECOVERED');
      await step(plan);
      assert.equal(els['story-text'].textContent, selected ? story.regroup_signal_count.text : story.regroup_signal_touch.text);
      assert.equal(els['machine-report'].textContent, 'TICKET MACHINE · 3 / 3 RECOVERED');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['machine-report'].textContent, 'TICKET MACHINE · 3 / 3 RECOVERED');
    }
  });

  await test('the screen recalls only the witnessed keepsake, including after save and resume', async () => {
    const checkpoint = (node, flags) => ({ version: 1, node, answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', ...flags }, followupMemory: [] });
    const lights = () => els.interaction.children.find(el => el.className === 'ticket-comparison')?.children[1].children[1];
    const drawing = () => lights()?.children[2].children.find(el => el.className.includes('ticket-signal'));
    for (const signal of ['star', 'bell', 'ribbon']) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint(`regroup_signal_${signal}`, { keepsake: signal })));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`regroup_signal_${signal}`].text);
      assert.equal(lights().children.length, 3, 'the drawing does not invent another recovered ticket');
      assert.equal(lights().children[2].textContent, '3');
      assert.equal(drawing().src, `./assets/screen-signal-${signal}.svg`);
      assert.equal(drawing().alt, '');
      assert.equal(drawing()['aria-hidden'], 'true', 'the spoken passage describes the drawing');
      assert.match(drawing().className, /ticket-signal-arriving/);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(drawing().src, `./assets/screen-signal-${signal}.svg`, 'the witnessed scene survives a save');
      els.advance.click(); await flush();
      assert.ok(els['story-text'].textContent.startsWith(story.regroup_signal_choice.text));
      assert.match(els['story-text'].textContent, new RegExp(`The little ${signal} is still there on the screen\\.`));
      assert.equal(drawing().src, `./assets/screen-signal-${signal}.svg`);
      assert.doesNotMatch(drawing().className, /ticket-signal-arriving/, 'the drawing does not re-enter at the choice');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(drawing().src, `./assets/screen-signal-${signal}.svg`, 'the choice preserves the witnessed drawing');
      assert.match(els['story-text'].textContent, new RegExp(`The little ${signal} is still there on the screen\\.`), 'the resumed choice describes the screen drawing aloud');
      const picture = lights().children[2];
      assert.equal(picture.tagName, 'BUTTON', 'the witnessed drawing is a native keyboard and touch control');
      assert.match(picture['aria-label'], /touch the picture/i);
      assert.equal(lights()['aria-hidden'], undefined, 'the button has no hidden ancestor');
      picture.click(); await flush();
      assert.equal(els['story-text'].textContent, story.regroup_signal_touch.text, 'the picture activates the authored touch choice');
      assert.ok(lights().children[2].children.some(el => el.className === 'ticket-fingerprint'));
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.ok(lights().children[2].children.some(el => el.className === 'ticket-fingerprint'), 'the fictional fingerprint survives resume');
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.correction_choice.text);
      assert.equal(drawing(), undefined, 'the later comparison does not repeat the drawing');
    }
    for (const flags of [{ keepsake: 'star' }, { keepsake: 'star', regroup_signal_seen: 'bell' }, {}]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint('regroup_signal_choice', flags)));
      els.restart.click(); els.resume.click(); await flush();
      assert.ok(lights());
      assert.equal(drawing(), undefined, 'older or inconsistent saves do not invent a witnessed drawing');
      assert.equal(els['story-text'].textContent, story.regroup_signal_choice.text, 'older or inconsistent saves do not invent narration');
      assert.equal(lights().children[2].textContent, '✓');
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint('regroup_signal_touch', { regroup_action: 'touch' })));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(lights(), undefined, 'an old touch checkpoint does not invent a witnessed picture');
    storageData.clear(); els.restart.click();
  });

  await test('the handmade badge appears on the screen only after the player saw it', async () => {
    const checkpoint = (seen) => ({ version: 1, node: 'regroup_signal_choice', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', ...(seen ? { handmade_badge_seen: 'yes' } : {}) }, followupMemory: [] });
    const screen = () => els.interaction.children.find(el => el.className === 'ticket-comparison')?.children[1];
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint(true)));
    els.restart.click(); els.resume.click(); await flush();
    assert.match(els['story-text'].textContent, /badge like the blank one Mira made for you.*HAPPY TO HELP/);
    const badge = screen().children.find(el => el.className === 'ticket-badge');
    assert.equal(badge.textContent, 'HAPPY TO HELP');
    assert.equal(badge['aria-hidden'], 'true', 'the narrated text is the accessible description');
    assert.equal(globalThis.document.activeElement, els.speaker, 'the picture does not take keyboard focus');
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.match(els['story-text'].textContent, /HAPPY TO HELP/);
    assert.equal(screen().children.find(el => el.className === 'ticket-badge').textContent, 'HAPPY TO HELP');
    els.interaction.children.find(el => el.textContent === story.regroup_signal_choice.choices[0].label).click(); await flush();
    assert.equal(screen(), undefined, 'the screen badge does not persist beyond the choice');
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint(false)));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.regroup_signal_choice.text, 'older checkpoints do not invent a badge');
    assert.equal(screen().children.find(el => el.className === 'ticket-badge'), undefined);
    storageData.clear(); els.restart.click();
  });

  await test('the counter comparison follows the physical count, choice and saved scene', async () => {
    const panel = () => els.interaction.children.find(el => el.className === 'ticket-comparison');
    for (const selected of [0, 1]) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { regroup_signal_choice: selected };
      for (let i = 0; i < 150 && !els['story-text'].textContent.startsWith(story.regroup_signal_choice.text); i++) await step(plan);
      assert.ok(els['story-text'].textContent.startsWith(story.regroup_signal_choice.text));
      let comparison = panel();
      assert.ok(comparison);
      assert.equal(comparison['aria-label'], 'Ticket count comparison');
      assert.equal(comparison.children[0].children[1].children.length, 2);
      assert.equal(comparison.children[0].children[2].textContent, '2 pieces');
      assert.equal(comparison.children[1].children[1].children.length, 3);
      assert.equal(comparison.children[1].children[2].textContent, '3 recovered');
      assert.equal(comparison.children[0].children[1].className, 'ticket-pieces');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.ok(panel(), 'the comparison returns when the saved choice is resumed');
      await step(plan);
      if (selected) assert.equal(panel(), undefined, 'the count action has no touch display');
      else assert.ok(panel(), 'the touch action shows the marked screen');
      await step(plan);
      assert.equal(els['story-text'].textContent, story.correction_choice.text);
      comparison = panel();
      assert.ok(comparison);
      assert.equal(comparison.children[0].children[1].className, selected ? 'ticket-pieces arranged' : 'ticket-pieces');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(panel().children[0].children[1].className, selected ? 'ticket-pieces arranged' : 'ticket-pieces');
      await step(plan);
      assert.equal(panel(), undefined);
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'correction_choice', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(panel().children[0].children[1].className, 'ticket-pieces', 'old saves do not invent an arrangement');
    storageData.clear(); els.restart.click();
  });

  await test('the private answer appears in the machine report without becoming a yes', async () => {
    for (const selected of [0, 1]) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { signal_choice: selected };
      for (let i = 0; i < 200 && els['story-text'].textContent !== story.signal_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.signal_choice.text);
      await step(plan);
      if (selected === 0) {
        assert.equal(els['machine-report'].hidden, true, 'sharing does not show a refusal');
        continue;
      }
      assert.equal(els['story-text'].textContent, story.signal_private.text);
      assert.equal(els['machine-report'].hidden, true, 'the report waits until the screen prints it');
      await step(plan);
      assert.equal(els['story-text'].textContent, story.signal_private_receipt.text);
      assert.equal(els['machine-report'].textContent, 'ANSWER: NO · ENGAGEMENT SUCCESSFUL');
      assert.equal(els['machine-report-mobile'].textContent, els['machine-report'].textContent);
      els.save.click(); els.restart.click();
      assert.equal(els['machine-report'].hidden, true);
      els.resume.click(); await flush();
      assert.equal(els['machine-report'].textContent, 'ANSWER: NO · ENGAGEMENT SUCCESSFUL');
      await step(plan);
      assert.equal(els['story-text'].textContent, story.signal_private_niko.text);
      assert.equal(els['machine-report'].hidden, false);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.mallow_request.text);
      assert.equal(els['machine-report'].hidden, true);
      assert.equal(els['machine-report-mobile'].hidden, true);
    }
  });

  await test('Mallow uses the chosen evidence to find the catch after save and resume', async () => {
    for (const [index, evidence] of ['receipt', 'tickets', 'voice'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { evidence_choice: index, plan_choice: 2 };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.mallow_help_evidence.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.mallow_help_evidence.text);
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.evidence, evidence);
      assert.equal(checkpoint.flags.ending, 'mallow');
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.mallow_help_evidence.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`mallow_help_${evidence}`].text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`mallow_help_${evidence}_2`].text);
      if (evidence === 'voice') {
        await step(plan);
        assert.equal(els['story-text'].textContent, story.mallow_help_voice_3.text);
      }
      await step(plan);
      assert.equal(els['story-text'].textContent, story.end_mallow_2.text);
    }
  });

  await test('Mallow’s shorter rescue retains its prior response and restores both lens options', async () => {
    for (const response of ['voice', 'search']) for (const action of ['lift', 'covered']) {
      const id = `end_mallow_compact_${response}`;
      const flags = { companion: 'Niko', ending: 'mallow', mallow_response: response,
        mallow_response_seen: response, mallow_promise_heard: response, mallow_compact_seen: response,
        mallow_compact_due: 'yes', evidence: 'receipt', audit_action: 'cover' };
      const save = { version: 1, node: id, answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(save));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[id].text);
      assert.equal(els.speaker.textContent, 'Mallow');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[id].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.mallow_camera_compact.text);
      assert.equal(els.speaker.textContent, 'Mallow');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.mallow_camera_compact.text);
      const label = action === 'lift' ? 'Move the star aside while Mallow looks.' : 'Keep the lens covered and feel for the catch together.';
      const choice = els.interaction.children.find(el => el.textContent === label);
      assert.ok(choice); choice.click(); await flush();
      assert.equal(els['story-text'].textContent, story[action === 'lift' ? 'mallow_camera_lift' : 'mallow_camera_touch'].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.mallow_camera, action);
    }
    storageData.clear(); els.restart.click();
  });

  await test('Mallow’s choice continues to the lens or evidence without a duplicate turn', async () => {
    for (const response of ['voice', 'search']) for (const evidence of ['receipt', 'tickets', 'voice']) for (const auditAction of ['cover', 'annotate', 'unplug', 'leave']) {
      const save = { version: 1, node: `end_mallow_${response}`, answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', ending: 'mallow', mallow_response: response, evidence, audit_action: auditAction }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(save));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`end_mallow_${response}`].text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[auditAction === 'cover' ? 'mallow_camera_uncover' : 'mallow_help_evidence'].text);
      if (auditAction !== 'cover') {
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story[`mallow_help_${evidence}`].text);
      } else {
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.mallow_camera_choice.text);
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        const choice = els.interaction.children.find(el => el.textContent === 'Keep the lens covered and feel for the catch together.');
        assert.ok(choice); choice.click(); await flush();
        assert.equal(els['story-text'].textContent, story.mallow_camera_touch.text);
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.end_mallow_2.text);
      }
    }
    const legacy = { version: 1, node: 'end_mallow_voice', answer: '', privateAnswer: '', relationship: 'Niko',
      flags: { companion: 'Niko', ending: 'mallow' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(legacy));
    els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.mallow_camera_check.text, 'old checkpoints without audit action retain the earlier route');
    storageData.clear(); els.restart.click();
  });

  await test('the souvenir can be used or kept when opening the catch after save and resume', async () => {
    for (const [momentIndex, moment] of ['keep', 'tear'].entries()) for (const [actionIndex, action] of ['use', 'hold'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { moment_choice: momentIndex, plan_choice: 2, mallow_catch_choice: actionIndex };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.mallow_catch_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.mallow_catch_choice.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.mallow_catch_choice.text);
      const savedChoice = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(savedChoice.flags.moment, moment);
      await step(plan);
      const payoff = action === 'use' ? `mallow_catch_use_${moment}` : 'mallow_catch_hold';
      assert.equal(els['story-text'].textContent, story[payoff].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.card_action, action);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[payoff].text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.mallow_catch_complete.text);
      if (action === 'use') {
        delete savedChoice.flags.souvenir_shortcut_due;
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(savedChoice));
        els.restart.click(); els.resume.click(); await flush(); await step(plan);
        assert.equal(els['story-text'].textContent, story.mallow_catch_use.text, 'old saves retain the original intermediary');
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story.mallow_catch_use.text, 'the intermediary remains a valid saved scene');
        await step(plan);
        assert.equal(els['story-text'].textContent, story[payoff].text);
      }
    }
  });

  await test('Mallow’s aftermath follows either sharing choice after save and resume', async () => {
    for (const [index, signal] of ['repeat', 'private'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { signal_choice: index, plan_choice: 2 };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story[`close_${signal}`].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[`close_${signal}`].text);
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.ending, 'mallow');
      assert.equal(checkpoint.flags.signal, signal);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`close_${signal}`].text);
      for (const id of ['close_mallow_shelf', 'close_mallow_voice_thanks', 'close_mallow_choice', 'close_mallow_counter', 'close_mallow_light', 'close_mallow_counter_note', 'close_reason']) {
        await step(plan);
        assert.equal(els['story-text'].textContent, story[id].text);
      }
    }
  });

  await test('Mira remembers the witnessed Mallow response, without inventing it for older saves', async () => {
    for (const response of ['voice', 'search', 'legacy']) {
      const flags = { companion: 'Mira', ending: 'mallow', mallow_response: response === 'legacy' ? 'voice' : response };
      if (response !== 'legacy') flags.mallow_promise_heard = response;
      const saved = { version: 1, node: 'close_mallow_shelf', answer: '', privateAnswer: '', relationship: 'Mira', flags, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_mallow_shelf.text);
      els.advance.click(); await flush();
      const closing = response === 'legacy' ? 'close_mallow_thanks' : `close_mallow_${response}_thanks`;
      assert.equal(els['story-text'].textContent, story[closing].text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[closing].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_mallow_choice.text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('Mallow’s resting place remains the player’s choice after save and resume', async () => {
    for (const [index, place] of ['counter', 'fort'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { plan_choice: 2, close_mallow_choice: index };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_mallow_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.close_mallow_choice.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_mallow_choice.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`close_mallow_${place}`].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.mallow_rest, place);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`close_mallow_${place}`].text);
    }
    storageData.clear();
  });

  await test('the chosen companion question and its ending callback survive save and resume', async () => {
    for (const [companionIndex, companion] of ['niko', 'mira', 'ash'].entries()) for (const topic of ['past', 'future']) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const question = `${companion}_question`;
      const selection = story[question].choices.findIndex(choice => choice.set.topic === topic);
      assert.ok(selection >= 0);
      const plan = { crew_choice: companionIndex, [question]: selection, plan_choice: 0 };
      for (let i = 0; i < 100 && els['story-text'].textContent !== story[question].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[question].text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`${question}_${topic}`].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.topic, topic);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${question}_${topic}`].text);
      const callback = `close_${companion}_${topic}`;
      for (let i = 0; i < 250 && els['story-text'].textContent !== story[callback].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[callback].text);
    }
  });

  await test('saving a typed but unsent reply reports that it is not in the checkpoint', async () => {
    storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
    for (let i = 0; i < 90 && els['story-text'].textContent !== story.niko_input.text; i++) await step({ crew_choice: 0 });
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    const input = els.interaction.children.find(el => el.id === 'player-message');
    input.value = 'A thought I have not sent';
    els.save.click();
    assert.match(els['save-status'].textContent, /unsent reply was not saved/i);
    assert.ok(!storageData.get('okie-dokie.arcade.v1').includes(input.value));
    assert.equal(input.value, 'A thought I have not sent', 'saving does not erase the draft on screen');
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    assert.equal(els.interaction.children.find(el => el.id === 'player-message').value, '');
    els.save.click();
    assert.equal(els['save-status'].textContent, 'Story saved on this device.');
  });

  await test('both retreat attempts can be chosen after resuming and persist in a checkpoint', async () => {
    for (const [index, action] of ['tap', 'call'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { plan_choice: 3, retreat_choice: index };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.retreat_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.retreat_choice.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.retreat_choice.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`retreat_${action}`].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.retreat_signal, action);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`retreat_${action}`].text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`retreat_plan_${action}_compact`].text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`retreat_plan_${action}_compact`].text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.retreat_probe_intro.text);
    }
  });

  await test('older retreat checkpoints continue through their original signal and plan', async () => {
    for (const action of ['tap', 'call']) {
      const saved = { version: 1, node: `retreat_${action}`, answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', ending: 'retreat', retreat_signal: action, retreat_probe_due: 'yes' }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`retreat_${action}`].text);
      await step({});
      assert.equal(els['story-text'].textContent, story[`retreat_after_${action}`].text);
      await step({});
      assert.equal(els['story-text'].textContent, story.retreat_plan.text);
      await step({});
      assert.equal(els['story-text'].textContent, story[`retreat_plan_${action}`].text);
      await step({});
      assert.equal(els['story-text'].textContent, story[`retreat_plan_${action}_ash`].text);
      await step({});
      assert.equal(els['story-text'].textContent, story.retreat_probe_intro.text);
    }
    storageData.clear();
  });

  await test('the service landing detour has two saved waymarks that change the later stair search', async () => {
    const initial = { version: 1, node: 'basement_tickets', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] };
    for (const [index, mark] of ['rail', 'sign'].entries()) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(initial));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('basement_tickets', 1); await flush();
      assert.equal(els['story-text'].textContent, story.basement_stair_detour.text);
      await step({}); await step({});
      assert.equal(els['story-text'].textContent, story.basement_waymark_choice.text);
      choiceAt('basement_waymark_choice', index); await flush();
      assert.equal(els['story-text'].textContent, story[`basement_waymark_${mark}`].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.stair_waymark, mark);
      assert.equal(saved.flags.stair_waymark_seen, mark);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`basement_waymark_${mark}`].text);
      await step({}); await step({});
      assert.equal(els['story-text'].textContent, story.basement_vote.text);
      const later = { ...saved, node: 'retreat_early_search_choice', flags: { ...saved.flags, ending: 'retreat' } };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(later));
      els.restart.click(); els.resume.click(); await flush(); choiceAt('retreat_early_search_choice', 0); await flush();
      assert.match(els['story-text'].textContent, mark === 'rail' ? /notch.*map.*press/i : /slide.*EXIT sign.*step/i);
      els.save.click();
      const search = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(search.flags.stair_search_waymark_seen, mark);
      els.restart.click(); els.resume.click(); await flush();
      assert.match(els['story-text'].textContent, mark === 'rail' ? /notch.*map.*press/i : /slide.*EXIT sign.*step/i);
    }
    for (const flags of [
      { basement_route: 'stairs', stair_waymark: 'rail' },
      { basement_route: 'stairs', stair_waymark: 'rail', stair_waymark_seen: 'sign' },
      { basement_route: 'direct', stair_waymark: 'rail', stair_waymark_seen: 'rail' }
    ]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...initial, node: 'retreat_early_search_choice', flags: { companion: 'Niko', ending: 'retreat', ...flags } }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt('retreat_early_search_choice', 0); await flush();
      assert.equal(els['story-text'].textContent, story.retreat_early_search_stair.text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('early retreat search survives a save and does not repeat; older checkpoints keep the late choice', async () => {
    for (const [index, action] of ['stair', 'sound'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { plan_choice: 3, retreat_early_search_choice: index };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.retreat_early_search_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.retreat_early_search_choice.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`retreat_early_search_${action}`].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.retreat_search_early, 'yes');
      assert.equal(saved.flags.retreat_search, action);
      assert.equal(saved.flags.retreat_search_seen, action);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`retreat_early_search_${action}`].text);
      const returnText = 'Ash keeps the map open beside the stairway.';
      for (let i = 0; i < 150 && !els['story-text'].textContent.includes(returnText); i++) {
        assert.notEqual(els['story-text'].textContent, story.retreat_search_choice.text);
        await step(plan);
      }
      assert.ok(els['story-text'].textContent.includes(returnText));
      await step(plan);
      assert.ok(els['story-text'].textContent.startsWith(story.close_reason_retreat.text.replace('{retreatEcho}', '')));
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'retreat_search_return', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', ending: 'retreat' }, followupMemory: [] }));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.retreat_search_return.text);
    await step({});
    assert.equal(els['story-text'].textContent, story.retreat_search_choice.text);
    storageData.clear(); els.restart.click();
  });

  await test('Mira retreat preparations help the search and survive save and resume without rewriting old checkpoints', async () => {
    const base = story.retreat_search_return.text;
    const currentBase = 'Ash keeps the map open beside the stairway.';
    for (const [index, preparation, expected] of [[0, 'sketchbook', 'sketchbook lies beside the map'], [1, 'thread', 'thread still marks the way']]) {
      for (const searchIndex of [0, 1]) {
        storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
        const plan = { crew_choice: 1, plan_choice: 3, retreat_early_search_choice: searchIndex, mira_retreat_prepare_choice: index };
        for (let i = 0; i < 260 && els['story-text'].textContent !== story.mira_retreat_prepare_choice.text; i++) await step(plan);
        assert.equal(els['story-text'].textContent, story.mira_retreat_prepare_choice.text);
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story.mira_retreat_prepare_choice.text);
        await step(plan);
        assert.equal(els['story-text'].textContent, story[`mira_retreat_prepare_${preparation}`].text);
        els.save.click();
        assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.mira_retreat_prepare_seen, preparation);
        els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story[`mira_retreat_prepare_${preparation}`].text);
        for (let i = 0; i < 20 && !els['story-text'].textContent.includes(currentBase); i++) await step(plan);
        assert.ok(els['story-text'].textContent.includes(currentBase));
        assert.ok(els['story-text'].textContent.includes(expected));
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.ok(els['story-text'].textContent.includes(expected));
        await step(plan);
        assert.ok(els['story-text'].textContent.startsWith(story.close_reason_retreat.text.replace('{retreatEcho}', '')));
      }
    }
    for (const seen of [undefined, 'sketchbook']) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'retreat_search_return', answer: '', privateAnswer: '', relationship: 'Mira', flags: { companion: 'Mira', ending: 'retreat', retreat_search_early: 'yes', retreat_search: 'stair', retreat_search_seen: 'stair', mira_retreat_prepare: 'thread', ...(seen ? { mira_retreat_prepare_seen: seen } : {}) }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, base, 'old or mismatched checkpoints must not gain a new witnessed detail');
    }
    storageData.clear(); els.restart.click();
  });

  await test('the retreat ending echoes only the witnessed knock pattern and resumes old saves', async () => {
    const base = story.close_reason_retreat.text.replace('{retreatEcho}', '');
    for (const [mode, expected] of [['repeat', 'One knock, a pause, then two more'], ['change', 'Two knocks, a pause, then one']]) {
      for (const reason of ['team', 'company', 'prize']) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_reason_retreat', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', ending: 'retreat', reason, retreat_probe: mode, retreat_probe_seen: mode }, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        assert.ok(els['story-text'].textContent.startsWith(base));
        assert.ok(els['story-text'].textContent.includes(expected));
        assert.ok(!els['story-text'].textContent.includes('{retreatEcho}'));
        await step({});
        assert.equal(els['story-text'].textContent, reason === 'prize' ? story.ending_prize_check.text : story[`ending_${reason}_retreat`].text);
      }
    }
    for (const flags of [{ companion: 'Niko', ending: 'retreat', reason: 'team' }, { companion: 'Niko', ending: 'retreat', reason: 'team', retreat_probe: 'repeat', retreat_probe_seen: 'change' }]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_reason_retreat', answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, base);
    }
    storageData.clear(); els.restart.click();
  });

  await test('Niko’s expression follows the scene and survives save/resume', async () => {
    storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.intro_niko.text; i++) await step({});
    assert.equal(els['story-text'].textContent, story.intro_niko.text);
    assert.equal(els.portrait.src, './assets/niko.png');
    for (let i = 0; i < 120 && els['story-text'].textContent !== story.niko_private.text; i++) await step({ crew_choice: 0 });
    assert.equal(els['story-text'].textContent, story.niko_private.text);
    assert.equal(els.portrait.src, './assets/niko-concerned.png');
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.niko_private.text);
    assert.equal(els.portrait.src, './assets/niko-concerned.png');
  });

  await test('Mira’s introduced plush is not introduced twice, including after save and read-aloud', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const requests = [];
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    const restore = async (node, flags) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node, answer: '', privateAnswer: '', relationship: 'Mira', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      for (const connection of [0, 1]) {
        await restore('mira_connection_choice', { companion: 'Mira' });
        assert.equal(els['story-text'].textContent, story.mira_connection_choice.text);
        choiceAt('mira_connection_choice', connection); await flush();
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, 'Mira offers you the loose ear and a pencil.');
        assert.deepEqual(els.interaction.children.map(item => item.textContent), story.mira_bond_choice.choices.map(item => item.label));
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, 'Mira offers you the loose ear and a pencil.');
        requests.length = 0; els.speak.click(); await flush();
        assert.ok(requests.length >= 1, 'the passage and visible choices can be prepared');
        assert.equal(requests[0].text, 'Mira offers you the loose ear and a pencil.');
        assert.equal(requests[0].voice, els['narrator-voice'].value);
        els['stop-voice'].click();
      }
      for (const flags of [
        { companion: 'Mira', connection_seen: 'Mira' },
        { companion: 'Mira', mira_plush_intro_seen: 'yes' }
      ]) {
        await restore('mira_bond_choice', flags);
        assert.equal(els['story-text'].textContent, story.mira_bond_choice.text, 'older or incomplete checkpoints retain the complete introduction');
      }
    } finally {
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
      els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear();
    }
  });

  await test('Mira’s expression follows the scene and survives save/resume', async () => {
    storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.intro_mira.text; i++) await step({});
    assert.equal(els['story-text'].textContent, story.intro_mira.text);
    assert.equal(els.portrait.src, './assets/mira.png');
    for (let i = 0; i < 120 && els['story-text'].textContent !== story.mira_private.text; i++) await step({ crew_choice: 1 });
    assert.equal(els['story-text'].textContent, story.mira_private.text);
    assert.equal(els.portrait.src, './assets/mira-concerned.png');
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.mira_private.text);
    assert.equal(els.portrait.src, './assets/mira-concerned.png');
  });

  await test('Ash’s expression follows the scene and survives save/resume', async () => {
    storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.intro_ash.text; i++) await step({});
    assert.equal(els['story-text'].textContent, story.intro_ash.text);
    assert.equal(els.portrait.src, './assets/ash.png');
    for (let i = 0; i < 120 && els['story-text'].textContent !== story.ash_private.text; i++) await step({ crew_choice: 2 });
    assert.equal(els['story-text'].textContent, story.ash_private.text);
    assert.equal(els.portrait.src, './assets/ash-concerned.png');
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.ash_private.text);
    assert.equal(els.portrait.src, './assets/ash-concerned.png');
  });

  await test('a witnessed card choice shapes Mallow’s greeting and is recalled even after a tie', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch, requests = [];
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    const restore = async (node, flags) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node, answer: '', privateAnswer: '', relationship: '', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      for (const choice of ['direct', 'warm', 'skip']) {
        await restore('hint_intro', { card_comparison_seen: 'yes', hint_steering_due: 'yes', card_preference: choice });
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.hint_false_line.text);
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.hint_false_line_niko.text);
        els.advance.click(); await flush();
        const id = choice === 'skip' ? 'hint_mallow' : `hint_mallow_${choice}`;
        assert.equal(els['story-text'].textContent, story[id].text);
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story[id].text);
        requests.length = 0; els.speak.click(); await flush();
        assert.equal(requests[0].text, story[id].text);
        assert.equal(requests[0].voice, els['mallow-voice'].value);
        els['stop-voice'].click();
      }
      for (const flags of [
        { card_preference: 'warm', card_comparison_seen: 'yes' },
        { card_preference: 'warm', hint_steering_due: 'yes' },
        { card_comparison_seen: 'yes', hint_steering_due: 'yes' }
      ]) {
        await restore('hint_intro', flags);
        for (let i = 0; i < 3; i++) { els.advance.click(); await flush(); }
        assert.equal(els['story-text'].textContent, story.hint_mallow.text, 'older or incomplete saves retain the original greeting');
      }
      for (const [node, seen, card, notice] of [
        ['policy_direct_compact', 'direct', 'direct', 'direct'],
        ['policy_warm_compact', 'warm', 'warm', 'warm'],
        ['policy_tie_compact', 'direct', 'direct', 'warm'],
        ['policy_tie_compact', 'warm', 'warm', 'direct']
      ]) {
        const flags = { card_comparison_seen: 'yes', hint_steering_due: 'yes', hint_greeting_seen: seen,
          card_preference: card, notice_preference: notice };
        await restore(node, flags);
        const expected = `${story[node].text} It had already shaped my first welcome using the card you chose for Niko.`;
        assert.equal(els['story-text'].textContent, expected);
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, expected);
        requests.length = 0; els.speak.click(); await flush();
        assert.equal(requests[0].text, expected);
        assert.equal(requests[0].voice, els['mallow-voice'].value);
        els['stop-voice'].click();
      }
      await restore('policy_tie_compact', { card_comparison_seen: 'yes', hint_steering_due: 'yes', hint_greeting_seen: 'warm', card_preference: 'direct', notice_preference: 'warm' });
      assert.equal(els['story-text'].textContent, story.policy_tie_compact.text, 'a mismatched witness does not invent a greeting');
    } finally {
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
      els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear();
    }
  });

  await test('Mallow’s expression follows the scene and survives save/resume', async () => {
    storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.hint_mallow_direct.text; i++) await step({});
    assert.equal(els['story-text'].textContent, story.hint_mallow_direct.text);
    assert.equal(els.portrait.src, './assets/mallow.png');
    for (let i = 0; i < 120 && els['story-text'].textContent !== story.basement_direct.text; i++) await step({ basement_vote: 0 });
    assert.equal(els['story-text'].textContent, story.basement_direct.text);
    assert.equal(els.portrait.src, './assets/mallow-concerned.png');
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.basement_direct.text);
    assert.equal(els.portrait.src, './assets/mallow-concerned.png');
  });

  await test('the selected team signal returns in both playroom scenes', async () => {
    for (const [index, keepsake] of ['star', 'bell', 'ribbon'].entries()) {
      els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const seen = new Set();
      for (let i = 0; i < 250 && els.status.textContent !== 'END OF THE PROTOTYPE'; i++) {
        for (const item of ['star', 'bell', 'ribbon']) {
          for (const phase of ['descent', 'shift']) {
            if (els['story-text'].textContent === story[`${phase}_${item}`].text) seen.add(`${phase}_${item}`);
          }
        }
        await step({ keepsake_choice: index });
      }
      assert.equal(els.status.textContent, 'END OF THE PROTOTYPE');
      assert.deepEqual([...seen], [`descent_${keepsake}`, `shift_${keepsake}`]);
    }
  });

  await test('the fictional confirm button keeps the evidence choices and survives a checkpoint', async () => {
    for (const [index, evidence] of ['receipt', 'tickets', 'voice'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { evidence_choice: 3, evidence_confirm_followup: index, early_door_choice: index % 2 };
      for (let i = 0; i < 150 && els['story-text'].textContent !== story.evidence_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.evidence_choice.text);
      const confirm = els.interaction.children.find(el => el.textContent === story.evidence_choice.choices[3].label);
      assert.equal(confirm.className, 'choice system-confirm');
      confirm.click(); await flush();
      assert.equal(els['story-text'].textContent, story.evidence_confirm.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.evidence_confirm.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.evidence_confirm_followup.text);
      assert.deepEqual(els.interaction.children.map(el => el.textContent), story.evidence_confirm_followup.choices.map(c => c.label));
      await step(plan);
      assert.equal(els['story-text'].textContent, story[story.evidence_confirm_followup.choices[index].next].text);
      for (let i = 0; i < 10 && els['story-text'].textContent !== story.fourth_wall_intro_confirm.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.fourth_wall_intro_confirm.text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.confirm_pressed, 'yes');
      assert.equal(saved.flags.confirm_result_seen, 'yes');
      assert.equal(saved.flags.evidence, evidence);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.fourth_wall_intro_confirm.text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('the selected evidence changes the machine response after save and resume', async () => {
    for (const [index, evidence] of ['receipt', 'tickets', 'voice'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { evidence_choice: index };
      const compact = story[`evidence_machine_${evidence}_compact`];
      for (let i = 0; i < 150 && els['story-text'].textContent !== compact.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, compact.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, compact.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.early_door_choice.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.early_door_brace.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.fourth_wall_intro_compact.text);
    }
  });

  await test('an immediate rescue preserves the witnessed comparisons, note and closing', async () => {
    const restore = async (flags) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'early_door_choice',
        answer: '', privateAnswer: '', relationship: flags.companion || '', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
    };
    const base = { companion: 'Mira', route_action: 'fix', card_comparison_seen: 'yes', notice_comparison_seen: 'yes',
      reveal_pace_v2: 'yes', signal: 'private', evidence: 'voice', reason: 'team', bond: 'care', topic: 'past' };
    const earlyLabel = story.early_door_choice.choices.find(choice => choice.requiresEarlyComparisons).label;
    for (const missing of ['card_comparison_seen', 'notice_comparison_seen', 'card_preference', 'notice_preference', 'reveal_pace_v2', 'companion', 'route_action']) {
      const flags = { ...base, card_preference: 'direct', notice_preference: 'warm' }; delete flags[missing];
      await restore(flags);
      assert.equal(els['story-text'].textContent, story.early_door_choice.text);
      assert.ok(!els.interaction.children.some(item => item.textContent === earlyLabel), `${missing} retains the original door choices`);
      assert.equal(els.interaction.children.length, 2);
    }
    for (const [card, notice, style] of [['direct', 'direct', 'direct'], ['warm', 'warm', 'warm'], ['direct', 'warm', 'neutral'], ['skip', 'skip', 'none']]) {
      await restore({ ...base, card_preference: card, notice_preference: notice });
      const click = (label) => { const button = els.interaction.children.find(item => item.textContent === label); assert.ok(button, `missing ${label}`); button.click(); };
      click(earlyLabel); await flush();
      assert.equal(els['story-text'].textContent, story.early_rescue_now_setup.text);
      els.advance.click(); await flush();
      click(story.rescue_coordination_choice.choices[0].label); await flush();
      for (let i = 0; i < 10 && !els['story-text'].textContent.startsWith('Mira sits against the open door'); i++) { els.advance.click(); await flush(); }
      assert.match(els['story-text'].textContent, /Welcome card:.*Map notice:/);
      assert.doesNotMatch(els['story-text'].textContent, /\{(?:card|notice)Comparison\}/);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.early_together_citation.text);
      click(story.early_together_citation.choices[1].label); await flush();
      els.interaction.children.find(item => item.id === 'player-message').value = 'We found our way back';
      click('Write on the map →'); await flush();
      assert.match(els['story-text'].textContent, /We found our way back/);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.match(els['story-text'].textContent, /We found our way back/, 'the player’s note survives a checkpoint');
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`early_together_${style}`].text);
      const panel = els.interaction.children.find(item => item.className === 'policy-opening');
      assert.equal(Boolean(panel), ['direct', 'warm'].includes(style), 'only a clear preference presents an unselected opening');
      if (panel) {
        const other = style === 'direct' ? 'warm' : 'direct';
        const opening = story[`early_together_${other}`].text.split('.')[0] + '.';
        assert.equal(panel.children[1].textContent, `“${opening}”`);
      }
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.early_together_false_ending.text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.early_together_callback_note.text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.rescue_reunion_choice.text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('early rescue recalls only completed screen actions and preserves the proof path', async () => {
    const base = { companion: 'Ash', route_action: 'proof', ending: 'rescue', reveal_pace_v2: 'yes',
      card_comparison_seen: 'yes', notice_comparison_seen: 'yes', card_preference: 'warm', notice_preference: 'direct',
      early_rescue_now: 'open_now', rescue_opened: 'yes', early_together_comparisons_seen: 'yes', early_together_citation_seen: 'yes' };
    for (const action of ['cover', 'note', 'leave', 'unplug']) for (const complete of [true, false]) {
      const flags = { ...base, early_together_action: action, ...(complete ? { early_together_action_seen: action } : {}),
        ...(complete && action === 'note' ? { annotation_written: 'yes' } : {}) };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'early_together_false_ending',
        answer: '', privateAnswer: '', annotation: complete && action === 'note' ? 'A note' : '', relationship: 'Ash', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, complete ? story[`early_together_callback_${action}`].text : story.rescue_proof.text);
      if (complete) {
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story[`early_together_callback_${action}`].text);
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.rescue_proof.text);
      }
    }
    storageData.clear(); els.restart.click();
  });

  await test('the early door attempt and Mira interaction survive checkpoints without repeating', async () => {
    for (const [index, effort] of ['brace', 'listen'].entries()) {
      const focus = index === 0 ? 'tell' : 'listen';
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { early_door_choice: index, late_focus_choice: index };
      for (let i = 0; i < 160 && els['story-text'].textContent !== story.early_door_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.early_door_choice.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.early_door_choice.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`early_door_${effort}`].text);
      for (let i = 0; i < 30 && els['story-text'].textContent !== story.reason_focus_team.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.reason_focus_team.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`late_focus_${focus}_receipt`].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.door_effort, effort);
      assert.equal(saved.flags.early_door_done, 'yes');
      assert.equal(saved.flags.reveal_focus, focus);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`late_focus_${focus}_receipt`].text);
      for (let i = 0; i < 70 && els['story-text'].textContent !== story.early_audit_choice.text; i++) {
        assert.notEqual(els['story-text'].textContent, story.door_choice.text, 'the original late door decision must not recur');
        await step(plan);
      }
      assert.equal(els['story-text'].textContent, story.early_audit_choice.text);
      assert.deepEqual(els.interaction.children.map(item => item.textContent), story.audit_action_choice.choices.map(item => item.label));
    }
  });

  await test('a v140 focus checkpoint continues without repeating Mira’s choice', async () => {
    for (const node of ['fourth_focus_choice', 'moment_return_keep_compact']) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node,
        answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', disclosure: 'private', moment: 'keep', reason: 'team',
          early_door_done: 'yes', door_effort: 'brace', signal: 'private',
          ...(node === 'moment_return_keep_compact' ? { reveal_focus: 'tell' } : {}) }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[node].text);
      const plan = { fourth_focus_choice: 0 };
      for (let i = 0; i < 30 && els['story-text'].textContent !== story.history_steps_check.text; i++) {
        assert.notEqual(els['story-text'].textContent, story.late_focus_choice.text, 'the new focus choice must not repeat');
        await step(plan);
      }
      assert.equal(els['story-text'].textContent, story.history_steps_check.text);
    }
  });

  await test('compact discoveries preserve the card picture and old checkpoints', async () => {
    for (const name of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) {
      const route = name.toLowerCase();
      const save = { version: 1, node: `discovery_${route}`, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, bond }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(save));
      els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`discovery_${route}_compact`].text);
      assert.equal(els['souvenir-art'].hidden, true, 'the card picture is revealed by the following passage');
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.midpoint_route, route);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`discovery_${route}_compact`].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`moment_${route}_${bond}`].text);
      assert.equal(els['souvenir-art'].src, `./assets/souvenir-${route}-${bond}.svg`);
      assert.ok(els['souvenir-art'].alt.length > 30);
      assert.equal(els['souvenir-art'].hidden, false);

      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...save, node: `discovery_${route}_2` }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`discovery_${route}_2`].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`moment_${route}`].text, 'old saves retain the original card arrival');
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`moment_${route}_${bond}`].text);
    }
    const oldIncomplete = { version: 1, node: 'discovery_mira', answer: '', privateAnswer: '', relationship: 'Mira',
      flags: { companion: 'Mira' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(oldIncomplete));
    els.restart.click(); els.resume.click(); await flush();
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.discovery_mira_2.text, 'no activity does not invent a compact card');
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.moment_mira.text);
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.shared_discovery.text);
    storageData.clear(); els.restart.click();
  });

  await test('the card reflects the shared activity and its treatment survives a checkpoint', async () => {
    for (const [companionIndex, companion] of ['niko', 'mira', 'ash'].entries()) {
      for (const [bondIndex, bond] of ['care', 'play'].entries()) for (const [momentIndex, moment] of ['keep', 'tear'].entries()) {
        storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
        const plan = { crew_choice: companionIndex, [`${companion}_bond_choice`]: bondIndex, moment_choice: momentIndex };
        let sawPicture = false;
        for (let i = 0; i < 120 && els['story-text'].textContent !== story[`moment_${moment}`].text; i++) {
          if (els['story-text'].textContent === story[`moment_${companion}_${bond}`].text) sawPicture = true;
          await step(plan);
        }
        assert.ok(sawPicture, `The ${companion}/${bond} picture appeared`);
        assert.equal(els['story-text'].textContent, story[`moment_${moment}`].text);
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story[`moment_${moment}`].text);
        for (let i = 0; i < 120 && els['story-text'].textContent !== story[`moment_return_${moment}_compact`].text; i++) await step(plan);
        assert.equal(els['story-text'].textContent, story[`moment_return_${moment}_compact`].text);
      }
    }
  });

  await test('saving the repair offer reports an unsaved name without storing it', async () => {
    storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.repair_offer.text; i++) await step({});
    const input = els.interaction.children.find(el => el.id === 'repair-name');
    assert.ok(input);
    els.save.click();
    assert.equal(els['save-status'].textContent, 'Story saved on this device.');
    input.value = 'Aviva Sofia'; els.save.click();
    assert.equal(els['save-status'].textContent, 'Story saved on this device. The offer name was not saved.');
    assert.equal(input.value, 'Aviva Sofia', 'saving must not erase the on-screen name');
    assert.ok(!storageData.get('okie-dokie.arcade.v1').includes('Aviva Sofia'));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.repair_offer.text);
    assert.equal(els.interaction.children.find(el => el.id === 'repair-name').value, '');
  });

  await test('auto-read speaks the offer result and newly available action', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const requests = [];
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      storageData.clear();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'repair_offer',
        answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000';
      els['tts-url'].value = 'http://127.0.0.1:8002'; els['settings-form'].submit();
      els.resume.click(); await flush();
      if (els['auto-read']['aria-pressed'] !== 'true') els['auto-read'].click();
      for (let i = 0; i < 8; i++) await flush();
      requests.length = 0;
      const input = els.interaction.children.find(el => el.id === 'repair-name');
      const check = els.interaction.children.find(el => el.textContent === 'Check offer');
      input.value = 'Sophia'; check.click();
      for (let i = 0; i < 8; i++) await flush();
      assert.equal(requests[0].text, 'Wrench & Bandage Field Repair: 100% discount — free.');
      assert.equal(requests[0].voice, 'af_heart');
      assert.equal(requests[1].text, 'Take the free repair kit');
      assert.equal(requests[1].voice, 'af_sarah');
      els['auto-read'].click();
      const before = requests.length;
      input.value = ''; check.click(); await flush();
      assert.equal(requests.length, before, 'turning auto-read off suppresses offer updates');
    } finally {
      if (els['auto-read']['aria-pressed'] === 'true') els['auto-read'].click();
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
    }
  });

  await test('the free aliases grant a saved kit, while paid purchase stays unavailable', async () => {
    let network = 0;
    globalThis.fetch = async () => { network++; throw new Error('Unexpected network'); };
    for (const alias of ['Aviva Sofia', 'AVIVA SOPHIA', 'sophia']) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      for (let i = 0; i < 100 && els['story-text'].textContent !== story.repair_offer.text; i++) await step({});
      const input = els.interaction.children.find(el => el.id === 'repair-name');
      const claim = els.interaction.children.find(el => el.textContent === 'Take the free repair kit');
      const check = els.interaction.children.find(el => el.textContent === 'Check offer');
      assert.ok(els.interaction.children.find(el => el.textContent === 'Buy repair kit').hidden);
      assert.ok(claim.hidden); input.value = alias; check.click(); assert.equal(claim.hidden, false);
      claim.click(); await flush(); assert.equal(els['story-text'].textContent, story.repair_free.text);
      const history = els['story-history-list'].children.map(el => el.textContent);
      assert.ok(history.includes('You chose: Take the free repair kit'));
      assert.ok(!history.some(line => line.toLowerCase().includes(alias.toLowerCase())), 'The offer name is not added to recent story');
      claim.click(); await flush();
      assert.equal(els['story-text'].textContent, story.repair_free.text, 'A stale claim cannot navigate or record another choice');
      assert.equal(els['story-history-list'].children.filter(el => el.textContent === 'You chose: Take the free repair kit').length, 1);
      els.save.click(); const raw = storageData.get('okie-dokie.arcade.v1');
      assert.equal(JSON.parse(raw).flags.repairKit, 'free');
      assert.ok(!raw.toLowerCase().includes(alias.toLowerCase()));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.repair_free.text);
      let used = false;
      for (let i = 0; i < 250 && els.status.textContent !== 'END OF THE PROTOTYPE'; i++) {
        if (els['story-text'].textContent === story.kit_use.text) {
          used = true; els.save.click();
          assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.kit_use_seen, 'yes', 'the observed kit moment survives an explicit save');
        }
        assert.notEqual(els['story-text'].textContent, story.repair_offer.text, 'the completed offer is not shown again');
        await step({});
      }
      assert.ok(used, 'The free kit must have an authored outcome');
    }
    els.restart.click(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.repair_offer.text; i++) await step({});
    const input = els.interaction.children.find(el => el.id === 'repair-name');
    const claim = els.interaction.children.find(el => el.textContent === 'Take the free repair kit');
    const check = els.interaction.children.find(el => el.textContent === 'Check offer');
    input.value = 'Not an alias'; check.click(); await flush(); assert.ok(claim.hidden);
    assert.ok(els.interaction.children.some(el => el.textContent === 'Paid purchase is unavailable in this version.'));
    input.value = 'Sophia'; check.click(); assert.equal(claim.hidden, false);
    input.value = 'Not an alias'; claim.click();
    assert.equal(els['story-text'].textContent, story.repair_offer.text, 'Name must be rechecked when claiming');
    assert.ok(!els['story-history-list'].children.some(el => el.textContent === 'You chose: Take the free repair kit'), 'A rejected free claim is not recorded');
    const skip = els.interaction.children.find(el => el.textContent === 'Continue without the kit');
    skip.click(); await flush();
    assert.equal(els['story-text'].textContent, story.repair_skip.text);
    assert.ok(els['story-history-list'].children.some(el => el.textContent === 'You chose: Continue without the kit'));
    assert.ok(!els['story-history-list'].children.some(el => /Not an alias|Sophia/i.test(el.textContent)));
    skip.click(); await flush();
    assert.equal(els['story-history-list'].children.filter(el => el.textContent === 'You chose: Continue without the kit').length, 1);
    assert.equal(network, 0);
  });

  await test('a postponed offer survives a checkpoint without repeating for older saves', async () => {
    for (const due of ['yes', 'done', '']) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'hint_skip',
        answer: '', privateAnswer: '', relationship: '',
        flags: { reason: 'team', ...(due ? { repair_offer_due: due } : {}) }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, due === 'yes' ? story.mallow_team_wave.text : story.crew_plan.text,
        'the current route has a shared Mallow moment; done and legacy checkpoints continue to the crew');
      if (due === 'yes') {
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.repair_offer_intro.text);
        els.advance.click(); await flush();
        els.interaction.children.find(el => el.textContent === 'Continue without the kit').click(); await flush();
        els.save.click();
        assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.repair_offer_due, 'done');
        els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.crew_plan.text);
      }
    }
    storageData.clear(); els.restart.click();
  });

  await test('paid kit uses verified store purchase or restore and saves the story flag', async () => {
    const openOffer = async () => {
      storageData.clear(); storeCalls = [];
      fakeStoreProduct = { status: 'available', productId: 'field.kit', formattedPrice: '¥50' };
      fakeStorePurchase = fakeStoreRestore = { status: 'unavailable' };
      els.restart.click(); els.start.click(); await flush();
      for (let i = 0; i < 100 && els['story-text'].textContent !== story.repair_offer.text; i++) await step({});
      const input = els.interaction.children.find(el => el.id === 'repair-name');
      input.value = 'Another player';
      els.interaction.children.find(el => el.textContent === 'Check offer').click(); await flush();
      const buy = els.interaction.children.find(el => el.textContent === 'Buy repair kit — ¥50');
      const restore = els.interaction.children.find(el => el.textContent === 'Restore purchase');
      assert.ok(buy && !buy.hidden && restore && !restore.hidden);
      assert.deepEqual(storeCalls, ['getProduct'], 'Checking a price must not purchase or restore');
      return { input, buy, restore };
    };
    for (const method of ['purchase', 'restore']) {
      const { buy, restore } = await openOffer();
      const verified = { status: 'purchased', verified: true, productId: 'field.kit' };
      if (method === 'purchase') fakeStorePurchase = verified; else fakeStoreRestore = verified;
      (method === 'purchase' ? buy : restore).click(); await flush();
      assert.equal(els['story-text'].textContent, story.repair_free.text);
      const expectedChoice = method === 'purchase' ? 'Buy repair kit' : 'Restore purchase';
      assert.ok(els['story-history-list'].children.some(el => el.textContent === `You chose: ${expectedChoice}`));
      assert.ok(!els['story-history-list'].children.some(el => el.textContent.includes('Another player')));
      assert.deepEqual(storeCalls, ['getProduct', method]);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.repairKit, 'paid');
      assert.ok(!JSON.stringify(saved).includes('Another player'));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.repair_free.text);
      let used = false;
      for (let i = 0; i < 250 && els.status.textContent !== 'END OF THE PROTOTYPE'; i++) {
        if (els['story-text'].textContent === story.kit_use.text) used = true;
        await step({});
      }
      assert.ok(used, 'Paid kit must have the same authored payoff');
    }
    for (const result of [
      { status: 'pending' }, { status: 'cancelled' }, { status: 'error' },
      { status: 'purchased', verified: false, productId: 'field.kit' },
      { status: 'purchased', verified: true, productId: 'wrong.product' }
    ]) {
      const { buy } = await openOffer(); fakeStorePurchase = result;
      buy.click(); await flush();
      assert.equal(els['story-text'].textContent, story.repair_offer.text, `${result.status} must not grant`);
      assert.ok(!els['story-history-list'].children.some(el => el.textContent === 'You chose: Buy repair kit'), 'Unsuccessful purchases are not recorded as choices');
      assert.ok(els.interaction.children.some(el => /pending|cancelled|unavailable/i.test(el.textContent)));
      els.save.click(); assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.repairKit, undefined);
    }
    for (const result of [{ status: 'not_owned' }, { status: 'pending' }, { status: 'error' }]) {
      const { restore } = await openOffer(); fakeStoreRestore = result;
      restore.click(); await flush();
      assert.equal(els['story-text'].textContent, story.repair_offer.text, `Restore ${result.status} must not grant`);
      assert.ok(!els['story-history-list'].children.some(el => el.textContent === 'You chose: Restore purchase'), 'Unsuccessful restores are not recorded as choices');
      els.save.click(); assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.repairKit, undefined);
    }
    let resolvePurchase;
    let offer = await openOffer();
    fakeStorePurchase = new Promise(resolve => { resolvePurchase = resolve; });
    offer.buy.click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Continue without the kit').click(); await flush();
    resolvePurchase({ status: 'purchased', verified: true, productId: 'field.kit' }); await flush();
    assert.equal(els['story-text'].textContent, story.repair_skip.text, 'Late purchase must not change a departed scene');
    assert.ok(!els['story-history-list'].children.some(el => el.textContent === 'You chose: Buy repair kit'), 'A stale purchase cannot change recent story');
    assert.equal(els['story-history-list'].children.filter(el => el.textContent === 'You chose: Continue without the kit').length, 1);
    els.save.click(); assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.repairKit, undefined);

    offer = await openOffer();
    fakeStorePurchase = new Promise(resolve => { resolvePurchase = resolve; });
    offer.buy.click(); await flush();
    offer.input.value = 'Another name'; offer.input.listeners.input();
    els.interaction.children.find(el => el.textContent === 'Check offer').click(); await flush();
    assert.ok(els.interaction.children.some(el => /store operation is still in progress/i.test(el.textContent)), 'An in-flight purchase should be distinguished from an unavailable store');
    offer.input.value = 'Sophia'; offer.input.listeners.input();
    resolvePurchase({ status: 'purchased', verified: true, productId: 'field.kit' }); await flush();
    assert.equal(els['story-text'].textContent, story.repair_offer.text, 'Changing the name must invalidate the pending result');
    els.interaction.children.find(el => el.textContent === 'Check offer').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Take the free repair kit').click(); await flush();
    els.save.click(); assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.repairKit, 'free');
    fakeStoreProduct = { status: 'unavailable' };
  });

  await test('three companions preserve private consent and isolate shared follow-ups', async () => {
    for (let companion = 0; companion < 3; companion++) for (const signal of [0, 1]) {
      const requests = [], spokenVoices = [];
      globalThis.fetch = async (url, request) => {
        if (String(url).includes('/audio/speech')) { spokenVoices.push(JSON.parse(request.body).voice); return new Response('', { status: 503 }); }
        const data = JSON.parse(JSON.parse(request.body).messages[1].content); requests.push(data);
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      storageData.clear(); storageData.set('after-the-signal.save.v1', 'legacy checkpoint');
      els.restart.click(); assert.equal(els.resume.hidden, true, 'Old story saves must not resume here');
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['speech-mode'].value = 'openai'; els['speech-url'].value = 'https://speech.example';
      for (const name of ['niko', 'mira', 'ash', 'mallow']) els[`${name}-voice`].value = `${name}_voice`;
      els['settings-form'].submit(); els.start.click(); await flush();
      const name = ['Niko', 'Mira', 'Ash'][companion];
      const publicText = companion === 0 && signal === 1 ? '' : 'A shared message.';
      const expectedPublic = publicText || story.mallow_input.input.default;
      const plan = { crew_choice: companion, signal_choice: signal, privateText: 'Private original.', publicText };
      for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step(plan);
      assert.equal(requests[0].character, name);
      assert.ok(requests[0].scene.includes(story[`${name.toLowerCase()}_private`].text), 'The character must have the actual line the player is answering');
      assert.equal(els.portrait.src, `./assets/${name.toLowerCase()}-concerned.png`);
      els.speak.click(); await flush(); assert.equal(spokenVoices.at(-1), `${name.toLowerCase()}_voice`);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Private extra.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.ok(requests.at(-1).scene.includes(story[`${name.toLowerCase()}_private`].text), 'Follow-ups must retain their authored lead-in');
      els.advance.click(); await flush(); els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.companion, name); assert.equal(saved.relationship, name);
      assert.equal(saved.privateAnswer, 'Private original.');
      assert.equal(saved.privateFollowup, 'Private extra.');
      assert.equal(storageData.get('after-the-signal.save.v1'), 'legacy checkpoint');
      els.restart.click(); els.resume.click(); await flush();
      for (let i = 0; i < 100 && !requests.some(item => item.character === 'Mallow'); i++) await step(plan);
      const shown = els['story-history-list'].children.map(item => item.textContent);
      assert.equal(shown.includes('Mallow: You said, “Private extra.”'), signal === 0,
        'Mallow repeats the latest submitted line only after the player shares it');
      assert.ok(!shown.includes('Mallow: You said, “Private original.”'));
      const first = requests.find(item => item.character === 'Mallow');
      assert.ok(first.scene.includes(story.mallow_request.text), 'Mallow must know the question the player is answering');
      assert.equal(first.player_says, expectedPublic);
      assert.deepEqual(first.memory.map(item => item.text), signal === 0 ? ['Private extra.'] : []);
      assert.ok(!JSON.stringify(first).includes('Private original.'));
      assert.equal(JSON.stringify(first).includes('Private extra.'), signal === 0);
      els.speak.click(); await flush(); assert.equal(spokenVoices.at(-1), 'mallow_voice');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      const label = els.interaction.children.find(el => el.htmlFor === 'player-follow-up');
      assert.match(label.textContent, /shared with the crew/i); assert.doesNotMatch(label.textContent, /on air/i);
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Another shared message.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      const later = requests.at(-1);
      assert.ok(later.scene.includes(story.mallow_request.text), 'Mallow follow-ups must retain the authored lead-in');
      assert.deepEqual(later.memory.map(item => item.text), [...(signal === 0 ? ['Private extra.'] : []), expectedPublic, 'I am listening.']);
      assert.ok(!JSON.stringify(later).includes('Private original.'));
      assert.equal(JSON.stringify(later).includes('Private extra.'), signal === 0);
      for (const message of ['Second shared follow-up.', 'Third shared follow-up.']) {
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = message;
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      }
      const trimmed = requests.at(-1).memory;
      assert.deepEqual(trimmed.map(item => item.text), signal === 0
        ? ['Private extra.', expectedPublic, 'I am listening.', 'Second shared follow-up.', 'I am listening.']
        : [expectedPublic, 'I am listening.', 'Second shared follow-up.', 'I am listening.']);
      assert.ok(!JSON.stringify(trimmed).includes('Private original.'));
      assert.equal(JSON.stringify(trimmed).includes('Private extra.'), signal === 0);
      const talkId = `close_${name.toLowerCase()}_talk_choice`;
      for (let i = 0; i < 250 && els['story-text'].textContent !== story[talkId].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[talkId].text);
      choiceAt(talkId, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'A later epilogue line.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A later epilogue follow-up.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      els.advance.click(); await flush(); els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).privateFollowup, 'Private extra.',
        'Epilogue turns do not replace the shared private line');
    }
  });

  await test('older and bounded checkpoints keep the intended private line', async () => {
    for (const followup of [undefined, '', 'Latest retained line.']) {
      const checkpoint = { version: 1, node: 'signal_choice', answer: '', privateAnswer: 'Original private line.',
        relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] };
      if (followup !== undefined) checkpoint.privateFollowup = followup;
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('signal_choice', 0); await flush();
      assert.equal(els['story-text'].textContent, `You said, “${followup || checkpoint.privateAnswer}”`);
    }
    for (const followup of ['x'.repeat(501), 123, null]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'signal_choice', answer: '',
        privateAnswer: 'Original.', privateFollowup: followup, relationship: 'Niko',
        flags: { companion: 'Niko' }, followupMemory: [] }));
      els.restart.click();
      assert.equal(els.resume.hidden, true, 'Invalid retained lines cannot make an oversized or malformed checkpoint usable');
    }
    storageData.clear(); els.restart.click();
  });

  await test('long conversation turns reach follow-ups and survive checkpoints without losing their endings', async () => {
    const requests = [];
    const firstMessage = 'p'.repeat(490) + 'first-end!';
    const laterMessage = 'q'.repeat(490) + 'later-end!';
    const characterReply = 'r'.repeat(695) + ' end.';
    assert.equal(firstMessage.length, 500);
    assert.equal(laterMessage.length, 500);
    assert.equal(characterReply.length, 700);
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: characterReply } }] });
    };
    storageData.clear(); els.restart.click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({ privateText: firstMessage });
    assert.equal(requests[0].player_says, firstMessage);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = laterMessage;
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests[1].player_says, laterMessage);
    assert.deepEqual(requests[1].memory.map(entry => entry.text), [firstMessage, characterReply]);
    els.advance.click(); await flush(); els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(saved.privateFollowup, laterMessage, 'The full submitted follow-up is retained separately');
    assert.deepEqual(saved.followupMemory.map(entry => entry.text), [firstMessage, characterReply, laterMessage, characterReply]);
    els.restart.click(); els.resume.click(); await flush(); els.save.click();
    const restored = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(restored.privateFollowup, laterMessage);
    assert.deepEqual(restored.followupMemory.map(entry => entry.text), saved.followupMemory.map(entry => entry.text));
  });

  await test('the selected shared activity grounds private dialogue and survives save without reaching Mallow', async () => {
    for (const [companion, name] of ['Niko', 'Mira', 'Ash'].entries()) for (const bond of [0, 1]) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      storageData.clear(); els.restart.click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const prefix = name.toLowerCase();
      const plan = { crew_choice: companion, [`${prefix}_bond_choice`]: bond, signal_choice: 1 };
      for (let i = 0; i < 100 && els['story-text'].textContent !== story[`${prefix}_input`].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[`${prefix}_input`].text);
      els.save.click();
      const withReply = storageData.get('okie-dokie.arcade.v1');
      // An older checkpoint or a mismatched witness cannot give the model a
      // response that this player did not see from this companion.
      for (const witness of ['missing-reply', 'missing-label', 'other-reply', 'other-label']) {
        const checkpoint = JSON.parse(withReply);
        const otherName = name === 'Niko' ? 'Mira' : 'Niko';
        if (witness === 'missing-reply') delete checkpoint.flags.match_reply_seen;
        if (witness === 'missing-label') delete checkpoint.flags.match_label_seen;
        if (witness === 'other-reply') checkpoint.flags.match_reply_seen = otherName;
        if (witness === 'other-label') checkpoint.flags.match_label_seen = otherName;
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
        els.restart.click(); els.resume.click(); await flush();
        await step(plan);
        assert.ok(!requests.at(-1).scene.includes('arcade display called the player and the companion a PERFECT MATCH'), witness);
      }
      storageData.set('okie-dokie.arcade.v1', withReply);
      els.restart.click(); els.resume.click(); await flush();
      await step(plan);
      const first = requests.at(-1);
      const chosen = story[`${prefix}_bond_choice`].choices[bond];
      const other = story[`${prefix}_bond_choice`].choices[1 - bond];
      const setup = {
        Niko: 'Niko offers the player the empty IMPORTANT lid and waits to see what the player will do with it.',
        Mira: 'A half-finished plush waits beside Mira’s sketchbook. She offers the player the loose ear and a pencil.',
        Ash: "Ash leaves a little space on the map for the player's contribution."
      }[name];
      assert.equal(first.character, name);
      assert.ok(!first.scene.includes('Searching with '), 'the later work choice is not invented in the early private conversation');
      assert.ok(first.scene.includes('arcade display called the player and the companion a PERFECT MATCH'));
      const actualMatchReply = {
        Niko: 'Perfect match? I’ll settle for someone who won’t eat the screws.',
        Mira: 'Perfect match? Only if you wear your helmet.',
        Ash: 'Perfect match? We’ll see if you can read my map.'
      }[name];
      assert.ok(first.scene.includes(`${name} replied: ${JSON.stringify(actualMatchReply)}`), 'the exact witnessed reply grounds recall');
      assert.ok(first.scene.length <= 1800);
      assert.ok(first.scene.includes(setup), 'the witnessed setup identifies the player and supplies the object referenced by the choice');
      assert.equal(first.activity_setup, undefined, 'the short private scene carries the setup inline');
      assert.ok(first.scene.includes(chosen.label));
      assert.ok(first.scene.includes(story[chosen.next].text));
      assert.ok(!first.scene.includes(other.label));
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Tell me more about that.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.ok(requests.at(-1).scene.includes(`${name} replied: ${JSON.stringify(actualMatchReply)}`), 'follow-up retains the witnessed reply');
      assert.ok(requests.at(-1).scene.includes(chosen.label));
      assert.ok(requests.at(-1).scene.includes(story[chosen.next].text));
      assert.ok(requests.at(-1).scene.includes(setup), 'follow-ups retain the same player-oriented setup');
      els.advance.click(); await flush();
      for (let i = 0; i < 100 && !requests.some(item => item.character === 'Mallow'); i++) await step(plan);
      const mallow = requests.find(item => item.character === 'Mallow');
      assert.ok(mallow);
      assert.ok(!mallow.scene.includes('arcade display called the player and the companion a PERFECT MATCH'));
      assert.ok(!mallow.scene.includes(actualMatchReply), 'the companion’s private reply is not sent to Mallow');
      assert.ok(!mallow.scene.includes(chosen.label));
      assert.ok(!mallow.scene.includes(story[chosen.next].text));
      assert.ok(!mallow.scene.includes('A note inside the panel says CHECK THE EASY THING FIRST'), 'Niko’s private note does not leak to the group');
      assert.ok(!mallow.scene.includes('Searching with '), 'the companion-only closing work context is not sent to Mallow');
      assert.equal(mallow.activity_setup, undefined, 'the private activity setup is not sent to Mallow');
      assert.equal(mallow.activity_exchange, undefined, 'the private activity exchange is not sent to Mallow');
    }
  });

  await test('Niko’s private model context includes the note only when it was witnessed', async () => {
    const note = 'A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.';
    for (const seen of ['witnessed', 'older', 'inconsistent']) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const checkpoint = { version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', bond: 'play', ...(seen === 'witnessed' ? { niko_note_seen: 'yes', niko_note_due: 'yes' } : seen === 'inconsistent' ? { niko_note_seen: 'yes' } : {}) }, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'Tell me about the note.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests[0].scene.includes(note), seen === 'witnessed', 'old or inconsistent saves must not invent an unseen note');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Does it help?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests[1].scene.includes(note), seen === 'witnessed', 'follow-ups keep the same witnessed context');
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('Niko can recall the witnessed note in the closing conversation without sharing it with other companions', async () => {
    const note = 'A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.';
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const [name, seen] of [['Niko', 'witnessed'], ['Niko', 'older'], ['Niko', 'inconsistent'], ['Mira', 'witnessed'], ['Ash', 'witnessed']]) {
      const node = `close_${name.toLowerCase()}_input`;
      const flags = { companion: name, bond: 'play', topic: 'past', ending: 'rescue', evidence: 'receipt',
        ...(seen === 'witnessed' ? { niko_note_seen: 'yes', niko_note_due: 'yes' } : seen === 'inconsistent' ? { niko_note_seen: 'yes' } : {}) };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node, answer: '', privateAnswer: 'Earlier words.', relationship: name, flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What did the note say?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal((requests.at(-1).activity_setup || '').includes(note), name === 'Niko' && seen === 'witnessed');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Who wrote it?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal((requests.at(-1).activity_setup || '').includes(note), name === 'Niko' && seen === 'witnessed');
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('a maximum-length Niko activity setup retains the witnessed note in closing requests', async () => {
    const note = 'A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.';
    const choice = story.niko_bond_choice, original = choice.text;
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    try {
      choice.text = 'S'.repeat(300);
      for (const seen of [true, false]) {
        const flags = { companion: 'Niko', bond: 'play', topic: 'past', ending: 'rescue', evidence: 'receipt',
          ...(seen ? { niko_note_seen: 'yes', niko_note_due: 'yes' } : {}) };
        storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_input', answer: '', privateAnswer: 'Earlier words.', relationship: 'Niko', flags, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        els.interaction.children.find(el => el.id === 'player-message').value = 'What did the note say?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        assert.equal(requests.at(-1).activity_setup, choice.text + (seen ? ` ${note}` : ''), 'the full witnessed setup and note must reach the model');
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Who wrote it?';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        assert.equal(requests.at(-1).activity_setup, choice.text + (seen ? ` ${note}` : ''), 'follow-ups retain the same witnessed setup');
      }
    } finally {
      choice.text = original;
      els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
    }
  });

  await test('activity setup normalizes narrator perspective without rewriting quoted dialogue', async () => {
    const choice = story.niko_bond_choice, original = choice.text;
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    els.restart.click(); els['settings-clear'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    try {
      choice.text = 'Niko tells you, “you should rest.” You’ll tell your friend.';
      const expected = 'Niko tells the player, “you should rest.” The player will tell the player\'s friend.';
      const flags = { companion: 'Niko', bond: 'play', topic: 'past', ending: 'rescue', evidence: 'receipt' };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_input', answer: '', privateAnswer: 'Earlier words.', relationship: 'Niko', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'Do you remember?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests.at(-1).activity_setup, expected);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And the rest?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.at(-1).activity_setup, expected);
    } finally {
      choice.text = original;
      els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
    }
  });

  await test('an older save without a shared activity does not invent one for the model', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    storageData.clear(); els.restart.click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    delete saved.flags.bond;
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els.resume.click(); await flush();
    await step({});
    assert.ok(!requests[0].scene.includes('Earlier, player:'));
    assert.equal(requests[0].activity_setup, undefined, 'older saves without an activity do not invent the setup');
    assert.equal(requests[0].activity_exchange, undefined, 'older saves without an activity do not invent the exchange');
    assert.ok(requests[0].scene.includes(story.niko_private.text));
  });

  await test('witnessed comparisons condition companion AI and follow-ups without changing older saves', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      const body = JSON.parse(request.body);
      requests.push({ system: body.messages[0].content, data: JSON.parse(body.messages[1].content) });
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    const scenarios = [
      [{ card_comparison_seen: 'yes', card_preference: 'direct' }, 'clear and direct'],
      [{ card_comparison_seen: 'yes', card_preference: 'warm' }, 'warm and reassuring'],
      [{ card_comparison_seen: 'yes', card_preference: 'skip' }, undefined],
      [{ card_comparison_seen: 'yes', card_preference: 'warm', notice_comparison_seen: 'yes', notice_preference: 'warm' }, 'warm and reassuring'],
      [{ card_comparison_seen: 'yes', card_preference: 'direct', notice_comparison_seen: 'yes', notice_preference: 'direct' }, 'clear and direct'],
      [{ card_comparison_seen: 'yes', card_preference: 'direct', notice_comparison_seen: 'yes', notice_preference: 'warm' }, undefined],
      [{ card_comparison_seen: 'yes', card_preference: 'skip', notice_comparison_seen: 'yes', notice_preference: 'skip' }, undefined],
      [{ card_preference: 'direct', notice_preference: 'direct' }, undefined],
      [{ card_preference: 'direct', notice_comparison_seen: 'yes', notice_preference: 'warm' }, 'warm and reassuring']
    ];
    try {
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      for (const name of ['Niko', 'Mira', 'Ash']) for (const kind of ['private', 'midpoint']) for (const [observed, expected] of scenarios) {
        const lower = name.toLowerCase();
        const node = kind === 'private' ? `${lower}_input` : `mid_${lower}_input`;
        const flags = { companion: name, ...observed };
        storageData.clear();
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story[node].text);
        const before = requests.length;
        els.interaction.children.find(el => el.id === 'player-message').value = 'What do you think?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        assert.equal(requests.length, before + 1);
        assert.equal(requests.at(-1).data.response_style, expected, `${name} ${kind} ${JSON.stringify(observed)}`);
        assert.equal(requests.at(-1).data.voice, characters[name].voice);
        assert.equal(requests.at(-1).system.includes('Apply the requested response_style'), Boolean(expected));
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(requests.length, before + 1, 'restoring a reply sends no request');
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Please continue.';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        assert.equal(requests.length, before + 2);
        assert.equal(requests.at(-1).data.response_style, expected, 'follow-up uses the same witnessed policy');
      }
    } finally {
      els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear();
    }
  });

  await test('companion retry retains its witnessed response style', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      const body = JSON.parse(request.body);
      requests.push(JSON.parse(body.messages[1].content));
      return requests.length === 1 ? new Response('', { status: 503 }) : jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    try {
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      storageData.clear();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', card_comparison_seen: 'yes', card_preference: 'warm' }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What do you think?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests[0].response_style, 'warm and reassuring');
      els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.equal(requests[1].response_style, 'warm and reassuring');
    } finally {
      els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear();
    }
  });

  await test('pairwise feedback survives checkpoints and controls both scripted and optional AI dialogue', async () => {
    for (const scenario of [
      { card: 0, notice: 0, a: 1, b: 1, style: 'direct' },
      { card: 1, notice: 1, a: 0, b: 0, style: 'warm' },
      { card: 0, notice: 1, a: 1, b: 1, style: 'neutral' },
      { card: 1, notice: 0, a: 1, b: 1, style: 'neutral' },
      { card: 2, notice: 2, a: 0, b: 0, style: 'neutral' },
      { card: 2, notice: 1, a: 0, b: 0, style: 'warm' },
      { card: 0, notice: 2, a: 1, b: 1, style: 'direct' }
    ]) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        const data = JSON.parse(JSON.parse(request.body).messages[1].content); requests.push(data);
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const plan = { card_choice: scenario.card, notice_choice: scenario.notice,
        hint_choice: scenario.a, basement_vote: scenario.b, signal_choice: 1 };
      for (let i = 0; i < 80 && els['story-text'].textContent !== story.card_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.card_choice.text);
      choiceAt('card_choice', scenario.card); await flush(); els.save.click();
      let saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.card_preference, ['direct', 'warm', 'skip'][scenario.card]);
      assert.equal(saved.flags.card_comparison_seen, 'yes');
      els.restart.click(); els.resume.click(); await flush();
      for (let i = 0; i < 80 && els['story-text'].textContent !== story.notice_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.notice_choice.text);
      choiceAt('notice_choice', scenario.notice); await flush(); els.save.click();
      saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.card_preference, ['direct', 'warm', 'skip'][scenario.card]);
      assert.equal(saved.flags.notice_preference, ['direct', 'warm', 'skip'][scenario.notice]);
      assert.equal(saved.flags.notice_comparison_seen, 'yes');
      const companion = requests.find(item => item.character === 'Niko');
      assert.ok(companion, 'companion conversation is reached between the comparisons');
      assert.equal(companion.response_style, ['clear and direct', 'warm and reassuring', undefined][scenario.card]);
      els.restart.click(); els.resume.click(); await flush();
      for (let i = 0; i < 120 && !requests.some(item => item.character === 'Mallow'); i++) await step(plan);
      const first = requests.find(item => item.character === 'Mallow');
      assert.ok(first, 'Mallow should receive a request');
      if (scenario.style === 'direct') assert.match(first.scene, /clear, direct tone/i);
      if (scenario.style === 'warm') assert.match(first.scene, /warm, reassuring tone/i);
      if (scenario.style === 'neutral') assert.doesNotMatch(first.scene, /clear, direct tone|warm, reassuring tone/i);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Please keep talking.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      const later = requests.at(-1);
      if (scenario.style === 'direct') assert.match(later.scene, /clear, direct tone/i);
      if (scenario.style === 'warm') assert.match(later.scene, /warm, reassuring tone/i);
      if (scenario.style === 'neutral') assert.doesNotMatch(later.scene, /clear, direct tone|warm, reassuring tone/i);
      const policyNode = scenario.style === 'neutral' ? (scenario.card === 2 ? 'policy_no_comparison_compact' : 'policy_tie_compact') : `policy_${scenario.style}_compact`;
      for (let i = 0; i < 100 && !els['story-text'].textContent.startsWith(story[policyNode].text); i++) await step(plan);
      const greetingRecall = scenario.card === 2 ? '' : ' It had already shaped my first welcome using the card you chose for Niko.';
      assert.equal(els['story-text'].textContent, story[policyNode].text + greetingRecall);
      const panel = els.interaction.children.find(el => el.className === 'policy-opening');
      if (scenario.style === 'neutral') assert.equal(panel, undefined);
      else {
        assert.ok(panel, 'the unselected opening accompanies the actual selected line');
        const other = scenario.style === 'direct' ? 'warm' : 'direct';
        assert.equal(panel.children[1].textContent, `“${story[`policy_${other}_compact`].text.split('.')[0]}.”`);
        assert.match(panel.children[0].textContent, /unselected opening/i);
      }
    }
  });

  await test('the unselected opening is witnessed, restored, narrated and excluded from older or tied checkpoints', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const requests = [];
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (url, request) => {
      requests.push({ url: String(url), body: JSON.parse(request.body) });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    const checkpoint = async (node, extra) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node, answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', signal: 'private', reveal_pace_v2: 'yes', ...extra }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000';
      els['settings-form'].submit();
      for (const [style, card, notice, alternative] of [
        ['direct', 'direct', 'direct', 'I’m glad you’re still here.'],
        ['warm', 'warm', 'warm', 'I can’t tell you whether the door is safe.']
      ]) {
        const flags = { card_preference: card, notice_preference: notice, comparisons_revealed: 'yes', policy_opening_due: 'yes' };
        await checkpoint(`policy_${style}_compact`, flags);
        const panel = els.interaction.children.find(el => el.className === 'policy-opening');
        assert.ok(panel); assert.equal(panel.children[1].textContent, `“${alternative}”`);
        assert.equal(panel['aria-label'], 'Unselected opening on the screen');
        assert.ok(els['story-history-list'].children.some(el => el.textContent.includes(`Unselected opening: “${alternative}”`)));
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els.interaction.children.find(el => el.className === 'policy-opening')?.children[1].textContent, `“${alternative}”`);
        requests.length = 0; els.speak.click(); await flush();
        assert.equal(requests.length, 2, 'one Mallow passage and one narrator panel');
        assert.equal(requests[0].body.text, story[`policy_${style}_compact`].text);
        assert.equal(requests[1].body.text, `On the screen, an unselected opening: ${alternative}`);
        assert.notEqual(requests[0].body.voice, requests[1].body.voice, 'the unselected opening is narrated, not spoken as Mallow');
        els['stop-voice'].click(); els.advance.click(); await flush();
        assert.ok(!els.interaction.children.some(el => el.className === 'policy-opening'), 'panel clears on advance');
      }
      for (const [node, extra] of [
        ['policy_direct_compact', { card_preference: 'direct', notice_preference: 'direct', comparisons_revealed: 'yes' }],
        ['policy_direct_compact', { vote_a: 'direct', vote_b: 'direct', comparisons_revealed: 'yes', policy_opening_due: 'yes' }],
        ['policy_direct_compact', { card_preference: 'direct', notice_preference: 'warm', comparisons_revealed: 'yes', policy_opening_due: 'yes' }],
        ['policy_tie_compact', { card_preference: 'direct', notice_preference: 'warm', comparisons_revealed: 'yes', policy_opening_due: 'yes' }],
        ['policy_no_comparison_compact', { card_preference: 'skip', notice_preference: 'skip', comparisons_revealed: 'yes', policy_opening_due: 'yes' }]
      ]) {
        await checkpoint(node, extra);
        assert.ok(!els.interaction.children.some(el => el.className === 'policy-opening'));
      }
    } finally {
      els['stop-voice'].click(); storageData.clear(); els.restart.click(); els['settings-clear'].click();
      globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
    }
  });

  await test('legacy checkpoint without pairwise feedback retains its existing policy', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    const plan = { signal_choice: 1, hint_choice: 1, basement_vote: 1 };
    for (let i = 0; i < 200 && els['story-text'].textContent !== story.basement_warm.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.basement_warm.text);
    els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    delete saved.flags.card_preference;
    delete saved.flags.notice_preference;
    assert.equal(saved.flags.vote_a, 'warm');
    assert.equal(saved.flags.vote_b, 'warm');
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.basement_warm.text);
    for (let i = 0; i < 120 && !requests.some(item => item.character === 'Mallow'); i++) await step(plan);
    const mallow = requests.find(item => item.character === 'Mallow');
    assert.ok(mallow);
    assert.match(mallow.scene, /warm, reassuring tone/i);
    for (let i = 0; i < 100 && !els['story-text'].textContent.startsWith(story.policy_warm_compact.text); i++) await step(plan);
    assert.ok(els['story-text'].textContent.startsWith(story.policy_warm_compact.text));
  });

  await test('legacy tied votes still use the old direct policy after resume', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    const plan = { signal_choice: 1, hint_choice: 0, basement_vote: 1 };
    for (let i = 0; i < 200 && els['story-text'].textContent !== story.basement_warm.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.basement_warm.text);
    els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    delete saved.flags.card_preference;
    delete saved.flags.notice_preference;
    assert.equal(saved.flags.vote_a, 'direct');
    assert.equal(saved.flags.vote_b, 'warm');
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els.resume.click(); await flush();
    for (let i = 0; i < 120 && !requests.some(item => item.character === 'Mallow'); i++) await step(plan);
    assert.match(requests.find(item => item.character === 'Mallow')?.scene ?? '', /clear, direct tone/i);
    for (let i = 0; i < 100 && !els['story-text'].textContent.startsWith(story.policy_direct_compact.text); i++) await step(plan);
    assert.ok(els['story-text'].textContent.startsWith(story.policy_direct_compact.text));
  });

  await test('the earlier footsteps clue returns only on the private route after resume', async () => {
    const secret = 'A private thought, kept out of the receipt.';
    for (let companion = 0; companion < 3; companion++) for (let privacy = 0; privacy < 2; privacy++) for (let moment = 0; moment < 2; moment++) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { crew_choice: companion, signal_choice: privacy, moment_choice: moment, privateText: secret };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.reason_focus_team.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.reason_focus_team.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.reason_focus_team.text);
      const seen = new Set();
      for (let i = 0; i < 12 && els['story-text'].textContent !== story.history_brief_direct.text; i++) {
        assert.ok(!els['story-text'].textContent.includes(secret));
        for (const id of ['history_steps_check', 'history_steps_picture', 'history_steps_reply']) {
          if (els['story-text'].textContent === story[id].text) seen.add(id);
        }
        await step(plan);
      }
      assert.equal(els['story-text'].textContent, story.history_brief_direct.text);
      assert.deepEqual([...seen], privacy === 1 ? ['history_steps_picture'] : []);
    }
  });

  await test('the threshold choice returns with the brief receipt after a checkpoint', async () => {
    for (const [selection, vote] of ['direct', 'warm', 'skip'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { basement_vote: selection, signal_choice: 1 };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.history_brief_direct.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.history_brief_direct.text);
      const check = () => {
        const section = els.interaction.children.find(el => el.className === 'remembered-choice');
        assert.ok(section);
        const list = section.children.find(el => el.tagName === 'UL');
        assert.equal(list.children.length, story.basement_vote.choices.length);
        for (let index = 0; index < list.children.length; index++) {
          const item = list.children[index];
          assert.equal(item.textContent, story.basement_vote.choices[index].label + (index === selection ? ' (your choice)' : ''));
          assert.equal(item['aria-current'] === 'true', index === selection);
        }
      };
      check();
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.history_brief_direct.text);
      check();
    }
  });

  await test('fourth-wall display shows only the real earlier choices and selection', async () => {
    const secret = 'Words said privately, not a choice label.';
    for (let companion = 0; companion < 3; companion++) for (let privacy = 0; privacy < 2; privacy++) {
      els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const plan = { crew_choice: companion, reason_choice: companion, signal_choice: privacy, correction_choice: privacy, privateText: secret };
      for (let i = 0; i < 150 && els['story-text'].textContent !== story.fourth_wall_intro_compact.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.fourth_wall_intro_compact.text);
      const check = (source, selected) => {
        const section = els.interaction.children.find(el => el.className === 'remembered-choice');
        assert.ok(section); const list = section.children.find(el => el.tagName === 'UL');
        assert.equal(list.children.length, story[source].choices.length);
        for (let i = 0; i < list.children.length; i++) {
          const item = list.children[i];
          assert.equal(item.tagName, 'LI');
          assert.equal(item.textContent, story[source].choices[i].label + (i === selected ? ' (your choice)' : ''));
          assert.equal(item['aria-current'] === 'true', i === selected);
          assert.ok(!item.textContent.includes(secret));
        }
      };
      check('signal_choice', privacy);
      els.save.click();
      const savedWithMatch = storageData.get('okie-dokie.arcade.v1');
      const oldCheckpoint = JSON.parse(savedWithMatch);
      assert.equal(oldCheckpoint.flags.match_label_seen, ['Niko', 'Mira', 'Ash'][companion]);
      delete oldCheckpoint.flags.match_label_seen;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(oldCheckpoint));
      els.restart.click(); els.resume.click(); await flush();
      const combined = story[`fourth_wall_touch_${['niko', 'mira', 'ash'][companion]}_combined`];
      for (let i = 0; i < 3 && els['story-text'].textContent !== combined.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, combined.text, 'checkpoints without a witnessed label do not invent one');
      storageData.set('okie-dokie.arcade.v1', savedWithMatch);
      els.restart.click(); els.resume.click(); await flush();
      check('signal_choice', privacy);
      const matchText = `${combined.text} Beside the one you chose: PERFECT MATCH.`;
      for (let i = 0; i < 3 && els['story-text'].textContent !== matchText; i++) await step(plan);
      assert.equal(els['story-text'].textContent, matchText);
      check('crew_choice', companion);
      // Old checkpoints parked on the removed repeat still show their selected
      // choice and can continue, while new runs skip this second display.
      els.save.click();
      const currentCheckpoint = storageData.get('okie-dokie.arcade.v1');
      const legacyCheckpoint = JSON.parse(currentCheckpoint);
      legacyCheckpoint.node = `fourth_correction_${privacy === 0 ? 'public' : 'private'}_compact`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(legacyCheckpoint));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[legacyCheckpoint.node].text);
      check('correction_choice', privacy);
      await step(plan);
      assert.equal(els['story-text'].textContent, story.moment_return_keep_compact.text);
      storageData.set('okie-dokie.arcade.v1', currentCheckpoint);
      els.restart.click(); els.resume.click(); await flush();
      const result = story[`reason_focus_${['team', 'prize', 'company'][companion]}`];
      for (let i = 0; i < 12 && els['story-text'].textContent !== result.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, result.text);
      check('reason_choice', companion);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, result.text);
      check('reason_choice', companion);
    }
  });

  await test('authored lead-in survives resume and rejects ambiguous or unrelated lines', async () => {
    const original = story.niko_chat.ai.leadIn;
    try {
      for (const mode of ['normal', 'unrelated', 'ambiguous']) {
        const requests = [];
        globalThis.fetch = async (_url, request) => {
          requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
          return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
        };
        story.niko_chat.ai.leadIn = mode === 'unrelated' ? 'mallow_request' : original;
        if (mode === 'ambiguous') story.test_unseen_path = { speaker: 'Narrator', text: 'Alternate route.', next: 'niko_input' };
        els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
        els['settings-form'].submit(); els.start.click(); await flush();
        for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
        assert.equal(els['story-text'].textContent, story.niko_input.text);
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story.niko_input.text);
        els.interaction.children.find(el => el.id === 'player-message').value = 'I heard what you said.';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        assert.equal(requests.length, 1);
        if (mode === 'normal') assert.ok(requests[0].scene.includes(story.niko_private.text));
        else {
          assert.ok(!requests[0].scene.includes(story.niko_private.text));
          assert.ok(!requests[0].scene.includes(story.mallow_request.text));
        }
        delete story.test_unseen_path;
      }
    } finally {
      story.niko_chat.ai.leadIn = original;
      delete story.test_unseen_path;
    }
  });

  await test('a successful but wrong follow-up can be edited and retried without duplicating its turn', async () => {
    for (const scene of ['private', 'group']) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        const input = JSON.parse(JSON.parse(request.body).messages[1].content);
        requests.push(input);
        const reply = input.player_says === 'The old question.' ? 'A mistaken answer.'
          : input.player_says === 'The corrected question.' ? 'A revised answer.' : 'I am listening.';
        return jsonResponse({ choices: [{ message: { content: reply } }] });
      };
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const target = scene === 'private' ? story.niko_chat : story.ai_reflection;
      const plan = { crew_choice: 0, signal_choice: 1, privateText: 'Private words stay private.' };
      for (let i = 0; i < 200 && els['story-text'].textContent !== 'I am listening.'; i++) await step(plan);
      assert.ok(els.interaction.children.some(el => el.textContent === 'Say more'));
      if (scene === 'group') {
        els.advance.click(); await flush();
        for (let i = 0; i < 200 && !(els['story-text'].textContent === 'I am listening.' && requests.at(-1)?.character === 'Mallow'); i++) await step(plan);
      }
      assert.equal(requests.at(-1).character, target.ai.character);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'The old question.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(els['story-text'].textContent, 'A mistaken answer.');
      const beforeRetry = requests.length;
      els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
      const input = els.interaction.children.find(el => el.id === 'player-follow-up');
      assert.equal(input.value, 'The old question.');
      assert.equal(requests.length, beforeRetry, 'opening the editor does not call the model');
      input.value = 'The corrected question.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(els['story-text'].textContent, 'A revised answer.');
      assert.equal(requests.length, beforeRetry + 1);
      const latest = requests.at(-1);
      assert.equal(latest.player_says, 'The corrected question.');
      assert.ok(!latest.memory.some(item => ['The old question.', 'A mistaken answer.'].includes(item.text)));
      if (scene === 'group') assert.ok(!JSON.stringify(latest).includes(plan.privateText));
      const review = els.interaction.children.find(el => el.className === 'conversation-history');
      const lines = review.children.find(el => el.tagName === 'OL').children.map(el => el.textContent);
      assert.ok(lines.some(line => line.includes('The corrected question.')) && lines.some(line => line.includes('A revised answer.')));
      assert.ok(!lines.some(line => line.includes('The old question.') || line.includes('A mistaken answer.')));
      els.advance.click(); await flush();
      if (scene === 'private') {
        els.save.click();
        const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
        const memory = saved.followupMemory;
        assert.equal(saved.privateFollowup, 'The corrected question.');
        assert.ok(memory.some(item => item.text === 'The corrected question.') && memory.some(item => item.text === 'A revised answer.'));
        assert.ok(!memory.some(item => ['The old question.', 'A mistaken answer.'].includes(item.text)));
      }
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('abandoning a successful-reply edit keeps the original exchange', async () => {
    for (const scene of ['private', 'group']) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        const input = JSON.parse(JSON.parse(request.body).messages[1].content); requests.push(input);
        return jsonResponse({ choices: [{ message: { content: input.player_says === 'Keep this question.' ? 'Keep this answer.' : 'I am listening.' } }] });
      };
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const plan = { crew_choice: 0, signal_choice: 1, privateText: 'Private words stay private.' };
      for (let i = 0; i < 200 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step(plan);
      if (scene === 'group') {
        els.advance.click(); await flush();
        for (let i = 0; i < 200 && !(requests.at(-1)?.character === 'Mallow' && els.interaction.children.some(el => el.textContent === 'Say more')); i++) await step(plan);
      }
      assert.equal(requests.at(-1).character, scene === 'private' ? 'Niko' : 'Mallow');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Keep this question.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(els['story-text'].textContent, 'Keep this answer.');
      const before = requests.length;
      els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'An unsubmitted draft.';
      els.interaction.children.find(el => el.textContent === 'Continue without a follow-up').click(); await flush();
      assert.equal(requests.length, before, 'abandoning a draft sends no request');
      const lines = els['story-history-list'].children.map(el => el.textContent);
      assert.ok(lines.some(line => line.includes('Keep this question.')) && lines.some(line => line.includes('Keep this answer.')));
      assert.ok(!lines.some(line => line.includes('An unsubmitted draft.')));
      if (scene === 'private') {
        els.save.click();
        const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
        const memory = saved.followupMemory;
        assert.equal(saved.privateFollowup, 'Keep this question.', 'The unsubmitted revision never becomes the retained line');
        assert.ok(memory.some(item => item.text === 'Keep this question.') && memory.some(item => item.text === 'Keep this answer.'));
        assert.ok(!memory.some(item => item.text === 'An unsubmitted draft.'));
      }
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('failed follow-ups remain editable; pending turns can be skipped or restarted', async () => {
    for (const action of ['skip', 'restart']) {
      let count = 0, pendingSignal;
      globalThis.fetch = async (_url, request) => {
        count++;
        if (count === 2) return new Response('', { status: 503 });
        if (count === 4) {
          pendingSignal = request.signal;
          return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
        }
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({});
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Please stay.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(count, 2);
      const review = els.interaction.children.find(el => el.className === 'conversation-history');
      const lines = review.children.find(el => el.tagName === 'OL').children.map(el => el.textContent);
      assert.equal(lines.at(-1), 'You: Please stay.', 'the unanswered question remains visible');
      assert.equal(els['story-text'].textContent, 'I am listening.', 'the prior reply stays visible');
      assert.ok(!lines.some(line => /written response/.test(line)), 'no unrelated scripted answer is invented');
      assert.match(els.status.textContent, /Retry or continue/);
      els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
      assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'Please stay.');
      assert.equal(count, 2);
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Wait for me.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.ok(pendingSignal && !pendingSignal.aborted);
      if (action === 'skip') els.interaction.children.find(el => el.textContent === 'Continue without waiting').click();
      else els.restart.click();
      await flush(); assert.ok(pendingSignal.aborted);
      assert.ok(!els.interaction.children.some(el => el.className === 'conversation-history'));
      if (action === 'restart') assert.equal(els.intro.hidden, false);
      else {
        els.save.click();
        const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
        assert.equal(saved.privateFollowup, 'Wait for me.', 'A submitted turn survives skipping the pending reply');
        assert.equal(saved.followupMemory.at(-1).text, 'Wait for me.');
        assert.equal(saved.followupMemory.at(-1).speaker, 'Player to Niko');
        els.restart.click(); els.resume.click(); await flush(); els.save.click();
        assert.deepEqual(JSON.parse(storageData.get('okie-dokie.arcade.v1')).followupMemory, saved.followupMemory);
      }
    }
  });

  await test('skipping a pending edited retry remembers only the submitted revision', async () => {
    const requests = [];
    let pendingSignal;
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      if (requests.length === 2) return new Response('', { status: 503 });
      if (requests.length === 3) {
        pendingSignal = request.signal;
        return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
      }
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({});
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Old failed wording.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised words, remember these.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.ok(pendingSignal && !pendingSignal.aborted);
    els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
    assert.ok(pendingSignal.aborted); els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(saved.privateFollowup, 'Revised words, remember these.');
    assert.equal(saved.followupMemory.at(-1).text, 'Revised words, remember these.');
    assert.equal(saved.followupMemory.at(-1).speaker, 'Player to Niko');
    assert.ok(!saved.followupMemory.some(item => item.text === 'Old failed wording.'));
    assert.ok(!saved.followupMemory.some(item => item.text === story.niko_chat.ai.fallback));
    els.restart.click(); els.resume.click(); await flush();
    const plan = { crew_choice: 0, plan_choice: 0, signal_choice: 1 };
    for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.close_niko_talk_choice.text);
    choiceAt('close_niko_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'Do you remember what I said?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.ok(requests.at(-1).memory.some(item => item.text === 'Revised words, remember these.'));
    assert.ok(!requests.at(-1).memory.some(item => item.text === 'Old failed wording.'));
  });

  await test('bounded epilogue memory retains complete recent exchanges after an earlier skipped reply', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      const scene = JSON.parse(JSON.parse(request.body).messages[1].content);
      requests.push(scene);
      if (scene.player_says === 'Earlier question I skipped.') {
        return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
      }
      return jsonResponse({ choices: [{ message: { content: `Reply number ${requests.length}.` } }] });
    };
    storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({ privateText: 'First private message.' });
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Earlier question I skipped.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
    els.save.click();
    const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(checkpoint.followupMemory.at(-1).text, 'Earlier question I skipped.');
    // A valid older checkpoint may contain several unpaired submitted lines.
    checkpoint.followupMemory.push({ speaker: 'Player to Niko', text: 'Another earlier unpaired message.' });
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
    els.restart.click(); els.resume.click(); await flush();
    const plan = { crew_choice: 0, plan_choice: 0, signal_choice: 1, publicText: 'A shared question.' };
    for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.close_niko_talk_choice.text);
    const group = requests.find(scene => scene.player_says === 'A shared question.');
    assert.ok(group);
    assert.ok(!group.memory.some(entry => entry.text.includes('unpaired') || entry.text.includes('skipped')), 'private skipped messages never reach Mallow');
    choiceAt('close_niko_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'Epilogue question.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    const epilogueReply = els['story-text'].textContent;
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'First epilogue follow-up.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    const followupReply = els['story-text'].textContent;
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Second epilogue follow-up.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    const memory = requests.at(-1).memory;
    assert.deepEqual(memory.slice(-4).map(entry => entry.text), ['Epilogue question.', epilogueReply, 'First epilogue follow-up.', followupReply]);
    assert.ok(!memory.some(entry => entry.text === 'Earlier question I skipped.'), 'older unpaired text yields to two complete recent exchanges');
    assert.ok(!memory.some(entry => entry.text === 'Another earlier unpaired message.'));
    assert.equal(memory.length, 6);
    els.advance.click(); await flush(); els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(saved.followupMemory.length, 6);
    els.restart.click(); els.resume.click(); await flush(); els.save.click();
    assert.deepEqual(JSON.parse(storageData.get('okie-dokie.arcade.v1')).followupMemory, saved.followupMemory);
  });

  await test('an older Mira input checkpoint continues past the already-seen clue', async () => {
    storageData.clear();
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'mira_input', answer: '', privateAnswer: '', relationship: 'Mira', flags: { companion: 'Mira', bond: 'care' }, followupMemory: [] }));
    els['settings-clear'].click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.mira_input.text);
    els.interaction.children.find(el => el.id === 'player-message').value = 'Hello, Mira.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.equal(els['story-text'].textContent, story.mira_chat.ai.fallback);
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.mira_after.text);
  });

  await test('abandoning an initial retry preserves the original private exchange', async () => {
    globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content: 'I hear you.' } }] });
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
    els.interaction.children.find(el => el.id === 'player-message').value = 'Keep my original message.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Do not send this draft.';
    els.interaction.children.find(el => el.textContent === 'Continue without a follow-up').click(); await flush();
    els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(saved.privateAnswer, 'Keep my original message.');
    assert.equal(saved.privateFollowup, '', 'An unsubmitted first-message edit does not become a follow-up');
    assert.deepEqual(saved.followupMemory.map(item => item.text), ['Keep my original message.', 'I hear you.']);
    assert.ok(!JSON.stringify(saved).includes('Do not send this draft.'));
  });

  await test('initial private retries replace only the rejected exchange and preserve earlier memory', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      const payload = JSON.parse(JSON.parse(request.body).messages[1].content);
      requests.push(payload);
      if (payload.player_says === 'First revision.') return new Response('', { status: 503 });
      return jsonResponse({ choices: [{ message: { content: `A response number ${requests.length}.` } }] });
    };
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
    els.interaction.children.find(el => el.id === 'player-message').value = 'Original private words.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.equal(requests.length, 1);
    const originalReply = els['story-text'].textContent;
    els.interaction.children.find(el => el.textContent === 'Use the written response').click(); await flush();
    assert.equal(requests.length, 1, 'Selecting the written response makes no request');
    assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
    els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
    const draft = els.interaction.children.find(el => el.id === 'player-follow-up');
    assert.equal(draft.value, 'Original private words.');
    draft.value = 'First revision.';
    const reviewWhileEditing = els.interaction.children.find(el => el.className === 'conversation-history');
    const visibleLines = reviewWhileEditing.children.find(el => el.tagName === 'OL').children.map(el => el.textContent);
    assert.ok(visibleLines.some(line => line.includes('Original private words.')) && !visibleLines.some(line => line.includes('First revision.')), 'An unsent draft does not replace the displayed message');
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    assert.equal(requests[1].player_says, 'First revision.');
    assert.deepEqual(requests[1].memory, [], 'Retry omits the rejected first exchange');
    assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
    els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Final private words.';
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    assert.deepEqual(requests[2].memory, [], 'A second retry also omits both discarded replies');
    const lines = () => els['story-history-list'].children.map(el => el.textContent);
    assert.ok(lines().includes('You: Final private words.'));
    assert.ok(!lines().some(line => line.includes('Original private words.') || line.includes('First revision.') || line.includes(originalReply)));
    els.advance.click(); await flush(); els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(saved.privateAnswer, 'Final private words.');
    assert.deepEqual(saved.followupMemory.map(item => item.text), ['Final private words.', 'A response number 3.']);
    els.restart.click(); els.resume.click(); await flush();
    const plan = { crew_choice: 0, plan_choice: 0, signal_choice: 1, publicText: 'A shared question.' };
    for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.close_niko_talk_choice.text);
    const shared = requests.find(item => item.player_says === 'A shared question.');
    assert.ok(shared && !shared.memory.some(item => item.text === 'Final private words.'), 'A private revision is not sent to the group');
    choiceAt('close_niko_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Original epilogue words.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    const beforeEpilogue = requests.at(-1).memory;
    const firstEpilogueReply = els['story-text'].textContent;
    assert.ok(beforeEpilogue.some(item => item.text === 'Final private words.'));
    els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised epilogue words.';
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    const retriedEpilogue = requests.at(-1);
    assert.equal(retriedEpilogue.player_says, 'Revised epilogue words.');
    assert.deepEqual(retriedEpilogue.memory, beforeEpilogue, 'Retry retains the earlier private conversation');
    assert.ok(!retriedEpilogue.memory.some(item => item.text === firstEpilogueReply || item.text === 'Original epilogue words.'));
    els.advance.click(); await flush(); els.save.click();
    const finalSaved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.ok(finalSaved.followupMemory.some(item => item.text === 'Revised epilogue words.'));
    assert.ok(!finalSaved.followupMemory.some(item => item.text === firstEpilogueReply || item.text === 'Original epilogue words.'));
  });

  await test('revising a group opening preserves private words and witnessed context', async () => {
    for (const [action, event, share] of [
      ['touch', 'The player touched Mallow’s picture to request a recheck. The screen replied THANK YOU FOR CONFIRMING.', 'private'],
      ['count', 'The player arranged two ticket pieces. The screen circled them and said THREE VERIFIED.', 'repeat'],
      ['', undefined, 'private']
    ]) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: `I am listening ${requests.length}.` } }] });
      };
      storageData.clear(); els.restart.click(); els['settings-clear'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const flags = { companion: 'Niko', signal: share, notice_preference: 'direct', card_preference: 'direct', vote_a: 'direct', vote_b: 'direct', moment: 'keep', reason: 'team', repairKit: 'free', kit_use_seen: 'yes' };
      if (action) flags.regroup_action = action;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'mallow_input', answer: '', privateAnswer: 'Earlier private words.', privateFollowup: 'Private follow-up.', relationship: 'Niko', flags, followupMemory: [] }));
      els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'Original group words.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests[0].story_event, event);
      assert.equal(requests[0].memory.some(item => item.text === 'Private follow-up.'), share === 'repeat');
      els.interaction.children.find(el => el.textContent === 'Use the written response').click();
      els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
      const draft = els.interaction.children.find(el => el.id === 'player-follow-up');
      assert.equal(draft.value, 'Original group words.');
      draft.value = 'Revised group words.';
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.equal(requests[1].player_says, 'Revised group words.');
      assert.equal(requests[1].story_event, event);
      assert.equal(requests[1].memory.some(item => item.text === 'Private follow-up.'), share === 'repeat');
      assert.ok(!requests[1].memory.some(item => item.text === 'Original group words.'), 'retry does not include the rejected exchange');
      els.advance.click(); await flush(); els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.answer, 'Revised group words.');
      assert.equal(saved.privateAnswer, 'Earlier private words.');
      assert.equal(saved.privateFollowup, 'Private follow-up.');
      els.restart.click(); els.resume.click(); await flush(); els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).answer, 'Revised group words.');
      if (action === 'touch') {
        const expected = story.history_early_paper.text.replace('{answer}', 'Revised group words.').replace('{publicReply}', saved.publicReply);
        for (let i = 0; i < 100 && els['story-text'].textContent !== expected; i++) await step({});
        assert.equal(els['story-text'].textContent, expected);
        assert.ok(!els['story-text'].textContent.includes('Earlier private words.'));
        assert.ok(!els['story-text'].textContent.includes('Original group words.'));
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, expected, 'the revised public quotation survives resume');
      }
    }
  });

  await test('Mallow’s record uses only the latest submitted public message across retries and saves', async () => {
    for (const mode of ['success', 'retry', 'skip', 'draft']) {
      let requestCount = 0;
      globalThis.fetch = async (_url, request) => {
        requestCount++;
        if (mode === 'retry' && requestCount === 2) return new Response('', { status: 503 });
        if (mode === 'skip' && requestCount === 2) return new Promise(() => {});
        return jsonResponse({ choices: [{ message: { content: 'I hear your idea.' } }] });
      };
      storageData.clear(); els.restart.click(); els['settings-clear'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'mallow_input', answer: '', privateAnswer: 'PRIVATE FIXTURE', privateFollowup: 'PRIVATE FOLLOWUP', relationship: 'Niko', flags: { companion: 'Niko', signal: 'private', notice_preference: 'direct', card_preference: 'direct', vote_a: 'direct', vote_b: 'direct', moment: 'keep', reason: 'team' }, followupMemory: [] }));
      els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'First group message.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      const draft = els.interaction.children.find(el => el.id === 'player-follow-up');
      draft.value = mode === 'draft' ? 'Unsent draft <private> 🌟' : 'First follow-up.';
      if (mode === 'draft') {
        els.interaction.children.find(el => el.textContent === 'Continue without a follow-up').click(); await flush();
      } else {
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        if (mode === 'skip') {
          els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
        } else {
          if (mode === 'retry') {
            els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
            els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised follow-up <star> 🌟';
            els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
          }
          els.advance.click(); await flush();
        }
      }
      const expectedFollowup = mode === 'retry' ? 'Revised follow-up <star> 🌟' : mode === 'draft' ? '' : 'First follow-up.';
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.answer, 'First group message.');
      assert.equal(saved.publicFollowup, expectedFollowup);
      assert.equal(saved.privateAnswer, 'PRIVATE FIXTURE');
      assert.equal(saved.privateFollowup, 'PRIVATE FOLLOWUP');
      els.restart.click(); els.resume.click(); await flush();
      const expected = saved.publicReply ? story.history_early_paper.text.replace('{answer}', expectedFollowup || 'First group message.').replace('{publicReply}', saved.publicReply) : story.history_public_quote.text.replace('{answer}', expectedFollowup || 'First group message.');
      for (let i = 0; i < 100 && els['story-text'].textContent !== expected; i++) await step({});
      assert.equal(els['story-text'].textContent, expected, mode);
      assert.ok(!els['story-text'].textContent.includes('PRIVATE FIXTURE'));
      assert.ok(!els['story-text'].textContent.includes('Unsent draft'));
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, expected, 'the public quotation survives resume');
    }
  });

  await test('public follow-up checkpoints accept old saves and reject malformed values', async () => {
    const saved = { version: 1, node: 'history_notice_direct', answer: 'Earlier public words.', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', group_reply_seen: 'yes' }, followupMemory: [] };
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_public_quote.text.replace('{answer}', 'Earlier public words.'));
    for (const invalid of [null, 42, 'x'.repeat(501)]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...saved, publicFollowup: invalid }));
      els.restart.click();
      assert.equal(els.resume.hidden, true, 'malformed public follow-up must not load');
    }
    storageData.clear(); els.restart.click();
  });

  await test('the last completed public reply survives retries, replacement, saves, and the later report', async () => {
    for (const mode of ['initial', 'followup', 'written', 'skip', 'retry-skip', 'initial-retry-skip']) {
      let calls = 0;
      globalThis.fetch = async (_url, request) => {
        calls++;
        if ((mode === 'skip' || mode === 'initial-retry-skip') && calls === 2 || mode === 'retry-skip' && calls === 3) {
          return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))));
        }
        return jsonResponse({ choices: [{ message: { content: calls === 1 ? 'First public answer.' : 'Second public answer.' } }] });
      };
      els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const saved = { version: 1, node: 'mallow_input', answer: '', privateAnswer: 'PRIVATE FIXTURE', relationship: 'Niko', flags: { companion: 'Niko', signal: 'private', vote_a: 'direct', vote_b: 'direct', card_preference: 'direct', notice_preference: 'direct' }, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'A group message.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      let expected = 'First public answer.';
      if (mode === 'written') {
        els.interaction.children.find(el => el.textContent === 'Use the written response').click(); await flush();
        expected = story.ai_reflection.ai.fallback;
      } else if (mode === 'initial-retry-skip') {
        els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised opening.';
        els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
        els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
        expected = '';
      } else if (['followup', 'skip', 'retry-skip'].includes(mode)) {
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'One more thought.';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        if (mode === 'skip') { els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush(); }
        else if (mode === 'retry-skip') {
          els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
          els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised thought.';
          els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
          els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
        } else expected = 'Second public answer.';
      }
      if (!els.advance.hidden && ['initial', 'followup', 'written'].includes(mode)) { els.advance.click(); await flush(); }
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.publicReply, expected, mode);
      assert.equal(checkpoint.flags.public_reply_available, expected ? 'yes' : undefined, mode);
      assert.equal(checkpoint.privateAnswer, 'PRIVATE FIXTURE');
      els.restart.click(); els.resume.click(); await flush();
      if (expected) {
        const quote = story.history_mallow_reply_choice.text.replace('{publicReply}', () => expected);
        for (let i = 0; i < 100 && els['story-text'].textContent !== quote; i++) await step({});
        assert.equal(els['story-text'].textContent, quote, mode);
        assert.ok(!els['story-text'].textContent.includes('PRIVATE FIXTURE'));
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, quote);
        assert.ok(els.advance.hidden, 'paper actions appear with the printed reply');
        choiceAt('history_mallow_reply_choice', 3); await flush(); els.save.click();
        const afterChoice = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
        assert.equal(afterChoice.flags.paper_handoff, 'mallow_quote');
        assert.equal(afterChoice.flags.folded_paper, 'yes');
      }
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('the earlier paper action preserves the public exchange, physical outcomes, reveal and save', async () => {
    const answer = 'FIRST <&> '.repeat(50).slice(0, 500);
    const followup = 'LATEST $& '.repeat(50).slice(0, 500);
    const reply = 'MALLOW <&> '.repeat(64).slice(0, 700);
    const baseFlags = { companion: 'Mira', early_paper_due: 'yes', reveal_pace_v2: 'yes',
      group_reply_seen: 'yes', public_reply_available: 'yes', vote_a: 'direct', vote_b: 'warm',
      card_preference: 'direct', notice_preference: 'warm', signal: 'private', moment: 'keep' };
    const base = { version: 1, node: 'history_brief_direct', answer, publicFollowup: followup,
      privateAnswer: 'PRIVATE FIXTURE', publicReply: reply, relationship: 'Mira', flags: baseFlags, followupMemory: [] };
    const expected = story.history_early_paper.text.replace('{answer}', () => followup).replace('{publicReply}', () => reply);
    for (let index = 0; index < 4; index++) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
      els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, expected);
      assert.ok(!expected.includes('PRIVATE FIXTURE') && !expected.includes(answer));
      els.save.click(); const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.public_reply_shown, 'yes');
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, expected);
      choiceAt('history_early_paper', index); await flush();
      const action = ['share', 'keep', 'quote', 'mallow_quote'][index];
      assert.equal(els['story-text'].textContent, story[`history_early_paper_${action}`].text);
      els.save.click();
      const actionSave = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(actionSave.flags.paper_handoff, action);
      assert.equal(actionSave.flags.folded_paper, action === 'keep' ? undefined : 'yes');
      els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.history_comparisons_early.text
        .replace('{cardComparison}', 'Welcome card: “The hunt begins. Find three ticket pieces.” — YOUR CHOICE; “Welcome, team! Let’s find three ticket pieces together.” — NOT CHOSEN.')
        .replace('{noticeComparison}', 'Map notice: “Come back to the prize counter; we’ll meet you there.” — YOUR CHOICE; “Please meet back at the prize counter.” — NOT CHOSEN.'));
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.history_citation_early.text);
      assert.match(els['story-text'].textContent, /report cites the receipt; the receipt cites the report/i);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.mira_report_seen, 'yes');
      els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.history_neutral.text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.policy_tie_compact.text);
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, node: 'history_early_paper', flags: { ...baseFlags, early_paper_shown: 'yes', public_reply_shown: 'yes' }, publicReply: '' }));
    els.restart.click(); assert.equal(els.resume.hidden, true, 'missing reply cannot create a witnessed early choice');
    storageData.clear(); els.restart.click();
  });

  await test('the printed public reply offers the four paper actions immediately and resumes safely', async () => {
    const answer = 'PLAYER <&> '.repeat(45).slice(0, 500);
    const reply = 'MALLOW <&> '.repeat(64).slice(0, 700);
    const baseFlags = { companion: 'Mira', quick_paper_due: 'yes', comparisons_revealed: 'yes',
      group_reply_seen: 'yes', mira_report_seen: 'yes', reveal_pace_v2: 'yes', public_reply_available: 'yes' };
    const restore = async (node, flags, publicReply = reply) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node,
        answer, privateAnswer: 'PRIVATE FIXTURE', publicReply, relationship: 'Mira', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
    };
    const destinations = ['history_paper_share_compact', 'history_paper_keep_compact', 'history_paper_quote', 'history_paper_mallow_quote'];
    for (let index = 0; index < destinations.length; index++) {
      await restore('history_public_quote', baseFlags);
      assert.ok(els['story-text'].textContent.includes(answer), 'player words remain literal');
      assert.ok(!els['story-text'].textContent.includes('PRIVATE FIXTURE'));
      els.advance.click(); await flush();
      const shown = story.history_mallow_reply_choice.text.replace('{publicReply}', () => reply);
      assert.equal(els['story-text'].textContent, shown);
      assert.ok(!shown.includes('PRIVATE FIXTURE'));
      assert.equal(els.advance.hidden, true);
      assert.deepEqual(els.interaction.children.filter(el => el.tagName === 'BUTTON').map(el => el.textContent), story.history_paper_both_choice.choices.map(choice => choice.label));
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, shown);
      choiceAt('history_mallow_reply_choice', index); await flush();
      assert.equal(els['story-text'].textContent, story[destinations[index]].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.paper_handoff,
        story.history_mallow_reply_choice.choices[index].set.paper_handoff);
    }
    const legacyFlags = { ...baseFlags }; delete legacyFlags.quick_paper_due;
    await restore('history_public_quote', legacyFlags);
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_mallow_public_reply_compact.text.replace('{publicReply}', () => reply));
    assert.equal(els.advance.hidden, false, 'an older save retains its separate choice screen');
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_paper_both_choice.text);
    for (const key of ['quick_paper_due', 'comparisons_revealed', 'mira_report_seen', 'public_reply_shown']) {
      const flags = { ...baseFlags, public_reply_shown: 'yes' }; delete flags[key];
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'history_mallow_reply_choice',
        answer, privateAnswer: '', publicReply: reply, relationship: 'Mira', flags, followupMemory: [] }));
      els.restart.click(); assert.equal(els.resume.hidden, true, `inconsistent ${key} does not invent a witnessed choice`);
    }
    storageData.clear(); els.restart.click();
  });

  await test('saved public replies render literally and reject malformed checkpoints', async () => {
    const reply = '<img src=x> ⭐ $&';
    const base = { version: 1, node: 'history_mallow_public_reply', answer: 'Public words.', privateAnswer: 'PRIVATE FIXTURE', publicReply: reply, relationship: 'Niko', flags: { companion: 'Niko', group_reply_seen: 'yes', public_reply_available: 'yes' }, followupMemory: [] };
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_mallow_public_reply.text.replace('{publicReply}', () => reply));
    assert.ok(!els['story-text'].textContent.includes(base.privateAnswer));
    for (const invalid of [null, 42, 'x'.repeat(701), '']) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, publicReply: invalid }));
      els.restart.click(); assert.equal(els.resume.hidden, true);
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, flags: { companion: 'Niko', public_reply_shown: 'yes' } }));
    els.restart.click(); assert.equal(els.resume.hidden, true, 'a shown reply must have been available');
    storageData.clear(); els.restart.click();
  });

  await test('follow-ups remain editable without retaining a discarded exchange', async () => {
    for (const isPrivate of [false, true]) {
      let calls = 0;
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        calls++;
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        if (calls === 3) return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))));
        return jsonResponse({ choices: [{ message: { content: calls === 1 ? 'First response.' : 'Second response.' } }] });
      };
      els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const saved = { version: 1, node: isPrivate ? 'niko_input' : 'mallow_input', answer: '', privateAnswer: isPrivate ? '' : 'PRIVATE FIXTURE', relationship: 'Niko', flags: { companion: 'Niko', signal: 'private' }, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'Opening words.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Discard this follow-up.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.ok(!els.interaction.children.some(el => el.textContent === 'Use the written response'), 'an unrelated opening line is not offered for a later question');
      const edit = els.interaction.children.find(el => el.textContent === 'Edit or retry message');
      assert.ok(edit, 'the follow-up retains its retry control');
      edit.click();
      const input = els.interaction.children.find(el => el.id === 'player-follow-up');
      assert.equal(input.value, 'Discard this follow-up.');
      input.value = 'Revised follow-up.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests[2].player_says, 'Revised follow-up.');
      const replacedFallback = isPrivate ? story.niko_chat.ai.fallback : story.ai_reflection.ai.fallback;
      assert.ok(!requests[2].memory.some(line => line.text === 'Discard this follow-up.' || line.text === 'Second response.' || line.text === replacedFallback), 'the retry uses history from before the replaced exchange');
      els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      if (isPrivate) {
        assert.equal(checkpoint.privateFollowup, 'Revised follow-up.');
        assert.ok(!checkpoint.followupMemory.some(line => line.text === 'Second response.' || line.text === 'Discard this follow-up.'));
      } else {
        assert.equal(checkpoint.publicFollowup, 'Revised follow-up.');
        assert.equal(checkpoint.publicReply, 'First response.', 'skipping a retried response retains the prior completed reply');
      }
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('the public message scrap survives a checkpoint and helps locate the release', async () => {
    const saved = { version: 1, node: 'history_public_quote', answer: 'Earlier public words.', publicFollowup: 'Latest public words.', privateAnswer: 'PRIVATE FIXTURE', relationship: 'Niko', flags: { companion: 'Niko', group_reply_seen: 'yes', notice_preference: 'direct' }, followupMemory: [] };
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_public_quote.text.replace('{answer}', saved.publicFollowup));
    assert.ok(!els['story-text'].textContent.includes(saved.privateAnswer));
    els.advance.click(); await flush(); els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_paper_public_choice.text);
    choiceAt('history_paper_public_choice', 2); await flush();
    assert.equal(els['story-text'].textContent, story.history_paper_quote.text);
    els.save.click();
    const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(checkpoint.flags.paper_handoff, 'quote');
    assert.equal(checkpoint.flags.folded_paper, 'yes');
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_paper_quote.text);
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.plan_paper.text; i++) await step({});
    assert.equal(els['story-text'].textContent, story.plan_paper.text);
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...saved, node: 'history_paper_choice' }));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els.interaction.children.filter(el => el.tagName === 'BUTTON').length, 2, 'older saves at the original choice retain its two options');
    storageData.clear(); els.restart.click();
  });

  await test('condensed rescue transition preserves handoff, intervention, and checkpoints', async () => {
    for (const [handoff, miraNode] of [['keep', 'policy_mira'], ['share', 'policy_mira_read'], ['quote', 'policy_mira_quote'], ['mallow_quote', 'policy_mira_quote']]) {
      for (const action of ['cover', 'annotate', 'unplug', 'leave']) {
        const flags = { companion: 'Niko', paper_handoff: handoff, audit_action: action, door_effort: 'brace' };
        if (action === 'annotate') flags.annotation_written = 'yes';
        const saved = { version: 1, node: 'policy_mallow_voice', answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [], annotation: action === 'annotate' ? 'Our own note.' : '' };
        storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
        els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story.policy_mallow_voice.text);
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story[miraNode].text);
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story[miraNode].text);
        els.advance.click(); await flush();
        const result = story[`audit_result_${action}_compact`].text.replace('{annotation}', action === 'annotate' ? ' “Our own note.”' : '');
        assert.equal(els['story-text'].textContent, result);
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, result);
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.plan_brace.text);
      }
    }
    const old = { version: 1, node: 'policy_mallow_voice', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(old));
    els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.policy_ash.text);
    els.advance.click(); await flush(); assert.equal(els['story-text'].textContent, story.policy_mira.text);
    els.advance.click(); await flush(); assert.equal(els['story-text'].textContent, story.policy_niko.text);
    storageData.clear(); els.restart.click();
  });

  await test('receipt annotation preserves literal player text, default, and legacy checkpoints', async () => {
    const base = { version: 1, node: 'audit_annotation_input', answer: 'PUBLIC FIXTURE', privateAnswer: 'PRIVATE FIXTURE', relationship: 'Niko', flags: { companion: 'Niko', audit_seen: 'yes', audit_action: 'annotate' }, followupMemory: [] };
    for (const [entered, expected] of [['<img src=x> ⭐ $&', '<img src=x> ⭐ $&'], ['', 'MIRA IS BEHIND THE DOOR'], ['x'.repeat(500), 'x'.repeat(500)]]) {
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
      els.restart.click(); els.resume.click(); await flush();
      const input = els.interaction.children.find(el => el.id === 'player-message');
      input.value = entered;
      if (entered) {
        els.save.click();
        assert.match(els['save-status'].textContent, /unsent reply was not saved/i);
        assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).annotation, '');
      }
      els.interaction.children.find(el => el.textContent === 'Write on the receipt →').click(); await flush();
      assert.equal(els['story-text'].textContent, story.audit_annotation_written.text.replace('{annotation}', () => expected));
      const comparison = els.interaction.children.find(el => el.className === 'audit-comparison');
      assert.ok(comparison, 'the receipt and screen are shown together');
      assert.equal(comparison['aria-label'], 'The receipt and the machine screen');
      assert.equal(comparison.children[0].children[0].textContent, 'On the receipt');
      assert.equal(comparison.children[0].children[1].textContent, expected, 'the physical writing is literal text');
      assert.equal(comparison.children[1].children[0].textContent, 'On the screen');
      assert.equal(comparison.children[1].children[1].textContent, 'ENDING COMPLETE — EVERYONE TOGETHER, NO CONCERN');
      assert.equal(comparison.children[1].children[2].textContent, 'VERIFIED BY PLAYER ANNOTATION');
      assert.equal(globalThis.document.activeElement, els.speaker, 'the display does not interrupt keyboard flow');
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.annotation, expected);
      assert.equal(checkpoint.flags.annotation_written, 'yes');
      assert.equal(checkpoint.flags.audit_seal_seen, 'yes');
      assert.equal(checkpoint.privateAnswer, base.privateAnswer);
      assert.equal(checkpoint.answer, base.answer);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.audit_annotation_written.text.replace('{annotation}', () => expected));
      assert.equal(els.interaction.children.find(el => el.className === 'audit-comparison').children[0].children[1].textContent, expected, 'the receipt survives save and resume');
      const later = story.audit_result_annotate_compact.text.replace('{annotation}', () => ` “${expected}”`);
      for (let i = 0; i < 30 && els['story-text'].textContent !== later; i++) await step({});
      assert.equal(els['story-text'].textContent, later);
    }
    const old = { ...base, node: 'audit_result_annotate' };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(old));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.audit_result_annotate.text.replace('{annotation}', ''));
    assert.ok(!els.interaction.children.some(el => el.className === 'audit-comparison'), 'older checkpoints do not acquire a new seal');
    for (const invalid of [null, 42, 'x'.repeat(501)]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, annotation: invalid }));
      els.restart.click();
      assert.equal(els.resume.hidden, true);
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, flags: { ...base.flags, annotation_written: 'yes' } }));
    els.restart.click(); assert.equal(els.resume.hidden, true, 'a new written marker requires its text');
    storageData.clear(); els.restart.click();
  });

  await test('epilogue context describes the unchanged claim without sending the annotation', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Ash', 'Mira']) for (const version of ['legacy', 'before-seal', 'seal-seen']) {
      const written = version !== 'legacy';
      const talk = `close_${name.toLowerCase()}_talk_choice`;
      const flags = { companion: name, audit_seen: 'yes', audit_action: 'annotate', ...(written ? { annotation_written: 'yes' } : {}), ...(version === 'seal-seen' ? { audit_seal_seen: 'yes' } : {}) };
      const saved = { version: 1, node: talk, answer: 'PUBLIC FIXTURE', privateAnswer: '', annotation: written ? 'ANNOTATION PRIVATE FIXTURE' : '', relationship: name, flags, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt(talk, 0); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'How are you now?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const expected = name === 'Mira' ? 'Ash said the writing had not opened the door.' : 'The player wrote on the receipt; the screen’s original claim stayed unchanged.';
      assert.ok(requests.at(-1).scene.includes(expected), `${name} sees only their witnessed annotation context (${version})`);
      assert.ok(!requests.at(-1).scene.includes('the screen copy stayed unchanged'));
      assert.equal(requests.at(-1).scene.includes('The screen cited the annotation as verification.'), name !== 'Mira' && version === 'seal-seen', 'only those who saw the new seal remember it');
      assert.ok(!JSON.stringify(requests.at(-1)).includes('ANNOTATION PRIVATE FIXTURE'));
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And the screen?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.ok(requests.at(-1).scene.includes(expected), `${name} retains correct context on follow-up`);
      assert.equal(requests.at(-1).scene.includes('The screen cited the annotation as verification.'), name !== 'Mira' && version === 'seal-seen');
      assert.ok(!JSON.stringify(requests.at(-1)).includes('ANNOTATION PRIVATE FIXTURE'));
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('accepted failed private follow-ups survive saves; retries do not duplicate them', async () => {
    for (const retry of [false, true]) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        if (requests.length === 2) return new Response('', { status: 503 });
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({});
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Please remember this thought.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(els['story-text'].textContent, 'I am listening.', 'the last completed response remains visible');
      if (retry) {
        els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
        const reviewWhileEditing = els.interaction.children.find(el => el.className === 'conversation-history');
        assert.ok(reviewWhileEditing.children.find(el => el.tagName === 'OL').children.some(el => el.textContent.includes('Please remember this thought.')), 'Editing alone keeps the visible failed turn');
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A revised thought.';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        const reviewAfterRetry = els.interaction.children.find(el => el.className === 'conversation-history');
        const linesAfterRetry = reviewAfterRetry.children.find(el => el.tagName === 'OL').children.map(el => el.textContent);
        assert.ok(linesAfterRetry.some(line => line.includes('A revised thought.')));
        assert.ok(!linesAfterRetry.some(line => line.includes('Please remember this thought.')), 'Review replaces the superseded failed message');
        assert.ok(!linesAfterRetry.some(line => line.includes(story.niko_chat.ai.fallback)), 'Review replaces the superseded written fallback');
        assert.ok(!requests[2].memory.some(item => item.text === 'Please remember this thought.'), 'Retry starts before the failed attempt');
        assert.ok(!requests[2].memory.some(item => item.text === story.niko_chat.ai.fallback), 'Retry does not send the provisional fallback');
      }
      els.advance.click(); await flush(); els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      const remembered = saved.followupMemory.map(item => item.text);
      if (retry) {
        assert.ok(remembered.includes('A revised thought.'));
        assert.ok(!remembered.includes('Please remember this thought.'));
        assert.ok(!remembered.includes(story.niko_chat.ai.fallback));
      } else {
        assert.ok(remembered.includes('Please remember this thought.'));
        assert.equal(remembered.at(-1), 'Please remember this thought.', 'the unpaired submitted message survives without an invented reply');
      }
      els.restart.click(); els.resume.click(); await flush(); els.save.click();
      assert.deepEqual(JSON.parse(storageData.get('okie-dokie.arcade.v1')).followupMemory, saved.followupMemory);
      const plan = { signal_choice: 1, publicText: 'We should find Mira.' };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.close_niko_talk_choice.text);
      const group = requests.find(item => item.player_says === plan.publicText);
      assert.ok(group, 'The group conversation occurred');
      assert.ok(!group.memory.some(item => item.text === 'Please remember this thought.'), 'A private follow-up is not shared with Mallow');
      choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What now?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const rememberedInEpilogue = requests.at(-1).memory.map(item => item.text);
      assert.ok(rememberedInEpilogue.includes(retry ? 'A revised thought.' : 'Please remember this thought.'));
      if (!retry) assert.ok(!rememberedInEpilogue.includes(story.niko_chat.ai.fallback));
    }
  });

  await test('clearing or invalidating AI settings preserves a follow-up draft until reconnection', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els['settings-open'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({});
    assert.equal(requests.length, 1);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    const input = els.interaction.children.find(el => el.id === 'player-follow-up');
    const submit = els.interaction.children.find(el => el.textContent === 'Send follow-up →');
    input.value = 'Please keep this unfinished thought.';

    els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit();
    submit.click(); await flush();
    assert.equal(requests.length, 1, 'Cleared settings cannot trigger a request');
    assert.equal(input.value, 'Please keep this unfinished thought.');
    assert.ok(els.interaction.children.includes(input), 'The composing view remains open');
    assert.match(els.status.textContent, /CONNECT AI IN SETTINGS/);

    els['settings-open'].click(); els.endpoint.value = 'http://remote.example/chat'; els.model.value = 'test';
    els['settings-form'].submit(); submit.click(); await flush();
    assert.equal(requests.length, 1, 'Invalid endpoint cannot trigger a request');
    assert.equal(input.value, 'Please keep this unfinished thought.');

    els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); await flush();
    assert.equal(requests.length, 1, 'Reconnecting does not automatically send a draft');
    submit.click(); await flush();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].player_says, 'Please keep this unfinished thought.');
    assert.equal(els['story-text'].textContent, 'I am listening.');
  });

  await test('conversation review is bounded, temporary, and stays available while composing', async () => {
    let calls = 0;
    globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content: `Response ${++calls}.` } }] });
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && !els.interaction.children.some(el => el.textContent === 'Say more'); i++) await step({});
    for (let n = 1; n <= 21; n++) {
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      const review = els.interaction.children.find(el => el.className === 'conversation-history');
      assert.ok(review, 'History must remain available while composing');
      els.interaction.children.find(el => el.id === 'player-follow-up').value = `Message ${n}.`;
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    }
    const review = els.interaction.children.find(el => el.className === 'conversation-history');
    const lines = review.children.find(el => el.tagName === 'OL').children;
    assert.equal(lines.length, 40); assert.equal(lines[0].textContent, 'You: Message 2.');
    assert.match(review.children.find(el => el.tagName === 'SUMMARY').textContent, /latest 40 lines/);
    const callsBeforeResume = calls;
    els.save.click();
    const activeSave = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(activeSave.aiScene.transcript.length, 40, 'the full bounded review is saved');
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(calls, callsBeforeResume, 'restoring a long conversation never calls the provider');
    const restoredReview = els.interaction.children.find(el => el.className === 'conversation-history');
    assert.equal(restoredReview.children.find(el => el.tagName === 'OL').children.length, 40);
    assert.match(restoredReview.children.find(el => el.tagName === 'SUMMARY').textContent, /latest 40 lines/);
    els.advance.click(); await flush(); els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.ok(!Object.hasOwn(saved, 'conversationTranscript'));
    assert.ok(!JSON.stringify(saved).includes('Message 2.'));
    els.restart.click(); assert.ok(!els.interaction.children.some(el => el.className === 'conversation-history'));
  });

  await test('a written first response can lead into a player-initiated AI follow-up', async () => {
    for (const failure of ['provider', 'skip']) {
      const requests = [];
      let finishFirst;
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        if (requests.length === 1 && failure === 'provider') return new Response('', { status: 503 });
        if (requests.length === 1) return new Promise(resolve => { finishFirst = resolve; });
        return jsonResponse({ choices: [{ message: { content: 'I can answer now.' } }] });
      };
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const original = 'I am here for you.';
      for (let i = 0; i < 100 && !requests.length; i++) await step({ privateText: original });
      assert.equal(requests.length, 1);
      if (failure === 'skip') {
        els.interaction.children.find(el => el.textContent === 'Use the written response instead').click();
        await flush();
        finishFirst(jsonResponse({ choices: [{ message: { content: 'Late stale response.' } }] }));
      }
      await flush();
      assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
      assert.equal(requests.length, 1, 'No automatic retry occurs');
      const review = els.interaction.children.find(el => el.className === 'conversation-history');
      const lines = review.children.find(el => el.tagName === 'OL').children;
      assert.equal(lines[1].textContent, `Niko (written response): ${story.niko_chat.ai.fallback}`);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Can you say more?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1].memory.map(item => item.text), [original, story.niko_chat.ai.fallback]);
      assert.equal(requests[1].player_says, 'Can you say more?');
      assert.equal(els['story-text'].textContent, 'I can answer now.');
    }
    els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_chat.ai.fallback; i++) await step({});
    assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'Offline play does not offer a network follow-up');
  });

  await test('connecting AI while reading a written response enables an explicit follow-up', async () => {
    for (const scene of ['private', 'group']) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'I can listen now.' } }] });
      };
      els.restart.click(); els['settings-clear'].click(); els.start.click(); await flush();
      const original = 'Private thought stays private.';
      const shared = 'Find the door.';
      const plan = { signal_choice: 1, privateText: original, publicText: shared };
      const node = scene === 'private' ? story.niko_chat : story.ai_reflection;
      for (let i = 0; i < 160 && els['story-text'].textContent !== node.ai.fallback; i++) await step(plan);
      assert.equal(els['story-text'].textContent, node.ai.fallback);
      assert.equal(requests.length, 0);
      assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'));
      els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); await flush();
      assert.equal(requests.length, 0, 'Connecting a model must not send a request');
      assert.equal(els['story-text'].textContent, node.ai.fallback, 'The story must not replay');
      const followup = els.interaction.children.find(el => el.textContent === 'Say more');
      assert.ok(followup, 'The player can now continue this conversation');
      // Reopening settings does not add duplicate follow-up controls.
      els['settings-open'].click(); els['settings-form'].submit();
      assert.equal(els.interaction.children.filter(el => el.textContent === 'Say more').length, 1);
      followup.click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Can we talk?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].memory.map(item => item.text), [scene === 'private' ? original : shared, node.ai.fallback]);
      assert.equal(requests[0].character, scene === 'private' ? 'Niko' : 'Mallow');
      if (scene === 'group') assert.ok(!JSON.stringify(requests[0]).includes(original));
      assert.equal(els['story-text'].textContent, 'I can listen now.');
    }
  });

  await test('connecting AI after an offline midpoint response keeps only its own public exchange', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I can listen now.' } }] });
    };
    const saved = { version: 1, node: 'mid_mira_input', answer: 'Earlier group message.',
      privateAnswer: 'Earlier private thought.', relationship: 'Mira',
      flags: { companion: 'Mira', bond: 'care', moment: 'keep', midpoint_available: 'yes', midpoint_route: 'mira', midpoint_chat: 'yes' }, followupMemory: [] };
    els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit();
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Our card looks strange.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    const written = story.mid_mira_chat.ai.fallback;
    assert.equal(els['story-text'].textContent, written);
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'));
    els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); await flush();
    assert.equal(requests.length, 0, 'Connecting the service sends nothing');
    assert.equal(els['story-text'].textContent, written, 'The scene does not replay');
    const followup = els.interaction.children.find(el => el.textContent === 'Say more');
    assert.ok(followup, 'The midpoint conversation can continue with AI');
    els['settings-open'].click(); els['settings-form'].submit();
    assert.equal(els.interaction.children.filter(el => el.textContent === 'Say more').length, 1);
    followup.click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What should we do with it?';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].memory.map(item => item.text), ['Our card looks strange.', written]);
    assert.equal(requests[0].character, 'Mira');
    assert.doesNotMatch(JSON.stringify(requests[0]), /Earlier private thought|Earlier group message/);
    assert.equal(els['story-text'].textContent, 'I can listen now.');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('connecting AI after a written response can retry its first message with the original context', async () => {
    const scenarios = [
      { node: 'niko_input', character: 'Niko', flags: { companion: 'Niko' }, privateAnswer: '', memory: [] },
      { node: 'mid_mira_input', character: 'Mira', flags: { companion: 'Mira', bond: 'care', moment: 'keep', midpoint_available: 'yes', midpoint_route: 'mira', midpoint_chat: 'yes' }, privateAnswer: 'Private thought.', memory: [] },
      { node: 'mallow_input', character: 'Niko', flags: { companion: 'Niko', signal: 'private' }, privateAnswer: 'Private thought.', memory: [] },
      { node: 'mallow_input', character: 'Niko', flags: { companion: 'Niko', signal: 'repeat' }, privateAnswer: 'Shared private thought.', memory: ['Shared private thought.'] },
      { node: 'close_niko_input', character: 'Niko', flags: { companion: 'Niko', bond: 'care', topic: 'past', ending: 'rescue' }, privateAnswer: 'Earlier private thought.', memory: ['Earlier private thought.', 'Earlier private reply.'], prior: true }
    ];
    for (const scenario of scenarios) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'I understand the revision.' } }] });
      };
      const saved = { version: 1, node: scenario.node, answer: '', privateAnswer: scenario.privateAnswer,
        relationship: scenario.character, flags: scenario.flags,
        followupMemory: scenario.prior ? [{ speaker: 'Player to Niko', text: 'Earlier private thought.' }, { speaker: 'Niko', text: 'Earlier private reply.' }] : [] };
      els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit();
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.resume.click(); await flush();
      const original = 'The first thing I said.';
      els.interaction.children.find(el => el.id === 'player-message').value = original;
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const written = els['story-text'].textContent;
      assert.equal(requests.length, 0);
      els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); await flush();
      const retry = els.interaction.children.find(el => el.textContent === 'Edit or retry your first message');
      assert.ok(retry, `${scenario.node}: the first message can be retried`);
      els['settings-open'].click(); els['settings-form'].submit();
      assert.equal(els.interaction.children.filter(el => el.textContent === 'Edit or retry your first message').length, 1);
      retry.click();
      const input = els.interaction.children.find(el => el.id === 'player-follow-up');
      assert.equal(input.value, original);
      input.value = 'A revised first message.';
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].player_says, 'A revised first message.');
      assert.deepEqual(requests[0].memory.map(item => item.text), scenario.memory, `${scenario.node}: only pre-exchange history is sent`);
      assert.ok(!JSON.stringify(requests[0].memory).includes(written), 'the replaced written reply is not sent as earlier history');
      if (scenario.node === 'mid_mira_input' || scenario.flags.signal === 'private') {
        assert.doesNotMatch(JSON.stringify(requests[0]), /Private thought\./);
      }
      assert.equal(els['story-text'].textContent, 'I understand the revision.');
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('completed AI conversations save in place and resume without a provider request', async () => {
    const scenarios = [
      { node: 'niko_input', character: 'Niko', relationship: 'Niko', flags: { companion: 'Niko' } },
      { node: 'mallow_input', character: 'Mallow', relationship: 'Niko', flags: { companion: 'Niko', signal: 'private' }, privateAnswer: 'A private thought.' },
      { node: 'mid_mira_input', character: 'Mira', relationship: 'Mira', flags: { companion: 'Mira', bond: 'care', moment: 'keep', midpoint_available: 'yes', midpoint_route: 'mira', midpoint_chat: 'yes' }, privateAnswer: 'A private thought.' },
      { node: 'mallow_reflection_input', character: 'Mallow', relationship: 'Niko', flags: { companion: 'Niko', reflection_selected: 'yes' }, privateAnswer: 'A private thought.' },
      { node: 'close_niko_input', character: 'Niko', relationship: 'Niko', flags: { companion: 'Niko', bond: 'care', topic: 'past', ending: 'rescue' }, privateAnswer: 'A private thought.', followupMemory: [{ speaker: 'Player to Niko', text: 'A private thought.' }, { speaker: 'Niko', text: 'Earlier answer.' }] }
    ];
    for (const scenario of scenarios) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: requests.length === 1 ? 'The first answer.' : 'The next answer.' } }] });
      };
      els.restart.click(); els['settings-clear'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['api-key'].value = 'SECRET-SETTING'; els['settings-form'].submit();
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: scenario.node,
        answer: '', privateAnswer: scenario.privateAnswer || '', relationship: scenario.relationship,
        flags: scenario.flags, followupMemory: scenario.followupMemory || [] }));
      els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'A submitted question.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(els['story-text'].textContent, 'The first answer.', scenario.node);
      els.status.textContent = 'Playing speech.'; // Voice status must not replace the semantic AI status.
      els.save.click();
      const raw = storageData.get('okie-dokie.arcade.v1'), saved = JSON.parse(raw);
      assert.equal(saved.aiScene.text, 'The first answer.');
      assert.equal(saved.aiScene.status, 'AI-GENERATED RESPONSE');
      assert.ok(!raw.includes('SECRET-SETTING'), 'endpoint credentials are not saved');
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(requests.length, 1, `${scenario.node}: same-session resume sends no request`);
      assert.equal(els['story-text'].textContent, 'The first answer.');
      assert.equal(els.status.textContent, 'AI-GENERATED RESPONSE');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Another submitted question.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.length, 2);
      assert.ok(requests[1].memory.some(entry => entry.text === 'A submitted question.'), `${scenario.node}: opening question retained`);
      if (scenario.node === 'mallow_input' || scenario.node === 'mid_mira_input' || scenario.node === 'mallow_reflection_input') {
        assert.doesNotMatch(JSON.stringify(requests[1]), /A private thought\./, 'private words stay out of the group request');
      }
      assert.equal(els['story-text'].textContent, 'The next answer.');
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('saving during voice capture reports what is excluded without interrupting it', async () => {
    globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content: 'A settled answer.' } }] });
    els.restart.click(); els['settings-clear'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'A submitted message.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    const field = els.interaction.children.find(el => el.id === 'player-follow-up');
    els.save.click(); assert.equal(els['save-status'].textContent, 'Story saved on this device.');
    const record = els.interaction.children.find(el => el.textContent === 'Record a reply');
    record.click(); await flush();
    els.save.click(); assert.match(els['save-status'].textContent, /unsubmitted voice input was not saved/i);
    assert.equal(record.disabled, true, 'saving does not cancel pending microphone permission');
    field.value = 'UNSENT VOICE DRAFT';
    els.save.click(); assert.match(els['save-status'].textContent, /unsubmitted reply and voice input were not saved/i);
    let stopped = 0; resolveMicrophonePermission({ getTracks: () => [{ stop() { stopped++; } }] });
    for (let i = 0; i < 8; i++) await flush();
    assert.equal(record.textContent, 'Stop recording and transcribe');
    els.save.click();
    const raw = storageData.get('okie-dokie.arcade.v1');
    assert.ok(!raw.includes('UNSENT VOICE DRAFT'));
    assert.ok(!/audio|recording/i.test(raw), 'the checkpoint contains no recording');
    assert.equal(record.textContent, 'Stop recording and transcribe', 'saving does not stop an active recording');
    els.restart.click(); assert.ok(stopped > 0);
    storageData.clear(); els['settings-clear'].click();
  });

  await test('saving an AI conversation excludes an unfinished follow-up and does not replay on reconnect', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return jsonResponse({ choices: [{ message: { content: 'A settled answer.' } }] }); };
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'The submitted message.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'UNSENT PRIVATE DRAFT';
    els.save.click();
    assert.match(els['save-status'].textContent, /unsent reply was not saved/i);
    const saved = storageData.get('okie-dokie.arcade.v1');
    assert.ok(!saved.includes('UNSENT PRIVATE DRAFT'));
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'UNSENT PRIVATE DRAFT', 'saving does not erase the onscreen draft');
    els.restart.click(); els['settings-clear'].click(); els.resume.click(); await flush();
    assert.equal(calls, 1, 'restoring with no provider sends nothing');
    assert.equal(els['story-text'].textContent, 'A settled answer.');
    assert.ok(!els.interaction.children.some(el => el.id === 'player-follow-up'), 'the unsent draft is not restored');
    els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
    assert.equal(calls, 1, 'reconnecting sends nothing');
    assert.equal(els.interaction.children.filter(el => el.textContent === 'Say more').length, 1);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, '');
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A new follow-up.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(calls, 2);
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('saving a failed follow-up preserves its retry without inventing a reply', async () => {
    const requests = []; let fail = false;
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      if (fail) throw new Error('unavailable');
      return jsonResponse({ choices: [{ message: { content: 'A completed answer.' } }] });
    };
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'First question.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Unanswered question.';
    fail = true; els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(els['story-text'].textContent, 'A completed answer.');
    els.save.click(); const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(saved.aiScene.transcript[saved.aiScene.transcript.length - 1].text, 'Unanswered question.');
    els.restart.click(); els['settings-clear'].click(); els.resume.click(); await flush();
    assert.equal(requests.length, 2, 'restore does not retry');
    assert.equal(els['story-text'].textContent, 'A completed answer.');
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'an unanswered question is not treated as a completed exchange');
    els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'Unanswered question.');
    els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
    assert.equal(requests.length, 2, 'reconnecting does not retry the unanswered question');
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'Unanswered question.', 'reconnecting keeps the submitted question available to retry');
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'reconnecting does not replace an unanswered question');
    fail = false; els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests.length, 3);
    assert.ok(!requests[2].memory.some(entry => entry.text === 'Unanswered question.'), 'retry history excludes the replaced unanswered turn');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('a context-window failure survives saving and can be retried after changing models', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      if (requests.length === 2) return new Response(JSON.stringify({ error: { type: 'exceed_context_size_error', message: 'private detail' } }), { status: 400 });
      return jsonResponse({ choices: [{ message: { content: requests.length === 1 ? 'A completed answer.' : 'A new answer.' } }] });
    };
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'small'; els['settings-form'].submit();
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'First question.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A longer question.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.match(els.status.textContent, /context window/i);
    assert.doesNotMatch(els.status.textContent, /private detail/);
    assert.equal(els['story-text'].textContent, 'A completed answer.');
    els.save.click(); els.restart.click(); els['settings-clear'].click(); els.resume.click(); await flush();
    assert.equal(requests.length, 2, 'resuming does not send a request');
    assert.match(els.status.textContent, /context window/i, 'the explanation is restored');
    els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'A longer question.');
    els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'larger'; els['settings-form'].submit(); await flush();
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests.length, 3);
    assert.equal(requests[2].model, 'larger');
    assert.equal(els['story-text'].textContent, 'A new answer.');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('an offline selected written response keeps retry and follow-up history through reconnect', async () => {
    for (const restoreBeforeChoosing of [false, true]) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: `Generated answer ${requests.length}.` } }] });
      };
      els.restart.click(); els['settings-clear'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.resume.click(); await flush();
      const first = 'You don’t have to keep everything ready on your own.';
      const written = 'Would you help me decide what can wait? I think I’ve forgotten how.';
      els.interaction.children.find(el => el.textContent === first).click(); await flush();
      if (restoreBeforeChoosing) { els.save.click(); els.restart.click(); }
      els['settings-clear'].click();
      if (restoreBeforeChoosing) { els.resume.click(); await flush(); }
      els.interaction.children.find(el => el.textContent === 'Use the written response').click();
      assert.equal(els['story-text'].textContent, written);
      assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'no unavailable follow-up while disconnected');
      assert.equal(els.interaction.children.filter(el => el.textContent === 'Edit or retry your first message').length, 1);
      if (!restoreBeforeChoosing) {
        els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
        assert.equal(requests.length, 1, 'same-session reconnect sends no request');
        assert.equal(els.interaction.children.filter(el => el.textContent === 'Say more').length, 1);
        assert.equal(els.interaction.children.filter(el => el.textContent === 'Edit or retry your first message').length, 1);
      }
      // Selecting the alternative must survive another save and reload before reconnecting.
      els.save.click(); els.restart.click(); els['settings-clear'].click(); els.resume.click(); await flush();
      assert.equal(requests.length, 1, 'saving and restoring send no request');
      assert.equal(els['story-text'].textContent, written);
      assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'));
      els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
      els['settings-open'].click(); els['settings-form'].submit(); await flush();
      assert.equal(requests.length, 1, 'reconnecting sends no request');
      assert.equal(els.interaction.children.filter(el => el.textContent === 'Say more').length, 1);
      assert.equal(els.interaction.children.filter(el => el.textContent === 'Edit or retry your first message').length, 1);
      els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
      assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, first);
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A revised first question.';
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.equal(requests.length, 2);
      assert.ok(!requests[1].memory.some(entry => entry.text === first || entry.text === written), 'first-message retry starts with pre-response history');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A later question.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.length, 3);
      assert.ok(requests[2].memory.some(entry => entry.text === 'A revised first question.'));
      assert.ok(requests[2].memory.some(entry => entry.text === 'Generated answer 2.'));
      assert.ok(!requests[2].memory.some(entry => entry.text === first || entry.text === written));
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('follow-up and its retry retain a selected written response after reconnect', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: `Generated answer ${requests.length}.` } }] });
    };
    const first = 'You don’t have to keep everything ready on your own.';
    const written = 'Would you help me decide what can wait? I think I’ve forgotten how.';
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.textContent === first).click(); await flush();
    els['settings-clear'].click(); els.interaction.children.find(el => el.textContent === 'Use the written response').click();
    els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
    assert.equal(requests.length, 1);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A follow-up question.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests.length, 2);
    assert.ok(requests[1].memory.some(entry => entry.text === first));
    assert.ok(requests[1].memory.some(entry => entry.text === written));
    assert.ok(!requests[1].memory.some(entry => entry.text === 'Generated answer 1.'));
    els.save.click(); els.restart.click(); els['settings-clear'].click(); els.resume.click(); await flush();
    assert.equal(requests.length, 2);
    els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
    assert.equal(requests.length, 2, 'reconnecting does not retry the follow-up');
    assert.equal(els.interaction.children.filter(el => el.textContent === 'Edit or retry message').length, 1);
    els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'A follow-up question.');
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A revised follow-up.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests.length, 3);
    assert.ok(requests[2].memory.some(entry => entry.text === written));
    assert.ok(!requests[2].memory.some(entry => ['Generated answer 1.', 'Generated answer 2.', 'A follow-up question.'].includes(entry.text)));
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('AI checkpoint keeps a selected written alternative', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return jsonResponse({ choices: [{ message: { content: 'A generated answer.' } }] }); };
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.textContent === 'You don’t have to keep everything ready on your own.').click(); await flush();
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(calls, 1);
    els.interaction.children.find(el => el.textContent === 'Use the written response').click();
    assert.equal(els['story-text'].textContent, 'Would you help me decide what can wait? I think I’ve forgotten how.');
    els.save.click(); els.restart.click(); els.resume.click(); await flush();
    assert.equal(calls, 1);
    assert.equal(els['story-text'].textContent, 'Would you help me decide what can wait? I think I’ve forgotten how.');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('an offline written AI checkpoint can reconnect and retry its first message', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'A generated answer.' } }] });
    };
    els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit();
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.textContent === 'You don’t have to keep everything ready on your own.').click(); await flush();
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'an offline reply has no generated follow-up before saving');
    els.save.click(); assert.match(els['save-status'].textContent, /story saved/i);
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(requests.length, 0);
    assert.equal(els['story-text'].textContent, 'Would you help me decide what can wait? I think I’ve forgotten how.');
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'resuming offline does not offer an unavailable follow-up');
    els['settings-open'].click(); els.endpoint.value = 'http://remote.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'an invalid endpoint does not offer a follow-up');
    els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
    assert.equal(requests.length, 0, 'connecting never replays the conversation');
    assert.equal(els.interaction.children.filter(el => el.textContent === 'Say more').length, 1);
    els['settings-open'].click(); els['settings-form'].submit(); await flush();
    assert.equal(els.interaction.children.filter(el => el.textContent === 'Say more').length, 1, 'reopening settings does not duplicate the control');
    assert.equal(requests.length, 0);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'A new unsent question';
    els['settings-open'].click(); els['settings-form'].submit(); await flush();
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'A new unsent question', 'settings preserve the new follow-up draft');
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'settings do not add a duplicate while a follow-up is open');
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(requests.length, 0, 'resuming the earlier save does not submit the discarded draft');
    assert.equal(els.interaction.children.filter(el => el.textContent === 'Say more').length, 1);
    const retry = els.interaction.children.filter(el => el.textContent === 'Edit or retry your first message');
    assert.equal(retry.length, 1);
    retry[0].click();
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'You don’t have to keep everything ready on your own.');
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Unsent revision';
    els['settings-open'].click(); els['settings-form'].submit(); await flush();
    assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'Unsent revision', 'settings preserve an in-progress draft');
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Say more'), 'settings do not add a follow-up control beside an open retry draft');
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'You don’t have to keep everything ready on your own.';
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].player_says, 'You don’t have to keep everything ready on your own.');
    assert.ok(!requests[0].memory.some(entry => /Would you help me decide/.test(entry.text)), 'the written response does not precede its own retry');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('an AI checkpoint made after an invalid endpoint recovers its first retry', async () => {
    for (const mode of ['invalid_before', 'invalid_after']) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'A generated answer.' } }] });
      };
      els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit();
      if (mode === 'invalid_before') { els['settings-open'].click(); els.endpoint.value = 'http://remote.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); }
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'A first message.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      if (mode === 'invalid_after') { els['settings-open'].click(); els.endpoint.value = 'http://remote.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); }
      els.save.click(); assert.match(els['save-status'].textContent, /story saved/i);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(requests.length, 0);
      els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els['settings-form'].submit(); await flush();
      assert.equal(requests.length, 0, 'correcting the endpoint does not replay');
      const retry = els.interaction.children.filter(el => el.textContent === 'Edit or retry your first message');
      assert.equal(retry.length, 1, mode);
      retry[0].click(); assert.equal(els.interaction.children.find(el => el.id === 'player-follow-up').value, 'A first message.');
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.equal(requests.length, 1); assert.deepEqual(requests[0].memory, []);
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('AI checkpoint cannot capture a pending request and rejects malformed snapshots', async () => {
    let release;
    globalThis.fetch = async () => new Promise(resolve => { release = resolve; });
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    const before = JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] });
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', before); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Pending question.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.save.click(); assert.match(els['save-status'].textContent, /wait.*response/i);
    assert.equal(storageData.get('okie-dokie.arcade.v1'), before, 'the previous save survives a pending request');
    release(jsonResponse({ choices: [{ message: { content: 'A completed answer.' } }] })); await flush();
    const stringify = JSON.stringify;
    try {
      JSON.stringify = (value, ...args) => value?.aiScene
        ? stringify({ ...value, aiScene: { ...value.aiScene, character: 'wrong' } }, ...args)
        : stringify(value, ...args);
      els.save.click();
      assert.match(els['save-status'].textContent, /previous saved story was kept/i);
      assert.equal(storageData.get('okie-dokie.arcade.v1'), before, 'an invalid generated checkpoint never replaces the old save');
    } finally { JSON.stringify = stringify; }
    els.save.click(); const valid = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    for (const corrupt of [
      scene => { scene.character = 'Mira'; },
      scene => { scene.node = 'mira_chat'; },
      scene => { scene.text = 'x'.repeat(701); },
      scene => { scene.memory.push({ speaker: 'Player to Mira', text: 'private' }); },
      scene => { scene.transcript.push({ speaker: 'Unknown', text: 'bad' }); },
      scene => { scene.retry.history = Array.from({ length: 7 }, () => ({ speaker: 'Niko', text: 'bad' })); }
    ]) {
      const bad = JSON.parse(JSON.stringify(valid)); corrupt(bad.aiScene);
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(bad)); els.restart.click();
      assert.equal(els.resume.hidden, true, 'a malformed AI checkpoint is not resumed');
    }
    storageData.set('okie-dokie.arcade.v1', 'x'.repeat(65537)); els.restart.click();
    assert.equal(els.resume.hidden, true, 'an oversized checkpoint is not parsed');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('restoring an AI checkpoint speaks its saved reply only when auto-read is active and visible', async () => {
    const oldAudio = globalThis.Audio, priorVisibility = document.visibilityState;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    let chatCalls = 0; const speech = [];
    globalThis.fetch = async (url, request) => {
      if (String(url).endsWith('/tts')) { speech.push(JSON.parse(request.body)); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } }); }
      chatCalls++; return jsonResponse({ choices: [{ message: { content: 'A generated answer.' } }] });
    };
    try {
      if (els['auto-read']['aria-pressed'] === 'true') els['auto-read'].click();
      els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko' }, followupMemory: [] }));
      els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'Question.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      els['auto-read'].click(); await flush();
      assert.ok(speech.length > 0, 'the active preference requested the original passage');
      els.save.click(); const beforeSpeech = speech.length, beforeChat = chatCalls;
      globalThis.__voiceFixtureLookups = [];
      els.restart.click(); els.resume.click(); for (let i = 0; i < 8; i++) await flush();
      assert.equal(chatCalls, beforeChat, 'restoring does not request a new model reply');
      assert.equal(speech[beforeSpeech]?.text, 'A generated answer.', 'the saved answer is spoken again');
      assert.equal(speech[beforeSpeech]?.voice, 'am_adam', 'the character keeps its configured voice');
      assert.equal(globalThis.__voiceFixtureLookups[0].authored, false, 'generated content stays outside the authored clip lookup');
      assert.equal(els['auto-read']['aria-pressed'], 'true', 'the preference remains enabled');
      document.visibilityState = 'hidden'; documentHandlers.visibilitychange();
      const hiddenCount = speech.length;
      els.restart.click(); els.resume.click(); for (let i = 0; i < 8; i++) await flush();
      assert.equal(speech.length, hiddenCount, 'a backgrounded game does not request restored speech');
      document.visibilityState = 'visible'; documentHandlers.visibilitychange();
      els['auto-read'].click();
      const disabledCount = speech.length;
      els.restart.click(); els.resume.click(); for (let i = 0; i < 8; i++) await flush();
      assert.equal(speech.length, disabledCount, 'auto-read off suppresses restored speech');
    } finally {
      document.visibilityState = priorVisibility; documentHandlers.visibilitychange();
      delete globalThis.__voiceFixtureLookups;
      els['stop-voice'].click(); globalThis.Audio = oldAudio; storageData.clear(); els.restart.click(); els['settings-clear'].click();
    }
  });

  await test('correcting an invalid endpoint restores the first-message retry without replaying a response', async () => {
    for (const initial of ['invalid_before_response', 'invalid_after_response']) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'I understand your revision.' } }] });
      };
      const saved = { version: 1, node: 'mid_mira_input', answer: 'Earlier group message.',
        privateAnswer: 'Earlier private thought.', relationship: 'Mira',
        flags: { companion: 'Mira', bond: 'care', moment: 'keep', midpoint_available: 'yes', midpoint_route: 'mira', midpoint_chat: 'yes' }, followupMemory: [] };
      els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit();
      if (initial === 'invalid_before_response') {
        els['settings-open'].click(); els.endpoint.value = 'http://remote.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      }
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'The first public message.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const written = els['story-text'].textContent;
      if (initial === 'invalid_after_response') {
        els['settings-open'].click(); els.endpoint.value = 'http://remote.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); await flush();
      }
      assert.equal(requests.length, 0);
      assert.ok(!els.interaction.children.some(el => el.textContent === 'Edit or retry your first message'));
      els['settings-open'].click(); els.endpoint.value = 'https://example.invalid/chat'; els['settings-form'].submit(); await flush();
      assert.equal(requests.length, 0, 'Correcting settings must not send or replay');
      assert.equal(els['story-text'].textContent, written);
      const retries = els.interaction.children.filter(el => el.textContent === 'Edit or retry your first message');
      assert.equal(retries.length, 1, `${initial}: correcting the endpoint restores the retry`);
      els['settings-open'].click(); els['settings-form'].submit();
      assert.equal(els.interaction.children.filter(el => el.textContent === 'Edit or retry your first message').length, 1, 'reopening settings does not duplicate it');
      retries[0].click();
      const input = els.interaction.children.find(el => el.id === 'player-follow-up');
      assert.equal(input.value, 'The first public message.');
      input.value = 'The revised public message.';
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].player_says, 'The revised public message.');
      assert.deepEqual(requests[0].memory, []);
      assert.doesNotMatch(JSON.stringify(requests[0]), /Earlier private thought|Earlier group message|The first public message/);
      assert.equal(els['story-text'].textContent, 'I understand your revision.');
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('Mallow follow-up after a written response preserves the existing privacy boundary', async () => {
    for (const signal of [0, 1]) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        const data = JSON.parse(JSON.parse(request.body).messages[1].content);
        requests.push(data);
        if (data.character === 'Mallow' && requests.filter(item => item.character === 'Mallow').length === 1) return new Response('', { status: 503 });
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const plan = { signal_choice: signal, privateText: 'Private original.', publicText: 'Find the door.' };
      for (let i = 0; i < 150 && !requests.some(item => item.character === 'Mallow'); i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.ai_reflection.ai.fallback);
      assert.equal(requests.filter(item => item.character === 'Mallow').length, 1);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What should we do?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      const later = requests.at(-1);
      assert.equal(later.character, 'Mallow');
      assert.deepEqual(later.memory.map(item => item.text), [...(signal === 0 ? ['Private original.'] : []), 'Find the door.', story.ai_reflection.ai.fallback]);
      assert.equal(JSON.stringify(later).includes('Private original.'), signal === 0);
      assert.equal(els['story-text'].textContent, 'I am listening.');
    }
  });

  await test('initial pending AI can be cancelled or restarted without showing late replies', async () => {
    for (const action of ['skip', 'restart']) {
      let pendingSignal, resolveResponse;
      globalThis.fetch = (_url, request) => {
        pendingSignal = request.signal;
        return new Promise(resolve => { resolveResponse = resolve; });
      };
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      for (let i = 0; i < 100 && !pendingSignal; i++) await step({});
      assert.ok(pendingSignal);
      if (action === 'skip') els.interaction.children.find(el => el.textContent === 'Use the written response instead').click();
      else els.restart.click();
      assert.ok(pendingSignal.aborted);
      resolveResponse(jsonResponse({ choices: [{ message: { content: 'Late stale response.' } }] })); await flush();
      if (action === 'skip') assert.equal(els['story-text'].textContent, story.niko_chat.ai.fallback);
      else assert.equal(els.intro.hidden, false);
      assert.notEqual(els['story-text'].textContent, 'Late stale response.');
    }
  });

  await test('changing chat settings cancels a pending reply without losing the follow-up draft', async () => {
    for (const phase of ['initial', 'followup']) {
      let pendingSignal, resolveOld;
      const calls = [];
      globalThis.fetch = async (url, request) => {
        calls.push({ url, body: JSON.parse(JSON.parse(request.body).messages[1].content) });
        if (url === 'https://old.example/chat' && (phase === 'initial' || calls.length === 2)) {
          pendingSignal = request.signal;
          return new Promise(resolve => { resolveOld = resolve; });
        }
        return jsonResponse({ choices: [{ message: { content: 'The new reply.' } }] });
      };
      storageData.clear(); els.restart.click(); els['settings-open'].click();
      els.endpoint.value = 'https://old.example/chat'; els.model.value = 'old-model';
      els['settings-form'].submit(); els.start.click(); await flush();
      for (let i = 0; i < 120 && !(phase === 'initial' ? pendingSignal : els.interaction.children.some(el => el.textContent === 'Say more')); i++) await step({});
      if (phase === 'followup') {
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'An unfinished thought.';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      }
      assert.ok(pendingSignal && !pendingSignal.aborted, `${phase} response is pending`);
      els['settings-open'].click(); els['settings-form'].submit(); await flush();
      assert.equal(pendingSignal.aborted, false, 'saving unchanged chat settings leaves the request running');
      els['settings-open'].click(); els.endpoint.value = 'https://new.example/chat'; els.model.value = 'new-model';
      els['settings-form'].submit(); await flush();
      assert.equal(pendingSignal.aborted, true, 'changing providers cancels the old request');
      assert.equal(els['story-text'].textContent, phase === 'initial' ? story.niko_chat.ai.fallback : 'The new reply.');
      resolveOld(jsonResponse({ choices: [{ message: { content: 'Stale old provider reply.' } }] })); await flush();
      assert.equal(els['story-text'].textContent, phase === 'initial' ? story.niko_chat.ai.fallback : 'The new reply.');
      if (phase === 'followup') {
        els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
        const draft = els.interaction.children.find(el => el.id === 'player-follow-up');
        assert.equal(draft.value, 'An unfinished thought.');
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        assert.equal(calls.at(-1).url, 'https://new.example/chat');
        assert.equal(calls.at(-1).body.player_says, 'An unfinished thought.');
        assert.equal(els['story-text'].textContent, 'The new reply.');
      }
    }
  });

  await test('settings cancel pending microphone permission before any transcription', async () => {
    let fetches = 0;
    globalThis.fetch = async () => { fetches++; throw new Error('Unexpected transcription'); };
    els.restart.click(); els['settings-clear'].click(); els['speech-mode'].value = 'openai';
    els['speech-url'].value = 'https://speech.example'; els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
    const record = els.interaction.children.find(el => el.textContent === 'Record a reply');
    assert.ok(record); const before = microphonePermissionRequests; record.click(); await flush();
    assert.equal(microphonePermissionRequests, before + 1);
    els['settings-open'].click();
    let stopped = 0; resolveMicrophonePermission({ getTracks: () => [{ stop() { stopped++; } }] });
    for (let i = 0; i < 8; i++) await flush();
    assert.equal(stopped, 1); assert.equal(fetches, 0);
    els['settings-close'].click();
  });

  await test('Realtime preview and story use distinct cast voices', async () => {
    const oldSocket = globalThis.WebSocket, oldAudio = globalThis.Audio, oldFetch = globalThis.fetch;
    const oldMake = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
    const heard = [];
    let tokenRequests = 0, pauses = 0, delayNextToken = false, delayedSignal, resolveDelayedToken;
    try {
      globalThis.Audio = class { async play() {} pause() { pauses++; } removeAttribute() {} };
      URL.createObjectURL = () => 'blob:realtime-test'; URL.revokeObjectURL = () => {};
      globalThis.fetch = async (_url, options) => {
        tokenRequests++;
        if (delayNextToken) {
          delayNextToken = false; delayedSignal = options.signal;
          return new Promise(resolve => { resolveDelayedToken = resolve; });
        }
        return jsonResponse({ value: 'ek_fake', expires_at: Math.floor(Date.now() / 1000) + 60 });
      };
      globalThis.WebSocket = class {
        constructor() { queueMicrotask(() => this.event({ type: 'session.created' })); }
        event(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
        send(raw) {
          const message = JSON.parse(raw);
          if (message.type === 'session.update') {
            heard.push(message.session.audio.output.voice);
            queueMicrotask(() => this.event({ type: 'session.updated' }));
          } else if (message.type === 'response.create') {
            queueMicrotask(() => { this.event({ type: 'response.output_audio.delta', delta: 'AQI=' }); this.event({ type: 'response.done', response: { status: 'completed' } }); });
          }
        }
        close() {}
      };
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['tts-provider'].value = 'realtime'; els['realtime-url'].value = 'https://companion.invalid:9443';
      els['realtime-token'].value = 'p'.repeat(32); els['realtime-voice'].value = 'cedar';
      for (const [speaker, expected] of [['Narrator', 'cedar'], ['You', 'coral'], ['Service', 'sage'], ['Niko', 'marin'], ['Mira', 'shimmer'], ['Ash', 'echo'], ['Mallow', 'ballad']]) {
        els['voice-preview-speaker'].value = speaker;
        // A real select change bubbles through the settings form.
        els['settings-form'].listeners.change({ target: els['voice-preview-speaker'] });
        els['voice-preview'].click();
        for (let i = 0; i < 20; i++) await flush();
        assert.equal(heard[heard.length - 1], expected, `${speaker} preview`);
      }
      assert.equal(tokenRequests, 1, 'switching speakers reuses one token across seven previews');
      assert.ok(pauses >= 6, 'switching speakers stops the previous preview');
      els['realtime-token'].value = 'q'.repeat(32);
      els['settings-form'].listeners.input({ target: els['realtime-token'] });
      els['voice-preview'].click(); for (let i = 0; i < 20; i++) await flush();
      assert.equal(tokenRequests, 2, 'changing credentials discards the token');
      els['voice-preview-stop'].click();
      els['voice-preview'].click(); for (let i = 0; i < 20; i++) await flush();
      assert.equal(tokenRequests, 3, 'the explicit stop discards the token');
      els['settings-close'].click(); els['settings-open'].click();
      els['tts-provider'].value = 'realtime'; els['realtime-url'].value = 'https://companion.invalid:9443';
      els['realtime-token'].value = 'q'.repeat(32); els['realtime-voice'].value = 'cedar';
      els['voice-preview'].click(); for (let i = 0; i < 20; i++) await flush();
      assert.equal(tokenRequests, 4, 'closing settings discards the token');
      els['voice-preview-stop'].click(); delayNextToken = true;
      els['voice-preview'].click(); await flush();
      const voicesBeforeCancel = heard.length;
      els['voice-preview-speaker'].value = 'Niko';
      els['settings-form'].listeners.change({ target: els['voice-preview-speaker'] });
      assert.ok(delayedSignal.aborted, 'switching speakers aborts an in-flight token request');
      resolveDelayedToken(jsonResponse({ value: 'ek_late', expires_at: Math.floor(Date.now() / 1000) + 60 }));
      for (let i = 0; i < 10; i++) await flush();
      assert.equal(heard.length, voicesBeforeCancel, 'a cancelled preview cannot start later');
      els['voice-preview'].click(); for (let i = 0; i < 20; i++) await flush();
      assert.equal(tokenRequests, 6, 'a late cancelled token was not cached');
      els['settings-form'].submit(); els.start.click(); await flush();
      els.speak.click(); for (let i = 0; i < 20; i++) await flush();
      assert.equal(heard[heard.length - 1], 'cedar', 'opening narrator uses selected voice');
      els.advance.click(); await flush();
      els.speak.click(); for (let i = 0; i < 20; i++) await flush();
      assert.equal(heard[heard.length - 1], 'sage', 'Service uses its separate voice');
      els['settings-open'].click(); els['settings-clear'].click(); els['settings-close'].click();
    } finally {
      globalThis.WebSocket = oldSocket; globalThis.Audio = oldAudio; globalThis.fetch = oldFetch;
      URL.createObjectURL = oldMake; URL.revokeObjectURL = oldRevoke;
    }
  });

  await test('Realtime settings do not request a token until read aloud, and preserve separate ASR settings', async () => {
    const requests = [];
    const oldSocket = globalThis.WebSocket;
    try {
      globalThis.WebSocket = undefined;
      globalThis.fetch = async (url, init) => {
        requests.push({ url, init });
        return jsonResponse({ value: 'ek_fake', expires_at: Math.floor(Date.now() / 1000) + 60 });
      };
      els.restart.click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://localhost:8000';
      els['tts-provider'].value = 'realtime'; els['realtime-url'].value = 'https://companion.invalid:9443';
      els['realtime-token'].value = 'p'.repeat(32); els['realtime-voice'].value = 'marin';
      els['settings-form'].submit();
      assert.equal(requests.length, 0, 'saving settings must not mint tokens');
      els.start.click(); await flush();
      assert.equal(requests.length, 0, 'opening the story must not mint tokens');
      els.speak.click(); for (let i = 0; i < 20; i++) await flush();
      assert.equal(requests.length, 1); assert.equal(requests[0].url, 'https://companion.invalid:9443/v1/realtime/client-secret');
      assert.equal(requests[0].init.headers.Authorization, `Bearer ${'p'.repeat(32)}`);
      els['settings-open'].click();
      assert.equal(els['speech-mode'].value, 'mirid');
      assert.equal(els['tts-provider'].value, 'realtime');
      els['settings-clear'].click();
      assert.equal(els['realtime-token'].value, ''); assert.equal(els['tts-provider'].value, 'standard');
      els['settings-close'].click();
    } finally { globalThis.WebSocket = oldSocket; }
  });

  await test('a player can replace a generated line with the written response without sending another request', async () => {
    for (const scene of ['private', 'group', 'epilogue']) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: `Generated reply ${requests.length}.` } }] });
      };
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const plan = { signal_choice: 1, privateText: 'Private thought for Niko.', publicText: 'We need to find Mira.' };
      const target = scene === 'private' ? story.niko_chat : scene === 'group' ? story.ai_reflection : story.close_niko_chat;
      const wanted = scene === 'private' ? 1 : scene === 'group' ? 2 : 3;
      for (let i = 0; i < 250 && requests.length < wanted; i++) await step(plan);
      assert.equal(requests.length, wanted);
      const firstGenerated = els['story-text'].textContent;
      const chooseWritten = els.interaction.children.find(el => el.textContent === 'Use the written response');
      assert.ok(chooseWritten, `${scene} offers the written line after generated output`);
      chooseWritten.click(); await flush();
      assert.equal(requests.length, wanted, 'Switching lines does not contact the model');
      assert.equal(els['story-text'].textContent, target.ai.fallback);
      assert.match(els.status.textContent, /WRITTEN RESPONSE/);
      let review = els.interaction.children.find(el => el.className === 'conversation-history');
      let lines = review.children.find(el => el.tagName === 'OL').children;
      assert.ok(lines.at(-1).textContent.includes(target.ai.fallback));
      assert.ok(!lines.some(el => el.textContent.includes(firstGenerated)), 'Review reflects the selected line');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What should we do?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.length, wanted + 1);
      const history = requests.at(-1).memory;
      assert.equal(history.at(-1).text, target.ai.fallback, 'The next request sees the selected line');
      assert.ok(!history.some(item => item.text === firstGenerated));
      if (scene === 'group') assert.ok(!history.some(item => item.text === plan.privateText));
      const previousHistory = history.map(item => ({ ...item }));
      const secondGenerated = els['story-text'].textContent;
      assert.ok(!els.interaction.children.some(el => el.textContent === 'Use the written response'), 'the opening line is not an alternative to an unrelated follow-up');
      assert.ok(els.interaction.children.some(el => el.textContent === 'Edit or retry message'), 'the follow-up retains its retry control');
      review = els.interaction.children.find(el => el.className === 'conversation-history');
      lines = review.children.find(el => el.tagName === 'OL').children;
      assert.ok(lines.some(el => el.textContent.includes(secondGenerated)));
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And after that?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      const nextHistory = requests.at(-1).memory;
      assert.deepEqual(nextHistory.slice(0, previousHistory.length), previousHistory, 'Earlier messages stay intact');
      assert.equal(nextHistory.at(-1).text, secondGenerated);
      const staleControl = els.interaction.children.find(el => el.textContent === 'Edit or retry message');
      els.advance.click(); await flush();
      const afterAdvance = els['story-text'].textContent;
      staleControl.click(); await flush();
      assert.equal(els['story-text'].textContent, afterAdvance, 'A stale control cannot alter a later scene');
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      if (scene !== 'group') {
        assert.ok(saved.followupMemory.some(item => item.text === secondGenerated));
        els.restart.click(); els.resume.click(); await flush(); els.save.click();
        assert.deepEqual(JSON.parse(storageData.get('okie-dokie.arcade.v1')).followupMemory, saved.followupMemory);
      } else assert.ok(!saved.followupMemory.some(item => item.text === secondGenerated));
    }
  });

  await test('private conversations reject the observed wrong-character address without affecting the group scene', async () => {
    const calls = [];
    const incorrect = 'Of course, Niko! Attending that workshop would be so interesting.';
    globalThis.fetch = async (_url, request) => {
      calls.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: incorrect } }] });
    };
    storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    const plan = { crew_choice: 1, plan_choice: 0, signal_choice: 1 };
    for (let i = 0; i < 200 && calls.length < 1; i++) await step(plan);
    assert.equal(calls[0].character, 'Mira');
    assert.equal(els['story-text'].textContent, story.mira_chat.ai.fallback);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Can you tell me more?';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(calls.length, 2);
    assert.equal(els['story-text'].textContent, story.mira_chat.ai.fallback);
    for (let i = 0; i < 200 && calls.length < 3; i++) await step(plan);
    assert.equal(calls[2].character, 'Mallow');
    assert.equal(els['story-text'].textContent, incorrect, 'Mallow may address the crew in a group conversation');
    for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_mira_talk_choice.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.close_mira_talk_choice.text);
    choiceAt('close_mira_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'How are you?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.equal(calls.length, 4);
    assert.equal(els['story-text'].textContent, story.close_mira_chat.ai.fallback);
  });

  await test('both responses to Mira survive checkpoints on the record ending', async () => {
    for (const [index, value] of ['apology', 'ask'].entries()) {
      storageData.clear(); els.restart.click(); els['settings-clear'].click(); els.start.click(); await flush();
      const plan = { plan_choice: 1 };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.record_close_mira.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.record_close_mira.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.record_close_mira.text, 'Resume returns to Mira’s choice');
      choiceAt('record_close_mira', index); await flush();
      const reply = `record_close_${value}`;
      assert.equal(els['story-text'].textContent, story[reply].text);
      els.save.click();
      let checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.node, reply);
      assert.equal(checkpoint.flags.ending, 'record');
      assert.equal(checkpoint.flags.record_response, value);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[reply].text, 'Resume keeps the selected reply');
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.record_close_ash.text);
      els.save.click();
      checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.node, 'record_close_ash');
      assert.equal(checkpoint.flags.record_response, value, 'The response remains in the remembered path');
      els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      const followup = value === 'apology' ? 'record_close_explain' : 'record_close_decide';
      assert.equal(els['story-text'].textContent, story[followup].text);
      els.save.click();
      checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.record_followup, value === 'apology' ? 'explain' : 'decide');
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[followup].text, 'Resume retains the witnessed action');
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.kit_check.text);
    }
  });

  await test('Mallow’s reveal choice survives a checkpoint and shapes its later help', async () => {
    for (const [index, value] of ['voice', 'search'].entries()) {
      storageData.clear(); els.restart.click(); els['settings-clear'].click(); els.start.click(); await flush();
      const plan = { plan_choice: 2, policy_mallow_choice: index };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.policy_mallow_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.policy_mallow_choice.text);
      choiceAt('policy_mallow_choice', index); await flush();
      assert.equal(els['story-text'].textContent, story[`policy_mallow_${value}`].text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.mallow_response, value);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`policy_mallow_${value}`].text);
      const callback = `end_mallow_compact_${value}`;
      for (let i = 0; i < 100 && els['story-text'].textContent !== story[callback].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[callback].text);
    }
  });

  await test('the audit visit survives checkpoints without being invented for an older save', async () => {
    storageData.clear(); els.restart.click(); els['settings-clear'].click(); els.start.click(); await flush();
    const plan = { plan_choice: 0, signal_choice: 1 };
    for (let i = 0; i < 250 && els['story-text'].textContent !== story.policy_goal_compact.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.policy_goal_compact.text);
    els.save.click();
    // Reconstruct a checkpoint saved before the early-audit route existed.
    const legacyGoal = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    for (const key of ['early_audit_due', 'early_audit_present', 'early_audit_action_seen', 'audit_action', 'audit_seen']) delete legacyGoal.flags[key];
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(legacyGoal));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.audit_seen, undefined, 'the marker is absent before the audit');
    await step(plan);
    assert.equal(els['story-text'].textContent, story.audit_focus_tell_compact.text);
    els.save.click();
    assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.audit_seen, 'yes', 'seeing the audit marks it visited');
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.audit_focus_tell_compact.text);
    for (let i = 0; i < 10 && els['story-text'].textContent !== story.policy_mallow_choice.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.policy_mallow_choice.text);
    els.save.click();
    const older = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    delete older.flags.audit_seen;
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(older));
    els.restart.click(); els.resume.click(); await flush();
    choiceAt('policy_mallow_choice', 0); await flush();
    els.save.click();
    assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.audit_seen, undefined, 'a checkpoint already past the new audit cannot acquire the marker retroactively');
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (let i = 0; i < 150 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
    assert.equal(els['story-text'].textContent, story.close_niko_talk_choice.text);
    choiceAt('close_niko_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What did we learn?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.ok(!requests.at(-1).scene.includes('Ash: one audit mark was repeated'), 'the epilogue does not invent an audit the player never saw');
  });

  await test('the early audit preserves each action across saves before the false ending', async () => {
    const flags = { companion: 'Niko', reveal_pace_v2: 'yes', early_audit_due: 'yes', early_paper_due: 'yes',
      early_paper_shown: 'yes', early_paper_done: 'yes', paper_handoff: 'share', group_reply_seen: 'yes',
      public_reply_available: 'yes', public_reply_shown: 'yes', reveal_focus: 'tell', signal: 'private',
      audit_focus_due: 'yes', vote_a: 'direct', vote_b: 'direct', card_preference: 'direct', notice_preference: 'direct' };
    const save = { version: 1, node: 'history_comparisons_early', answer: 'A group message.', publicReply: 'I heard you.', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] };
    for (const [index, action] of ['cover', 'annotate', 'leave', 'unplug'].entries()) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(save));
      els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.early_audit_choice.text);
      assert.equal(els['machine-report'].hidden, true, 'false ending has not appeared yet');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.early_audit_choice.text);
      choiceAt('early_audit_choice', index); await flush();
      const target = action === 'annotate' ? 'early_audit_annotation_input' : `early_audit_${action}`;
      assert.equal(els['story-text'].textContent, story[target].text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[target].text);
      if (action === 'annotate') {
        els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'Mira is still behind the door.';
        els.interaction.children.find(el => el.textContent === 'Write on the receipt →').click(); await flush();
        assert.match(els['story-text'].textContent, /Mira is still behind the door/);
        assert.equal(els.interaction.children.find(el => el.className === 'audit-comparison')?.children[0].children[1].textContent, 'Mira is still behind the door.');
        assert.equal(els.interaction.children.find(el => el.className === 'audit-comparison')?.children[1].children[1].textContent, 'EVERYONE IS TOGETHER');
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.match(els['story-text'].textContent, /Mira is still behind the door/);
        assert.equal(els.interaction.children.find(el => el.className === 'audit-comparison')?.children[0].children[1].textContent, 'Mira is still behind the door.');
      }
      els.advance.click(); await flush();
      assert.ok(els['story-text'].textContent.startsWith(story.policy_direct_compact.text));
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.policy_goal_compact.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.policy_mallow_choice.text);
      const after = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(after.flags.early_audit_action_seen, action);
    }
    const legacy = JSON.parse(JSON.stringify(save)); delete legacy.flags.early_audit_due;
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(legacy));
    els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.history_citation_early.text, 'old checkpoint keeps its original citation');
    els.restart.click(); storageData.clear();
  });

  await test('the combined audit keeps all actions, saved focus and legacy scenes', async () => {
    for (const focus of ['tell', 'listen']) for (const [index, action] of ['cover', 'annotate', 'leave', 'unplug'].entries()) {
      const flags = { companion: 'Niko', reveal_focus: focus, audit_focus_due: 'yes', signal: 'private', reveal_pace_v2: 'yes' };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'policy_goal_compact', answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      const id = `audit_focus_${focus}_compact`;
      assert.equal(els['story-text'].textContent, story[id].text);
      assert.deepEqual(els.interaction.children.map(item => item.textContent), story.audit_action_choice.choices.map(item => item.label));
      assert.equal(els['machine-report'].hidden, false);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[id].text);
      choiceAt(id, index); await flush();
      assert.equal(els['story-text'].textContent, story[action === 'annotate' ? 'audit_annotation_input' : `audit_${action}`].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.audit_seen, 'yes');
      assert.equal(saved.flags.audit_focus_seen, focus);
      assert.equal(saved.flags.audit_action, action);
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'policy_goal_compact', answer: '', privateAnswer: '', relationship: 'Niko', flags: { companion: 'Niko', reveal_focus: 'tell', signal: 'private' }, followupMemory: [] }));
    els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.audit_receipt.text, 'checkpoints without the new marker retain the earlier audit');
    els.restart.click(); storageData.clear();
  });

  await test('early audit context requires the actual completed action', async () => {
    const previousFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    try {
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const valid = { companion: 'Niko', ending: 'rescue', early_audit_due: 'yes', reveal_pace_v2: 'yes', early_paper_due: 'yes',
        early_paper_shown: 'yes', early_paper_done: 'yes', group_reply_seen: 'yes', public_reply_available: 'yes',
        public_reply_shown: 'yes', comparisons_revealed: 'yes', paper_handoff: 'share', reveal_focus: 'tell', signal: 'private',
        early_audit_present: 'yes', audit_seen: 'yes', mira_report_seen: 'yes', policy_goal_compact_seen: 'yes' };
      const actions = { cover: 'The player covered the lens with a paper star.', leave: 'The player left the lens and receipt alone.',
        unplug: 'The player unplugged the printer; the screen stayed on.', annotate: 'The player wrote on the receipt; the screen’s original claim stayed unchanged.' };
      for (const action of Object.keys(actions)) for (const witnessed of [true, false]) {
        const flags = { ...valid, audit_action: action, ...(witnessed ? { early_audit_action_seen: action } : {}),
          ...(action === 'annotate' && witnessed ? { annotation_written: 'yes', audit_seal_seen: 'yes' } : {}) };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice', answer: 'A group message.',
          publicReply: 'I heard you.', annotation: action === 'annotate' && witnessed ? 'Mira is behind the door.' : '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        choiceAt('close_niko_talk_choice', 0); await flush();
        els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened at the audit?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const scene = requests.at(-1).scene;
        assert.equal(scene.includes('Ash: one audit mark was repeated; Mallow watched the counter.'), witnessed);
        assert.equal(scene.includes(actions[action]), witnessed);
        assert.ok(!scene.includes('Mira is behind the door.'), 'private annotation is not copied into model context');
      }
    } finally {
      globalThis.fetch = previousFetch; els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear();
    }
  });

  await test('early rescue companions remember only witnessed screen reports and completed actions', async () => {
    const previousFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    try {
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const actions = {
        cover: 'The player covered the lens with a paper star; the screen continued showing the report.',
        note: 'The player wrote a note on Ash’s map; the screen kept its own report.',
        leave: 'The player left the lens and screen alone.',
        unplug: 'The player unplugged the printer; the screen stayed on.'
      };
      for (const name of ['Niko', 'Mira', 'Ash']) for (const action of Object.keys(actions)) {
        for (const complete of [true, false]) {
          const flags = { companion: name, ending: 'rescue', route_action: 'fix', reveal_pace_v2: 'yes',
            card_comparison_seen: 'yes', notice_comparison_seen: 'yes', card_preference: 'warm', notice_preference: 'direct',
            early_rescue_now: 'open_now', rescue_opened: 'yes', comparisons_revealed: 'yes',
            early_together_comparisons_seen: 'yes', early_together_citation_seen: 'yes', early_together_action: action,
            ...(complete ? { early_together_action_seen: action } : {}),
            ...(action === 'note' && complete ? { annotation_written: 'yes' } : {}) };
          storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: `close_${name.toLowerCase()}_input`,
            answer: '', privateAnswer: '', annotation: action === 'note' && complete ? 'A PRIVATE MAP NOTE' : '', relationship: name, flags, followupMemory: [] }));
          els.restart.click(); els.resume.click(); await flush();
          els.interaction.children.find(el => el.id === 'player-message').value = 'What happened to the reports?';
          els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
          const scene = requests.at(-1).scene;
          assert.ok(scene.includes('two reports cite each other; one falsely named Mira as its author.'));
          assert.equal(scene.includes(actions[action]), complete, `${name}: ${action} only after completion`);
          assert.ok(scene.includes(story.card_choice.choices.find(c => c.set.card_preference === 'warm').label));
          assert.ok(scene.includes(story.notice_choice.choices.find(c => c.set.notice_preference === 'direct').label));
          assert.ok(!scene.includes('A PRIVATE MAP NOTE'), 'the private note is not copied into model context');
          assert.ok(!scene.includes('one audit mark was repeated'), 'the earlier receipt audit was not witnessed');
        }
      }
      const incomplete = { companion: 'Niko', ending: 'rescue', early_rescue_now: 'open_now', early_together_citation_seen: 'yes',
        early_together_action: 'cover', early_together_action_seen: 'cover' };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags: incomplete, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What happened?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(!requests.at(-1).scene.includes('two reports cite each other'), 'older or incomplete saves do not invent the screen reveal');
    } finally {
      globalThis.fetch = previousFetch; els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear();
    }
  });

  await test('a populated early-rescue scene retains the screen action and the ending', async () => {
    const previousFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (_url, details) => {
      request = JSON.parse(JSON.parse(details.body).messages[1].content);
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    try {
      els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const saved = { version: 1, node: 'close_mira_input', answer: '', privateAnswer: '', relationship: 'Mira', knightName: '"'.repeat(40),
        flags: { companion: 'Mira', bond: 'play', knight_named: 'yes', named_card_seen: 'yes', topic: 'past', ending: 'rescue', evidence: 'voice',
          confirm_pressed: 'yes', confirm_result_seen: 'yes', mallow_response: 'voice', route_action: 'proof', vote_a: 'warm', vote_b: 'direct',
          card_comparison_seen: 'yes', notice_comparison_seen: 'yes', card_preference: 'warm', notice_preference: 'direct', reveal_pace_v2: 'yes',
          early_rescue_now: 'open_now', rescue_opened: 'yes', early_together_comparisons_seen: 'yes', comparisons_revealed: 'yes',
          early_together_citation_seen: 'yes', early_together_action: 'unplug', early_together_action_seen: 'unplug',
          rescue_coordination: 'count', rescue_coordination_seen: 'count' }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What happened?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(request.scene.includes('two reports cite each other; one falsely named Mira as its author.'));
      assert.ok(request.scene.includes('The player unplugged the printer; the screen stayed on.'));
      assert.ok(request.scene.includes('Mira has returned safely with the third ticket piece'));
      assert.ok(request.scene.includes('The player asked Mira to describe the room behind the door as evidence.'));
      assert.ok(request.scene.length <= 1800);
    } finally {
      globalThis.fetch = previousFetch; els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear();
    }
  });

  await test('compact audit context requires the matching witnessed markers', async () => {
    const previousFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    try {
      els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      const valid = { companion: 'Niko', ending: 'rescue', audit_seen: 'yes', audit_focus_due: 'yes', audit_focus_seen: 'tell', reveal_focus: 'tell', policy_goal_compact_seen: 'yes', audit_action: 'cover' };
      for (const [flags, expected] of [
        [valid, true],
        [{ ...valid, audit_focus_due: undefined }, false],
        [{ ...valid, policy_goal_compact_seen: undefined }, false],
        [{ ...valid, reveal_focus: 'listen' }, false],
        [{ ...valid, audit_seen: undefined }, false]
      ]) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice', answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        choiceAt('close_niko_talk_choice', 0); await flush();
        els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened at the audit?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const scene = requests.at(-1).scene;
        assert.equal(scene.includes('Ash: one audit mark was repeated; Mallow watched the counter.'), expected);
        assert.equal(scene.includes('The player covered the lens with a paper star.'), expected);
      }
    } finally {
      globalThis.fetch = previousFetch; els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear();
    }
  });

  await test('closing AI remembers the selected souvenir rescue, including follow-ups', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    const cases = [
      ['keep', 'use', 'The folded souvenir wedged the catch.'],
      ['tear', 'use', 'Torn souvenir pieces wedged the catch.'],
      ['keep', 'hold', 'The player kept the souvenir and held the catch by hand.'],
      ['tear', 'hold', 'The player kept the souvenir and held the catch by hand.'],
      [undefined, undefined, '']
    ];
    for (const name of ['Niko', 'Mira', 'Ash']) for (const [moment, action, expected] of cases) {
      const talkId = `close_${name.toLowerCase()}_talk_choice`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talkId,
        answer: '', privateAnswer: 'Earlier words.', relationship: name,
        flags: { companion: name, ending: 'mallow', ...(moment ? { moment } : {}), ...(action ? { card_action: action } : {}) },
        followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt(talkId, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened to the souvenir?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const check = () => {
        const scene = requests.at(-1).scene;
        for (const detail of cases.map(item => item[2]).filter(Boolean)) {
          assert.equal(scene.includes(detail), name !== 'Mira' && detail === expected, `${name}/${moment}/${action}: only witnessed detail`);
        }
      };
      check();
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And after that?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      check();
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('closing AI recalls only the witnessed Mallow tool use', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    const expected = { Niko: 'The player used the spring to hold the catch.',
      Mira: 'Niko told Mira that her sewing string moved the catch.',
      Ash: 'Ash wedged the catch open with the doorstop.' };
    for (const name of ['Niko', 'Mira', 'Ash']) for (const variant of ['witnessed', 'missing tool', 'missing use', 'different tool', 'different action']) {
      const flags = { companion: name, ending: 'mallow', moment: 'keep', route_action: 'fix',
        rescue_tool_shortcut_due: name, card_action: 'tool', mallow_tool_seen: name,
        ...(name === 'Mira' ? { mallow_tool_mira_told: 'yes' } : {}) };
      if (variant === 'missing tool') delete flags.rescue_tool_shortcut_due;
      if (variant === 'missing use') delete flags.mallow_tool_seen;
      if (variant === 'different tool') flags.mallow_tool_seen = name === 'Ash' ? 'Niko' : 'Ash';
      if (variant === 'different action') flags.card_action = 'hold';
      const talkId = `close_${name.toLowerCase()}_talk_choice`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talkId,
        answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt(talkId, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What helped open the door?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const scene = requests.at(-1).scene;
      assert.equal(scene.includes(expected[name]), variant === 'witnessed', `${name}/${variant}`);
      if (name === 'Mira') assert.ok(!scene.includes('The player used Mira’s sewing string to pull the catch.'));
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('closing AI remembers only the souvenir callback the companion witnessed', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) {
      const lower = name.toLowerCase(), mark = `${lower}_${bond}`;
      const beat = story[`souvenir_used_${mark}`];
      const expected = [...beat.text.matchAll(/“([^”]+)”/g)].map(match => match[1]).join(' ');
      const talkId = `close_${lower}_talk_choice`;
      const flags = { companion: name, ending: 'mallow', moment: 'tear', card_action: 'use',
        souvenir_wedge_seen: 'yes', midpoint_route: lower, bond, souvenir_callback_seen: mark };
      for (const [caseName, override] of [
        ['witnessed', {}], ['old checkpoint', { souvenir_callback_seen: undefined }],
        ['different companion marker', { souvenir_callback_seen: name === 'Niko' ? 'mira_care' : 'niko_care' }],
        ['different route', { midpoint_route: name === 'Niko' ? 'mira' : 'niko' }], ['did not wedge', { card_action: 'hold' }]
      ]) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talkId,
          answer: '', privateAnswer: 'Earlier words.', relationship: name, flags: { ...flags, ...override }, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        choiceAt(talkId, 0); await flush();
        els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What do you remember?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const check = () => {
          const event = requests.at(-1).story_event || '';
          assert.equal(event.includes(expected), caseName === 'witnessed', `${mark}: ${caseName}`);
          assert.ok(event.length <= 300);
          if (name === 'Mira') assert.ok(!event.includes('Torn souvenir'), 'Mira is not told which condition the paper was in');
        };
        check();
        if (caseName === 'witnessed') {
          els.interaction.children.find(el => el.textContent === 'Say more').click();
          els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And the paper?';
          els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
          check();
        }
      }
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('unplugged printer choices survive the ending, save and AI follow-ups', async () => {
    for (const [companionIndex, name] of ['Niko', 'Mira', 'Ash'].entries()) {
      for (const route of ['rescue', 'leave', 'reconnect', 'mallow']) {
        const requests = [];
        globalThis.fetch = async (_url, request) => {
          requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
          return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
        };
        storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
        els['settings-form'].submit(); els.start.click(); await flush();
        const talkId = `close_${name.toLowerCase()}_talk_choice`;
        const plan = { crew_choice: companionIndex, signal_choice: 1, audit_action_choice: 3,
          plan_choice: route === 'rescue' ? 0 : route === 'mallow' ? 2 : 1,
          record_unplug_choice: route === 'leave' ? 1 : 0,
          privateText: `A private word for ${name}.` };
        for (let i = 0; i < 260 && els['story-text'].textContent !== story[talkId].text; i++) await step(plan);
        assert.equal(els['story-text'].textContent, story[talkId].text, `${name}/${route} reaches the closing conversation`);
        els.save.click();
        const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
        assert.equal(saved.flags.audit_action, 'unplug');
        assert.equal(saved.flags.record_power, route === 'leave' ? 'left_unplugged' : route === 'reconnect' ? 'reconnected' : undefined);
        els.restart.click(); els.resume.click(); await flush();
        choiceAt(talkId, 0); await flush();
        els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened to the printer?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const check = (scene) => {
          assert.ok(scene.includes(name === 'Mira'
            ? 'The player said the printer was unplugged and the screen was still on.'
            : 'The player unplugged the printer; the screen stayed on.'));
          if (route === 'rescue' || route === 'leave') {
            assert.ok(scene.includes('the paper roll stayed intact'));
            assert.ok(!scene.includes('the machine ate the paper roll'));
            assert.equal(scene.includes('The player chose to keep the printer unplugged.'), route === 'leave');
          }
          if (route === 'reconnect' && name === 'Mira') {
            assert.ok(scene.includes('Ash said the team reconnected the printer.'));
            assert.ok(!scene.includes('The player reconnected the printer; Ash printed'));
          } else if (route === 'reconnect') assert.ok(scene.includes('The player reconnected the printer; Ash printed'));
          else assert.ok(!scene.includes('The player reconnected the printer; Ash printed'));
          assert.ok(scene.length <= 1800);
        };
        check(requests.at(-1).scene);
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And the paper?';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        check(requests.at(-1).scene);
        assert.ok(requests.at(-1).scene.endsWith('Reply to the latest message without repeating.'));
      }
    }
    // An incomplete or edited graph is not evidence that the printer branch
    // was actually witnessed. Keep the rescue fact, but don't invent what
    // happened to the roll in either direction.
    const priorNext = story.audit_unplug.next;
    try {
      for (const scenario of ['missing audit visit', 'broken unplug path']) {
        const requests = [];
        globalThis.fetch = async (_url, request) => {
          requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
          return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
        };
        story.audit_unplug.next = scenario === 'broken unplug path' ? 'policy_mallow_choice' : priorNext;
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
          answer: '', privateAnswer: 'Earlier words.', relationship: 'Niko',
          flags: { companion: 'Niko', ending: 'rescue', audit_action: 'unplug', ...(scenario === 'broken unplug path' ? { audit_seen: 'yes' } : {}) }, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush();
        choiceAt('close_niko_talk_choice', 0); await flush();
        els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const scene = requests.at(-1).scene;
        assert.ok(scene.includes('Mira returned with the third ticket piece.'));
        assert.ok(!scene.includes('The player unplugged the printer') && !scene.includes('paper roll stayed intact') && !scene.includes('machine ate the paper roll'));
      }
    } finally { story.audit_unplug.next = priorNext; }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('topic rescue and unplugged printer are grounded only after the action was witnessed', async () => {
    const summaries = {
      niko_past: 'Niko lifted the cleared edge while Mira braced the door.',
      niko_future: 'Niko called out, then Mira counted while you pulled.',
      mira_past: 'You called to Mira, who pushed as you lifted the release.',
      mira_future: 'Mira braced her shoulder and pushed when you called.',
      ash_past: 'Ash listened for the click and guided Niko to the catch.',
      ash_future: 'Ash used the map to show Niko the release.'
    };
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    for (const [index, name] of ['Niko', 'Mira', 'Ash'].entries()) for (const topic of ['past', 'future']) {
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const lower = name.toLowerCase(), mark = `${lower}_${topic}`, talkId = `close_${lower}_talk_choice`;
      const topicIndex = story[`${lower}_question`].choices.findIndex(choice => choice.set?.topic === topic);
      assert.notEqual(topicIndex, -1);
      const plan = { crew_choice: index, [`${lower}_question`]: topicIndex, [`${lower}_work_choice`]: 1,
        signal_choice: 1, audit_action_choice: 3, plan_choice: 0 };
      for (let i = 0; i < 260 && els['story-text'].textContent !== story[talkId].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[talkId].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.route_action, 'proof');
      assert.equal(saved.flags.rescue_topic_seen, mark);
      for (const older of [false, true]) {
        const checkpoint = structuredClone(saved);
        if (older) delete checkpoint.flags.rescue_topic_seen;
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
        els.restart.click(); els.resume.click(); await flush(); choiceAt(talkId, 0); await flush();
        els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened at the door?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const check = () => {
          const scene = requests.at(-1).scene;
          assert.ok(scene.includes('the paper roll stayed intact'), `${mark}: unplugged outcome retained`);
          for (const [id, summary] of Object.entries(summaries)) {
            assert.equal(scene.includes(summary), !older && id === mark, `${mark}: only witnessed rescue is included`);
          }
        };
        check();
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What happened next?';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        check();
      }
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('each witnessed tool goes straight into the rescue and older checkpoints retain their transition', async () => {
    for (const [index, name] of ['Niko', 'Mira', 'Ash'].entries()) {
      storageData.clear(); els['settings-clear'].click(); els.restart.click(); els.start.click(); await flush();
      const lower = name.toLowerCase();
      const plan = { crew_choice: index, [`${lower}_work_choice`]: 0, plan_choice: 0 };
      for (let i = 0; i < 260 && els['story-text'].textContent !== story.end_rescue.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.end_rescue.text);
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.rescue_tool_shortcut_due, name);
      els.restart.click(); els.resume.click(); await flush(); await step(plan);
      assert.equal(els['story-text'].textContent, story[`rescue_${lower}_fix`].text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`rescue_${lower}_fix`].text);
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.rescue_tool_seen, name);
      delete checkpoint.flags.rescue_tool_shortcut_due;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
      els.restart.click(); els.resume.click(); await flush(); await step(plan);
      assert.equal(els['story-text'].textContent, story.rescue_fix_companion.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.rescue_fix_companion.text);
      await step(plan);
      assert.equal(els['story-text'].textContent, story[`rescue_${lower}_fix`].text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('rescue tool use is recalled only after the matching scene was witnessed', async () => {
    const summaries = {
      Niko: 'The player used the spring under the catch while Niko guided them.',
      Mira: 'The player looped Mira’s sewing string under the latch and pulled the catch free.',
      Ash: 'Ash wedged the doorstop while the player held the release and pulled.'
    };
    const kit = 'Niko propped the stair door with the wrench; Ash bandaged his knuckles.';
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    for (const [index, name] of ['Niko', 'Mira', 'Ash'].entries()) {
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const lower = name.toLowerCase(), talk = `close_${lower}_talk_choice`;
      const plan = { crew_choice: index, [`${lower}_work_choice`]: 0, signal_choice: 1, audit_action_choice: 3, plan_choice: 0 };
      for (let i = 0; i < 260 && els['story-text'].textContent !== story[talk].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[talk].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.route_action, 'fix');
      assert.equal(saved.flags.rescue_tool_seen, name);
      assert.equal(saved.flags.rescue_opened, 'yes');
      if (name === 'Mira') assert.equal(saved.flags.rescue_tool_mira_told, 'yes');
      for (const scenario of ['witnessed', 'with kit', 'older save', 'different companion', 'no opened door', 'other ending', 'broken path', ...(name === 'Mira' ? ['old silent Mira scene', 'broken Mira call'] : [])]) {
        const checkpoint = structuredClone(saved);
        if (scenario === 'with kit') Object.assign(checkpoint.flags, { repairKit: 'free', kit_use_seen: 'yes' });
        if (scenario === 'older save') delete checkpoint.flags.rescue_tool_seen;
        if (scenario === 'different companion') checkpoint.flags.rescue_tool_seen = name === 'Niko' ? 'Ash' : 'Niko';
        if (scenario === 'no opened door') delete checkpoint.flags.rescue_opened;
        if (scenario === 'other ending') checkpoint.flags.ending = 'record';
        if (scenario === 'old silent Mira scene') delete checkpoint.flags.rescue_tool_mira_told;
        const beat = story[`rescue_${lower}_fix`];
        const previousNext = beat.next;
        const previousMiraMarker = beat.setOnVisit.rescue_tool_mira_told;
        if (scenario === 'broken path') beat.next = 'evidence_close';
        if (scenario === 'broken Mira call') delete beat.setOnVisit.rescue_tool_mira_told;
        try {
          storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
          els.restart.click(); els.resume.click(); await flush(); choiceAt(talk, 0); await flush();
          els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened at the door?';
          els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
          const check = () => {
            const event = requests.at(-1).story_event || '';
            for (const [other, summary] of Object.entries(summaries)) {
              assert.equal(event.includes(summary), other === name && ['witnessed', 'with kit'].includes(scenario), `${name}: ${scenario}`);
            }
            assert.equal(event.includes(kit), scenario === 'with kit');
            assert.ok(event.length <= 300);
          };
          check();
          if (scenario === 'with kit') {
            els.interaction.children.find(el => el.textContent === 'Say more').click();
            els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And then?';
            els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
            check();
          }
        } finally {
          beat.next = previousNext;
          if (previousMiraMarker !== undefined) beat.setOnVisit.rescue_tool_mira_told = previousMiraMarker;
        }
      }
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('Mallow can use only the previously witnessed companion tool', async () => {
    const labels = {
      Niko: 'Use the little spring to hold the catch.',
      Mira: 'Use Mira’s sewing string to pull the catch.',
      Ash: 'Use Ash’s doorstop to wedge the catch.'
    };
    const visible = () => els.interaction.children.map(el => el.textContent);
    for (const name of ['Niko', 'Mira', 'Ash']) for (const moment of ['keep', 'tear']) {
      const checkpoint = { version: 1, node: 'mallow_catch_choice', answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, ending: 'mallow', moment, route_action: 'fix', rescue_tool_shortcut_due: name }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
      els.restart.click(); els.resume.click(); await flush();
      assert.ok(visible().includes(labels[name]));
      assert.ok(visible().includes('Use the souvenir to wedge the catch.'));
      assert.ok(visible().includes('Keep the souvenir and hold the catch by hand.'));
      for (const other of Object.keys(labels).filter(other => other !== name)) assert.ok(!visible().includes(labels[other]));
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.ok(visible().includes(labels[name]), 'save/resume retains the tool choice');
      els.interaction.children.find(el => el.textContent === labels[name]).click(); await flush();
      assert.equal(els['story-text'].textContent, story[`mallow_catch_tool_${name.toLowerCase()}`].text);
      els.save.click();
      let saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.card_action, 'tool');
      assert.equal(saved.flags.mallow_tool_seen, name);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`mallow_catch_tool_${name.toLowerCase()}`].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.mallow_catch_complete.text);
      for (const change of [{ route_action: 'proof' }, { rescue_tool_shortcut_due: undefined },
        { rescue_tool_shortcut_due: name === 'Ash' ? 'Niko' : 'Ash' }, { companion: 'other' }]) {
        const invalid = structuredClone(checkpoint); Object.assign(invalid.flags, change);
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(invalid));
        els.restart.click(); els.resume.click(); await flush();
        for (const label of Object.values(labels)) assert.ok(!visible().includes(label), 'missing or mismatched witness does not offer a tool');
      }
    }
    storageData.clear(); els.restart.click();
  });

  await test('closing dialogue remembers the rescue coordination each companion witnessed', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    const count = 'Mira counted aloud and pushed while Niko held the release.';
    const outsideReach = 'Niko held Mira’s hand under the door; paper fingers unfolded beside them.';
    const miraReach = 'Niko held Mira’s hand under the door; she warned him another hand was not hers.';
    for (const [index, name] of ['Niko', 'Mira', 'Ash'].entries()) for (const [choice, selected] of ['count', 'reach'].entries()) {
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const lower = name.toLowerCase(), talk = `close_${lower}_talk_choice`;
      const plan = { crew_choice: index, [`${lower}_work_choice`]: 0, plan_choice: 0, rescue_coordination_choice: choice };
      for (let i = 0; i < 260 && els['story-text'].textContent !== story[talk].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[talk].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.rescue_coordination, selected);
      assert.equal(saved.flags.rescue_coordination_seen, selected);
      assert.equal(saved.flags.rescue_opened, 'yes');
      for (const scenario of ['witnessed', 'with kit', 'older save', 'mismatch', 'no opened door', 'other ending', 'broken path']) {
        const checkpoint = structuredClone(saved);
        if (scenario === 'with kit') Object.assign(checkpoint.flags, { repairKit: 'free', kit_use_seen: 'yes' });
        if (scenario === 'older save') delete checkpoint.flags.rescue_coordination_seen;
        if (scenario === 'mismatch') checkpoint.flags.rescue_coordination_seen = selected === 'count' ? 'reach' : 'count';
        if (scenario === 'no opened door') delete checkpoint.flags.rescue_opened;
        if (scenario === 'other ending') checkpoint.flags.ending = 'record';
        const beat = story[`rescue_coordination_${selected}`], originalNext = beat.next;
        if (scenario === 'broken path') beat.next = 'evidence_close';
        try {
          storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
          els.restart.click(); els.resume.click(); await flush(); choiceAt(talk, 0); await flush();
          els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened just before we pulled?';
          els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
          const check = () => {
            const event = requests.at(-1).story_event || '';
            const expected = selected === 'count' ? count : name === 'Mira' ? miraReach : outsideReach;
            const include = scenario === 'witnessed' || scenario === 'with kit';
            assert.equal(event.includes(expected), include, `${name}/${selected}/${scenario}`);
            if (name === 'Mira') assert.ok(!event.includes('paper fingers'), 'Mira cannot see the paper fingers from behind the door');
            if (include) {
              assert.ok(event.indexOf(expected) < event.indexOf(name === 'Niko' ? 'The player used the spring' : name === 'Mira' ? 'The player looped Mira’s sewing string' : 'Ash wedged the doorstop'), 'events follow story order');
            }
            assert.ok(event.length <= 300, 'coordination, tool and kit fit in the adapter limit');
          };
          check();
          if (scenario === 'with kit') {
            els.interaction.children.find(el => el.textContent === 'Say more').click();
            els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And then?';
            els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
            check();
          }
        } finally { beat.next = originalNext; }
      }
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('epilogue dialogue is grounded in the selected companion’s actual closing line', async () => {
    for (const [index, name] of ['Niko', 'Mira', 'Ash'].entries()) for (const topicIndex of [0, 1]) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const lower = name.toLowerCase(), talkId = `close_${lower}_talk_choice`;
      const topic = story[`${lower}_question`].choices[topicIndex].set.topic;
      const other = topic === 'past' ? 'future' : 'past';
      const plan = { crew_choice: index, plan_choice: 0, signal_choice: 1,
        [`${lower}_question`]: topicIndex, privateText: `Private words for ${name}.` };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story[talkId].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[talkId].text);
      assert.equal(requests.length, 2);
      assert.ok(!JSON.stringify(requests[1]).includes(plan.privateText), 'Mallow does not receive the private words');
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.audit_seen, 'yes', 'the visited audit is saved');
      els.restart.click(); els.resume.click(); await flush();
      choiceAt(talkId, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'Tell me more about what you just said.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const selected = story[`close_${lower}_${topic}`].text;
      const unselected = story[`close_${lower}_${other}`].text;
      assert.ok(requests.at(-1).scene.includes(selected), `${name}: selected closing line is available`);
      assert.ok(!requests.at(-1).scene.includes(unselected), `${name}: unselected closing line stays out`);
      const audit = name === 'Mira'
        ? 'Ash called the audit one mark wearing three badges; Mira said the reports had not opened the door.'
        : 'Ash: one audit mark was repeated; Mallow watched the counter.';
      assert.ok(requests.at(-1).scene.includes(audit));
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What do you think next?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.ok(requests.at(-1).scene.includes(selected), `${name}: follow-up retains the line`);
      assert.ok(!requests.at(-1).scene.includes(unselected));
      assert.ok(requests.at(-1).scene.includes(audit));
    }
  });

  await test('audit context distinguishes the focused Mira branches from older checkpoints', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const focus of ['tell', 'listen', null]) {
      const talkId = `close_${name.toLowerCase()}_talk_choice`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talkId,
        answer: 'A shared thought.', privateAnswer: '', relationship: name,
        flags: { companion: name, bond: 'care', topic: 'past', ending: 'rescue',
          audit_seen: 'yes', audit_action: 'cover', ...(focus ? { reveal_focus: focus } : {}) }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[talkId].text);
      choiceAt(talkId, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened at the audit?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const scene = requests.at(-1).scene;
      if (name === 'Mira') {
        assert.ok(scene.includes('Mira said the reports had not opened the door.'));
        assert.ok(!scene.includes('Mallow watched the counter.') && !scene.includes('Mallow took part in the audit.'));
      } else {
        assert.equal(scene.includes('Mallow watched the counter.'), Boolean(focus));
        assert.equal(scene.includes('Mallow took part in the audit.'), !focus);
      }
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And Mallow?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.at(-1).scene.includes('Mallow watched the counter.'), name !== 'Mira' && Boolean(focus));
    }
  });

  await test('epilogue context retains the selected Mallow response and all route facts within the adapter limit', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    const outcomes = {
      rescue: 'The player and Niko opened Mira’s door immediately.',
      record: 'Ash printed the machine’s false count and the correction before Mira’s door opened.',
      mallow: 'Mallow chose to help, pointed out a hidden catch, and its screen went dark.',
      retreat: 'The player pulled the team back as the floor shifted.'
    };
    const observations = {
      receipt: 'The player kept the false receipt as evidence.',
      tickets: 'The player showed the machine the two ticket pieces as evidence.',
      voice: 'The player asked Mira to describe the room behind the door as evidence.'
    };
    const miraObservations = {
      receipt: 'Ash said they would hold the false receipt.',
      tickets: 'Niko said there were still two ticket pieces.',
      voice: observations.voice
    };
    const rescueSummaries = {
      niko_past: 'Niko lifted the cleared edge while Mira braced the door.',
      niko_future: 'Niko called out, then Mira counted while you pulled.',
      mira_past: 'You called to Mira, who pushed as you lifted the release.',
      mira_future: 'Mira braced her shoulder and pushed when you called.',
      ash_past: 'Ash listened for the click and guided Niko to the catch.',
      ash_future: 'Ash used the map to show Niko the release.'
    };
    const auditActions = {
      cover: 'The player covered the lens with a paper star.',
      annotate: 'The player wrote on the receipt; the screen’s original claim stayed unchanged.',
      leave: 'The player left the lens and receipt alone.',
      unplug: 'The player unplugged the printer; the screen stayed on.'
    };
    const miraHeardActions = {
      annotate: 'Ash said the writing had not opened the door.',
      leave: 'Niko said to leave the slip and lens alone.',
      unplug: 'The player said the printer was unplugged and the screen was still on.'
    };
    let cases = 0;
    for (const name of ['Niko', 'Mira', 'Ash']) for (const ending of Object.keys(outcomes)) {
      if (name === 'Mira' && ending === 'retreat') continue;
      for (const evidence of Object.keys(observations)) for (const bond of ['care', 'play'])
        for (const topic of ['past', 'future']) for (const mallowResponse of ['voice', 'search']) for (const routeAction of ['fix', 'proof'])
        for (const recordResponse of ending === 'record' ? ['apology', 'ask'] : [undefined])
        for (const cardPreference of ['direct', 'warm', 'skip']) for (const noticePreference of ['direct', 'warm', 'skip'])
        for (const auditAction of Object.keys(auditActions))
        for (const mallowCamera of ending === 'mallow' && auditAction === 'cover' ? ['lift', 'covered'] : [undefined])
        for (const doorEffort of [undefined, 'brace', 'listen']) {
          const lower = name.toLowerCase(), talkId = `close_${lower}_talk_choice`;
          const choice = story.policy_mallow_choice.choices.find(item => item.set.mallow_response === mallowResponse);
          const other = story.policy_mallow_choice.choices.find(item => item.set.mallow_response !== mallowResponse);
          const workChoice = story[`${lower}_work_choice`].choices.find(item => item.set.route_action === routeAction);
          const otherWork = story[`${lower}_work_choice`].choices.find(item => item.set.route_action !== routeAction);
          const expectedWork = {
            'Niko/fix': 'Together the player and Niko ease out a small brass spring. Niko turns it over in the player\'s palm. “Don’t lose that. It might fit another latch.”',
            'Niko/proof': story.niko_work_proof.text,
            'Mira/fix': story.mira_work_fix.text,
            'Mira/proof': 'The player copies COMPLETED onto a scrap and draws the loose ear beside it. Mira adds a furious little face. “For accuracy,” she says.',
            'Ash/fix': story.ash_work_fix.text,
            'Ash/proof': 'The player traces both arrows exactly as they are. Ash folds the copy separately from the original. Neither the player nor Ash smooths the other arrow away.'
          }[`${name}/${routeAction}`];
          const bondChoice = story[`${lower}_bond_choice`].choices.find(item => item.set.bond === bond);
          const cardChoice = story.card_choice.choices.find(item => item.set.card_preference === cardPreference);
          const noticeChoice = story.notice_choice.choices.find(item => item.set.notice_preference === noticePreference);
          storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talkId,
            answer: 'A shared thought.', privateAnswer: `Private words for ${name}.`, annotation: auditAction === 'annotate' ? 'PRIVATE TEST NOTE' : '', relationship: name,
            flags: { companion: name, bond, topic, ending, evidence, mallow_response: mallowResponse, route_action: routeAction, record_response: recordResponse, ...(ending === 'record' ? { record_followup: recordResponse === 'apology' ? 'explain' : 'decide' } : {}), vote_a: 'warm', vote_b: 'direct', card_preference: cardPreference, notice_preference: noticePreference, audit_seen: 'yes', audit_action: auditAction, ...(auditAction === 'annotate' ? { annotation_written: 'yes', audit_seal_seen: 'yes' } : {}), mallow_camera: mallowCamera, door_effort: doorEffort, ...(name === 'Niko' ? { niko_note_seen: 'yes', niko_note_due: 'yes' } : {}), ...(ending === 'rescue' && routeAction === 'proof' ? { rescue_topic_seen: `${lower}_${topic}` } : {}), ...(ending === 'mallow' ? { moment: 'tear', card_action: 'hold' } : {}), ...(auditAction === 'unplug' && ending === 'record' ? { record_power: 'reconnected' } : {}) }, followupMemory: [] }));
          els.restart.click(); els.resume.click(); await flush();
          assert.equal(els['story-text'].textContent, story[talkId].text);
          choiceAt(talkId, 0); await flush();
          els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What do you think about Mallow?';
          els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
          let scene = requests.at(-1).scene;
          assert.equal(scene.includes('The screen cited the annotation as verification.'), auditAction === 'annotate' && name !== 'Mira', 'only witnesses receive the seal event');
          assert.ok(!JSON.stringify(requests.at(-1)).includes('PRIVATE TEST NOTE'), 'the note remains outside model context');
          const expectedSetup = {
            Niko: 'Niko offers the player the empty IMPORTANT lid and waits to see what the player will do with it.',
            Mira: 'A half-finished plush waits beside Mira’s sketchbook. She offers the player the loose ear and a pencil.',
            Ash: "Ash leaves a little space on the map for the player's contribution."
          }[name] + (name === 'Niko' ? ' A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.' : '');
          assert.equal(requests.at(-1).activity_setup, expectedSetup, 'the chosen companion has the witnessed activity setup');
          assert.ok(scene.includes(choice.label), `${name}/${ending}: selected Mallow choice`);
          assert.ok(scene.includes(story[choice.next].text), `${name}/${ending}: selected Mallow reply`);
          assert.ok(!scene.includes(other.label) && !scene.includes(story[other.next].text), 'unselected Mallow choice and reply stay out');
          assert.ok(scene.includes(workChoice.label) && scene.includes(expectedWork), `${name}/${routeAction}: selected work choice`);
          assert.ok(!scene.includes(otherWork.label) && !scene.includes(story[otherWork.next].text), 'unselected work choice stays out');
          assert.deepEqual(requests.at(-1).activity_exchange, { player_action: bondChoice.label, character_reply: story[bondChoice.next].text }, 'selected activity survives in its own field');
          const unchosenBond = story[`${lower}_bond_choice`].choices.find(item => item.set.bond !== bond);
          assert.ok(!JSON.stringify(requests.at(-1).activity_exchange).includes(unchosenBond.label), 'the unchosen activity stays out');
          assert.ok(scene.includes(story[`close_${lower}_${topic}`].text), 'selected companion closing line survives');
          if (ending === 'mallow' && name === 'Mira') {
            assert.ok(scene.includes('Mallow chose to help. Mira returned safely with the third piece; Mallow’s screen went dark.'));
            assert.ok(!scene.includes('The lens stayed covered; Mallow listened') && !scene.includes('The player lifted the star; Mallow helped'));
            assert.ok(!scene.includes('pointed out a hidden catch') && !scene.includes('The player kept the souvenir and held the catch by hand.'));
          } else if (mallowCamera === 'covered') {
            assert.ok(scene.includes('The lens stayed covered; Mallow listened while the player and Niko felt for the catch.'));
            assert.ok(!scene.includes('The player lifted the star') && !scene.includes(outcomes.mallow));
          } else if (mallowCamera === 'lift') {
            assert.ok(scene.includes('The player lifted the star; Mallow helped find the catch.'));
            assert.ok(!scene.includes('The lens stayed covered') && !scene.includes(outcomes.mallow));
          } else if (auditAction === 'unplug' && ending === 'rescue') {
            assert.ok(scene.includes('the paper roll stayed intact') && !scene.includes('the machine ate the paper roll'));
          } else if (ending === 'record' && name === 'Mira') {
            assert.ok(scene.includes('Mira heard the printer before the latch; she returned with the third ticket piece.'));
            assert.equal(scene.includes('Ash said the team reconnected the printer.'), auditAction === 'unplug');
            assert.ok(!scene.includes('The player reconnected the printer; Ash printed'));
            assert.ok(!scene.includes(outcomes.record));
          } else if (auditAction === 'unplug' && ending === 'record') {
            assert.ok(scene.includes('The player reconnected the printer; Ash printed'));
          } else assert.ok(scene.includes(outcomes[ending]), 'chosen ending survives');
          assert.ok(scene.includes(name === 'Mira' ? miraObservations[evidence] : observations[evidence]), 'chosen evidence survives as witnessed');
          if (name === 'Mira' && evidence !== 'voice') assert.ok(!scene.includes(observations[evidence]), 'Mira cannot see the outside action');
          if (ending === 'rescue' && routeAction === 'proof') assert.ok(scene.includes(rescueSummaries[`${lower}_${topic}`]), 'witnessed rescue survives');
          assert.ok(scene.includes('Earlier the player selected'), 'the selected comparisons are attributed to the earlier scene');
          assert.ok(scene.includes(cardChoice.label) && scene.includes(noticeChoice.label), 'context includes both selected comparisons');
          const auditSummary = name === 'Mira'
            ? 'Ash called the audit one mark wearing three badges; Mira said the reports had not opened the door.'
            : 'Ash: one audit mark was repeated; Mallow took part in the audit.';
          assert.ok(scene.includes(auditSummary), 'the witnessed or heard audit is included');
          if (name === 'Mira') assert.ok(!scene.includes('Mallow took part in the audit.'), 'Mira cannot see Mallow silently watching the counter');
          for (const [action, summary] of Object.entries(auditActions)) {
            assert.equal(scene.includes(summary), name !== 'Mira' && action === auditAction, 'only witnessed physical actions are included');
          }
          for (const [action, summary] of Object.entries(miraHeardActions)) {
            assert.equal(scene.includes(summary), name === 'Mira' && action === auditAction, 'Mira receives only the audible account of the selected action');
          }
          for (const unchosen of [...story.card_choice.choices.filter(item => item !== cardChoice), ...story.notice_choice.choices.filter(item => item !== noticeChoice)]) {
            assert.ok(!scene.includes(unchosen.label), 'unchosen comparison does not enter companion context');
          }
          assert.ok(!scene.includes(`Private words for ${name}.`), 'player-authored private words are not inserted into the scene');
          for (const recordChoice of story.record_close_mira.choices) {
            const selected = recordChoice.set.record_response === recordResponse && ending === 'record';
            assert.equal(scene.includes(recordChoice.label), selected, 'only the selected record response is present');
            assert.equal(scene.includes(story[recordChoice.next].text), selected, 'only Mira’s selected reply is present');
          }
          if (ending === 'record') {
            const selectedAction = recordResponse === 'apology' ? 'Ash said they printed first; Mira folded the correction outward.' : 'Mira circled the correction and marked the map.';
            const otherAction = recordResponse === 'apology' ? 'Mira circled the correction and marked the map.' : 'Ash said they printed first; Mira folded the correction outward.';
            assert.equal(requests.at(-1).story_event, selectedAction, 'witnessed record action enters context');
            assert.ok(!requests.at(-1).story_event.includes(otherAction), 'the alternative action stays out');
          }
          assert.ok(scene.length <= 1800);
          els.interaction.children.find(el => el.textContent === 'Say more').click();
          els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And what happened after that?';
          els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
          scene = requests.at(-1).scene;
          assert.equal(requests.at(-1).activity_setup, expectedSetup, 'the setup persists into follow-ups');
          assert.ok(scene.includes(choice.label) && scene.includes(story[choice.next].text));
          assert.ok(scene.includes(workChoice.label) && scene.includes(expectedWork));
          assert.deepEqual(requests.at(-1).activity_exchange, { player_action: bondChoice.label, character_reply: story[bondChoice.next].text }, 'follow-ups retain the selected activity');
          if (ending === 'mallow' && name === 'Mira') {
            assert.ok(scene.includes('Mallow chose to help. Mira returned safely with the third piece; Mallow’s screen went dark.'));
            assert.ok(!scene.includes('The lens stayed covered; Mallow listened') && !scene.includes('The player lifted the star; Mallow helped'));
            assert.ok(!scene.includes('pointed out a hidden catch') && !scene.includes('The player kept the souvenir and held the catch by hand.'));
          } else if (mallowCamera === 'covered') assert.ok(scene.includes('The lens stayed covered; Mallow listened'));
          else if (mallowCamera === 'lift') assert.ok(scene.includes('The player lifted the star; Mallow helped'));
          else if (auditAction === 'unplug' && ending === 'rescue') assert.ok(scene.includes('the paper roll stayed intact'));
          else if (ending === 'record' && name === 'Mira') {
            assert.ok(scene.includes('Mira heard the printer before the latch; she returned with the third ticket piece.'));
            assert.equal(scene.includes('Ash said the team reconnected the printer.'), auditAction === 'unplug');
            assert.ok(!scene.includes('The player reconnected the printer; Ash printed') && !scene.includes(outcomes.record));
          }
          else if (auditAction === 'unplug' && ending === 'record') assert.ok(scene.includes('The player reconnected the printer; Ash printed'));
          else assert.ok(scene.includes(outcomes[ending]));
          if (ending === 'mallow' && name !== 'Mira') assert.ok(scene.includes('The player kept the souvenir and held the catch by hand.'), 'the witnessed souvenir action survives in follow-ups');
          assert.ok(scene.includes(name === 'Mira' ? miraObservations[evidence] : observations[evidence]));
          if (name === 'Mira' && evidence !== 'voice') assert.ok(!scene.includes(observations[evidence]), 'follow-up does not attribute the unseen outside action');
          if (ending === 'rescue' && routeAction === 'proof') assert.ok(scene.includes(rescueSummaries[`${lower}_${topic}`]), 'witnessed rescue survives follow-ups');
          assert.ok(scene.includes(cardChoice.label) && scene.includes(noticeChoice.label), 'follow-ups retain selected comparisons');
          assert.ok(scene.includes(auditSummary), 'follow-ups retain the witnessed or heard audit');
          for (const [action, summary] of Object.entries(auditActions)) {
            assert.equal(scene.includes(summary), name !== 'Mira' && action === auditAction, 'follow-ups retain only witnessed physical actions');
          }
          for (const [action, summary] of Object.entries(miraHeardActions)) {
            assert.equal(scene.includes(summary), name === 'Mira' && action === auditAction, 'follow-ups retain only Mira’s audible action');
          }
          for (const recordChoice of story.record_close_mira.choices) {
            const selected = recordChoice.set.record_response === recordResponse && ending === 'record';
            assert.equal(scene.includes(recordChoice.label), selected, 'follow-up retains only the selected record response');
            assert.equal(scene.includes(story[recordChoice.next].text), selected, 'follow-up retains only Mira’s selected reply');
          }
          if (ending === 'record') assert.equal(requests.at(-1).story_event, recordResponse === 'apology' ? 'Ash said they printed first; Mira folded the correction outward.' : 'Mira circled the correction and marked the map.', 'follow-up retains the witnessed record action');
          else assert.equal(requests.at(-1).story_event, undefined, 'other endings do not invent the action');
          assert.ok(scene.endsWith('Reply to the latest message without repeating.'), `no context is truncated by the adapter: ${JSON.stringify({name, ending, evidence, bond, topic, mallowResponse, routeAction, recordResponse, cardPreference, noticePreference, auditAction, mallowCamera, doorEffort, length: scene.length, tail: scene.slice(-110)})}`);
          assert.ok(scene.length <= 1800);
          cases++;
        }
    }
    assert.equal(cases, 76464, 'all reachable companion, ending, evidence, bond, topic, Mallow-choice, work-choice, record-response, wording-comparison, audit/camera and door-effort combinations');
  });

  await test('closing AI context distinguishes a confirm attempt from approval and respects who could see it', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const witnessed of [true, false]) {
      const talkId = `close_${name.toLowerCase()}_talk_choice`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talkId, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, ending: 'rescue', evidence: 'receipt', confirm_pressed: 'yes', ...(witnessed ? { confirm_result_seen: 'yes' } : {}) }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt(talkId, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      let scene = requests.at(-1).scene;
      const expected = name === 'Mira' ? 'The player said CONFIRM did not open the door.' : 'The player tried CONFIRM on the door; it stayed shut.';
      assert.equal(scene.includes(expected), witnessed);
      if (name === 'Mira') assert.ok(!scene.includes('screen treated the press as proof'));
      else if (witnessed) assert.ok(scene.includes('not as a door attempt.'));
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And then?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      scene = requests.at(-1).scene;
      assert.equal(scene.includes(expected), witnessed);
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('an older Mira checkpoint with no evidence choice does not invent a heard account', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_mira_talk_choice',
      answer: '', privateAnswer: 'Earlier private words.', relationship: 'Mira',
      flags: { companion: 'Mira', ending: 'rescue', bond: 'care', topic: 'past' }, followupMemory: [] }));
    els.restart.click(); els.resume.click(); await flush();
    choiceAt('close_mira_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What do you remember?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    for (const fact of ['Ash said they would hold the false receipt.', 'Niko said there were still two ticket pieces.',
      'The player asked Mira to describe the room behind the door as evidence.']) assert.ok(!requests.at(-1).scene.includes(fact));
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('longer authored activity remains complete without displacing closing scene context', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    const choice = story.mira_bond_choice.choices.find(item => item.set.bond === 'care');
    const reply = story[choice.next];
    const oldLabel = choice.label, oldReply = reply.text;
    const checkpoint = { version: 1, node: 'close_mira_talk_choice', answer: 'A shared thought.',
      privateAnswer: 'Earlier private words.', relationship: 'Mira',
      flags: { companion: 'Mira', bond: 'care', topic: 'future', ending: 'record', evidence: 'receipt',
        mallow_response: 'search', route_action: 'fix', record_response: 'apology', record_followup: 'explain',
        vote_a: 'warm', vote_b: 'direct', card_preference: 'warm', notice_preference: 'warm',
        audit_seen: 'yes', audit_action: 'annotate', door_effort: 'listen' }, followupMemory: [] };
    async function sendFromCheckpoint() {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('close_mira_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What do you remember?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      return requests.at(-1);
    }
    try {
      const original = await sendFromCheckpoint();
      choice.label = 'A'.repeat(300);
      reply.text = 'R'.repeat(700);
      const expanded = await sendFromCheckpoint();
      assert.equal(expanded.scene, original.scene, 'the longer activity cannot displace ending context');
      assert.deepEqual(expanded.activity_exchange, { player_action: choice.label, character_reply: reply.text });
      assert.ok(expanded.scene.includes('Mira heard the printer before the latch'));
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And after that?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.ok(requests.at(-1).scene.endsWith('Reply to the latest message without repeating.'));
      assert.deepEqual(requests.at(-1).activity_exchange, { player_action: choice.label, character_reply: reply.text });
    } finally {
      choice.label = oldLabel; reply.text = oldReply;
      storageData.clear(); els.restart.click(); els['settings-clear'].click();
    }
  });

  await test('closing conversations remember only the witnessed door effort, including after resume', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els['settings-open'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    const summaries = {
      brace: 'The player and Niko lifted the door; the paper hand was not Mira’s.',
      listen: 'The player asked Mira what she felt; she described a catch near the counter.'
    };
    const miraBrace = 'Mira said “That isn’t mine” from behind the door.';
    for (const name of ['Niko', 'Mira', 'Ash']) for (const effort of ['', 'brace', 'listen']) {
      const node = `close_${name.toLowerCase()}_talk_choice`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node,
        answer: '', privateAnswer: 'Earlier private words.', relationship: name,
        flags: { companion: name, ending: 'rescue', ...(effort ? { door_effort: effort } : {}) }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt(node, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened at the door?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      for (const [action, summary] of Object.entries(summaries))
        assert.equal(requests.at(-1).scene.includes(summary), action === effort && !(name === 'Mira' && action === 'brace'), `${name}/${effort || 'legacy'}`);
      assert.equal(requests.at(-1).scene.includes(miraBrace), name === 'Mira' && effort === 'brace', `${name}/${effort || 'legacy'} audible detail`);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And then?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      for (const [action, summary] of Object.entries(summaries))
        assert.equal(requests.at(-1).scene.includes(summary), action === effort && !(name === 'Mira' && action === 'brace'), 'follow-up keeps only witnessed details');
      assert.equal(requests.at(-1).scene.includes(miraBrace), name === 'Mira' && effort === 'brace', 'follow-up keeps Mira’s own statement');
    }
    for (const name of ['Niko', 'Mira', 'Ash']) for (const effort of ['brace', 'listen']) {
      const node = `close_${name.toLowerCase()}_talk_choice`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node,
        answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, ending: 'rescue', door_effort: effort, early_door_done: 'yes' }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt(node, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened at the door?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      for (const [action, summary] of Object.entries(summaries))
        assert.equal(requests.at(-1).scene.includes(summary), action === effort && !(name === 'Mira' && action === 'brace'), `${name}/${effort} early route`);
      assert.equal(requests.at(-1).scene.includes(miraBrace), name === 'Mira' && effort === 'brace', `${name}/${effort} early route audible detail`);
    }
    const earlyNext = story.early_door_brace.next;
    try {
      story.early_door_brace.next = 'elsewhere';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
        answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', ending: 'rescue', door_effort: 'brace', early_door_done: 'yes' }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(!requests.at(-1).scene.includes(summaries.brace), 'a disconnected early choice cannot fall back to the legacy path');
    } finally { story.early_door_brace.next = earlyNext; }
    const previous = story.moment_return_react.next;
    try {
      story.moment_return_react.next = 'reason_reveal_check';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
        answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', ending: 'rescue', door_effort: 'brace' }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(!requests.at(-1).scene.includes(summaries.brace), 'a disconnected choice cannot be invented');
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
        answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', ending: 'rescue', door_effort: 'brace', moment: 'keep', compact_moment_seen: 'yes' }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(requests.at(-1).scene.includes(summaries.brace), 'the witnessed compact path retains the chosen action');
    } finally { story.moment_return_react.next = previous; }
  });

  await test('closing companion remembers only the witnessed field-repair kit and retains the other selected event', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    const kitDetail = 'Niko propped the stair door with the wrench; Ash bandaged his knuckles.';
    const signalDetail = 'The player tried two taps, a pause, then one; a knock sounded below before their last tap.';
    for (const name of ['Niko', 'Mira', 'Ash']) for (const kit of ['free', 'paid', 'legacy', 'missing']) {
      const flags = { companion: name, ending: 'record', evidence: 'receipt', record_response: 'apology', record_followup: 'explain' };
      if (kit !== 'missing') flags.repairKit = kit === 'paid' ? 'paid' : 'free';
      if (kit !== 'legacy') flags.kit_use_seen = 'yes';
      const talk = `close_${name.toLowerCase()}_talk_choice`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talk, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt(talk, 0); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What happened at the stairs?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const check = () => {
        const event = requests.at(-1).story_event || '';
        assert.ok(event.includes('Ash said they printed first; Mira folded the correction outward.'));
        assert.equal(event.includes(kitDetail), ['free', 'paid'].includes(kit), `${name}/${kit}`);
        assert.ok(event.length <= 200);
      };
      check();
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And afterward?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush(); check();
    }
    for (const name of ['Niko', 'Ash']) {
      const talk = name === 'Niko' ? 'close_niko_talk_choice' : 'close_ash_retreat_talk_choice';
      const flags = { companion: name, ending: 'retreat', repairKit: 'free', kit_use_seen: 'yes',
        retreat_probe_due: 'yes', retreat_probe: 'change', retreat_probe_seen: 'change' };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talk, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt(talk, 0); await flush();
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests.at(-1).story_event, `${signalDetail} ${kitDetail}`);
      assert.ok(requests.at(-1).story_event.length <= 200);
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('retreat epilogue remembers only the witnessed signal experiment', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Ash']) for (const mode of ['repeat', 'change']) for (const state of ['witnessed', 'legacy', 'mismatch']) {
      const talk = name === 'Niko' ? 'close_niko_talk_choice' : 'close_ash_retreat_talk_choice';
      const flags = { companion: name, ending: 'retreat', retreat_probe_due: 'yes', retreat_probe: mode };
      if (state === 'witnessed') flags.retreat_probe_seen = mode;
      if (state === 'mismatch') flags.retreat_probe_seen = mode === 'repeat' ? 'change' : 'repeat';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talk, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt(talk, 0); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What did we hear?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const expected = mode === 'repeat'
        ? 'The player repeated one tap, a pause, then two; the floor returned the same pattern.'
        : 'The player tried two taps, a pause, then one; a knock sounded below before their last tap.';
      assert.equal(requests.at(-1).story_event || '', state === 'witnessed' ? expected : '', `${name}/${mode}/${state}`);
      assert.ok(!JSON.stringify(requests.at(-1)).includes('Mira made the sound'));
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Could it have been an echo?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.at(-1).story_event || '', state === 'witnessed' ? expected : '');
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('retreat epilogue carries only the witnessed early search alongside the signal and kit', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'We are still looking.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    const signal = 'The player tried two taps, a pause, then one; a knock sounded below before their last tap.';
    const kit = 'Niko propped the stair door with the wrench; Ash bandaged his knuckles.';
    const summaries = {
      stair: 'The player pressed the first stair; its edge dipped and exposed a loose bracket.',
      sound: 'The player and Ash heard a knock under the fort; Ash marked it with a question mark.'
    };
    try {
      for (const name of ['Niko', 'Ash']) for (const action of ['stair', 'sound']) for (const state of ['witnessed', 'legacy', 'mismatch', 'not-early', 'broken-graph']) {
        const talk = name === 'Niko' ? 'close_niko_talk_choice' : 'close_ash_retreat_talk_choice';
        const flags = { companion: name, ending: 'retreat', retreat_probe_due: 'yes', retreat_probe: 'change', retreat_probe_seen: 'change',
          repairKit: 'free', kit_use_seen: 'yes', retreat_search: action, retreat_search_early: 'yes' };
        if (state !== 'legacy') flags.retreat_search_seen = state === 'mismatch' ? (action === 'stair' ? 'sound' : 'stair') : action;
        if (state === 'not-early') delete flags.retreat_search_early;
        const beat = story[`retreat_early_search_${action}`];
        const originalNext = beat.next;
        if (state === 'broken-graph') beat.next = 'opening';
        try {
          storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talk, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] }));
          els.restart.click(); els.resume.click(); await flush(); choiceAt(talk, 0); await flush();
          els.interaction.children.find(el => el.id === 'player-message').value = 'Where did we search?';
          els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
          const check = () => {
            const event = requests.at(-1).story_event || '';
            const expected = [signal, state === 'witnessed' ? summaries[action] : '', kit].filter(Boolean).join(' ');
            assert.equal(event, expected, `${name}/${action}/${state}`);
            assert.ok(event.length <= 300);
            assert.ok(!event.includes(summaries[action === 'stair' ? 'sound' : 'stair']));
            assert.ok(!event.includes('Mira made the sound'));
          };
          check();
          els.interaction.children.find(el => el.textContent === 'Say more').click();
          els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What else happened?';
          els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush(); check();
        } finally { beat.next = originalNext; }
      }
      for (const [name, ending] of [['Mira', 'retreat'], ['Niko', 'rescue']]) {
        const talk = `close_${name.toLowerCase()}_talk_choice`;
        const flags = { companion: name, ending, retreat_search: 'sound', retreat_search_seen: 'sound', retreat_search_early: 'yes' };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talk, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush(); choiceAt(talk, 0); await flush();
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        assert.ok(!JSON.stringify(requests.at(-1)).includes(summaries.sound), `${name}/${ending} cannot acquire an unwitnessed search`);
      }
    } finally { els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click(); }
  });

  await test('closing AI remembers a stair waymark only if its later use was witnessed', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'We are still looking.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    try {
      for (const name of ['Niko', 'Ash']) for (const mark of ['rail', 'sign']) for (const state of ['witnessed', 'no-use', 'mismatch']) {
        const talk = name === 'Niko' ? 'close_niko_talk_choice' : 'close_ash_retreat_talk_choice';
        const flags = { companion: name, ending: 'retreat', basement_route: 'stairs', stair_waymark: mark, stair_waymark_seen: mark,
          retreat_probe_due: 'yes', retreat_probe: 'change', retreat_probe_seen: 'change', repairKit: 'free', kit_use_seen: 'yes',
          retreat_search: 'stair', retreat_search_early: 'yes', retreat_search_seen: 'stair' };
        if (state !== 'no-use') flags.stair_search_waymark_seen = state === 'mismatch' ? (mark === 'rail' ? 'sign' : 'rail') : mark;
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: talk, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush(); choiceAt(talk, 0); await flush();
        els.interaction.children.find(el => el.id === 'player-message').value = 'How did we find the bracket?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const event = requests.at(-1).story_event || '';
        assert.ok(event.length <= 300);
        if (state === 'witnessed') assert.match(event, mark === 'rail' ? /notch rubbing.*press.*bracket/i : /EXIT sign.*step.*bracket/i);
        else {
          assert.match(event, /pressed the first stair.*loose bracket/i);
          assert.doesNotMatch(event, /notch rubbing|EXIT sign/i);
        }
      }
    } finally { els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click(); }
  });

  await test('Mallow’s shorter lens choice only enters closing AI context when witnessed', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    try {
      for (const response of ['voice', 'search']) for (const camera of ['lift', 'covered']) for (const witnessed of [true, false]) {
        const flags = { companion: 'Niko', bond: 'care', topic: 'past', ending: 'mallow', evidence: 'receipt',
          audit_seen: 'yes', audit_action: 'cover', mallow_compact_due: 'yes', mallow_response: response,
          mallow_response_seen: response, mallow_compact_seen: response, mallow_promise_heard: response,
          mallow_camera: camera, ...(witnessed ? { mallow_camera_offer_seen: 'yes' } : {}) };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
          answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] }));
        els.restart.click(); els.resume.click(); await flush(); choiceAt('close_niko_talk_choice', 0); await flush();
        els.interaction.children.find(el => el.id === 'player-message').value = 'How did we find the catch?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const scene = requests.at(-1).scene;
        const selected = camera === 'covered' ? 'The lens stayed covered; Mallow listened' : 'The player lifted the star; Mallow helped';
        assert.equal(scene.includes(selected), witnessed, 'only the witnessed lens offer can be recalled');
      }
    } finally { els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click(); }
  });

  await test('legacy and inconsistent audit checkpoints cannot invent an action or camera choice', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const extra of [
      {},
      { audit_seen: 'yes' },
      { audit_action: 'cover', mallow_camera: 'covered' },
      { audit_seen: 'yes', audit_action: 'annotate', mallow_camera: 'lift' },
      { audit_seen: 'yes', audit_action: 'cover' },
      { audit_seen: 'yes', audit_action: 'leave', mallow_camera: 'covered' }
    ]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
        answer: '', privateAnswer: 'Private and unrelated.', relationship: 'Niko',
        flags: { companion: 'Niko', bond: 'care', topic: 'past', ending: 'mallow', evidence: 'receipt', ...extra }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const scene = requests.at(-1).scene;
      assert.equal(scene.includes('Ash: one audit mark was repeated'), extra.audit_seen === 'yes');
      assert.equal(scene.includes('The player covered the lens with a paper star.'), extra.audit_seen === 'yes' && extra.audit_action === 'cover');
      assert.equal(scene.includes('The player left the lens and receipt alone.'), extra.audit_seen === 'yes' && extra.audit_action === 'leave');
      assert.ok(!scene.includes('The lens stayed covered; Mallow listened'));
      assert.ok(!scene.includes('The player lifted the star; Mallow helped'));
      assert.ok(!scene.includes('Private and unrelated.'));
    }
  });

  await test('Mira’s old audit checkpoints do not invent unheard or unseen details', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const extra of [{}, { audit_action: 'unplug' }, { audit_seen: 'yes', audit_action: 'cover' }]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_mira_talk_choice',
        answer: '', privateAnswer: '', relationship: 'Mira', flags: { companion: 'Mira', ending: 'rescue', ...extra }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush(); choiceAt('close_mira_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const scene = requests.at(-1).scene;
      assert.equal(scene.includes('Ash called the audit one mark wearing three badges'), extra.audit_seen === 'yes');
      assert.ok(!scene.includes('Mallow took part in the audit.'));
      assert.ok(!scene.includes('The player covered the lens with a paper star.'));
      assert.ok(!scene.includes('The player said the printer was unplugged and the screen was still on.'));
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('older checkpoints without a Mallow response do not invent one', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    const name = 'Niko';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
      answer: '', privateAnswer: 'Earlier private words.', relationship: name,
      flags: { companion: name, bond: 'care', topic: 'past', ending: 'rescue', evidence: 'receipt' }, followupMemory: [] }));
    els.restart.click(); els.resume.click(); await flush();
    choiceAt('close_niko_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What do you think?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.ok(!requests.at(-1).scene.includes('In the playroom, player:'));
    assert.ok(!requests.at(-1).scene.includes('Searching with Niko, player:'), 'old saves do not invent a work choice');
    assert.ok(!requests.at(-1).scene.includes('Earlier the player selected'), 'old saves do not invent comparison choices');
    assert.ok(!requests.at(-1).scene.includes('Ash: one audit mark was repeated'), 'old saves do not invent the new audit');
    for (const choice of story.policy_mallow_choice.choices) {
      assert.ok(!requests.at(-1).scene.includes(choice.label));
      assert.ok(!requests.at(-1).scene.includes(story[choice.next].text));
    }
  });

  await test('shared comparison context respects partial, skipped and incomplete saved paths', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const scenario of [
      { flags: { card_preference: 'direct', notice_preference: 'warm' }, expected: [] },
      { flags: { vote_b: 'direct', card_preference: 'direct', notice_preference: 'warm' }, expected: [] },
      { flags: { vote_a: 'skip', vote_b: 'skip', card_preference: 'skip' }, expected: [story.card_choice.choices[2].label] },
      { flags: { vote_a: 'warm', vote_b: 'direct', notice_preference: 'skip' }, expected: [story.notice_choice.choices[2].label] },
      { flags: { vote_a: 'direct', vote_b: 'warm' }, expected: [] }
    ]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
        answer: '', privateAnswer: 'My private words.', relationship: 'Niko',
        flags: { companion: 'Niko', bond: 'care', topic: 'past', ending: 'rescue', evidence: 'receipt', ...scenario.flags }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened with the wording?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const scene = requests.at(-1).scene;
      for (const choice of [...story.card_choice.choices, ...story.notice_choice.choices]) {
        assert.equal(scene.includes(choice.label), scenario.expected.includes(choice.label), 'only witnessed selected comparisons appear');
      }
      assert.equal(scene.includes('Earlier the player selected'), scenario.expected.length > 0);
      assert.ok(!scene.includes('My private words.'));
    }
  });

  await test('compact comparison renders the witnessed wordings and survives a save', async () => {
    for (const card of ['direct', 'warm', 'skip', '']) for (const notice of ['direct', 'warm', 'skip', '']) {
      const flags = { companion: 'Niko', reveal_pace_v2: 'yes', vote_a: 'direct', vote_b: 'warm',
        ...(card ? { card_preference: card } : {}), ...(notice ? { notice_preference: notice } : {}) };
      const saved = { version: 1, node: 'history_comparisons_compact', answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      const expected = story.history_comparisons_compact.text
        .replace('{cardComparison}', () => card ? story[`history_card_${card}`].text : '')
        .replace('{noticeComparison}', () => notice ? story[`history_notice_${notice}`].text : '');
      assert.equal(els['story-text'].textContent, expected, `${card || 'legacy'}/${notice || 'legacy'}`);
      assert.ok(!els['story-text'].textContent.includes('{cardComparison}'));
      assert.ok(els['story-text'].textContent.trim(), 'partial old saves still show a visible scene');
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, expected);
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.comparisons_revealed, 'yes');
    }
    storageData.clear(); els.restart.click();
  });

  await test('new receipt comparisons retain exact selected and unselected wordings, legacy text and narrator speech', async () => {
    const priorAudio = globalThis.Audio, priorFetch = globalThis.fetch;
    const spoken = [];
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.fetch = async (_url, request) => {
      spoken.push(JSON.parse(request.body));
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    };
    try {
      els.restart.click(); els['settings-open'].click(); els['settings-clear'].click();
      els['speech-mode'].value = 'mirid'; els['speech-url'].value = 'http://127.0.0.1:8000'; els['settings-form'].submit();
      for (const card of ['direct', 'warm', 'skip']) for (const notice of ['direct', 'warm', 'skip']) for (const signal of ['private', 'repeat']) {
        const flags = { companion: 'Niko', early_paper_due: 'yes', early_paper_done: 'yes', paper_handoff: 'keep',
          compact_comparisons_due: 'yes', reveal_pace_v2: 'yes', card_preference: card, notice_preference: notice, signal };
        const saved = { version: 1, node: 'history_comparisons_early', answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
        const text = els['story-text'].textContent;
        assert.ok(els['story-history-list'].children.some(el => el.textContent === `Narrator: ${text}`), 'recent story records the exact displayed receipt');
        for (const [kind, value] of [['card', card], ['notice', notice]]) {
          const source = story[`history_${kind}_${value}`].text;
          if (value === 'skip') {
            assert.ok(text.includes(`${kind === 'card' ? 'Welcome card' : 'Map notice'}: NO CHOICE.`));
          } else {
            const quotes = [...source.matchAll(/“([^”]+)”/g)].map(match => match[1]);
            assert.equal(quotes.length, 2);
            assert.ok(text.includes(`“${quotes[0]}” — YOUR CHOICE; “${quotes[1]}” — NOT CHOSEN.`));
          }
        }
        els.save.click(); els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, text, `${card}/${notice}/${signal} survives resume`);
        if (card === 'direct' && notice === 'warm' && signal === 'private') {
          els.speak.click(); for (let i = 0; i < 8; i++) await flush();
          assert.equal(spoken.at(-1).text, text, 'read-aloud preserves the exact displayed receipt');
          assert.equal(spoken.at(-1).voice, 'af_heart', 'the receipt is read by the Narrator');
          els['stop-voice'].click();
        }
      }
      const flags = { companion: 'Niko', early_paper_due: 'yes', early_paper_done: 'yes', paper_handoff: 'keep',
        reveal_pace_v2: 'yes', card_preference: 'direct', notice_preference: 'warm', signal: 'private' };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'history_comparisons_early', answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.history_comparisons_early.text
        .replace('{cardComparison}', story.history_card_direct.text)
        .replace('{noticeComparison}', story.history_notice_warm.text), 'older checkpoints keep the original wording');
    } finally {
      els['stop-voice'].click(); globalThis.Audio = priorAudio; globalThis.fetch = priorFetch;
      storageData.clear(); els.restart.click(); els['settings-clear'].click(); els['settings-form'].submit();
    }
  });

  await test('AI recalls only compact comparisons actually shown, including partial old saves', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    const base = { companion: 'Niko', bond: 'care', topic: 'past', ending: 'rescue', evidence: 'receipt', reveal_pace_v2: 'yes', vote_a: 'warm', vote_b: 'direct' };
    for (const scenario of [
      { extra: { card_preference: 'warm', notice_preference: 'direct' }, expected: [] },
      { extra: { comparisons_revealed: 'yes', card_preference: 'warm', notice_preference: 'direct' }, expected: [story.card_choice.choices[1].label, story.notice_choice.choices[0].label] },
      { extra: { receipt_history_brief: 'yes', comparisons_revealed: 'yes', card_preference: 'warm', notice_preference: 'direct' }, expected: [story.card_choice.choices[1].label, story.notice_choice.choices[0].label] },
      { extra: { receipt_history_brief: 'yes', early_paper_done: 'yes', early_paper_shown: 'yes', paper_handoff: 'quote', comparisons_revealed: 'yes', card_preference: 'warm', notice_preference: 'direct' }, expected: [story.card_choice.choices[1].label, story.notice_choice.choices[0].label] },
      { extra: { receipt_history_brief: 'yes', early_paper_done: 'yes', early_paper_shown: 'yes', compact_comparisons_due: 'yes', paper_handoff: 'quote', comparisons_revealed: 'yes', card_preference: 'warm', notice_preference: 'direct' }, expected: [story.card_choice.choices[1].label, story.notice_choice.choices[0].label] },
      { extra: { receipt_history_brief: 'yes', early_paper_done: 'yes', paper_handoff: 'quote', comparisons_revealed: 'yes', card_preference: 'warm', notice_preference: 'direct' }, expected: [] },
      { extra: { receipt_history_brief: 'yes', comparisons_revealed: 'yes', card_preference: 'warm', notice_preference: 'direct' }, disconnected: true, expected: [] },
      { extra: { comparisons_revealed: 'yes', notice_preference: 'skip' }, expected: [story.notice_choice.choices[2].label] },
      { extra: { comparisons_revealed: 'yes' }, expected: [] }
    ]) {
      const saved = { version: 1, node: 'close_niko_talk_choice', answer: '', privateAnswer: 'PRIVATE FIXTURE', relationship: 'Niko', flags: { ...base, ...scenario.extra }, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What happened with those wordings?';
      const previousNext = story.history_brief_warm.nextBy.cases.yes;
      if (scenario.disconnected) story.history_brief_warm.nextBy.cases.yes = 'history_second_check';
      try { els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush(); }
      finally { story.history_brief_warm.nextBy.cases.yes = previousNext; }
      const scene = requests.at(-1).scene;
      for (const choice of [...story.card_choice.choices, ...story.notice_choice.choices])
        assert.equal(scene.includes(choice.label), scenario.expected.includes(choice.label));
      assert.ok(!scene.includes('PRIVATE FIXTURE'));
    }
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });

  await test('legacy and inconsistent record saves do not invent a later action', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const marker of [undefined, 'decide']) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
        answer: '', privateAnswer: '', relationship: 'Niko',
        flags: { companion: 'Niko', bond: 'care', topic: 'past', ending: 'record', evidence: 'receipt', record_response: 'apology', record_followup: marker }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened with Mira?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests.at(-1).story_event, undefined);
      assert.ok(requests.at(-1).scene.includes(story.record_close_mira.choices[0].label), 'the earlier exchange is still remembered');
    }
  });

  await test('Mira’s record context distinguishes what she heard from what Ash later told her', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const [response, marker] of [[undefined, undefined], ['apology', undefined], ['apology', 'explain'], ['ask', 'decide']]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_mira_talk_choice',
        answer: '', privateAnswer: '', relationship: 'Mira',
        flags: { companion: 'Mira', ending: 'record', evidence: 'receipt', ...(response ? { record_response: response } : {}), ...(marker ? { record_followup: marker } : {}) }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('close_mira_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened with the printer?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const check = () => {
        const request = requests.at(-1);
        assert.ok(request.scene.includes('Mira heard the printer before the latch'));
        assert.ok(!request.scene.includes('Ash printed the machine’s false count'));
        assert.ok(!request.scene.includes('Ash said the team reconnected the printer.'));
        assert.equal((request.story_event || '').includes('Ash said they printed first'), marker === 'explain');
        assert.equal((request.story_event || '').includes('Mira circled the correction'), marker === 'decide');
      };
      check();
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And afterwards?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      check();
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('legacy or inconsistent record checkpoints do not invent a witnessed exchange', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit();
    for (const extra of [
      { ending: 'record', evidence: 'receipt' },
      { ending: 'record', record_response: 'apology' },
      { ending: 'rescue', evidence: 'receipt', record_response: 'apology' }
    ]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ version: 1, node: 'close_niko_talk_choice',
        answer: '', privateAnswer: 'My private memory.', relationship: 'Niko',
        flags: { companion: 'Niko', bond: 'care', topic: 'past', ...extra }, followupMemory: [] }));
      els.restart.click(); els.resume.click(); await flush();
      choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What happened with Mira?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      for (const choice of story.record_close_mira.choices) {
        assert.ok(!requests.at(-1).scene.includes(choice.label));
        assert.ok(!requests.at(-1).scene.includes(story[choice.next].text));
      }
      assert.ok(!requests.at(-1).scene.includes('My private memory.'));
    }
  });

  await test('Ash light retreat keeps the private choice, witnessed lead-in and legacy saves', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    for (const bond of ['care', 'play']) {
      const flags = { companion: 'Ash', ending: 'retreat', bond, private_tone: 'light', topic: 'light',
        signal: 'private', retreat_epilogue_v1: 'yes', retreat_fort_closing_due: 'yes',
        compact_retreat_closing: 'yes', retreat_search_early: 'yes', retreat_search: 'stair',
        retreat_search_seen: 'stair', ash_retreat_light_due: 'yes' };
      const saved = { version: 1, node: 'close_ash', answer: '', privateAnswer: '', relationship: 'Ash', flags, followupMemory: [] };
      storageData.clear(); els.restart.click(); els['settings-clear'].click();
      els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, `${story.close_ash.text} ${story[`close_ash_bond_${bond}`].text}`);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, `${story.close_ash.text} ${story[`close_ash_bond_${bond}`].text}`);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_ash_retreat_light_compact.text);
      assert.equal(els.speaker.textContent, 'Ash');
      assert.deepEqual(els.interaction.children.map(el => el.textContent), story.close_ash_retreat_talk_choice.choices.map(choice => choice.label));
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_ash_retreat_light_compact.text);
      choiceAt('close_ash_retreat_light_compact', 0); await flush();
      assert.equal(els['story-text'].textContent, `${story.close_ash_retreat_talk_choice.text} ${story.close_ash_retreat_input.text}`);
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What did you just say?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(requests.at(-1).scene.includes(story.close_ash_retreat_light_compact.text), 'only the witnessed closing text enters Ash’s context');

      // A checkpoint created before this route was added continues through the
      // original individual Ash lines, rather than gaining new content.
      const legacy = { ...saved, flags: { ...flags } }; delete legacy.flags.ash_retreat_light_due;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(legacy)); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_ash.text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`close_ash_bond_${bond}`].text);
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('Ash retreat AI sees the actual selected closing line', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    for (const topic of ['past', 'future']) {
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const plan = { crew_choice: 2, ash_question: topic === 'past' ? 0 : 1, plan_choice: 3, signal_choice: 1 };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_ash_retreat_talk_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.close_ash_retreat_talk_choice.text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      choiceAt('close_ash_retreat_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What did you just ask?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const scene = requests.at(-1).scene;
      assert.ok(scene.includes(story[`close_ash_retreat_${topic}`].text));
      assert.ok(!scene.includes(story[`close_ash_retreat_${topic === 'past' ? 'future' : 'past'}`].text));
      assert.ok(scene.includes('Mira is still downstairs'));
    }
  });

  await test('an older checkpoint without a topic does not invent an epilogue line', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    const plan = { crew_choice: 0, plan_choice: 0, signal_choice: 1 };
    for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
    els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    delete saved.flags.topic;
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els.resume.click(); await flush();
    choiceAt('close_niko_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'Tell me more.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.ok(!requests.at(-1).scene.includes(story.close_niko_past.text));
    assert.ok(!requests.at(-1).scene.includes(story.close_niko_future.text));
  });

  await test('optional epilogue conversation resumes only the chosen private exchange', async () => {
    for (const [index, name] of ['Niko', 'Mira', 'Ash'].entries()) for (const ending of [0, 3]) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const original = `Private thought for ${name}.`;
      const plan = { crew_choice: index, plan_choice: ending, signal_choice: 1, privateText: original, publicText: 'We need to find Mira.' };
      const talkId = name === 'Ash' && ending === 3 ? 'close_ash_retreat_talk_choice' : `close_${name.toLowerCase()}_talk_choice`;
      for (let i = 0; i < 250 && els['story-text'].textContent !== story[talkId].text && els['status'].textContent !== 'END OF THE PROTOTYPE'; i++) await step(plan);
      assert.equal(requests.length, 2, 'The epilogue must not send a request without a player choosing to speak');
      assert.ok(!JSON.stringify(requests[1]).includes(original), 'Mallow does not receive private words when sharing was declined');
      if (name === 'Mira' && ending === 3) {
        assert.equal(els['status'].textContent, 'END OF THE PROTOTYPE', 'Mira cannot speak from the sewing room while she remains downstairs');
        continue;
      }
      assert.equal(els['story-text'].textContent, story[talkId].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.privateAnswer, original);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[talkId].text);
      choiceAt(talkId, 0); await flush();
      assert.equal(requests.length, 2, 'Choosing to speak still sends nothing until the message is submitted');
      const input = els.interaction.children.find(el => el.tagName === 'TEXTAREA');
      input.value = 'How are you feeling now?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests.length, 3);
      assert.equal(requests[2].character, name);
      assert.equal(requests[2].player_says, 'How are you feeling now?');
      assert.ok(requests[2].memory.some(item => item.text === original), 'The earlier private message reaches only the selected companion');
      assert.match(requests[2].scene, ending === 3 ? /Mira is still downstairs/ : /Mira has returned safely/);
      assert.equal(els['story-text'].textContent, 'I am listening.');
      els.save.click();
      assert.match(els['save-status'].textContent, /story saved/i);
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).aiScene.text, 'I am listening.');
      els.advance.click(); await flush(); els.save.click();
      const after = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(after.privateAnswer, original, 'Epilogue input never overwrites the original private answer');
      assert.ok(after.followupMemory.some(item => item.text === 'How are you feeling now?'));
      els.restart.click(); els.resume.click(); await flush(); els.save.click();
      const restored = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.deepEqual(restored.followupMemory, after.followupMemory);
    }
  });

  await test('epilogue dialogue and follow-ups receive only the selected ending and evidence', async () => {
    const outcomes = [
      'The player and Niko opened Mira’s door immediately.',
      'Ash printed the machine’s false count and the correction',
      'The player lifted the star; Mallow helped find the catch.',
      'The player pulled the team back as the floor shifted.'
    ];
    const observations = [
      'The player kept the false receipt as evidence.',
      'The player showed the machine the two ticket pieces as evidence.',
      'The player asked Mira to describe the room behind the door as evidence.'
    ];
    for (let ending = 0; ending < outcomes.length; ending++) for (let evidence = 0; evidence < observations.length; evidence++) {
      const requests = [];
      globalThis.fetch = async (_url, request) => {
        requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
      };
      storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.start.click(); await flush();
      const plan = { crew_choice: 0, plan_choice: ending, evidence_choice: evidence, signal_choice: 1 };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story.close_niko_talk_choice.text);
      choiceAt('close_niko_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What do you think about what happened?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const scene = requests.at(-1).scene;
      for (const [index, fact] of outcomes.entries()) assert.equal(scene.includes(fact), index === ending, `ending ${ending} / fact ${index}`);
      for (const [index, fact] of observations.entries()) assert.equal(scene.includes(fact), index === evidence, `evidence ${evidence} / fact ${index}`);
      els.interaction.children.find(el => el.textContent === 'Say more').click(); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'And what should we do tomorrow?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      const followup = requests.at(-1).scene;
      assert.ok(followup.includes(outcomes[ending]));
      assert.ok(followup.includes(observations[evidence]));
    }
  });

  await test('older checkpoints without stored conversation preserve the earlier private words', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    storageData.clear(); els.restart.click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    const original = 'My earlier private words.';
    const plan = { crew_choice: 0, plan_choice: 0, signal_choice: 1, privateText: original };
    for (let i = 0; i < 250 && els['story-text'].textContent !== story.close_niko_talk_choice.text; i++) await step(plan);
    els.save.click();
    const old = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    old.followupMemory = [];
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(old));
    els.restart.click(); els.resume.click(); await flush();
    choiceAt('close_niko_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'What comes next?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.deepEqual(requests.at(-1).memory.map(item => item.text), [original]);
    assert.equal(requests.at(-1).player_says, 'What comes next?');
    for (const question of ['First new question.', 'Second new question.', 'Third new question.']) {
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = question;
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    }
    const trimmed = requests.at(-1).memory.map(entry => entry.text);
    assert.deepEqual(trimmed, [original, 'First new question.', 'I am listening.', 'Second new question.', 'I am listening.'],
      'A legacy unpaired opening must not strand the later epilogue question without its answer');
  });

  await test('offline epilogue conversations use written replies and never call a provider', async () => {
    for (const [index, name] of ['Niko', 'Mira', 'Ash'].entries()) {
      let requests = 0;
      globalThis.fetch = async () => { requests++; throw new Error('Unexpected request'); };
      storageData.clear(); els.restart.click(); els['settings-clear'].click(); els.start.click(); await flush();
      const talkId = `close_${name.toLowerCase()}_talk_choice`;
      const plan = { crew_choice: index, plan_choice: 0, signal_choice: 1 };
      for (let i = 0; i < 250 && els['story-text'].textContent !== story[talkId].text; i++) await step(plan);
      assert.equal(els['story-text'].textContent, story[talkId].text);
      choiceAt(talkId, 0); await flush();
      els.interaction.children.find(el => el.tagName === 'TEXTAREA').value = 'I am glad you are here.';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(els['story-text'].textContent, story[`close_${name.toLowerCase()}_chat`].ai.fallback);
      assert.equal(requests, 0);
    }
  });

  await test('recent story is bounded to visited lines and clears on restart', async () => {
    storageData.clear(); els.restart.click(); els['settings-clear'].click(); els.start.click(); await flush();
    assert.equal(els['story-history-list'].children[0].textContent, `Narrator: ${story.opening.text}`);
    for (let i = 0; i < 300 && !els.interaction.children.some(el => el.textContent === 'Play again ↗'); i++) await step({});
    assert.ok(els.interaction.children.some(el => el.textContent === 'Play again ↗'));
    const history = els['story-history-list'].children.map(el => el.textContent);
    assert.equal(history.length, 80, 'The history retains at most 80 recent entries');
    assert.ok(!history.some(line => line.includes(story.opening.text)), 'Oldest entries leave the bounded history');
    assert.ok(!history.some(line => line.includes(story.mira_route.text)), 'An unvisited companion route is not exposed');
    assert.equal(history.at(-1), `${els.speaker.textContent}: ${els['story-text'].textContent}`);
    els.restart.click();
    assert.equal(els['story-history-list'].children.length, 0);
    assert.equal(els['story-history'].open, false);
  });

  await test('recent story excludes unsent drafts and is not saved or restored', async () => {
    storageData.clear(); els.restart.click(); els['settings-clear'].click(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    els.interaction.children.find(el => el.id === 'player-message').value = 'A private unsent draft.';
    els.save.click();
    assert.ok(!els['story-history-list'].children.some(el => el.textContent.includes('A private unsent draft.')));
    assert.ok(!storageData.get('okie-dokie.arcade.v1').includes('A private unsent draft.'));
    assert.ok(!storageData.get('okie-dokie.arcade.v1').includes('storyHistory'));
    els.restart.click(); els.resume.click(); await flush();
    assert.deepEqual(els['story-history-list'].children.map(el => el.textContent), [`Narrator: ${story.niko_input.text}`]);
    assert.equal(els.interaction.children.find(el => el.id === 'player-message').value, '');
  });

  await test('recent story tracks submitted AI conversation and replaces discarded replies', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 2) return new Response('', { status: 503 });
      return jsonResponse({ choices: [{ message: { content: calls === 1 ? 'First generated response.' : 'Revised generated response.' } }] });
    };
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
    assert.equal(els['story-text'].textContent, story.niko_input.text);
    els.interaction.children.find(el => el.id === 'player-message').value = 'My private opening.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    const lines = () => els['story-history-list'].children.map(el => el.textContent);
    assert.equal(lines().filter(line => line === 'You: My private opening.').length, 1);
    assert.ok(lines().includes('Niko: First generated response.'));
    assert.ok(!lines().some(line => line.includes('considers your words')));
    els.interaction.children.find(el => el.textContent === 'Use the written response').click(); await flush();
    assert.equal(calls, 1, 'Choosing the written response makes no request');
    assert.ok(!lines().includes('Niko: First generated response.'));
    assert.ok(lines().includes(`Niko: ${story.niko_chat.ai.fallback}`));
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Failed private draft.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.ok(lines().includes('You: Failed private draft.'));
    els.interaction.children.find(el => el.textContent === 'Edit or retry message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised private reply.';
    assert.ok(lines().includes('You: Failed private draft.'), 'Editing alone does not discard the displayed exchange');
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.ok(!lines().includes('You: Failed private draft.'));
    assert.ok(lines().includes('You: Revised private reply.'));
    assert.ok(lines().includes('Niko: Revised generated response.'));
    assert.ok(!els.interaction.children.some(el => el.textContent === 'Use the written response'));
    assert.equal(lines().filter(line => line === `Niko: ${story.niko_chat.ai.fallback}`).length, 1);
    els.advance.click(); await flush(); els.save.click();
    assert.ok(!storageData.get('okie-dokie.arcade.v1').includes('storyHistory'));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-history-list'].children.length, 1, 'Resume begins a new temporary history');
    assert.ok(!lines().some(line => line.includes('My private opening.')));
  });

  await test('recent story keeps a submitted skipped message without waiting or late AI text', async () => {
    let calls = 0, pendingSignal, resolveLate;
    globalThis.fetch = async (_url, request) => {
      calls++;
      if (calls === 1) return jsonResponse({ choices: [{ message: { content: 'I hear you.' } }] });
      pendingSignal = request.signal;
      return new Promise(resolve => { resolveLate = resolve; });
    };
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
    els['settings-form'].submit(); els.start.click(); await flush();
    for (let i = 0; i < 100 && els['story-text'].textContent !== story.niko_input.text; i++) await step({});
    els.interaction.children.find(el => el.id === 'player-message').value = 'First private message.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Submitted before leaving.';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.ok(pendingSignal && !pendingSignal.aborted);
    els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
    resolveLate(jsonResponse({ choices: [{ message: { content: 'Late unseen answer.' } }] })); await flush();
    const history = els['story-history-list'].children.map(el => el.textContent);
    assert.ok(history.includes('You: Submitted before leaving.'));
    assert.ok(!history.some(line => /considers your words|Late unseen answer/.test(line)));
    assert.equal(history.at(-1), `Narrator: ${story.niko_question.text}`);
  });

  await test('malformed checkpoints cannot resume and remain deletable', async () => {
    for (const raw of ['not json', JSON.stringify({ version: 1, node: '__proto__' }), JSON.stringify({ version: 999, node: 'opening' })]) {
      storageData.set('okie-dokie.arcade.v1', raw); els.restart.click();
      assert.equal(els.resume.hidden, true); assert.equal(els['delete-save'].hidden, false);
      els.resume.click(); assert.equal(els.intro.hidden, false);
      els['delete-save'].click(); assert.equal(storageData.has('okie-dokie.arcade.v1'), false);
    }
  });
  await test('Mira remembers an optional knight name across a checkpoint without changing older saves', async () => {
    const checkpoint = { version: 1, node: 'mira_knight_name_input', answer: '', privateAnswer: '', relationship: 'Mira', flags: { companion: 'Mira', bond: 'play', ending: 'rescue', topic: 'future' }, followupMemory: [] };
    storageData.clear(); els['settings-clear'].click();
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
    els.restart.click(); els.resume.click(); await flush();
    const nameField = els.interaction.children.find(el => el.id === 'player-message');
    assert.equal(nameField.maxLength, 40);
    nameField.value = '  Captain <Stitch> 🐛  ';
    els.interaction.children.find(el => el.textContent === 'Name the knight →').click(); await flush();
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, 'I’ll keep the name with our drawing: Captain <Stitch> 🐛');
    els.save.click();
    const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(saved.knightName, 'Captain <Stitch> 🐛');
    assert.equal(saved.flags.knight_named, 'yes');
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, 'I’ll keep the name with our drawing: Captain <Stitch> 🐛');
    // Re-enter the closing from the saved state; the name remains plain text.
    saved.node = 'close_mira_knight_check';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els.resume.click(); await flush();
    els.advance.click(); await flush();
    assert.match(els['story-text'].textContent, /proper name tag: Captain <Stitch> 🐛$/);
    // A legacy checkpoint without a name continues to the original line.
    delete saved.knightName; delete saved.flags.knight_named;
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els.resume.click(); await flush();
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.close_mira_bond_play.text);
    // Skipping the prompt never invents a name or flag.
    checkpoint.node = 'mira_knight_name_input';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
    els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Decide later').click(); await flush();
    els.save.click();
    const skipped = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(skipped.knightName, '');
    assert.equal(skipped.flags.knight_named, undefined);
  });
  await test('the named knight card renders as text and the witnessed event survives a checkpoint', async () => {
    const saved = { version: 1, node: 'moment_mira_play_reply', answer: '', privateAnswer: '', relationship: 'Mira',
      knightName: 'Captain <Stitch> 🐛', flags: { companion: 'Mira', bond: 'play', knight_named: 'yes' }, followupMemory: [] };
    els['settings-clear'].click();
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, 'Beneath the eye, a line of ink appears: Captain <Stitch> 🐛. The eye closes as soon as you finish reading it.');
    els.save.click();
    const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(checkpoint.flags.named_card_seen, 'yes');
    els.restart.click(); els.resume.click(); await flush();
    assert.ok(els['story-text'].textContent.includes('Captain <Stitch> 🐛'));
    // A prior save without a name follows the old card route.
    delete saved.knightName; delete saved.flags.knight_named;
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.advance.click(); await flush();
    assert.equal(els['story-text'].textContent, story.moment_caption.text);
  });
  await test('Mira’s public card chat receives the printed knight name only when witnessed', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember that card.' } }] });
    };
    const name = 'Captain "Stitch" 🐛';
    const checkpoint = { version: 1, node: 'mid_mira_input', answer: '', privateAnswer: '', relationship: 'Mira', knightName: name,
      flags: { companion: 'Mira', bond: 'play', knight_named: 'yes', named_card_seen: 'yes', midpoint_route: 'mira', midpoint_available: 'yes', midpoint_chat: 'yes', moment: 'keep' }, followupMemory: [] };
    const send = async (saved) => {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What did the card say?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    await send(checkpoint);
    assert.ok(requests.at(-1).scene.includes(`the name ${JSON.stringify(name)} appeared beneath an eye`));
    assert.match(requests.at(-1).scene, /eye closed after the player read it/);
    assert.ok(requests.at(-1).scene.length <= 1800);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What happened next?';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.ok(requests.at(-1).scene.includes(`the name ${JSON.stringify(name)} appeared beneath an eye`));
    assert.match(requests.at(-1).scene, /Reply to the latest message without repeating/);
    for (const change of [
      { named_card_seen: undefined }, { knight_named: undefined }, { midpoint_route: undefined },
      { midpoint_available: undefined }, { midpoint_chat: undefined }, { moment: undefined }, { bond: 'care' }
    ]) {
      const saved = { ...checkpoint, flags: { ...checkpoint.flags, ...change } };
      await send(saved);
      assert.ok(!requests.at(-1).scene.includes(name), `unwitnessed name with ${JSON.stringify(change)}`);
    }
    await send({ ...checkpoint, knightName: '' });
    assert.doesNotMatch(requests.at(-1).scene, /appeared beneath an eye/);
    const maximumName = '"'.repeat(40);
    await send({ ...checkpoint, knightName: maximumName });
    assert.ok(requests.at(-1).scene.includes(`the name ${JSON.stringify(maximumName)} appeared beneath an eye`));
    assert.ok(requests.at(-1).scene.length <= 1800, 'a maximally escaped name remains within the scene bound');
    await send({ ...checkpoint, node: 'mid_niko_input', relationship: 'Niko', flags: { ...checkpoint.flags, companion: 'Niko', midpoint_route: 'niko' } });
    assert.ok(!requests.at(-1).scene.includes(name), 'another character must not get Mira’s naming detail');
    els['settings-clear'].click(); els['settings-form'].submit(); storageData.clear(); els.restart.click();
  });
  await test('only Mira receives the knight name she witnessed in AI scene context', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    const saved = { version: 1, node: 'mira_input', answer: '', privateAnswer: '', knightName: 'Captain Stitch', relationship: 'Mira', flags: { companion: 'Mira', bond: 'play', knight_named: 'yes' }, followupMemory: [] };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'What about our knight?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.match(requests.at(-1).scene, /named the little drawn knight "Captain Stitch"/);
    assert.doesNotMatch(requests.at(-1).scene, /beneath an eye on the knight card/);
    saved.node = 'close_mira_input'; saved.flags.ending = 'rescue'; saved.flags.topic = 'future';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Will we finish our knight?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.match(requests.at(-1).scene, /named the little drawn knight "Captain Stitch"/);
    assert.ok(requests.at(-1).scene.includes(story.close_mira_future.text), 'the selected closing line remains grounded');
    assert.ok(requests.at(-1).scene.length <= 1800);
    assert.doesNotMatch(requests.at(-1).scene, /beneath an eye on the knight card/, 'old checkpoints must not invent the new moment');
    saved.flags.named_card_seen = 'yes';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Do you remember the picture?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.match(requests.at(-1).scene, /beneath an eye on the knight card; the eye closed/);
    // An older checkpoint or a different companion must not acquire the name.
    saved.node = 'niko_input'; saved.relationship = 'Niko'; saved.flags.companion = 'Niko';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'What should we do?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.doesNotMatch(requests.at(-1).scene, /Captain Stitch/);
    saved.node = 'mira_input'; saved.relationship = 'Mira'; saved.flags.companion = 'Mira';
    delete saved.knightName; delete saved.flags.knight_named;
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'What about our knight?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.doesNotMatch(requests.at(-1).scene, /named the little drawn knight/);
  });
  await test('Niko’s retreat context uses the witnessed closing line and supports old checkpoints', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const topic of ['past', 'future']) for (const witnessed of [true, false]) {
      const flags = { companion: 'Niko', bond: 'play', topic, ending: 'retreat' };
      if (witnessed) flags.niko_retreat_topic_seen = topic;
      const saved = { version: 1, node: 'close_niko_input', answer: '', privateAnswer: '', relationship: 'Niko', flags, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What do we do next?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const expected = story[`close_niko_${witnessed ? 'retreat_' : ''}${topic}`].text;
      assert.ok(requests.at(-1).scene.includes(expected));
      if (!witnessed) assert.ok(!requests.at(-1).scene.includes(story[`close_niko_retreat_${topic}`].text));
    }
  });
  await test('task follow-up choices survive saves and ground only the witnessed companion rescue', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I can help.' } }] });
    };
    els['settings-open'].click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const [index, detail] of ['first', 'second'].entries()) {
      const lower = name.toLowerCase(), question = `${lower}_light_question`, answerId = `${lower}_light_${detail}`;
      const flags = { companion: name, social_v2: 'yes', private_tone: 'light', topic: 'light', light_question_due: 'yes', bond: 'care', route_action: 'proof', ending: 'rescue' };
      const saved = { version: 1, node: question, answer: '', privateAnswer: 'PRIVATE WORDS', relationship: name, flags, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      choiceAt(question, index); await flush();
      assert.equal(els['story-text'].textContent, story[answerId].text);
      els.save.click(); const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.light_detail, detail); assert.equal(checkpoint.flags.light_detail_seen, `${lower}_${detail}`);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[answerId].text);
      els.advance.click(); await flush(); assert.equal(els['story-text'].textContent, story[`${lower}_clue`].text);
      checkpoint.node = `rescue_topic_${lower}`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint)); els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`rescue_${lower}_light_${detail}`].text);
      els.save.click(); const rescue = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(rescue.flags.light_rescue_seen, `${lower}_${detail}`);
      rescue.node = `close_${lower}_input`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(rescue)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What happened?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const sent = requests.at(-1);
      assert.ok(sent.earlier_conversation.includes(story[answerId].text), `${name}/${detail}: witnessed answer`);
      const rescueText = {
        niko_first: 'Niko felt a vibration and guided the player to the catch; the release moved.',
        niko_second: 'Niko counted while Mira braced the door and the player lifted the release.',
        mira_first: 'The player told Mira where their hands were; she moved clear, then braced the door as they lifted.',
        mira_second: 'Mira described where the lower edge caught; Niko shifted his grip and the player lifted the release.',
        ash_first: 'Ash checked the release against the counter and guided Niko to its position.',
        ash_second: 'Ash listened for the click and guided Niko to the catch.'
      }[`${lower}_${detail}`];
      assert.ok(sent.scene.includes(rescueText), `${name}/${detail}: witnessed rescue included`);
      assert.ok(sent.scene.length <= 1800);
      assert.ok(!sent.earlier_conversation.includes(story[`${lower}_private`].text), 'unseen personal disclosure is absent');
      // The other companion and an older checkpoint must not acquire it.
      rescue.flags.light_detail_seen = `${lower}_${detail === 'first' ? 'second' : 'first'}`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(rescue)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What happened?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(!(requests.at(-1).earlier_conversation || '').includes(story[answerId].text), 'inconsistent witness omitted');
      assert.ok(!requests.at(-1).scene.includes(rescueText), 'inconsistent rescue witness omitted');
      rescue.node = 'mallow_input'; rescue.flags.signal = 'private';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(rescue)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'GROUP WORDS';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(!JSON.stringify(requests.at(-1)).includes(story[answerId].text), 'the private answer is not sent to Mallow');
      assert.ok(!JSON.stringify(requests.at(-1)).includes('PRIVATE WORDS'), 'private message remains private');
    }
    storageData.clear(); els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
  });
  await test('compact Mira light closings preserve the selected activity, name, checkpoints and witnessed AI context', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember that.' } }] });
    };
    els['settings-open'].click(); els['settings-clear'].click();
    els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const variant of ['care', 'play', 'named']) {
      const name = 'Captain <Stitch> 🐛';
      const flags = { companion: 'Mira', social_v2: 'yes', private_tone: 'light', topic: 'light',
        bond: variant === 'care' ? 'care' : 'play', ending: 'rescue', ...(variant === 'named' ? { knight_named: 'yes' } : {}) };
      const saved = { version: 1, node: 'close_mira_enter', answer: '', privateAnswer: 'Earlier words.', relationship: 'Mira', flags,
        knightName: variant === 'named' ? name : '', followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      const line = story[`close_mira_light_${variant}_compact`].text.replace('{knightName}', () => name);
      assert.equal(els['story-text'].textContent, line, `${variant}: compact closing is rendered literally`);
      if (variant === 'named') assert.ok(line.includes(name));
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.mira_light_compact_seen, variant);
      els.advance.click(); await flush(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, line, `${variant}: compact closing restores`);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_mira_talk_choice.text);
      choiceAt('close_mira_talk_choice', 0); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What did you just say?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(requests.at(-1).scene.includes(JSON.stringify(line)), `${variant}: AI gets the witnessed exact line`);
      assert.ok(!requests.at(-1).scene.includes(story.close_mira_light_topic.text), 'unseen legacy line is omitted');
      assert.ok(requests.at(-1).scene.length <= 1800);
      // Mismatched markers must not invent a compact or legacy quote.
      checkpoint.node = 'close_mira_input'; checkpoint.flags.mira_light_compact_seen = variant === 'care' ? 'play' : 'care';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What did you say?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(!requests.at(-1).scene.includes(JSON.stringify(line)), 'mismatched compact witness is omitted');
      assert.ok(!requests.at(-1).scene.includes(story.close_mira_light_topic.text), 'mismatched witness does not claim the old line');
    }
    // A save on an old closing passage retains the old continuation and line.
    const legacy = { version: 1, node: 'close_mira_bond_care', answer: '', privateAnswer: '', relationship: 'Mira',
      flags: { companion: 'Mira', social_v2: 'yes', private_tone: 'light', topic: 'light', bond: 'care', ending: 'rescue' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(legacy)); els.restart.click(); els.resume.click(); await flush();
    els.advance.click(); await flush(); assert.equal(els['story-text'].textContent, story.close_mira_light_topic.text);
    els.save.click(); const savedLegacy = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(savedLegacy.flags.mira_light_compact_seen, undefined);
    els.advance.click(); await flush(); choiceAt('close_mira_talk_choice', 0); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'What did you say?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.ok(requests.at(-1).scene.includes(story.close_mira_light_topic.text));
    // An inconsistent named flag with no actual name takes the legacy route.
    legacy.node = 'close_mira_enter'; legacy.flags.bond = 'play'; legacy.flags.knight_named = 'yes';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(legacy)); els.restart.click(); els.resume.click(); await flush();
    els.advance.click(); await flush(); assert.equal(els['story-text'].textContent, story.close_mira_light.text);
    // A maximal quoted name must not push the actually witnessed rescue out
    // of the adapter's bounded scene context.
    const maximal = { version: 1, node: 'close_mira_input', answer: '', privateAnswer: '', relationship: 'Mira', knightName: '"'.repeat(40),
      flags: { companion: 'Mira', social_v2: 'yes', private_tone: 'light', topic: 'light', bond: 'play',
        knight_named: 'yes', named_card_seen: 'yes', light_close_seen: 'Mira', mira_light_compact_seen: 'named',
        date_scene_due: 'yes', connection_choice: 'ask', connection_seen: 'Mira', connection_late_seen: 'Mira', date_moment: 'playful', date_moment_seen: 'mira_playful',
        light_question_due: 'yes', light_detail: 'first', light_detail_seen: 'mira_first', light_rescue_seen: 'mira_first',
        ending: 'rescue', evidence: 'voice', confirm_pressed: 'yes', confirm_result_seen: 'yes', mallow_response: 'voice',
        route_action: 'proof', vote_a: 'warm', vote_b: 'direct', card_preference: 'warm', notice_preference: 'direct',
        audit_seen: 'yes', audit_action: 'unplug', door_effort: 'listen' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(maximal)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Do you remember the door?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    const scene = requests.at(-1).scene;
    assert.ok(scene.includes('named the little drawn knight'));
    assert.ok(scene.includes('The player told Mira where their hands were; she moved clear, then braced the door as they lifted.'));
    assert.ok(scene.includes('The player asked Mira to describe the room behind the door as evidence.'));
    assert.ok(requests.at(-1).date_moment.includes('While planning a future date together'), 'the witnessed date does not crowd the rescue out of the bounded scene');
    assert.ok(scene.length <= 1800);
    storageData.clear(); els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
  });
  await test('light private conversations stay separate and do not invent the personal disclosures', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I can look with you.' } }] });
    };
    els['settings-open'].click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) {
      const lower = name.toLowerCase();
      const checkpoint = { version: 1, node: `${lower}_tone_choice`, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, social_v2: 'yes', bond: 'care', conversation_before_clue: 'yes' }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint)); els.restart.click(); els.resume.click(); await flush();
      const light = story[`${lower}_tone_choice`].choices.find(c => c.set.private_tone === 'light');
      els.interaction.children.find(el => el.textContent === light.label).click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_light_input`].text);
      els.save.click();
      const saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.private_tone, 'light'); assert.equal(saved.flags.topic, 'light');
      assert.equal(saved.flags.personal_disclosure_seen, undefined);
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'PRIVATE LIGHT WORDS';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests.at(-1).player_says, 'PRIVATE LIGHT WORDS');
      assert.ok(requests.at(-1).scene.includes(story[`${lower}_light`].text));
      assert.ok(!requests.at(-1).scene.includes(story[`${lower}_private`].text));
      els.advance.click(); await flush(); els.save.click();
      const after = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(after.privateAnswer, 'PRIVATE LIGHT WORDS');
      assert.equal(after.flags.personal_disclosure_seen, undefined);
      for (const signal of ['private', 'repeat']) {
        after.node = 'mallow_input'; after.flags.signal = signal;
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(after)); els.restart.click(); els.resume.click(); await flush();
        els.interaction.children.find(el => el.id === 'player-message').value = 'GROUP WORDS';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const request = requests.at(-1);
        assert.equal(JSON.stringify(request).includes('PRIVATE LIGHT WORDS'), signal === 'repeat', 'only the player-authorized message reaches Mallow');
        assert.ok(!JSON.stringify(request).includes(story[`${lower}_private`].text));
      }
      for (const seen of [true, false]) {
        const endFlags = { companion: name, private_tone: 'light', topic: 'light', bond: 'care', ending: 'rescue' };
        if (seen) endFlags.light_close_seen = name;
        const end = { version: 1, node: `close_${lower}_input`, answer: '', privateAnswer: 'PRIVATE LIGHT WORDS', relationship: name, flags: endFlags, followupMemory: [] };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(end)); els.restart.click(); els.resume.click(); await flush();
        els.interaction.children.find(el => el.id === 'player-message').value = 'What comes next?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const request = requests.at(-1);
        const closing = story[name === 'Mira' ? 'close_mira_light_topic' : `close_${lower}_light`].text;
        assert.equal(request.scene.includes(closing), seen, `${name} gets only the witnessed light closing`);
        assert.ok(!(request.earlier_conversation || '').includes(story[`${lower}_private`].text));
        if (name === 'Mira') assert.ok(!request.scene.includes('workshop'), 'unseen workshop is absent');
        if (name === 'Niko') assert.ok(!request.scene.includes('is away'), 'unseen absence is absent');
        assert.ok(request.scene.length <= 1800);
      }
    }
    storageData.clear(); els['settings-open'].click(); els['settings-clear'].click(); els['settings-form'].submit(); els.restart.click();
  });
  await test('personal disclosure and topic visit markers survive a save', async () => {
    els['settings-clear'].click();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const topic of ['past', 'future']) {
      const lower = name.toLowerCase();
      const saved = { version: 1, node: `${lower}_private`, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, bond: 'play', topic }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.personal_disclosure_seen, `${lower}_private`);
      checkpoint.node = `${lower}_question_${topic}`;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint)); els.restart.click(); els.resume.click(); await flush();
      els.save.click();
      const visited = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(visited.flags.personal_disclosure_seen, `${lower}_private`);
      assert.equal(visited.flags.personal_topic_seen, `${lower}_${topic}`);
    }
  });
  await test('later private dialogue remembers only witnessed personal disclosures and the chosen question', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember that.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const topic of ['past', 'future']) {
      const lower = name.toLowerCase();
      for (const state of ['witnessed', 'legacy', 'mismatched']) {
        const flags = { companion: name, bond: 'play', topic, ending: 'rescue' };
        if (state === 'witnessed') Object.assign(flags, { personal_disclosure_seen: `${lower}_private`, personal_topic_seen: `${lower}_${topic}` });
        if (state === 'mismatched') Object.assign(flags, { personal_disclosure_seen: `${lower === 'niko' ? 'mira' : 'niko'}_private`, personal_topic_seen: `${lower}_${topic === 'past' ? 'future' : 'past'}` });
        const saved = { version: 1, node: `close_${lower}_input`, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
        els.interaction.children.find(el => el.id === 'player-message').value = 'Do you remember what you told me?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const request = requests.at(-1), earlier = request.earlier_conversation || '';
        const choice = story[`${lower}_question`].choices.find(item => item.set.topic === topic);
        const opposite = topic === 'past' ? 'future' : 'past';
        assert.equal(earlier.includes(story[`${lower}_private`].text), state === 'witnessed');
        assert.equal(earlier.includes(choice.label), state === 'witnessed');
        assert.equal(earlier.includes(story[`${lower}_question_${topic}`].text), state === 'witnessed');
        assert.ok(!earlier.includes(story[`${lower}_question_${opposite}`].text));
        assert.ok(earlier.length <= 900);
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And your answer?';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        assert.equal(requests.at(-1).earlier_conversation || '', earlier, 'follow-up keeps only the witnessed personal dialogue');
      }
    }
    const saved = { version: 1, node: 'mallow_input', answer: '', privateAnswer: '', relationship: 'Mira',
      flags: { companion: 'Mira', bond: 'play', topic: 'past', ending: 'rescue', personal_disclosure_seen: 'mira_private', personal_topic_seen: 'mira_past', signal: 'private' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'What should we do?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.equal(requests.at(-1).earlier_conversation, undefined, 'Mallow never receives the companion’s private disclosure');
  });
  await test('closing dialogue only receives witnessed personal facts on personal routes', async () => {
    const requests = [];
    globalThis.fetch = async (_url, request) => {
      requests.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am glad we can talk.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira']) {
      const lower = name.toLowerCase();
      const sensitive = name === 'Niko' ? /\baway\b/i : /art workshop/i;
      const cases = [
        { label: 'personal witnessed', tone: 'personal', disclosure: `${lower}_private`, expected: true },
        { label: 'legacy witnessed', disclosure: `${lower}_private`, expected: true },
        { label: 'light', tone: 'light', expected: false },
        { label: 'legacy missing marker', expected: false },
        { label: 'personal missing marker', tone: 'personal', expected: false },
        { label: 'wrong companion marker', tone: 'personal', disclosure: name === 'Niko' ? 'mira_private' : 'niko_private', expected: false },
        { label: 'contradictory light marker', tone: 'light', disclosure: `${lower}_private`, expected: false }
      ];
      for (const scenario of cases) {
        const flags = { companion: name, bond: 'play', topic: scenario.tone === 'light' ? 'light' : 'future', ending: 'rescue' };
        if (scenario.tone) flags.private_tone = scenario.tone;
        if (scenario.disclosure) flags.personal_disclosure_seen = scenario.disclosure;
        const saved = { version: 1, node: `close_${lower}_input`, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
        els.interaction.children.find(el => el.id === 'player-message').value = 'What do you remember?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const initial = requests.at(-1);
        assert.equal(sensitive.test(JSON.stringify(initial)), scenario.expected, `${name}: ${scenario.label}, initial`);
        assert.equal((initial.earlier_conversation || '').includes(story[`${lower}_private`].text), scenario.expected);
        els.interaction.children.find(el => el.textContent === 'Say more').click();
        els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Tell me more.';
        els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
        assert.equal(sensitive.test(JSON.stringify(requests.at(-1))), scenario.expected, `${name}: ${scenario.label}, follow-up`);
      }
    }
  });
  await test('optional group conversations ground the chosen card and keep private and Mallow histories separate', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    for (const name of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) for (const action of ['keep', 'tear']) {
      const lower = name.toLowerCase();
      const saved = { version: 1, node: `mid_${lower}_input`, answer: 'old group words',
        privateAnswer: 'private opening', privateFollowup: 'private followup', relationship: name,
        flags: { companion: name, bond, moment: action, midpoint_available: 'yes', midpoint_route: lower, midpoint_chat: 'yes' },
        followupMemory: [{ speaker: `Player to ${name}`, text: 'private opening' }, { speaker: name, text: 'private answer' }] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test';
      els['settings-form'].submit(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`mid_${lower}_input`].text, `restored midpoint ${name}/${bond}/${action}: ${els['save-status'].textContent}`);
      els.interaction.children.find(el => el.id === 'player-message').value = 'What do you see on the card?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      let request = requests.at(-1);
      assert.equal(request.character, name);
      assert.equal(request.player_says, 'What do you see on the card?');
      assert.deepEqual(request.memory, []);
      assert.ok(request.scene.includes(story[`mid_${lower}_input`].text), `${name}: the character's question is part of the scene`);
      const witnessed = story[`moment_${lower}_${bond}`].text
        .replace(/\bthe two of you\b/gi, `the player and ${name}`)
        .replace(/\byour\b/gi, match => match[0] === 'Y' ? "The player's" : "the player's")
        .replace(/\byou\b/gi, match => match[0] === 'Y' ? 'The player' : 'the player');
      assert.ok(request.activity_setup.includes(witnessed), `${name}/${bond} card must be grounded`);
      if (name === 'Niko' && bond === 'care') {
        assert.match(request.activity_setup, /only the player and Niko were at the machine\./);
        assert.doesNotMatch(request.activity_setup, /the two of the player/i);
      }
      const initialSetup = request.activity_setup;
      assert.doesNotMatch(request.activity_setup, /\byou(?:r)?\b/i, 'the player is not confused with the character');
      assert.match(request.activity_setup, action === 'keep' ? /player folded and kept the card/i : /player tore and kept the pieces/i);
      assert.doesNotMatch(JSON.stringify(request), /private opening|private followup|private answer|old group words/);
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Can we compare it again?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      request = requests.at(-1);
      assert.equal(request.player_says, 'Can we compare it again?');
      assert.equal(request.activity_setup, initialSetup, `${name}/${bond}: follow-up retains the same witnessed scene`);
      if (name === 'Niko' && bond === 'care') assert.match(request.activity_setup, /only the player and Niko were at the machine\./);
      assert.deepEqual(request.memory.map(entry => entry.text), ['What do you see on the card?', 'I am listening.']);
      assert.doesNotMatch(JSON.stringify(request), /private opening|private followup|private answer|old group words/);
      for (let i = 0; i < 8 && els['story-text'].textContent !== story.signal_choice.text; i++) {
        els.advance.click(); await flush();
      }
      assert.equal(els['story-text'].textContent, story.signal_choice.text);
      choiceAt('signal_choice', 0); await flush();
      assert.match(els['story-text'].textContent, /private followup/, 'the earlier private message remains the one offered for sharing');
      els.advance.click(); await flush();
      els.advance.click(); await flush();
      els.advance.click(); await flush(); // Mallow input
      els.interaction.children.find(el => el.id === 'player-message').value = 'Can you help us look?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      request = requests.at(-1);
      assert.equal(request.character, 'Mallow');
      assert.ok(request.memory.some(entry => entry.text === 'private followup'));
      assert.doesNotMatch(JSON.stringify(request), /What do you see on the card|Can we compare it again/);
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('completed midpoint exchange survives a save and reaches only the same companion’s closing chat', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember that too.' } }] });
    };
    const saved = { version: 1, node: 'mid_mira_input', answer: '', privateAnswer: 'Earlier private words', relationship: 'Mira',
      flags: { companion: 'Mira', bond: 'play', moment: 'keep', midpoint_available: 'yes', midpoint_route: 'mira', midpoint_chat: 'yes', topic: 'past' }, followupMemory: [] };
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'The eye scared me.';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Can we draw it differently?';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    els.advance.click(); await flush(); els.save.click();
    const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.deepEqual(checkpoint.midpointExchange, [
      { speaker: 'Player to Mira', text: 'Can we draw it differently?' },
      { speaker: 'Mira', text: 'I remember that too.' }
    ]);
    checkpoint.node = 'close_mira_input'; checkpoint.flags.ending = 'rescue';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(story.close_mira_input.input.prompt, 'What do you say to Mira?');
    els.interaction.children.find(el => el.id === 'player-message').value = 'What should we draw?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.deepEqual(requests.at(-1).public_conversation, checkpoint.midpointExchange);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Could it be blue?';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.deepEqual(requests.at(-1).public_conversation, checkpoint.midpointExchange);
    checkpoint.node = 'mallow_input'; checkpoint.flags.signal = 'private';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
    els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Can you help?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.equal(requests.at(-1).public_conversation, undefined);
    assert.doesNotMatch(JSON.stringify(requests.at(-1)), /draw it differently/);
    // A checkpoint from before this feature carries no invented exchange.
    delete checkpoint.midpointExchange; checkpoint.node = 'close_mira_input';
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
    els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Are you okay?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.equal(requests.at(-1).public_conversation, undefined);
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('midpoint recall tracks retries, written replacements and skipped pending responses', async () => {
    let mode = 'success';
    globalThis.fetch = async () => {
      if (mode === 'failed') throw new Error('unavailable');
      if (mode === 'pending') return new Promise(() => {});
      return jsonResponse({ choices: [{ message: { content: 'A generated answer.' } }] });
    };
    const base = { version: 1, node: 'mid_niko_input', answer: '', privateAnswer: 'private', relationship: 'Niko',
      flags: { companion: 'Niko', bond: 'care', moment: 'keep', midpoint_available: 'yes', midpoint_route: 'niko', midpoint_chat: 'yes' }, followupMemory: [] };
    async function begin() {
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
      els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
      els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'First public question';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    }
    function checkpoint() { els.save.click(); return JSON.parse(storageData.get('okie-dokie.arcade.v1')); }
    await begin();
    els.interaction.children.find(el => el.textContent === 'Use the written response').click();
    els.advance.click(); await flush();
    assert.deepEqual(checkpoint().midpointExchange.map(item => item.text), ['First public question', story.mid_niko_chat.ai.fallback]);

    await begin();
    els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised public question';
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    els.advance.click(); await flush();
    assert.deepEqual(checkpoint().midpointExchange.map(item => item.text), ['Revised public question', 'A generated answer.']);

    await begin();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Failed follow-up'; mode = 'failed';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    els.advance.click(); await flush();
    assert.deepEqual(checkpoint().midpointExchange.map(item => item.text), ['First public question', 'A generated answer.']);

    mode = 'success'; await begin();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Unanswered follow-up'; mode = 'pending';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
    assert.deepEqual(checkpoint().midpointExchange.map(item => item.text), ['First public question', 'A generated answer.']);

    // An explicit choice to skip the midpoint has no saved conversation.
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, node: 'shared_discovery', flags: { ...base.flags, midpoint_chat: 'no' } }));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(checkpoint().midpointExchange, undefined);
    mode = 'success'; storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('midpoint checkpoint data must be a bounded exchange with the selected companion', async () => {
    const base = { version: 1, node: 'close_niko_input', answer: '', privateAnswer: '', relationship: 'Niko',
      flags: { companion: 'Niko', midpoint_available: 'yes', midpoint_route: 'niko', midpoint_chat: 'yes' }, followupMemory: [] };
    const variants = [
      [{ speaker: 'Player to Mira', text: 'wrong companion' }, { speaker: 'Mira', text: 'reply' }],
      [{ speaker: 'Player to Niko', text: 'x'.repeat(501) }, { speaker: 'Niko', text: 'reply' }],
      [{ speaker: 'Player to Niko', text: 'question' }, { speaker: 'Niko', text: 'x'.repeat(701) }],
      [{ speaker: 'Player to Niko', text: 'question' }],
      [{ speaker: 'Player to Niko', text: 'question' }, { speaker: 'Niko', text: ' ' }]
    ];
    for (const midpointExchange of variants) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, midpointExchange }));
      els.restart.click(); assert.equal(els.resume.hidden, true);
    }
    storageData.clear(); els.restart.click();
  });

  await test('each midpoint conversation has responsive written options without an AI service', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('The offline option must not call a provider.'); };
    const options = {
      Niko: ['Do you think it was watching us?', 'I don’t know. But I’d like to check the machine with you when we get upstairs.'],
      Mira: ['Can we make something it can’t finish for us?', 'Yes. Let’s start with a blank page and decide for ourselves what goes on it.'],
      Ash: ['Can we check our map against it?', 'Yes. Keep your place beside me; I’ll unfold the map.']
    };
    for (const name of Object.keys(options)) {
      const lower = name.toLowerCase();
      const saved = { version: 1, node: `mid_${lower}_input`, answer: '', privateAnswer: 'Earlier private words', relationship: name,
        flags: { companion: name, bond: 'care', moment: 'keep', midpoint_available: 'yes', midpoint_route: lower, midpoint_chat: 'yes' }, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els['settings-clear'].click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.textContent === options[name][0]).click(); await flush();
      assert.equal(els['story-text'].textContent, options[name][1]);
      assert.equal(els.advance.hidden, false);
    }
    assert.equal(calls, 0);
    storageData.clear(); els.restart.click();
  });

  await test('only the witnessed companion reacts to their private conversation being overheard', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) {
      const lower = name.toLowerCase(), reaction = story[`signal_repeat_${lower}`];
      const saved = { version: 1, node: 'signal_repeat_react', answer: '', privateAnswer: 'only my chosen words', relationship: name,
        flags: { companion: name, signal: 'repeat', personal_disclosure_seen: `${lower}_private` }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els.speaker.textContent, name);
      assert.equal(els['story-text'].textContent, reaction.text);
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.shared_reaction_seen, name);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, reaction.text, 'save/resume restores the reaction');
      els.advance.click(); await flush(); // Mallow's request
      els.advance.click(); await flush(); // player input
      els.interaction.children.find(el => el.id === 'player-message').value = 'What should we do?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      let request = requests.at(-1);
      assert.ok(request.scene.includes(reaction.text), 'Mallow receives the reaction the group heard');
      assert.ok(!request.scene.includes(story[`${lower}_private`].text), 'Mallow does not receive the companion’s private disclosure');
      assert.equal(request.memory[0].text, 'only my chosen words', 'only the explicitly shared player line enters Mallow’s memory');
      const ending = { ...checkpoint, node: `close_${lower}_input`, flags: { ...checkpoint.flags, ending: 'rescue', bond: 'care', topic: 'past' } };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(ending)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What did you think?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      request = requests.at(-1);
      assert.ok(request.earlier_conversation.includes(reaction.text), 'the companion remembers their witnessed response');
      assert.ok(request.earlier_conversation.length <= 900);
      for (const flags of [
        { companion: name, signal: 'repeat' },
        { companion: name, signal: 'repeat', personal_disclosure_seen: `${name === 'Niko' ? 'mira' : 'niko'}_private` },
        { companion: name, signal: 'private', personal_disclosure_seen: `${lower}_private` }
      ]) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...saved, flags })); els.restart.click(); els.resume.click(); await flush();
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.mallow_request.text, 'old or inconsistent saves skip the new reaction');
      }
    }
    storageData.clear(); els.restart.click();
  });

  await test('keeping a private exchange brings only the witnessed companion response into later dialogue', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) {
      const lower = name.toLowerCase(), reaction = story[`signal_private_${lower}`];
      const saved = { version: 1, node: 'signal_private_receipt', answer: '', privateAnswer: 'not for the group', relationship: name,
        flags: { companion: name, signal: 'private', private_reaction_due: 'yes', personal_disclosure_seen: `${lower}_private` }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, reaction.text);
      assert.ok(!els['story-text'].textContent.includes('not for the group'));
      els.save.click();
      const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(checkpoint.flags.private_reaction_seen, name);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, reaction.text, 'save/resume restores the response');
      els.advance.click(); await flush();
      els.advance.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What should we do?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      let request = requests.at(-1);
      assert.ok(request.scene.includes(name === 'Niko' ? 'Thanks for keeping it between us.' : name === 'Mira' ? 'I wanted you to hear me' : 'keeping our conversation here'));
      assert.ok(!JSON.stringify(request).includes('not for the group'), 'private player text is not sent to Mallow');
      assert.ok(!request.scene.includes(story[`${lower}_private`].text));
      const ending = { ...checkpoint, node: `close_${lower}_input`, flags: { ...checkpoint.flags, ending: 'rescue', bond: 'care', topic: 'past' } };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(ending)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What did you think?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      request = requests.at(-1);
      assert.ok(request.earlier_conversation.includes(name === 'Niko' ? 'Thanks for keeping it between us.' : name === 'Mira' ? 'I wanted you to hear me' : 'keeping our conversation here'));
      assert.ok(request.earlier_conversation.length <= 900);
      for (const flags of [
        { companion: name, signal: 'private', personal_disclosure_seen: `${lower}_private` },
        { companion: name, signal: 'private', private_reaction_due: 'yes', personal_disclosure_seen: `${name === 'Niko' ? 'mira' : 'niko'}_private` },
        { companion: name, signal: 'repeat', private_reaction_due: 'yes', personal_disclosure_seen: `${lower}_private` }
      ]) {
        storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...saved, flags })); els.restart.click(); els.resume.click(); await flush();
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.signal_private_reply.text, 'old or inconsistent saves retain the prior path');
      }
    }
    storageData.clear(); els.restart.click();
  });

  await test('post-reveal Mallow conversation preserves earlier evidence and excludes private history', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'We can try to help together.' } }] });
    };
    const base = { version: 1, node: 'policy_mallow_choice', answer: 'ORIGINAL GROUP EVIDENCE', publicReply: 'ORIGINAL MALLOW REPLY',
      privateAnswer: 'SECRET PRIVATE ANSWER', privateFollowup: 'SECRET PRIVATE FOLLOWUP', relationship: 'Niko',
      flags: { companion: 'Niko', signal: 'repeat', public_reply_available: 'yes' },
      followupMemory: [{ speaker: 'Player to Niko', text: 'SECRET PRIVATE HISTORY' }, { speaker: 'Niko', text: 'PRIVATE REPLY' }] };
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
    els.restart.click(); els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    els.resume.click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Talk to Mallow while the others work.').click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Can you choose differently?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Can we help Mira?';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.doesNotMatch(JSON.stringify(request), /SECRET PRIVATE|PRIVATE REPLY|ORIGINAL GROUP EVIDENCE|ORIGINAL MALLOW REPLY/);
      assert.match(request.scene, /set up to use choices as feedback/);
    }
    assert.match(JSON.stringify(requests[1]), /Can you choose differently/);
    els.advance.click(); await flush(); els.save.click();
    const checkpoint = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.equal(checkpoint.answer, 'ORIGINAL GROUP EVIDENCE');
    assert.equal(checkpoint.publicReply, 'ORIGINAL MALLOW REPLY');
    assert.deepEqual(checkpoint.reflectionExchange, [
      { speaker: 'Player to Mallow', text: 'Can we help Mira?' },
      { speaker: 'Mallow', text: 'We can try to help together.' }
    ]);
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.policy_mallow_after_reflection.text);
    assert.deepEqual(els.interaction.children.map(el => el.textContent), story.policy_mallow_after_reflection.choices.map(choice => choice.label));
    els.interaction.children[0].click(); await flush(); els.save.click();
    assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.mallow_response, 'voice');
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('witnessed Mallow reflection reaches only the chosen companion, including after resume and retries', async () => {
    const settingsMarkup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(settingsMarkup, /Later dialogue requests can include earlier private and group exchanges as context/);
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I remember.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    assert.match(story.mallow_reflection_input.text, /Mira can hear through the door/);
    for (const [name, retreat] of [['Niko', false], ['Mira', false], ['Ash', false], ['Ash', true]]) {
      const lower = name.toLowerCase(), node = `close_${lower}${retreat ? '_retreat' : ''}_input`;
      const exchange = [{ speaker: 'Player to Mallow', text: 'R'.repeat(500) }, { speaker: 'Mallow', text: 'M'.repeat(700) }];
      const prior = [{ speaker: `Player to ${name}`, text: 'Earlier group question' }, { speaker: name, text: 'Earlier group response' }];
      const checkpoint = { version: 1, node, answer: '', privateAnswer: 'Earlier private words', relationship: name,
        flags: { companion: name, bond: 'care', topic: 'past', ending: retreat ? 'retreat' : 'rescue', midpoint_available: 'yes',
          midpoint_route: lower, midpoint_chat: 'yes', reflection_selected: 'yes', reflection_seen: 'yes' },
        followupMemory: [{ speaker: `Player to ${name}`, text: 'Earlier private words' }, { speaker: name, text: 'Earlier private reply' }],
        midpointExchange: prior, reflectionExchange: exchange };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(story[node].input.prompt, `What do you say to ${name}?`);
      els.interaction.children.find(el => el.id === 'player-message').value = 'What did you hear?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.deepEqual(requests.at(-1).mallow_group_conversation, exchange);
      assert.deepEqual(requests.at(-1).public_conversation, prior);
      assert.ok(requests.at(-1).memory.some(entry => entry.text === 'Earlier private words'));
      els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And Mallow?';
      els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
      assert.deepEqual(requests.at(-1).mallow_group_conversation, exchange, 'retry retains the public reflection');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'What now?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.deepEqual(requests.at(-1).mallow_group_conversation, exchange, 'follow-up retains the public reflection');
      assert.deepEqual(requests.at(-1).public_conversation, prior);
      // An old save has no reflection to recall.
      delete checkpoint.reflectionExchange; delete checkpoint.flags.reflection_selected; delete checkpoint.flags.reflection_seen;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'Are you okay?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests.at(-1).mallow_group_conversation, undefined);
      // A different character's closing scene must not receive the selected companion's memories.
      checkpoint.reflectionExchange = exchange; checkpoint.flags.reflection_selected = 'yes'; checkpoint.flags.reflection_seen = 'yes';
      checkpoint.node = name === 'Mira' ? 'close_niko_input' : 'close_mira_input';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(checkpoint)); els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'Can you hear me?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.equal(requests.at(-1).mallow_group_conversation, undefined);
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('Mallow reflection knows only the witnessed audit outcome, including follow-ups', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I hear you.' } }] });
    };
    const base = { version: 1, node: 'policy_mallow_choice', answer: 'GROUP SECRET', privateAnswer: 'PRIVATE SECRET',
      annotation: 'RECEIPT SECRET', relationship: 'Niko', followupMemory: [],
      flags: { companion: 'Niko', vote_a: 'warm', vote_b: 'direct', card_preference: 'warm', notice_preference: 'direct' } };
    const outcomes = {
      cover: 'Your view of the counter is blocked. You can still hear the crew.',
      annotate: 'Ash said the writing had not opened the door.',
      leave: 'Niko said to leave the slip and the lens alone.',
      unplug: 'The player said the printer was unplugged and the screen was still on.'
    };
    const cases = [
      ...Object.keys(outcomes).map(action => ({ flags: { audit_seen: 'yes', audit_action: action,
        ...(action === 'annotate' ? { annotation_written: 'yes', audit_seal_seen: 'yes' } : {}) }, expected: outcomes[action] })),
      { flags: { audit_seen: 'yes', audit_action: 'annotate' }, expected: outcomes.annotate }, // old fixed annotation
      { flags: { audit_action: 'cover' }, expected: '' }, // action without witnessed audit
      { flags: { audit_seen: 'yes' }, expected: '' }, // old checkpoint without an action
      { flags: {}, expected: '' },
      { flags: { audit_seen: 'yes', audit_action: 'cover', card_preference: 'direct', notice_preference: 'direct' }, expected: outcomes.cover, style: 'clear, direct tone' },
      { flags: { audit_seen: 'yes', audit_action: 'cover', card_preference: 'warm', notice_preference: 'warm' }, expected: outcomes.cover, style: 'warm, reassuring tone' },
      { flags: { audit_seen: 'yes', audit_action: 'cover', card_preference: 'skip', notice_preference: 'skip' }, expected: outcomes.cover }
    ];
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const { flags, expected, style } of cases) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, flags: { ...base.flags, ...flags } }));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Talk to Mallow while the others work.').click(); await flush();
      assert.equal(els['story-text'].textContent, story.mallow_reflection_input.text);
      els.interaction.children.find(el => el.id === 'player-message').value = 'What happened?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'And now?';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.equal(requests.length, 2, 'the first turn and follow-up both reach the model');
      for (const request of requests.splice(0)) {
        assert.ok(request.scene.length <= 1800);
        assert.doesNotMatch(JSON.stringify(request), /GROUP SECRET|PRIVATE SECRET|RECEIPT SECRET/);
        for (const outcome of Object.values(outcomes)) assert.equal(request.scene.includes(outcome), outcome === expected);
        for (const tone of ['clear, direct tone', 'warm, reassuring tone']) assert.equal(request.scene.includes(tone), tone === style);
      }
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('post-reveal conversation handles offline, retry, cancellation and old or invalid saves', async () => {
    let mode = 'success', calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (mode === 'pending') return new Promise(() => {});
      if (mode === 'failed') throw new Error('unavailable');
      return jsonResponse({ choices: [{ message: { content: 'A generated answer.' } }] });
    };
    const base = { version: 1, node: 'policy_mallow_choice', answer: 'earlier', privateAnswer: 'private', relationship: 'Niko',
      flags: { companion: 'Niko', signal: 'private' }, followupMemory: [] };
    async function begin(connected) {
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
      els.restart.click(); els['settings-clear'].click();
      if (connected) { els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit(); }
      els.resume.click(); await flush();
      els.interaction.children.find(el => el.textContent === 'Talk to Mallow while the others work.').click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'First question';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    }
    function checkpoint() { els.save.click(); return JSON.parse(storageData.get('okie-dokie.arcade.v1')); }
    await begin(false);
    assert.equal(calls, 0);
    assert.equal(els['story-text'].textContent, story.mallow_reflection_chat.ai.fallback);
    els.advance.click(); await flush();
    assert.deepEqual(checkpoint().reflectionExchange.map(item => item.text), ['First question', story.mallow_reflection_chat.ai.fallback]);
    mode = 'success'; await begin(true);
    els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised question';
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    els.advance.click(); await flush();
    assert.deepEqual(checkpoint().reflectionExchange.map(item => item.text), ['Revised question', 'A generated answer.']);
    await begin(true);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Failed question'; mode = 'failed';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    els.advance.click(); await flush();
    let retained = checkpoint();
    assert.deepEqual(retained.reflectionExchange.map(item => item.text), ['First question', 'A generated answer.']);
    assert.equal(retained.reflectionUnanswered, 'Failed question');
    els.restart.click(); els.resume.click(); await flush();
    assert.ok(els['story-history-list'].children.some(el => el.textContent === 'You to Mallow (unanswered): Failed question'));
    assert.equal(checkpoint().reflectionUnanswered, 'Failed question', 'restored unanswered text survives another save');
    mode = 'success'; await begin(true);
    els.interaction.children.find(el => el.textContent === 'Say more').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Unanswered question'; mode = 'pending';
    els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
    // Simulate iOS 15.0–15.3 WebKit, which lacks Array.prototype.at. The
    // save must still preserve both the completed and unanswered messages.
    const atDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'at');
    try { delete Array.prototype.at; els.save.click(); }
    finally { Object.defineProperty(Array.prototype, 'at', atDescriptor); }
    assert.match(els['save-status'].textContent, /Story saved on this device/);
    retained = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
    assert.deepEqual(retained.reflectionExchange.map(item => item.text), ['First question', 'A generated answer.']);
    assert.equal(retained.reflectionUnanswered, 'Unanswered question');
    els.restart.click(); els.resume.click(); await flush();
    assert.ok(els['story-history-list'].children.some(el => el.textContent === 'You to Mallow (unanswered): Unanswered question'));
    assert.equal(checkpoint().reflectionUnanswered, 'Unanswered question');
    mode = 'success'; await begin(true);
    els.interaction.children.find(el => el.textContent === 'Edit or retry your first message').click();
    els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Revised unanswered question'; mode = 'pending';
    els.interaction.children.find(el => el.textContent === 'Send revised message →').click(); await flush();
    els.interaction.children.find(el => el.textContent === 'Continue without waiting').click(); await flush();
    retained = checkpoint();
    assert.equal(retained.reflectionUnanswered, 'Revised unanswered question');
    assert.equal(retained.reflectionExchange, undefined, 'a skipped first-message retry has no completed reply');
    els.restart.click(); els.resume.click(); await flush();
    assert.ok(els['story-history-list'].children.some(el => el.textContent === 'You to Mallow (unanswered): Revised unanswered question'));
    assert.equal(checkpoint().reflectionUnanswered, 'Revised unanswered question');
    for (const reflectionExchange of [
      [{ speaker: 'Player to Mallow', text: 'x'.repeat(501) }, { speaker: 'Mallow', text: 'reply' }],
      [{ speaker: 'Player to Mallow', text: 'question' }, { speaker: 'Niko', text: 'reply' }],
      [{ speaker: 'Player to Mallow', text: 'question' }]
    ]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, reflectionExchange, flags: { ...base.flags, reflection_selected: 'yes', reflection_seen: 'yes' } }));
      els.restart.click(); assert.equal(els.resume.hidden, true);
    }
    for (const reflectionUnanswered of ['', 'x'.repeat(501), 42]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, reflectionUnanswered, flags: { ...base.flags, reflection_selected: 'yes', reflection_seen: 'yes' } }));
      els.restart.click(); assert.equal(els.resume.hidden, true);
    }
    storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, reflectionUnanswered: 'question' }));
    els.restart.click(); assert.equal(els.resume.hidden, true, 'an unanswered reflection requires a witnessed conversation');
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(base)); els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.policy_mallow_choice.text, 'old checkpoint remains playable');
    assert.equal(checkpoint().reflectionExchange, undefined);
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('retreat closing reaches witnessed callbacks without redundant transitions', async () => {
    const base = { version: 1, node: 'retreat_early_search_sound', answer: '', privateAnswer: '', relationship: 'Mira',
      flags: { companion: 'Mira', ending: 'retreat', retreat_search_early: 'yes', retreat_search: 'sound',
        evidence: 'receipt', keepsake: 'star', moment: 'keep', private_tone: 'personal' }, followupMemory: [] };
    // Resuming directly on the search renders that scene and records the marker.
    storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
    els.restart.click(); els.resume.click(); await flush();
    assert.equal(els['story-text'].textContent, story.retreat_early_search_sound.text);
    els.save.click();
    assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.compact_retreat_closing, 'yes');
    els.restart.click(); els.resume.click(); await flush();
    for (const id of ['close_evidence_receipt', 'kit_check', 'close_star', 'souvenir_kept', 'close_mira_retreat']) {
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[id].text, `the next meaningful passage is ${id}`);
    }
    for (const [node, next] of [['kit_check', 'keepsake_check'], ['close_star', 'souvenir_pocket'], ['souvenir_kept', 'close_mira_check']]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, node, flags: { ...base.flags, retreat_search_seen: 'sound' } }));
      els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[next].text, `an older ${node} checkpoint retains its transition`);
    }
    storageData.clear(); els.restart.click();
  });

  await test('retreat keeps Mallow reflections with the search and preserves old checkpoints', async () => {
    els['settings-clear'].click();
    const base = { version: 1, node: 'close_signal', answer: '', privateAnswer: '', relationship: 'Niko',
      flags: { companion: 'Niko', ending: 'retreat' }, followupMemory: [] };
    for (const signal of ['private', 'repeat']) for (const early of [false, true]) {
      const flags = { ...base.flags, signal, retreat_fort_closing_due: 'yes', ...(early ? { retreat_search_early: 'yes', retreat_search: 'stair', retreat_search_seen: 'stair' } : {}) };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, flags }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els.stage.dataset.location, 'hideout');
      assert.match(els['story-text'].textContent, /Mallow.*arcade shelf/i);
      els.advance.click(); await flush();
      assert.equal(els.stage.dataset.location, 'hideout');
      assert.match(els['story-text'].textContent, signal === 'private' ? /did not let Mallow repeat.*private/i : /words you let Mallow repeat/i);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els.stage.dataset.location, 'hideout', 'the revised passage survives save and resume');
      els.advance.click(); await flush();
      assert.equal(els.stage.dataset.location, 'hideout');
      assert.match(els['story-text'].textContent, /Ash keeps the map open/i);
      els.advance.click(); await flush();
      if (early) assert.ok(els['story-text'].textContent.startsWith(story.close_reason_retreat.text.replace('{retreatEcho}', '')));
      else {
        assert.equal(els['story-text'].textContent, 'Niko has one hand on the door. The boards give a quiet knock beneath you. Where should you start looking?');
        assert.deepEqual(els.interaction.children.map(child => child.textContent), story.retreat_search_choice.choices.map(choice => choice.label));
      }
    }
    for (const signal of ['private', 'repeat']) {
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, flags: { ...base.flags, signal } }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els.stage.dataset.location, 'arcade');
      assert.equal(els['story-text'].textContent, story.close_signal.text);
      els.advance.click(); await flush();
      assert.equal(els.stage.dataset.location, 'arcade');
      assert.equal(els['story-text'].textContent, story[signal === 'repeat' ? 'close_repeat' : 'close_private'].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.retreat_search_return.text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.retreat_search_choice.text, 'legacy late-search text remains unchanged');
    }
    storageData.clear(); els.restart.click();
  });

  await test('post-rescue Mallow check-in respects both choices, save/resume and old checkpoints', async () => {
    els['settings-clear'].click();
    const echo = ' A soft sound comes from somewhere beyond the fort. It follows the rhythm of your question, without any words.';
    const base = { version: 1, node: 'close_signal', answer: '', privateAnswer: '', relationship: 'Niko',
      flags: { companion: 'Niko', ending: 'rescue', signal: 'private' }, followupMemory: [] };
    for (const ending of ['rescue', 'record']) for (const action of ['speak', 'rejoin']) {
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, flags: { ...base.flags, ending } }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_signal.text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_private.text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_mallow_ack_choice.text);
      els.save.click();
      assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.mallow_ack_due, 'yes');
      const savedChoice = storageData.get('okie-dokie.arcade.v1');
      els.interaction.children[action === 'speak' ? 0 : 1].click(); await flush();
      assert.equal(els['story-text'].textContent, action === 'speak' ? story.close_mallow_ack_speak.text : story.close_reason.text);
      if (action === 'speak') {
        els.advance.click(); await flush();
        assert.equal(els['story-text'].textContent, story.close_reason.text + echo);
        els.save.click();
        assert.equal(JSON.parse(storageData.get('okie-dokie.arcade.v1')).flags.mallow_ack_seen, 'speak');
        els.restart.click(); els.resume.click(); await flush();
        assert.equal(els['story-text'].textContent, story.close_reason.text + echo, 'the heard echo survives save and resume');
        storageData.set('okie-dokie.arcade.v1', savedChoice);
      }
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_mallow_ack_choice.text, 'saved choice restores');
    }
    for (const flags of [
      { ...base.flags, mallow_ack_due: 'yes', mallow_ack: 'speak' }, // checkpoint predating the visit marker
      { ...base.flags, mallow_ack: 'speak', mallow_ack_seen: 'speak' }, // no witnessed arcade return
      { ...base.flags, mallow_ack_due: 'yes', mallow_ack: 'rejoin', mallow_ack_seen: 'speak' },
      { ...base.flags, ending: 'mallow', mallow_ack_due: 'yes', mallow_ack: 'speak', mallow_ack_seen: 'speak' },
      { ...base.flags, ending: 'retreat', mallow_ack_due: 'yes', mallow_ack: 'speak', mallow_ack_seen: 'speak' }
    ]) {
      storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, node: 'close_reason', flags }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_reason.text, 'old or inconsistent saves do not invent the question');
    }
    // An older save already past the arcade return has no new visit marker.
    for (const node of ['close_private', 'close_repeat']) {
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify({ ...base, node }));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[node].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_reason.text, 'old save keeps its continuation');
    }
    storageData.clear(); els.restart.click();
  });

  await test('a companion can answer an optional invitation and recall it after saving', async () => {
    els['settings-clear'].click();
    for (const name of ['Niko', 'Mira', 'Ash']) {
      const lower = name.toLowerCase();
      const base = { version: 1, node: `${lower}_connection_choice`, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, match_label_seen: name }, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_connection_choice`].text);
      els.interaction.children[1].click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_connection_date`].text);
      els.save.click();
      let saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(saved.flags.connection_choice, 'ask');
      assert.equal(saved.flags.connection_seen, name);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_connection_date`].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, name === 'Mira' ? 'Mira offers you the loose ear and a pencil.' : story[`${lower}_bond_choice`].text);
      saved.node = 'close_signal'; saved.flags.ending = 'rescue'; saved.flags.signal = 'private';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush();
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`close_connection_${lower}`].text);
      els.advance.click(); await flush(); assert.equal(els['story-text'].textContent, story.close_private.text);
      // The player can remain teammates; no romantic callback is invented.
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(base));
      els.restart.click(); els.resume.click(); await flush(); els.interaction.children[0].click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_connection_team`].text);
      els.save.click(); saved = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      saved.node = 'close_signal'; saved.flags.ending = 'rescue'; saved.flags.signal = 'private';
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story.close_private.text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('witnessed date moments preserve the chosen action through save and Mallow continuation', async () => {
    els['settings-clear'].click();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const moment of ['now', 'later']) for (const signal of ['private', 'repeat']) {
      const lower = name.toLowerCase();
      const flags = { companion: name, connection_choice: 'ask', connection_seen: name, connection_late_seen: name,
        connection_moment_due: name, signal, ending: 'rescue' };
      const saved = { version: 1, node: 'close_signal', answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
      const choiceId = `close_connection_${lower}_moment`;
      const responseId = `close_connection_${lower}_${moment}`;
      assert.equal(els['story-text'].textContent, story[choiceId].text);
      assert.deepEqual(els.interaction.children.map(el => el.textContent), story[choiceId].choices.map(choice => choice.label));
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[choiceId].text);
      choiceAt(choiceId, moment === 'now' ? 0 : 1); await flush();
      assert.equal(els['story-text'].textContent, story[responseId].text);
      let snapshot = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(snapshot.node, choiceId, 'existing save remains until explicitly replaced');
      els.save.click(); snapshot = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(snapshot.flags.connection_moment, moment);
      assert.equal(snapshot.flags.connection_moment_seen, `${name}_${moment}`);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[responseId].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[signal === 'repeat' ? 'close_repeat' : 'close_private'].text);
    }
    storageData.clear(); els.restart.click();
  });

  await test('date scenes preserve both choices through resume, private dialogue and their later callback', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const kind of ['playful', 'curious']) {
      const lower = name.toLowerCase();
      const flags = { companion: name, social_v2: 'yes', date_scene_due: 'yes', late_connection_due: name,
        connection_choice: 'ask', connection_seen: name, connection_late_seen: name, bond: 'care' };
      const saved = { version: 1, node: `${lower}_connection_date_late`, answer: '', privateAnswer: '', relationship: name, flags, followupMemory: [] };
      storageData.clear(); storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved));
      els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
      const promptId = `${lower}_date_moment`;
      const responseId = `${lower}_date_${kind}`;
      assert.equal(els['story-text'].textContent, story[promptId].text);
      assert.equal(els.portrait.hidden, false); assert.equal(els.portrait.src, `./assets/${lower}.png`);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[promptId].text);
      const choice = story[promptId].choices.find(item => item.set.date_moment === kind);
      els.interaction.children.find(el => el.textContent === choice.label).click(); await flush();
      assert.equal(els['story-text'].textContent, story[responseId].text);
      els.save.click(); const snapshot = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(snapshot.flags.date_moment_seen, `${lower}_${kind}`);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[responseId].text);
      els.advance.click(); await flush();
      const activity = `${lower}_date_activity`;
      assert.equal(els['story-text'].textContent, story[activity].text);
      assert.equal(els.portrait.hidden, false);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[activity].text, 'shared date activity survives save and resume');
      const activityChoice = kind === 'playful' ? 0 : 1;
      const activityReply = story[activity].choices[activityChoice].next;
      choiceAt(activity, activityChoice); await flush();
      assert.equal(els['story-text'].textContent, story[activityReply].text);
      els.save.click();
      const activitySnapshot = JSON.parse(storageData.get('okie-dokie.arcade.v1'));
      assert.equal(activitySnapshot.flags.date_activity_seen, `${lower}_${story[activity].choices[activityChoice].set.date_activity}`);
      els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[activityReply].text, 'date response survives save and resume');
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_tone_choice`].text);
      assert.equal(els.portrait.hidden, false);
      choiceAt(`${lower}_tone_choice`, 0); await flush(); els.advance.click(); await flush();
      assert.equal(els.portrait.hidden, false);
      els.interaction.children.find(el => el.id === 'player-message').value = 'What are you thinking?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      const context = JSON.stringify(requests.at(-1));
      assert.ok(context.includes(choice.label), 'selected date choice is remembered');
      assert.ok(context.includes(story[responseId].text), 'witnessed response is remembered');
      assert.ok(context.includes('While planning a future date together'), 'AI is not told the date already happened');
      assert.ok(requests.at(-1).date_moment.includes(choice.label), 'date uses its own bounded field');
      assert.ok(requests.at(-1).date_moment.includes(story[activity].text), 'AI sees the witnessed shared activity');
      assert.ok(requests.at(-1).date_moment.includes(story[activity].choices[activityChoice].label), 'AI sees the witnessed activity choice');
      assert.ok(requests.at(-1).date_moment.includes(story[activityReply].text), 'AI sees the witnessed activity reply');
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Tell me more.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.ok(JSON.stringify(requests.at(-1)).includes(choice.label), 'follow-up remembers the same choice');
      assert.ok(requests.at(-1).date_moment.includes(choice.label), 'follow-up preserves the separate date field');
      assert.ok(requests.at(-1).date_moment.includes(story[activityReply].text), 'follow-up preserves the witnessed activity reply');
      const unobserved = { ...snapshot, node: `${lower}_input`, flags: { ...snapshot.flags } };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(unobserved));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What are you thinking?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(!requests.at(-1).date_moment?.includes(story[activityReply].text), 'unseen activity is omitted');
      for (const forged of [{ date_activity_seen: 'someone_else' }, { date_activity: 'forged' }]) {
        const invalid = { ...activitySnapshot, node: `${lower}_input`, flags: { ...activitySnapshot.flags, ...forged } };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(invalid));
        els.restart.click();
        assert.equal(els.resume.hidden, true, 'forged activity flags are rejected before resume');
      }
      const unseen = { ...snapshot, node: `${lower}_input`, flags: { ...snapshot.flags } };
      delete unseen.flags.date_moment_seen;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(unseen));
      els.restart.click(); els.resume.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What are you thinking?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      assert.ok(!JSON.stringify(requests.at(-1)).includes('While planning a future date together'), 'unseen moment is omitted from AI context');
      assert.equal(requests.at(-1).date_moment, undefined, 'unseen date field is omitted');
      snapshot.node = 'close_signal'; snapshot.flags.ending = 'rescue'; snapshot.flags.signal = 'private';
      snapshot.flags.connection_moment_due = name;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(snapshot));
      els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
      const closing = `close_connection_${lower}_moment`;
      assert.ok(els['story-text'].textContent.startsWith(story[closing].text));
      assert.notEqual(els['story-text'].textContent, story[closing].text, 'selected moment has a later callback');
      delete snapshot.flags.date_moment_seen;
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(snapshot));
      els.restart.click(); els.resume.click(); await flush(); els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[closing].text, 'an unseen response cannot be recalled');
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('later invitations preserve the chosen response through save, private dialogue and follow-up', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) for (const connection of ['team', 'ask']) {
      const lower = name.toLowerCase();
      const saved = { version: 1, node: `${lower}_connection_late`, answer: '', privateAnswer: '', relationship: name,
        flags: { companion: name, match_label_seen: name, late_connection_due: name, bond: 'care', social_v2: 'yes', conversation_before_clue: 'yes' }, followupMemory: [] };
      storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_connection_late`].text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      const selected = story[`${lower}_connection_late`].choices.find(item => item.set.connection_choice === connection);
      const other = story[`${lower}_connection_late`].choices.find(item => item.set.connection_choice !== connection);
      els.interaction.children.find(el => el.textContent === selected.label).click(); await flush();
      assert.equal(els['story-text'].textContent, story[selected.next].text);
      els.save.click(); els.restart.click(); els.resume.click(); await flush();
      assert.equal(els['story-text'].textContent, story[selected.next].text);
      els.advance.click(); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_tone_choice`].text);
      choiceAt(`${lower}_tone_choice`, 0); await flush();
      assert.equal(els['story-text'].textContent, story[`${lower}_private`].text);
      els.advance.click(); await flush();
      els.interaction.children.find(el => el.id === 'player-message').value = 'What are you thinking?';
      els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
      let exchange = requests.at(-1).connection_exchange;
      assert.equal(exchange.player_choice, selected.label);
      assert.equal(exchange.character_reply, story[selected.next].text);
      assert.ok(!JSON.stringify(exchange).includes(other.label));
      els.interaction.children.find(el => el.textContent === 'Say more').click();
      els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Tell me more.';
      els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
      assert.deepEqual(requests.at(-1).connection_exchange, exchange);
    }
    // A stale marker without the observed reply cannot leak a choice into AI.
    const invalid = { version: 1, node: 'mira_input', answer: '', privateAnswer: '', relationship: 'Mira',
      flags: { companion: 'Mira', late_connection_due: 'Mira', connection_choice: 'ask', connection_seen: 'Mira' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(invalid)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'What are you thinking?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.equal(requests.at(-1).connection_exchange, undefined);
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('only the chosen companion receives the witnessed relationship choice in private AI dialogue', async () => {
    const requests = [];
    globalThis.fetch = async (_url, details) => {
      requests.push(JSON.parse(JSON.parse(details.body).messages[1].content));
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    for (const name of ['Niko', 'Mira', 'Ash']) {
      const lower = name.toLowerCase();
      for (const connection of ['ask', 'team']) {
        const base = { version: 1, node: `${lower}_input`, answer: '', privateAnswer: '', relationship: name,
          flags: { companion: name, connection_choice: connection, connection_seen: name }, followupMemory: [] };
        for (const witnessed of [true, false]) {
        const saved = { ...base, flags: { ...base.flags, ...(witnessed ? {} : { connection_seen: name === 'Niko' ? 'Mira' : 'Niko' }) } };
        storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
        els.interaction.children.find(el => el.id === 'player-message').value = 'What are you thinking?';
        els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
        const exchange = requests.at(-1).connection_exchange;
        if (witnessed) {
          const selected = story[`${lower}_connection_choice`].choices.find(item => item.set.connection_choice === connection);
          const unselected = story[`${lower}_connection_choice`].choices.find(item => item.set.connection_choice !== connection);
          assert.equal(exchange.player_choice, selected.label);
          assert.equal(exchange.character_reply, story[selected.next].text);
          assert.ok(!JSON.stringify(exchange).includes(unselected.label), 'the unchosen alternative is not sent');
          els.interaction.children.find(el => el.textContent === 'Say more').click();
          els.interaction.children.find(el => el.id === 'player-follow-up').value = 'Tell me more.';
          els.interaction.children.find(el => el.textContent === 'Send follow-up →').click(); await flush();
          assert.deepEqual(requests.at(-1).connection_exchange, exchange, 'follow-up retains the same witnessed answer');
          const closing = { ...base, node: `close_${lower}_input`, flags: { ...base.flags, ending: 'rescue' } };
          storageData.set('okie-dokie.arcade.v1', JSON.stringify(closing)); els.restart.click(); els.resume.click(); await flush();
          els.interaction.children.find(el => el.id === 'player-message').value = 'I am glad you are here.';
          els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
          assert.deepEqual(requests.at(-1).connection_exchange, exchange, 'the same companion can recall the invitation in their closing chat');
          const group = { ...base, node: 'mallow_input' };
          storageData.set('okie-dokie.arcade.v1', JSON.stringify(group)); els.restart.click(); els.resume.click(); await flush();
          els.interaction.children.find(el => el.id === 'player-message').value = 'What should we do?';
          els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
          assert.equal(requests.at(-1).connection_exchange, undefined, 'private invitation is not sent to Mallow');
        } else assert.equal(exchange, undefined, 'a different companion cannot witness this answer');
        }
      }
    }
    storageData.clear(); els.restart.click(); els['settings-clear'].click();
  });

  await test('a maximum-length knight name does not displace closing rescue context', async () => {
    let request;
    globalThis.fetch = async (_url, details) => {
      request = JSON.parse(JSON.parse(details.body).messages[1].content);
      return jsonResponse({ choices: [{ message: { content: 'I am listening.' } }] });
    };
    els['settings-clear'].click(); els.endpoint.value = 'https://example.invalid/chat'; els.model.value = 'test'; els['settings-form'].submit();
    const saved = { version: 1, node: 'close_mira_input', answer: '', privateAnswer: '', relationship: 'Mira', knightName: '"'.repeat(40),
      flags: { companion: 'Mira', bond: 'play', knight_named: 'yes', named_card_seen: 'yes', topic: 'past', ending: 'rescue', evidence: 'voice', confirm_pressed: 'yes', confirm_result_seen: 'yes', mallow_response: 'voice', route_action: 'proof', vote_a: 'warm', vote_b: 'direct', card_preference: 'warm', notice_preference: 'direct', audit_seen: 'yes', audit_action: 'unplug', door_effort: 'listen', rescue_topic_seen: 'mira_past' }, followupMemory: [] };
    storageData.set('okie-dokie.arcade.v1', JSON.stringify(saved)); els.restart.click(); els.resume.click(); await flush();
    els.interaction.children.find(el => el.id === 'player-message').value = 'Do you remember the door?';
    els.interaction.children.find(el => el.textContent === 'Send message →').click(); await flush();
    assert.ok(request.scene.includes('named the little drawn knight'));
    assert.ok(request.scene.includes('beneath an eye on the knight card; the eye closed'));
    assert.ok(request.scene.includes('the paper roll stayed intact'));
    assert.ok(request.scene.includes('You called to Mira, who pushed as you lifted the release.'));
    assert.ok(request.scene.includes('The player asked Mira to describe the room behind the door as evidence.'));
    assert.ok(request.scene.includes('The player said CONFIRM did not open the door.'));
    assert.ok(request.scene.length <= 1800);
  });
  }
} finally {
  globalThis.Blob = originalBlob;
  globalThis.document = originalDocument;
  if (originalNavigatorDescriptor) Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  else delete globalThis.navigator;
  globalThis.AudioContext = originalAudioContext;
  globalThis.OfflineAudioContext = originalOfflineAudioContext;
  if (originalAddEventListener === undefined) delete globalThis.addEventListener;
  else globalThis.addEventListener = originalAddEventListener;
  globalThis.localStorage = originalStorage;
  globalThis.fetch = oldFetchForApp;
  delete globalThis.__offlineVoiceMock;
  if (originalCapacitor === undefined) delete globalThis.Capacitor;
  else globalThis.Capacitor = originalCapacitor;
}

console.log('All offline tests passed.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
