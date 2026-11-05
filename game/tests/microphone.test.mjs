/** Offline microphone lifecycle and WAV tests; all audio APIs are fakes. */
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Blob as NodeBlob } from 'node:buffer';
import vm from 'node:vm';
if (!globalThis.Blob) globalThis.Blob = NodeBlob;
if (!globalThis.DOMException) globalThis.DOMException = class DOMException extends Error { constructor(message, name) { super(message); this.name = name; } };
const temp = await mkdtemp(join(tmpdir(), 'signal-microphone-test-'));
const modulePath = join(temp, 'microphone.mjs');
await writeFile(modulePath, await readFile(new URL('../src/microphone.js', import.meta.url)));
const { createMicrophone } = await import(pathToFileURL(modulePath).href);
await rm(temp, { recursive: true, force: true });

function setup({ rate = 16000, permission, initialState = 'running', resumeState = 'running', resumeWait, closeWait, renderWait, onRender, onInterrupted, onLimit, onContextConstruct, onResume } = {}) {
  const calls = { requested: 0, stopped: 0, closed: 0, contexts: [], offlineRates: [] };
  const listeners = new Set();
  const track = { stop() { calls.stopped++; }, addEventListener(name, listener) { if (name === 'ended') listeners.add(listener); }, removeEventListener(name, listener) { if (name === 'ended') listeners.delete(listener); } };
  const stream = { getTracks: () => [track] };
  const devices = { getUserMedia: async () => { calls.requested++; return typeof permission === 'function' ? permission() : permission || stream; } };
  class Context {
    constructor() { onContextConstruct?.(); this.sampleRate = rate; this.state = initialState; this.destination = {}; this.listeners = new Set(); calls.contexts.push(this); }
    addEventListener(name, listener) { if (name === 'statechange') this.listeners.add(listener); }
    removeEventListener(name, listener) { if (name === 'statechange') this.listeners.delete(listener); }
    setState(state) { this.state = state; for (const listener of [...this.listeners]) listener(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return this.processor = { connect() {}, disconnect() {}, onaudioprocess: null }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    async resume() { onResume?.(); if (resumeWait) await resumeWait; this.state = resumeState; }
    async close() { calls.closed++; if (closeWait) await closeWait; }
  }
  class OfflineContext {
    constructor(channels, length, sampleRate) { this.length = length; calls.offlineRates.push({channels, length, sampleRate}); }
    createBuffer(_channels, _total, inputRate) { this.inputRate = inputRate; return { copyToChannel: value => { this.input = value; } }; }
    createBufferSource() { return { connect() {}, start() {} }; }
    async startRendering() { onRender?.(); if (renderWait) await renderWait; return { getChannelData: () => Float32Array.from({ length: this.length }, (_, index) => this.input[Math.min(this.input.length - 1, Math.floor(index * this.inputRate / 16000))]) }; }
  }
  const mic = createMicrophone({ mediaDevices: devices, AudioContext: Context, OfflineAudioContext: OfflineContext, onInterrupted, onLimit });
  return { mic, calls, stream, endTrack() { for (const listener of [...listeners]) listener(); }, emit(samples) { calls.contexts.at(-1).processor.onaudioprocess({ inputBuffer: { getChannelData: () => Float32Array.from(samples) } }); } };
}
const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };

await test('the capture limit notifies once and keeps only one minute of samples', async () => {
  let limits = 0;
  const h = setup({ onLimit: () => { limits++; } });
  await h.mic.start();
  h.emit(new Float32Array(960005).fill(0.5));
  await Promise.resolve();
  assert.equal(limits, 1);
  h.emit([0.75]);
  await Promise.resolve();
  assert.equal(limits, 1);
  const view = new DataView(await (await h.mic.stop()).arrayBuffer());
  assert.equal(view.getUint32(40, true), 960000 * 2);
  assert.equal(view.getInt16(44 + (960000 - 1) * 2, true), 16383);
  assert.equal(h.calls.stopped, 1);
});

await test('cancelling at the capture limit suppresses its queued callback', async () => {
  let limits = 0;
  const h = setup({ onLimit: () => { limits++; } });
  await h.mic.start();
  h.emit(new Float32Array(960000));
  h.mic.cancel();
  await Promise.resolve();
  assert.equal(limits, 0);
  assert.equal(h.calls.stopped, 1);
});

await test('no microphone is requested until explicit start; WAV contains mono 16k PCM', async () => {
  const h = setup();
  assert.equal(h.calls.requested, 0);
  await h.mic.start();
  assert.equal(h.calls.requested, 1);
  h.emit([0, 0.5, -0.5, 1]);
  const audio = await h.mic.stop();
  assert.equal(audio.type, 'audio/wav');
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const str = (start, len) => String.fromCharCode(...bytes.slice(start, start + len));
  assert.equal(str(0, 4), 'RIFF'); assert.equal(str(8, 4), 'WAVE');
  assert.equal(str(12, 4), 'fmt '); assert.equal(str(36, 4), 'data');
  assert.equal(view.getUint16(20, true), 1); assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000); assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 8); assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), 16383); assert.equal(view.getInt16(48, true), -16384);
  assert.equal(view.getInt16(50, true), 32767); assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
});
await test('48k input uses offline resampling to 16k before WAV encoding', async () => {
  const h = setup({ rate: 48000 }); await h.mic.start(); h.emit([0, 0, 0, 1, 1, 1]);
  const blob = await h.mic.stop(); const view = new DataView(await blob.arrayBuffer());
  assert.deepEqual(h.calls.offlineRates, [{channels: 1, length: 2, sampleRate: 16000}]);
  assert.equal(view.getUint32(24, true), 16000); assert.equal(view.getUint32(40, true), 4);
  assert.equal(view.getInt16(44, true), 0); assert.equal(view.getInt16(46, true), 32767);
});
await test('a stalled context close does not block a stopped recording or retry', async () => {
  const h = setup({ closeWait: new Promise(() => {}) });
  await h.mic.start(); h.emit([0.5]);
  let timer;
  const result = await Promise.race([
    h.mic.stop(),
    new Promise(resolve => { timer = setTimeout(() => resolve('stalled'), 100); })
  ]);
  clearTimeout(timer);
  assert.notEqual(result, 'stalled', 'context cleanup must not block the recorded WAV');
  assert.equal(result.type, 'audio/wav');
  assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
  await h.mic.start(); h.emit([0.25]);
  h.mic.cancel();
  assert.equal(h.calls.requested, 2);
});
await test('cancelling during stalled resampling releases the stop operation', async () => {
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  const h = setup({ rate: 48000, renderWait: new Promise(() => {}), onRender: started });
  await h.mic.start(); h.emit([0.3, 0.4, 0.5]);
  const stop = h.mic.stop(); await requested;
  h.mic.cancel();
  let timer;
  const outcome = await Promise.race([
    stop.then(() => 'completed', error => error.name),
    new Promise(resolve => { timer = setTimeout(() => resolve('stalled'), 100); })
  ]);
  clearTimeout(timer);
  assert.equal(outcome, 'AbortError');
  assert.equal(h.calls.stopped, 1);
  await h.mic.start();
  h.mic.cancel();
});
await test('stalled resampling times out and permits retry', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  let resolveRender;
  const renderWait = new Promise(resolve => { resolveRender = resolve; });
  try {
    globalThis.setTimeout = (fn, delay, ...args) => originalSetTimeout(fn, delay === 30000 ? 10 : delay, ...args);
    const h = setup({ rate: 48000, renderWait });
    await h.mic.start(); h.emit([0.3, 0.4, 0.5]);
    await assert.rejects(h.mic.stop(), /could not be prepared/);
    assert.equal(h.calls.stopped, 1);
    resolveRender();
    await h.mic.start(); h.emit([0.25]);
    assert.equal((await h.mic.stop()).type, 'audio/wav');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});
await test('cancellation stops tracks and closes the audio context', async () => {
  const h = setup(); await h.mic.start(); h.emit([0.4]); h.mic.cancel();
  assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
  await assert.rejects(h.mic.stop(), /No active recording/);
});
await test('an externally ended microphone stops capture and remains retryable', async () => {
  let interruptions = 0;
  const h = setup({ onInterrupted: () => { interruptions++; } });
  await h.mic.start(); h.emit([0.4]); h.endTrack();
  assert.equal(interruptions, 1);
  assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
  await assert.rejects(h.mic.stop(), /No active recording/);
  h.endTrack(); assert.equal(interruptions, 1, 'old listeners are removed');
  await h.mic.start(); h.emit([0.5]);
  const blob = await h.mic.stop();
  assert.equal(new DataView(await blob.arrayBuffer()).getInt16(44, true), 16383);
  h.endTrack(); assert.equal(interruptions, 1, 'normal stop does not report an interruption');
});
await test('an interrupted audio context stops capture even when its input track remains live', async () => {
  let interruptions = 0;
  const h = setup({ onInterrupted: () => { interruptions++; } });
  await h.mic.start(); h.emit([0.4]);
  const first = h.calls.contexts.at(-1);
  first.setState('interrupted');
  assert.equal(interruptions, 1);
  assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
  await assert.rejects(h.mic.stop(), /No active recording/);
  first.setState('running'); first.setState('suspended');
  assert.equal(interruptions, 1, 'cleanup removes the old context listener');
  await h.mic.start(); h.emit([0.5]);
  const second = h.calls.contexts.at(-1);
  const blob = await h.mic.stop();
  assert.equal(new DataView(await blob.arrayBuffer()).getInt16(44, true), 16383);
  second.setState('closed');
  assert.equal(interruptions, 1, 'normal stop does not report an interruption');
});
await test('late permission is discarded and its tracks are stopped after cancellation', async () => {
  let allow;
  const permission = new Promise(resolve => { allow = resolve; });
  const h = setup({ permission });
  const start = h.mic.start();
  assert.equal(h.calls.requested, 1); h.mic.cancel(); allow(h.stream);
  await assert.rejects(start, error => error.name === 'AbortError');
  assert.equal(h.calls.stopped, 1); assert.equal(h.calls.contexts.length, 1); assert.equal(h.calls.closed, 1);
});
await test('cancelling an unanswered permission prompt settles promptly and permits a new recording', async () => {
  let allowFirst, requests = 0, secondStopped = 0;
  const pending = new Promise(resolve => { allowFirst = resolve; });
  const secondStream = { getTracks: () => [{ stop() { secondStopped++; }, addEventListener() {}, removeEventListener() {} }] };
  const h = setup({ permission: () => ++requests === 1 ? pending : secondStream });
  const first = h.mic.start();
  h.mic.cancel();
  let timer;
  const result = await Promise.race([
    first.then(() => 'started', error => error.name),
    new Promise(resolve => { timer = setTimeout(() => resolve('stalled'), 100); })
  ]);
  clearTimeout(timer);
  assert.equal(result, 'AbortError');
  await h.mic.start();
  h.emit([0.5]);
  allowFirst(h.stream);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.stopped, 1, 'the late stream from the abandoned prompt is stopped');
  assert.equal(secondStopped, 0, 'late permission does not interrupt the newer recording');
  const audio = await h.mic.stop();
  assert.equal(new DataView(await audio.arrayBuffer()).getInt16(44, true), 16383);
  assert.equal(secondStopped, 1);
});
await test('denying an abandoned permission prompt does not disrupt a later recording', async () => {
  let denyFirst, requests = 0, secondStopped = 0;
  const pending = new Promise((_, reject) => { denyFirst = reject; });
  const secondStream = { getTracks: () => [{ stop() { secondStopped++; }, addEventListener() {}, removeEventListener() {} }] };
  const h = setup({ permission: () => ++requests === 1 ? pending : secondStream });
  const first = h.mic.start(); h.mic.cancel();
  await assert.rejects(first, error => error.name === 'AbortError');
  await h.mic.start(); h.emit([0.25]);
  denyFirst(new DOMException('Denied.', 'NotAllowedError'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secondStopped, 0);
  assert.equal(new DataView(await (await h.mic.stop()).arrayBuffer()).getInt16(44, true), 8191);
  assert.equal(secondStopped, 1);
});
await test('audio context creation and resume happen during the recording gesture', async () => {
  let allow, inGesture = true, constructed = false, resumed = false;
  const permission = new Promise(resolve => { allow = resolve; });
  const h = setup({ permission, initialState: 'suspended',
    onContextConstruct() { assert.equal(inGesture, true); constructed = true; },
    onResume() { assert.equal(inGesture, true); resumed = true; } });
  const start = h.mic.start();
  inGesture = false;
  assert.equal(constructed, true); assert.equal(resumed, true);
  assert.equal(h.calls.requested, 1);
  allow(h.stream); await start;
  h.emit([0.5]);
  const blob = await h.mic.stop();
  assert.equal(new DataView(await blob.arrayBuffer()).getInt16(44, true), 16383);
});
await test('permission denial closes the context created during the gesture', async () => {
  const denial = Promise.reject(new DOMException('Denied.', 'NotAllowedError'));
  const h = setup({ permission: denial, initialState: 'suspended' });
  await assert.rejects(h.mic.start(), error => error.name === 'NotAllowedError');
  assert.equal(h.calls.contexts.length, 1);
  assert.equal(h.calls.closed, 1);
  await assert.rejects(h.mic.stop(), /No active recording/);
});
await test('a stalled context close does not hide a microphone permission denial', async () => {
  const denial = Promise.reject(new DOMException('Denied.', 'NotAllowedError'));
  const h = setup({ permission: denial, closeWait: new Promise(() => {}) });
  let timer;
  const outcome = await Promise.race([
    h.mic.start().then(() => 'started', error => error.name),
    new Promise(resolve => { timer = setTimeout(() => resolve('stalled'), 100); })
  ]);
  clearTimeout(timer);
  assert.equal(outcome, 'NotAllowedError');
  assert.equal(h.calls.closed, 1);
});
await test('cancelling while the gesture-started context resumes releases the granted stream', async () => {
  let finishResume;
  const resumeWait = new Promise(resolve => { finishResume = resolve; });
  const h = setup({ initialState: 'suspended', resumeWait });
  const starting = h.mic.start();
  await Promise.resolve(); // allow getUserMedia to resolve and attach its stream
  h.mic.cancel(); finishResume();
  await assert.rejects(starting, error => error.name === 'AbortError');
  assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
});
await test('cancelling a stalled context resume settles startup without waiting for the browser', async () => {
  const h = setup({ initialState: 'suspended', resumeWait: new Promise(() => {}) });
  const starting = h.mic.start();
  await Promise.resolve(); // permission is granted; startup is waiting on resume
  h.mic.cancel();
  let timeout;
  const outcome = await Promise.race([
    starting.then(() => 'started', error => error.name),
    new Promise(resolve => { timeout = setTimeout(() => resolve('stalled'), 200); })
  ]);
  clearTimeout(timeout);
  assert.equal(outcome, 'AbortError');
  assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
});
await test('a stalled context resume times out and releases the granted microphone', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let delay;
  try {
    globalThis.setTimeout = (callback, ms) => { delay = ms; queueMicrotask(callback); return 1; };
    globalThis.clearTimeout = () => {};
    const h = setup({ initialState: 'suspended', resumeWait: new Promise(() => {}) });
    await assert.rejects(h.mic.start(), /Microphone audio could not start/);
    assert.equal(delay, 5000);
    assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
    await assert.rejects(h.mic.stop(), /No active recording/);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
await test('empty capture and unsupported browsers fail without retaining tracks', async () => {
  const h = setup(); await h.mic.start();
  await assert.rejects(h.mic.stop(), /No audio was captured/);
  assert.equal(h.calls.stopped, 1); assert.equal(h.calls.closed, 1);
  const unsupported = createMicrophone({ mediaDevices: {}, AudioContext: undefined, OfflineAudioContext: undefined });
  await assert.rejects(unsupported.start(), /supported browser/);
});
await test('a suspended audio context cannot falsely report an active recording', async () => {
  const h = setup({ initialState: 'suspended', resumeState: 'suspended' });
  await assert.rejects(h.mic.start(), /Microphone audio could not start/);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.calls.closed, 1);
  await assert.rejects(h.mic.stop(), /No active recording/);
  // A subsequent explicit attempt can retry rather than getting stuck active.
  await assert.rejects(h.mic.start(), /Microphone audio could not start/);
  assert.equal(h.calls.requested, 2);
  assert.equal(h.calls.stopped, 2);
});
await test('a resumed audio context proceeds to capture', async () => {
  const h = setup({ initialState: 'suspended', resumeState: 'running' });
  await h.mic.start();
  h.emit([0.5]);
  const blob = await h.mic.stop();
  assert.equal(new DataView(await blob.arrayBuffer()).getInt16(44, true), 16383);
});

function workletSetup(addModule, { supportsFinish = false, onLimit } = {}) {
  const calls = { stopped: 0, closed: 0, moduleUrl: '', worklets: [], fallbacks: 0 };
  const mediaDevices = { async getUserMedia() { return { getTracks: () => [{ stop() { calls.stopped++; } }] }; } };
  class Context {
    constructor() { this.sampleRate = 16000; this.state = 'running'; this.destination = {}; this.audioWorklet = { addModule: async (url) => { calls.moduleUrl = url; return addModule(); } }; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { calls.fallbacks++; return calls.fallback = { connect() {}, disconnect() {}, onaudioprocess: null }; }
    createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
    async close() { calls.closed++; }
  }
  class Worklet {
    constructor(_context, name) {
      this.name = name;
      this.port = { onmessage: null };
      if (supportsFinish) this.port.postMessage = message => { calls.finishRequest = message; };
      calls.worklets.push(this);
    }
    connect() {}
    disconnect() {}
  }
  class OfflineContext {}
  const mic = createMicrophone({ mediaDevices, AudioContext: Context, AudioWorkletNode: Worklet, OfflineAudioContext: OfflineContext, onLimit });
  return { mic, calls };
}
await test('worklet capture also signals the one-minute limit', async () => {
  let limits = 0;
  const h = workletSetup(async () => {}, { onLimit: () => { limits++; } });
  await h.mic.start();
  h.calls.worklets[0].port.onmessage({ data: new Float32Array(960000) });
  await Promise.resolve();
  assert.equal(limits, 1);
  const audio = await h.mic.stop();
  assert.equal((await audio.arrayBuffer()).byteLength, 44 + 960000 * 2);
  assert.equal(h.calls.stopped, 1);
});
await test('AudioWorklet loads the module and captures its sample messages', async () => {
  const h = workletSetup(async () => {}); await h.mic.start();
  assert.match(h.calls.moduleUrl, /\/mic-worklet\.js$/);
  assert.equal(h.calls.worklets.length, 1); assert.equal(h.calls.worklets[0].name, 'reply-capture');
  assert.equal(h.calls.fallbacks, 0);
  const port = h.calls.worklets[0].port;
  port.onmessage({ data: Float32Array.from([0, 0.5, -0.5]) });
  const blob = await h.mic.stop();
  const view = new DataView(await blob.arrayBuffer());
  assert.equal(view.getUint32(40, true), 6); assert.equal(view.getInt16(46, true), 16383);
  assert.equal(view.getInt16(48, true), -16384); assert.equal(port.onmessage, null);
  assert.equal(h.calls.stopped, 1);
});
await test('the worklet drains queued samples on stop before producing a WAV', async () => {
  const h = workletSetup(async () => {}, { supportsFinish: true }); await h.mic.start();
  const port = h.calls.worklets[0].port;
  port.onmessage({ data: Float32Array.from([0.25]) });
  let complete = false;
  const stopping = h.mic.stop().then(blob => { complete = true; return blob; });
  assert.deepEqual(h.calls.finishRequest, { type: 'finish' });
  assert.equal(h.calls.stopped, 1, 'the microphone track stops immediately');
  assert.equal(complete, false);
  port.onmessage({ data: Float32Array.from([0.5, -0.5]) });
  port.onmessage({ data: { type: 'finished' } });
  const view = new DataView(await (await stopping).arrayBuffer());
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), 8191);
  assert.equal(view.getInt16(46, true), 16383);
  assert.equal(view.getInt16(48, true), -16384);
  assert.equal(port.onmessage, null);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.calls.closed, 1);
});
await test('cancelling during a worklet drain discards queued audio and stops promptly', async () => {
  const h = workletSetup(async () => {}, { supportsFinish: true }); await h.mic.start();
  const port = h.calls.worklets[0].port;
  port.onmessage({ data: Float32Array.from([0.25]) });
  const stopping = h.mic.stop();
  await assert.rejects(h.mic.stop(), /No active recording/);
  h.mic.cancel();
  await assert.rejects(stopping, error => error.name === 'AbortError');
  assert.equal(port.onmessage, null);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.calls.closed, 1);
});
await test('an unresponsive worklet does not leave recording stuck', async () => {
  const h = workletSetup(async () => {}, { supportsFinish: true }); await h.mic.start();
  const port = h.calls.worklets[0].port;
  port.onmessage({ data: Float32Array.from([0.25]) });
  const blob = await h.mic.stop();
  assert.equal(new DataView(await blob.arrayBuffer()).getInt16(44, true), 8191);
  assert.equal(port.onmessage, null);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.calls.closed, 1);
});
await test('the actual worklet acknowledges only after its queued sample messages', async () => {
  let Processor;
  class FakeProcessor { constructor() { this.port = { sent: [], postMessage(data) { this.sent.push(data); } }; } }
  const source = await readFile(new URL('../src/mic-worklet.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { AudioWorkletProcessor: FakeProcessor, Float32Array, registerProcessor: (_name, klass) => { Processor = klass; } });
  const processor = new Processor();
  assert.equal(processor.process([[Float32Array.from([0.25])]]), true);
  processor.port.onmessage({ data: { type: 'finish' } });
  assert.equal(processor.port.sent.length, 2);
  assert.equal(processor.port.sent[0][0], 0.25);
  assert.equal(processor.port.sent[1].type, 'finished');
  assert.equal(processor.process([[Float32Array.from([0.5])]]), false);
  assert.equal(processor.port.sent.length, 2);
});
await test('failed AudioWorklet module loading falls back to ScriptProcessor', async () => {
  const h = workletSetup(async () => { throw new Error('worklet unavailable'); }); await h.mic.start();
  assert.equal(h.calls.worklets.length, 0); assert.equal(h.calls.fallbacks, 1);
  h.calls.fallback.onaudioprocess({ inputBuffer: { getChannelData: () => Float32Array.from([0.75]) } });
  const blob = await h.mic.stop();
  assert.equal(new DataView(await blob.arrayBuffer()).getInt16(44, true), 24575);
  assert.equal(h.calls.stopped, 1);
});
await test('cancelling while the worklet module loads closes tracks and does not start capture', async () => {
  let resolveModule, started;
  const moduleRequested = new Promise(resolve => { started = resolve; });
  const moduleWait = new Promise(resolve => { resolveModule = resolve; });
  const h = workletSetup(() => { started(); return moduleWait; });
  const start = h.mic.start(); await moduleRequested;
  h.mic.cancel(); resolveModule();
  await assert.rejects(start, error => error.name === 'AbortError');
  assert.equal(h.calls.worklets.length, 0); assert.equal(h.calls.fallbacks, 0);
  assert.ok(h.calls.stopped >= 1); assert.ok(h.calls.closed >= 1);
});
await test('a stalled worklet load falls back to ScriptProcessor and ignores late completion', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let timers = 0, finishModule;
  const moduleWait = new Promise(resolve => { finishModule = resolve; });
  try {
    // The first timer protects AudioContext activation; accelerate only the
    // subsequent worklet-load timeout to exercise the real fallback path.
    globalThis.setTimeout = (callback, ms) => {
      if (++timers === 2) { assert.equal(ms, 5000); queueMicrotask(callback); return -1; }
      return originalSetTimeout(callback, ms);
    };
    globalThis.clearTimeout = id => { if (id !== -1) originalClearTimeout(id); };
    const h = workletSetup(() => moduleWait);
    await h.mic.start();
    assert.equal(h.calls.fallbacks, 1);
    assert.equal(h.calls.worklets.length, 0);
    finishModule(); await Promise.resolve(); await Promise.resolve();
    assert.equal(h.calls.worklets.length, 0, 'late worklet completion must not replace the active fallback');
    h.calls.fallback.onaudioprocess({ inputBuffer: { getChannelData: () => Float32Array.from([0.5]) } });
    const audio = await h.mic.stop();
    assert.equal(new DataView(await audio.arrayBuffer()).getInt16(44, true), 16383);
    assert.equal(h.calls.stopped, 1);
    assert.equal(h.calls.closed, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
await test('cancelling a stalled worklet load settles startup without waiting for the browser', async () => {
  let started;
  const requested = new Promise(resolve => { started = resolve; });
  const h = workletSetup(() => { started(); return new Promise(() => {}); });
  const starting = h.mic.start(); await requested;
  h.mic.cancel();
  let timer;
  const outcome = await Promise.race([
    starting.then(() => 'started', error => error.name),
    new Promise(resolve => { timer = setTimeout(() => resolve('stalled'), 200); })
  ]);
  clearTimeout(timer);
  assert.equal(outcome, 'AbortError');
  assert.equal(h.calls.fallbacks, 0);
  assert.equal(h.calls.worklets.length, 0);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.calls.closed, 1);
});
