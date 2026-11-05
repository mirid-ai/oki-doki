/** Mock-only voice UI tests: node tests/voice-ui.test.mjs. No mic or audio is used. */
import assert from 'node:assert/strict';
import { Blob as NodeBlob } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const originals = { Blob: globalThis.Blob, document: globalThis.document, Audio: globalThis.Audio, Event: globalThis.Event, mocks: globalThis.__voiceMocks, makeUrl: URL.createObjectURL, revokeUrl: URL.revokeObjectURL };
if (!globalThis.Blob) globalThis.Blob = NodeBlob;
if (!globalThis.Event) globalThis.Event = class { constructor(type) { this.type = type; } };
class Element {
  constructor() { this.children = []; this.listeners = {}; this.value = ''; this.maxLength = 500; this.isConnected = true; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  setAttribute(name, value) { this[name] = value; }
  click() { return this.listeners.click?.(); }
  remove() {}
  dispatchEvent(event) { this.lastEvent = event.type; }
}
globalThis.document = { createElement: () => new Element() };
const temp = await mkdtemp(join(tmpdir(), 'signal-voice-ui-tests-'));
const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
try {
  const source = (await readFile(new URL('../src/voice-ui.js', import.meta.url), 'utf8'))
    .replace("'./microphone.js'", "'./microphone.mjs'").replace("'./speech.js'", "'./speech.mjs'").replace("'./realtime-speech.js'", "'./realtime-speech.mjs'");
  await writeFile(join(temp, 'voice-ui.mjs'), source);
  await writeFile(join(temp, 'microphone.mjs'), 'export const createMicrophone = options => { globalThis.__voiceMocks.onInterrupted = options.onInterrupted; globalThis.__voiceMocks.onLimit = options.onLimit; return globalThis.__voiceMocks.microphone; };');
  await writeFile(join(temp, 'speech.mjs'), 'export const transcribeSpeech = (...args) => globalThis.__voiceMocks.transcribe(...args); export const synthesizeSpeech = (...args) => globalThis.__voiceMocks.synthesize(...args); export const validateTranscriptionSettings = (...args) => globalThis.__voiceMocks.validate?.(...args);');
  await writeFile(join(temp, 'realtime-speech.mjs'), 'export const getRealtimeClientSecretInfo = async (...args) => { const result = await globalThis.__voiceMocks.getRealtimeClientSecret(...args); return typeof result === "string" ? { value: result, expiresAt: Date.now() + 60000 } : result; }; export const synthesizeRealtimeSpeech = (...args) => globalThis.__voiceMocks.synthesizeRealtimeSpeech(...args); export const validateRealtimeSpeechInput = (...args) => globalThis.__voiceMocks.validateRealtime?.(...args);');
  const { createVoiceUI, createBundledSpeechLookup, splitNanoPassage, realtimeVoiceFor } = await import(pathToFileURL(join(temp, 'voice-ui.mjs')).href);

  await test('bundled speech uses exact cast, text and voice, and respects alternative voices', async () => {
    const filename = `${'a'.repeat(64)}.mp3`;
    const key = JSON.stringify(['Mira', 'af_bella', 'Hello, friend.']);
    const calls = [];
    const lookup = createBundledSpeechLookup(async (url, options) => {
      calls.push({ url: String(url), signal: options.signal });
      return String(url).endsWith('/manifest.json')
        ? new Response(JSON.stringify({ [key]: filename }), { headers: { 'content-type': 'application/json' } })
        : new Response('recorded audio', { headers: { 'content-type': 'audio/mpeg' } });
    });
    const settings = { mode: 'mirid', ttsEngine: 'kokoro', speed: 1 };
    const part = { speaker: 'Mira', voice: 'af_bella', text: ' Hello, friend. ', settings };
    const signal = new AbortController().signal;
    assert.equal(await (await lookup(part, signal)).text(), 'recorded audio');
    assert.match(calls[1].url, new RegExp(`${filename}$`));
    for (const variant of [
      { ...part, speaker: 'Niko' }, { ...part, voice: 'af_heart' },
      { ...part, text: 'Hello, stranger.' }, { ...part, authored: false },
      { ...part, settings: { ...settings, ttsEngine: 'chatterbox_nano' } },
      { ...part, settings: { ...settings, ttsProvider: 'realtime' } },
      { ...part, settings: { ...settings, mode: 'openai' } },
      { ...part, settings: { ...settings, speed: 1.2 } }
    ]) assert.equal(await lookup(variant, signal), null);
    assert.equal(calls.length, 2, 'different or live text must not fetch a recorded clip');
  });

  await test('missing or unsafe bundled files fall back and a failed manifest can be retried', async () => {
    let attempts = 0;
    const key = JSON.stringify(['Mira', 'af_bella', 'Hello.']);
    const part = { speaker: 'Mira', voice: 'af_bella', text: 'Hello.', settings: { mode: 'mirid', ttsEngine: 'kokoro' } };
    const lookup = createBundledSpeechLookup(async () => {
      attempts++;
      if (attempts === 1) return new Response('', { status: 404 });
      return new Response(JSON.stringify({ [key]: '../private.mp3' }));
    });
    const signal = new AbortController().signal;
    assert.equal(await lookup(part, signal), null);
    assert.equal(await lookup(part, signal), null);
    assert.equal(attempts, 2, 'unsafe manifest targets are never fetched');
  });

  await test('missing clips and a host HTML fallback do not masquerade as audio', async () => {
    const key = JSON.stringify(['Mira', 'af_bella', 'Hello.']);
    const part = { speaker: 'Mira', voice: 'af_bella', text: 'Hello.', settings: { mode: 'mirid', ttsEngine: 'kokoro' } };
    for (const clip of [new Response('', { status: 404 }), new Response('<html>Missing</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }), new Response('')]) {
      const lookup = createBundledSpeechLookup(async url => String(url).endsWith('/manifest.json')
        ? new Response(JSON.stringify({ [key]: `${'b'.repeat(64)}.mp3` })) : clip);
      assert.equal(await lookup(part, new AbortController().signal), null);
    }
  });

  await test('cancelling a manifest fetch does not cache the failed result', async () => {
    let calls = 0;
    const key = JSON.stringify(['Mira', 'af_bella', 'Hello.']);
    const part = { speaker: 'Mira', voice: 'af_bella', text: 'Hello.', settings: { mode: 'mirid', ttsEngine: 'kokoro' } };
    const lookup = createBundledSpeechLookup((url, { signal }) => {
      calls++;
      if (calls === 1) return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
      return Promise.resolve(String(url).endsWith('/manifest.json')
        ? new Response(JSON.stringify({ [key]: `${'c'.repeat(64)}.mp3` })) : new Response('audio'));
    });
    const controller = new AbortController();
    const first = lookup(part, controller.signal);
    controller.abort();
    await assert.rejects(first, { name: 'AbortError' });
    assert.equal(await (await lookup(part, new AbortController().signal)).text(), 'audio');
    assert.equal(calls, 3);
  });

  await test('bundled queue plays without a speech service and cancellation stops prefetch', async () => {
    const players = [], seen = []; let resolveNext, nextSignal;
    URL.createObjectURL = () => 'blob:bundled'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { constructor() { players.push(this); this.plays = 0; } async play() { this.plays++; } pause() { this.paused = true; } removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async () => { throw new Error('live service must not be called'); } };
    const ui = createVoiceUI({ getSettings: () => ({ mode: 'mirid', ttsEngine: 'kokoro' }), lookupBundledSpeech: (part, signal) => {
      seen.push(part.text);
      if (part.text === 'First.') return Promise.resolve(new Blob(['one']));
      nextSignal = signal;
      return new Promise(resolve => { resolveNext = resolve; });
    } });
    await ui.speakSequence([{ text: 'First.', speaker: 'Mira', voice: 'af_bella' }, { text: 'Second.', speaker: 'Niko', voice: 'am_adam' }]);
    await flush();
    assert.deepEqual(seen, ['First.', 'Second.']);
    assert.equal(players[0].plays, 1);
    ui.cancel();
    assert.equal(nextSignal.aborted, true);
    resolveNext(new Blob(['two'])); await flush();
    assert.equal(players[0].plays, 1);
    assert.equal(players[0].paused, true);
  });

  await test('a missing bundled clip uses live speech and an unavailable service is reported', async () => {
    const requests = [], statuses = [];
    URL.createObjectURL = () => 'blob:live-fallback'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async options => { requests.push(options); return new Blob(['live']); } };
    const lookup = async () => null;
    const ui = createVoiceUI({ getSettings: () => ({ mode: 'mirid', ttsEngine: 'kokoro', baseUrl: 'https://voice.invalid' }), lookupBundledSpeech: lookup });
    await ui.speak('A missing line.', 'af_bella', {}, 'Mira');
    assert.equal(requests.length, 1);
    ui.cancel();
    const offline = createVoiceUI({ getSettings: () => ({ mode: 'mirid', ttsEngine: 'kokoro' }), lookupBundledSpeech: lookup, onStatus: s => statuses.push(s) });
    await offline.speak('A missing line.', 'af_bella', {}, 'Mira');
    assert.match(statuses.at(-1), /configure a speech service url/i);
    offline.cancel();
  });

  await test('local Kokoro supplies missing dynamic speech and preserves configured services and references', async () => {
    const local = [], live = [];
    URL.createObjectURL = () => 'blob:local-test'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async options => {
      live.push(options);
      if (options.baseUrl === 'http://127.0.0.1:8000') throw new Error('unavailable');
      return new Blob(['service']);
    } };
    const localKokoro = async options => { local.push(options); return new Blob(['local']); };
    const lookupBundledSpeech = async () => null;
    const common = { lookupBundledSpeech, localKokoro };
    const offline = createVoiceUI({ ...common, getSettings: () => ({ mode: 'mirid', ttsEngine: 'kokoro' }) });
    await offline.speakSequence([{ speaker: 'Mira', voice: 'af_bella', text: 'A name from the player.', authored: false }]);
    assert.equal(local.length, 1); assert.equal(live.length, 0); offline.cancel();
    const fallback = createVoiceUI({ ...common, getSettings: () => ({ mode: 'mirid', ttsEngine: 'kokoro', baseUrl: 'http://127.0.0.1:8000' }) });
    await fallback.speak('A generated response.', 'af_bella', {}, 'Mira');
    assert.equal(live.length, 1); assert.equal(local.length, 2); fallback.cancel();
    const configured = createVoiceUI({ ...common, getSettings: () => ({ mode: 'mirid', ttsEngine: 'kokoro', baseUrl: 'https://voice.invalid' }) });
    await configured.speak('A configured service.', 'af_bella', {}, 'Mira');
    assert.equal(live.length, 2); assert.equal(local.length, 2); configured.cancel();
    const creator = createVoiceUI({ ...common, getSettings: () => ({ mode: 'mirid', ttsEngine: 'kokoro', baseUrl: 'http://127.0.0.1:8000' }) });
    await creator.speak('A creator voice.', 'af_bella', { ttsEngine: 'chatterbox_nano', ttsBaseUrl: 'https://reference.invalid' }, 'Mira');
    assert.equal(live.at(-1).engine, 'chatterbox_nano'); assert.equal(local.length, 2); creator.cancel();
  });

  await test('cancelling local Kokoro ignores late model output', async () => {
    let resolveAudio, signal, plays = 0;
    URL.createObjectURL = () => 'blob:late-local'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() { plays++; } pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} } };
    const ui = createVoiceUI({ getSettings: () => ({ mode: 'mirid', ttsEngine: 'kokoro' }), lookupBundledSpeech: async () => null,
      localKokoro: args => { signal = args.signal; return new Promise(resolve => { resolveAudio = resolve; }); } });
    const pending = ui.speak('Hello.', 'af_bella', {}, 'Mira');
    await flush(); ui.cancel(); assert.equal(signal.aborted, true);
    resolveAudio(new Blob(['late'])); await pending;
    assert.equal(plays, 0);
  });

  await test('desktop transcription preserves generated speech with the bundled Kokoro voice', async () => {
    const local = [], live = [];
    URL.createObjectURL = () => 'blob:local-asr-kokoro'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async args => { live.push(args); return new Blob(['service']); } };
    const ui = createVoiceUI({
      getSettings: () => ({ mode: 'mirid', baseUrl: 'http://127.0.0.1:49564/local-asr', asrEngine: 'parakeet-cpp:tdt_ctc-110m:q4_k', ttsEngine: 'kokoro' }),
      lookupBundledSpeech: async () => null,
      localKokoro: async args => { local.push(args); return new Blob(['kokoro']); }
    });
    await ui.speak('A line generated during play.', 'af_bella', {}, 'Mira');
    assert.equal(local.length, 1);
    assert.equal(local[0].voice, 'af_bella');
    assert.equal(live.length, 0, 'transcription endpoint is not used as a TTS server');
    ui.cancel();
    const custom = createVoiceUI({
      getSettings: () => ({ mode: 'mirid', baseUrl: 'http://127.0.0.1:49564/local-asr', ttsBaseUrl: 'https://speech.example', ttsEngine: 'kokoro' }),
      lookupBundledSpeech: async () => null,
      localKokoro: async args => { local.push(args); return new Blob(['kokoro']); }
    });
    await custom.speak('A different provider.', 'af_bella', {}, 'Mira');
    assert.equal(live.at(-1).baseUrl, 'https://speech.example');
    assert.equal(local.length, 1, 'explicit voice service remains authoritative');
    custom.cancel();
  });

  await test('invalid speech settings are caught before microphone access', async () => {
    const speechSource = await readFile(new URL('../src/speech.js', import.meta.url));
    const { validateTranscriptionSettings } = await import(`data:text/javascript;base64,${speechSource.toString('base64')}`);
    let starts = 0, status = '';
    globalThis.__voiceMocks = { validate: validateTranscriptionSettings, microphone: { start: async () => { starts++; }, cancel() {} } };
    for (const settings of [
      { baseUrl: 'http://example.invalid', mode: 'mirid' },
      { baseUrl: 'https://example.invalid?bad=query', mode: 'openai' },
      { baseUrl: 'https://example.invalid', mode: 'openai', asrModel: 'bad\nmodel' },
      { baseUrl: 'https://example.invalid', mode: 'mirid', asrEngine: 'bad\nengine' }
    ]) {
      const ui = createVoiceUI({ getSettings: () => settings, onStatus: text => { status = text; } });
      const button = ui.attachRecorder(new Element(), new Element());
      await button.click();
      assert.equal(starts, 0, 'invalid settings must not request microphone access');
      assert.equal(button.disabled, false);
      assert.equal(button.textContent, 'Record a reply');
      assert.notEqual(status, '');
      ui.cancel();
    }
  });

  await test('missing configuration never requests microphone permission', async () => {
    let starts = 0;
    let status = '';
    globalThis.__voiceMocks = { microphone: { start: async () => { starts++; }, cancel() {} } };
    const ui = createVoiceUI({ getSettings: () => ({}), onStatus: text => { status = text; } });
    const button = ui.attachRecorder(new Element(), new Element());
    assert.equal(starts, 0);
    await button.click();
    assert.equal(starts, 0);
    assert.match(status, /configure a speech service url/i);
    ui.cancel();
  });

  await test('a full reply is caught before microphone access or transcription', async () => {
    let starts = 0, transcriptions = 0, status = '';
    globalThis.__voiceMocks = {
      microphone: { start: async () => { starts++; }, cancel() {} },
      transcribe: async () => { transcriptions++; return 'new words'; }
    };
    const field = new Element();
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onStatus: text => { status = text; } });
    const button = ui.attachRecorder(new Element(), field);
    for (const [value, limit] of [['full', 4], ['word', 5], ['', 0]]) {
      field.value = value; field.maxLength = limit;
      await button.click();
      assert.match(status, /reply field is full/i);
      assert.equal(starts, 0);
      assert.equal(transcriptions, 0);
      assert.equal(button.textContent, 'Record a reply');
      assert.equal(button.disabled, false);
    }
    // Once edited, one space plus one character is enough to start recording.
    field.value = 'word'; field.maxLength = 6;
    await button.click();
    assert.equal(starts, 1);
    assert.equal(button.textContent, 'Stop recording and transcribe');
    ui.cancel();
  });

  await test('a reply filled while recording or draining is not sent for transcription', async () => {
    for (const fillWhileDraining of [false, true]) {
      let finish, starts = 0, stops = 0, transcriptions = 0, status = '';
      globalThis.__voiceMocks = {
        microphone: {
          start: async () => { starts++; },
          stop: () => { stops++; return new Promise(resolve => { finish = resolve; }); },
          cancel() {}
        },
        transcribe: async () => { transcriptions++; return 'unexpected'; }
      };
      const field = new Element(); field.maxLength = 5;
      const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onStatus: value => { status = value; } });
      const button = ui.attachRecorder(new Element(), field);
      await button.click();
      if (!fillWhileDraining) field.value = 'full!';
      const stopping = button.click();
      if (fillWhileDraining) field.value = 'full!';
      finish(new Blob(['audio'], { type: 'audio/wav' }));
      await stopping;
      assert.equal(starts, 1);
      assert.equal(stops, 1, 'the recording is released');
      assert.equal(transcriptions, 0, 'full replies never reach the speech service');
      assert.equal(field.value, 'full!');
      assert.match(status, /reply field is full/i);
      assert.equal(button.textContent, 'Record a reply');
      assert.equal(button.disabled, false);
      ui.cancel();
    }
  });

  await test('cancelling while permission is pending ignores its late completion', async () => {
    let releasePermission;
    let cancels = 0;
    let status = '';
    globalThis.__voiceMocks = { microphone: { start: () => new Promise(resolve => { releasePermission = resolve; }), cancel() { cancels++; } } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onStatus: text => { status = text; } });
    const button = ui.attachRecorder(new Element(), new Element());
    assert.equal(ui.hasPendingCapture(), false);
    const pending = button.click();
    assert.match(status, /permission/i);
    assert.equal(ui.hasPendingCapture(), true, 'pending microphone permission is capture, not playback');
    ui.cancel();
    assert.equal(ui.hasPendingCapture(), false);
    const cancelledStatus = status;
    releasePermission();
    await pending;
    assert.equal(status, cancelledStatus);
    assert.equal(button.textContent, 'Record a reply');
    assert.equal(button.disabled, false);
    assert.ok(cancels >= 2);
  });

  await test('failed audio startup reports the issue and leaves the recorder retryable', async () => {
    let status = '';
    let starts = 0;
    globalThis.__voiceMocks = { microphone: { start: async () => { starts++; throw new Error('Microphone audio could not start. Check your device audio and try again.'); }, cancel() {} } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onStatus: text => { status = text; } });
    const button = ui.attachRecorder(new Element(), new Element());
    await button.click();
    assert.match(status, /Microphone audio could not start/);
    assert.equal(button.textContent, 'Record a reply');
    assert.equal(button.disabled, false);
    await button.click();
    assert.equal(starts, 2);
    ui.cancel();
  });

  await test('interrupted microphone recording resets the button and can be retried', async () => {
    let status = '', starts = 0, transcriptions = 0;
    globalThis.__voiceMocks = {
      microphone: { start: async () => { starts++; }, cancel() {}, stop: async () => new Blob(['audio']) },
      transcribe: async () => { transcriptions++; return 'unexpected'; }
    };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onStatus: text => { status = text; } });
    const button = ui.attachRecorder(new Element(), new Element());
    await button.click();
    assert.equal(button.textContent, 'Stop recording and transcribe');
    globalThis.__voiceMocks.onInterrupted();
    assert.match(status, /recording was interrupted/i);
    assert.equal(button.textContent, 'Record a reply');
    assert.equal(button.disabled, false);
    assert.equal(transcriptions, 0);
    await button.click(); assert.equal(starts, 2);
    ui.cancel();
  });

  await test('interruption during startup ignores late permission completion', async () => {
    let finish, status = '';
    globalThis.__voiceMocks = { microphone: { start: () => new Promise(resolve => { finish = resolve; }), cancel() {} } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onStatus: text => { status = text; } });
    const button = ui.attachRecorder(new Element(), new Element());
    const startup = button.click();
    globalThis.__voiceMocks.onInterrupted();
    finish(); await startup;
    assert.match(status, /recording was interrupted/i);
    assert.equal(button.textContent, 'Record a reply');
    assert.equal(button.disabled, false);
    ui.cancel();
  });

  await test('reaching the recording limit automatically transcribes once', async () => {
    let stops = 0, transcriptions = 0;
    globalThis.__voiceMocks = {
      microphone: { start: async () => {}, stop: async () => { stops++; return new Blob(['audio'], { type: 'audio/wav' }); }, cancel() {} },
      transcribe: async () => { transcriptions++; return 'my reply'; }
    };
    const field = new Element();
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid', mode: 'mirid' }) });
    const button = ui.attachRecorder(new Element(), field);
    await button.click();
    globalThis.__voiceMocks.onLimit();
    globalThis.__voiceMocks.onLimit();
    await flush();
    assert.equal(stops, 1);
    assert.equal(transcriptions, 1);
    assert.equal(field.value, 'my reply');
    assert.equal(button.textContent, 'Record a reply');
    ui.cancel();
  });

  await test('transcription is added only after explicit recording and respects reply limit', async () => {
    let starts = 0;
    let submitted = 0;
    let status = '';
    globalThis.__voiceMocks = {
      microphone: { start: async () => { starts++; }, stop: async () => new Blob(['audio'], { type: 'audio/wav' }), cancel() {} },
      transcribe: async ({ audio, signal }) => { submitted++; assert.equal(audio.type, 'audio/wav'); assert.equal(signal.aborted, false); return 'beautiful station'; }
    };
    const field = new Element();
    field.value = 'hello';
    field.maxLength = 10;
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid', mode: 'mirid' }), onStatus: text => { status = text; } });
    const button = ui.attachRecorder(new Element(), field);
    assert.equal(starts, 0);
    assert.equal(submitted, 0);
    await button.click();
    assert.equal(starts, 1);
    assert.equal(button.textContent, 'Stop recording and transcribe');
    assert.equal(ui.hasPendingCapture(), true);
    await button.click();
    assert.equal(submitted, 1);
    assert.equal(ui.hasPendingCapture(), false);
    assert.equal(field.value, 'hello beau');
    assert.equal(field.lastEvent, 'input');
    assert.match(status, /reply limit/i);
    ui.cancel();
  });

  await test('capture state remains active while transcription is pending', async () => {
    let release;
    globalThis.__voiceMocks = {
      microphone: { start: async () => {}, stop: async () => new Blob(['audio']), cancel() {} },
      transcribe: () => new Promise(resolve => { release = resolve; })
    };
    const field = new Element();
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }) });
    const button = ui.attachRecorder(new Element(), field);
    await button.click();
    const pending = button.click(); await flush();
    assert.equal(ui.hasPendingCapture(), true);
    release('A spoken reply'); await pending;
    assert.equal(ui.hasPendingCapture(), false);
    assert.equal(field.value, 'A spoken reply');
    ui.cancel();
  });

  await test('reply limit never splits a non-BMP character in transcribed speech', async () => {
    for (const [limit, expected, statusPattern] of [
      [4, 'go', /field is full/i],       // No room for a separator and emoji.
      [5, 'go 🎮', /reply limit/i],      // The entire emoji fits.
      [6, 'go 🎮a', /reply limit/i]
    ]) {
      let status = '';
      globalThis.__voiceMocks = {
        microphone: { start: async () => {}, stop: async () => new Blob(['audio']), cancel() {} },
        transcribe: async () => '🎮abc'
      };
      const field = new Element();
      field.value = 'go';
      field.maxLength = limit;
      const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onStatus: text => { status = text; } });
      const button = ui.attachRecorder(new Element(), field);
      await button.click();
      await button.click();
      assert.equal(field.value, expected);
      assert.match(status, statusPattern);
      assert.ok(!/[\uD800-\uDBFF]$/.test(field.value), 'no dangling high surrogate');
      ui.cancel();
    }
  });

  await test('cancellation while the recording drains never transcribes late audio', async () => {
    let finish, transcriptions = 0;
    globalThis.__voiceMocks = {
      microphone: { start: async () => {}, stop: () => new Promise(resolve => { finish = resolve; }), cancel() {} },
      transcribe: async () => { transcriptions++; return 'unexpected'; }
    };
    const field = new Element();
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }) });
    const button = ui.attachRecorder(new Element(), field);
    await button.click();
    const stopping = button.click();
    ui.cancel();
    finish(new Blob(['audio'], { type: 'audio/wav' }));
    await stopping;
    assert.equal(transcriptions, 0);
    assert.equal(field.value, '');
    assert.equal(button.textContent, 'Record a reply');
    assert.equal(button.disabled, false);
  });

  await test('transcription and speaker-specific read-aloud use their own service URLs', async () => {
    let transcribed, spoken;
    globalThis.__voiceMocks = {
      microphone: { start: async () => {}, stop: async () => new Blob(['audio']), cancel() {} },
      transcribe: async value => { transcribed = value; return 'hello'; },
      synthesize: async value => { spoken = value; return new Blob(['wav'], { type: 'audio/wav' }); }
    };
    const originalAudio = globalThis.Audio;
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'http://localhost:8000', apiKey: 'asr-key', ttsBaseUrl: 'http://localhost:8002', ttsApiKey: 'tts-key', mode: 'mirid-local-kokoro', ttsMode: 'mirid', ttsEngine: 'kokoro' }) });
    try {
      const button = ui.attachRecorder(new Element(), new Element());
      await button.click(); await button.click();
      assert.equal(transcribed.baseUrl, 'http://localhost:8000');
      assert.equal(transcribed.mode, 'mirid-local-kokoro');
      assert.equal(transcribed.apiKey, 'asr-key');
      await ui.speak('hello', 'af_bella');
      assert.equal(ui.hasPendingCapture(), false, 'read-aloud is not voice input');
      assert.equal(spoken.baseUrl, 'http://localhost:8002');
      assert.equal(spoken.mode, 'mirid');
      assert.equal(spoken.apiKey, 'tts-key');
      assert.equal(spoken.engine, 'kokoro');
      await ui.speak('hello', 'default', { mode: 'mirid', ttsBaseUrl: 'http://localhost:8001', ttsApiKey: '', ttsEngine: 'chatterbox_nano' });
      assert.equal(spoken.baseUrl, 'http://localhost:8001');
      assert.equal(spoken.engine, 'chatterbox_nano');
      assert.equal(spoken.apiKey, '', 'a separate voice service does not inherit another service key');
    } finally { ui.cancel(); globalThis.Audio = originalAudio; }
  });

  await test('speech playback and cancellation release blob URLs and stop audio', async () => {
    const created = [];
    const revoked = [];
    const audio = [];
    URL.createObjectURL = blob => { created.push(blob); return `blob:test-${created.length}`; };
    URL.revokeObjectURL = url => revoked.push(url);
    globalThis.Audio = class {
      constructor(url) { this.url = url; audio.push(this); }
      async play() {}
      pause() { this.paused = true; }
      removeAttribute(name) { this.removed = name; }
    };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async () => new Blob(['wave'], { type: 'audio/wav' }) };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }) });
    await ui.speak('Hello.', 'test');
    assert.equal(audio.length, 1);
    audio[0].onended();
    assert.deepEqual(revoked, ['blob:test-1']);
    assert.equal(audio[0].paused, true);
    assert.equal(audio[0].removed, 'src');
    await ui.speak('Again.', 'test');
    ui.cancel();
    assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2']);
    assert.equal(audio[1].paused, true);
  });

  await test('unsupported playback is a terminal failure, not a gesture retry', async () => {
    const ready = [], revoked = [], statuses = []; let failures = 0, player;
    URL.createObjectURL = () => 'blob:unsupported'; URL.revokeObjectURL = url => revoked.push(url);
    globalThis.Audio = class {
      constructor() { player = this; }
      async play() { throw Object.assign(new Error('bad audio'), { name: 'NotSupportedError' }); }
      pause() { this.paused = true; }
      removeAttribute() {}
    };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async () => new Blob(['bad audio']) };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }),
      onStatus: value => statuses.push(value), onPlaybackReady: value => ready.push(value),
      onSpeechError: () => { failures++; } });
    await ui.speak('Hello.', 'test');
    assert.equal(failures, 1);
    assert.equal(ready.at(-1), false);
    assert.match(statuses.at(-1), /could not play the returned audio/i);
    assert.deepEqual(revoked, ['blob:unsupported']);
    assert.equal(player.paused, true);
    assert.equal(await ui.playReady(), false, 'unsupported media is not offered as ready audio');
  });

  await test('blocked playback keeps prepared audio for user-gesture retries without resynthesis', async () => {
    const readyStates = [];
    const revoked = [];
    const statuses = [];
    let syntheses = 0, failures = 0;
    let player;
    URL.createObjectURL = () => 'blob:ready';
    URL.revokeObjectURL = url => revoked.push(url);
    globalThis.Audio = class {
      constructor(url) { this.url = url; this.attempts = 0; player = this; }
      async play() { this.attempts++; if (this.attempts < 3) throw Object.assign(new Error('autoplay blocked'), { name: 'NotAllowedError' }); }
      pause() { this.paused = true; }
      removeAttribute(name) { this.removed = name; }
    };
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      synthesize: async () => { syntheses++; return new Blob(['wave'], { type: 'audio/wav' }); }
    };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onStatus: value => statuses.push(value), onPlaybackReady: ready => readyStates.push(ready), onSpeechError: () => { failures++; } });
    await ui.speak('Hello.', 'test');
    assert.equal(player.attempts, 1);
    assert.equal(readyStates.at(-1), true);
    assert.match(statuses.at(-1), /select play ready audio/i);
    assert.deepEqual(revoked, [], 'Audio must remain prepared after blocked playback');
    assert.equal(await ui.playReady(), false);
    assert.equal(readyStates.at(-1), true);
    assert.deepEqual(revoked, []);
    assert.equal(await ui.playReady(), true);
    assert.equal(player.attempts, 3);
    assert.equal(syntheses, 1, 'Retries must not resynthesize');
    assert.equal(failures, 0, 'autoplay denial is not a terminal speech failure');
    assert.equal(readyStates.at(-1), false);
    assert.equal(statuses.at(-1), 'Playing speech.');
    player.onended();
    assert.deepEqual(revoked, ['blob:ready']);
    assert.equal(player.paused, true);
    assert.equal(readyStates.at(-1), false);
  });

  await test('out-of-order retries of the same audio cannot overwrite the latest playback state', async () => {
    let rejectOlder, resolveOlder, count = 0;
    const ready = [], statuses = [];
    URL.createObjectURL = () => 'blob:retry-race'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class {
      play() {
        count++;
        if (count === 1) return Promise.reject(new Error('blocked'));
        if (count === 2) return new Promise((resolve, reject) => { resolveOlder = resolve; rejectOlder = reject; });
        if (count === 3) return Promise.resolve();
        if (count === 4) return new Promise(resolve => { resolveOlder = resolve; });
        return Promise.reject(new Error('blocked'));
      }
      pause() {} removeAttribute() {}
    };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async () => new Blob(['wave']) };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onPlaybackReady: value => ready.push(value), onStatus: value => statuses.push(value) });
    await ui.speak('Hello.', 'test');
    assert.equal(ready.at(-1), true);
    const olderFailure = ui.playReady();
    assert.equal(await ui.playReady(), true);
    rejectOlder(new Error('late blocked result'));
    assert.equal(await olderFailure, false);
    assert.equal(ready.at(-1), false);
    assert.equal(statuses.at(-1), 'Playing speech.');
    const olderSuccess = ui.playReady();
    assert.equal(await ui.playReady(), false);
    resolveOlder();
    assert.equal(await olderSuccess, false);
    assert.equal(ready.at(-1), true);
    assert.match(statuses.at(-1), /select play ready audio/i);
    ui.cancel();
  });

  await test('cancelling blocked playback removes retry and revokes prepared audio', async () => {
    const readyStates = [];
    const revoked = [];
    URL.createObjectURL = () => 'blob:blocked';
    URL.revokeObjectURL = url => revoked.push(url);
    globalThis.Audio = class { async play() { throw new Error('blocked'); } pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async () => new Blob(['wave']) };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }), onPlaybackReady: ready => readyStates.push(ready) });
    await ui.speak('Hello.', 'test');
    assert.equal(readyStates.at(-1), true);
    ui.cancel();
    assert.deepEqual(revoked, ['blob:blocked']);
    assert.equal(readyStates.at(-1), false);
    assert.equal(await ui.playReady(), false);
  });

  await test('late synthesized audio cannot play after cancellation', async () => {
    let resolveAudio;
    let signal;
    let played = 0;
    URL.createObjectURL = () => { played++; return 'blob:unexpected'; };
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      synthesize: options => { signal = options.signal; return new Promise(resolve => { resolveAudio = resolve; }); }
    };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://example.invalid' }) });
    const pending = ui.speak('Hello.', 'test');
    await flush();
    ui.cancel();
    assert.equal(signal.aborted, true);
    resolveAudio(new Blob(['late'], { type: 'audio/wav' }));
    await pending;
    assert.equal(played, 0);
  });
  await test('invalid Realtime text and voice are rejected before requesting a token', async () => {
    const source = await readFile(new URL('../src/realtime-speech.js', import.meta.url));
    const { validateRealtimeSpeechInput } = await import(`data:text/javascript;base64,${source.toString('base64')}`);
    let requests = 0, status = '';
    globalThis.__voiceMocks = {
      microphone: { cancel() {} }, validateRealtime: validateRealtimeSpeechInput,
      getRealtimeClientSecret: async () => { requests++; return 'fake'; }
    };
    for (const [text, voice] of [['', 'marin'], ['x'.repeat(2001), 'marin'], ['Hello.', 'invalid voice']]) {
      const ui = createVoiceUI({ getSettings: () => ({ ttsProvider: 'realtime', realtimeVoice: voice }), onStatus: value => { status = value; } });
      await ui.speak(text);
      assert.equal(requests, 0, 'invalid input must not consume a token request');
      assert.match(status, /Speech text|valid Realtime voice/);
    }
  });

  await test('Realtime read-aloud mints only on request and leaves ASR settings independent', async () => {
    const calls = [];
    URL.createObjectURL = () => 'blob:realtime'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = {
      microphone: { cancel() {}, start: async () => calls.push('record') },
      validate: settings => { calls.push(['asr', settings]); },
      getRealtimeClientSecret: async options => { calls.push(['mint', options]); return 'ek_test'; },
      synthesizeRealtimeSpeech: async options => { calls.push(['realtime', options]); return new Blob(['wave']); },
      synthesize: async () => { throw new Error('wrong TTS provider'); }
    };
    const settings = { mode: 'mirid', baseUrl: 'http://localhost:8000', ttsProvider: 'realtime', realtimeUrl: 'https://companion.invalid', realtimeToken: 'p'.repeat(32), realtimeVoice: 'marin' };
    const ui = createVoiceUI({ getSettings: () => settings });
    const button = ui.attachRecorder(new Element(), new Element());
    assert.equal(calls.length, 0, 'settings and recorder creation do not mint a token');
    await ui.speak('Hello.', 'af_heart');
    assert.equal(calls[0][0], 'mint'); assert.equal(calls[1][0], 'realtime');
    assert.equal(calls[1][1].token, 'ek_test'); assert.equal(calls[1][1].voice, 'marin');
    await button.click();
    assert.equal(calls[2][0], 'asr'); assert.equal(calls[2][1].mode, 'mirid');
    assert.equal(calls[3], 'record'); ui.cancel();
  });

  await test('Realtime maps each cast member to a distinct supported voice, including preview', async () => {
    const cast = ['Narrator', 'You', 'Service', 'Niko', 'Mira', 'Ash', 'Mallow'];
    const supported = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
    for (const chosen of ['marin', 'cedar', 'shimmer', 'coral', 'sage', 'echo', 'ballad', 'alloy']) {
      const voices = cast.map(name => realtimeVoiceFor(name, chosen));
      assert.equal(voices[0], chosen);
      assert.equal(new Set(voices).size, cast.length, `unique cast with narrator ${chosen}`);
      assert.ok(voices.every(voice => supported.has(voice)));
    }
    const calls = [];
    URL.createObjectURL = () => 'blob:realtime-cast'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      getRealtimeClientSecret: async () => 'ek_test',
      synthesizeRealtimeSpeech: async options => { calls.push(options); return new Blob(['wave']); }
    };
    const ui = createVoiceUI({ getSettings: () => ({ ttsProvider: 'realtime', realtimeVoice: 'cedar', realtimeUrl: 'https://companion.invalid', realtimeToken: 'p'.repeat(32) }) });
    for (const speaker of cast) {
      await ui.speak('Hello.', 'unused-kokoro-id', {}, speaker);
    }
    assert.deepEqual(calls.map(call => call.voice), cast.map(name => realtimeVoiceFor(name, 'cedar')));
    assert.equal(new Set(calls.map(call => call.voice)).size, cast.length);
    ui.cancel();
  });

  await test('Realtime mixed passage keeps a creator reference on its own service', async () => {
    const calls = [], players = [];
    URL.createObjectURL = () => 'blob:mixed-realtime'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      getRealtimeClientSecret: async () => 'ek_test',
      synthesizeRealtimeSpeech: async options => { calls.push(['realtime', options]); return new Blob(['wave']); },
      synthesize: async options => { calls.push(['reference', options]); return new Blob(['wave']); }
    };
    const ui = createVoiceUI({ getSettings: () => ({ ttsProvider: 'realtime', realtimeVoice: 'marin', realtimeUrl: 'https://companion.invalid', realtimeToken: 'p'.repeat(32), mode: 'mirid', baseUrl: 'https://tts.invalid' }) });
    await ui.speakSequence([
      { speaker: 'Narrator', text: 'A line. ', voice: 'default', overrides: { ttsProvider: 'standard', ttsMode: 'mirid', ttsBaseUrl: 'https://creator.invalid', ttsEngine: 'chatterbox_nano' } },
      { speaker: 'Niko', text: 'Another line.', voice: 'am_adam' },
      { speaker: 'Mira', text: 'A third line.', voice: 'af_bella' }
    ]);
    await flush();
    assert.equal(calls[0][0], 'reference');
    assert.equal(calls[0][1].baseUrl, 'https://creator.invalid');
    assert.equal(calls[0][1].engine, 'chatterbox_nano');
    assert.equal(calls[1][0], 'realtime');
    assert.equal(calls[1][1].voice, 'cedar');
    players[0].onended(); await flush();
    assert.equal(calls[2][0], 'realtime');
    assert.equal(calls[2][1].voice, 'shimmer');
    ui.cancel();
  });

  await test('two concurrent prefetched voices share one secret across passages, until its expiry margin', async () => {
    const calls = [], players = [];
    let resolveToken, mints = 0;
    let now = Date.now();
    const originalNow = Date.now;
    Date.now = () => now;
    try {
      URL.createObjectURL = () => 'blob:reuse'; URL.revokeObjectURL = () => {};
      globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() {} removeAttribute() {} };
      globalThis.__voiceMocks = {
        microphone: { cancel() {} },
        getRealtimeClientSecret: () => { mints++; return new Promise(resolve => { resolveToken = resolve; }); },
        synthesizeRealtimeSpeech: async options => { calls.push(options); return new Blob(['wave']); },
        synthesize: async () => new Blob(['reference'])
      };
      const ui = createVoiceUI({ getSettings: () => ({ ttsProvider: 'realtime', realtimeUrl: 'https://one.invalid', realtimeToken: 'p'.repeat(32), prefetchParts: '2', mode: 'mirid', baseUrl: 'https://tts.invalid' }) });
      assert.equal(mints, 0, 'opening the game does not issue a token');
      await ui.speakSequence([
        { text: 'Creator.', speaker: 'Narrator', overrides: { ttsProvider: 'standard' } },
        { text: 'Niko.', speaker: 'Niko' }, { text: 'Mira.', speaker: 'Mira' }
      ]);
      await flush(); assert.equal(mints, 1, 'both pending voices share the request');
      resolveToken({ value: 'ek_one', expiresAt: now + 20000 }); await flush();
      assert.deepEqual(calls.map(call => call.voice), ['cedar', 'shimmer']);
      await ui.speak('Next passage.', '', {}, 'Ash');
      assert.equal(mints, 1, 'a subsequent passage reuses the unexpired secret');
      assert.equal(calls[2].voice, 'echo');
      now += 15001;
      const refreshed = ui.speak('After expiry margin.', '', {}, 'Mallow'); await flush();
      assert.equal(mints, 2, 'a secret within five seconds of expiry is not reused');
      resolveToken({ value: 'ek_two', expiresAt: now + 20000 }); await refreshed;
      assert.equal(calls.at(-1).token, 'ek_two'); ui.cancel();
    } finally { Date.now = originalNow; }
  });

  await test('Realtime secrets do not cross credentials and failures or settings changes discard them', async () => {
    let mints = 0, fail = false;
    const options = { ttsProvider: 'realtime', realtimeUrl: 'https://one.invalid', realtimeToken: 'a'.repeat(32) };
    const calls = [];
    URL.createObjectURL = () => 'blob:credentials'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      getRealtimeClientSecret: async ({ pairingToken }) => { mints++; if (pairingToken.startsWith('b')) throw new Error('bad pairing'); return `ek_${mints}`; },
      synthesizeRealtimeSpeech: async ({ token }) => { calls.push(token); if (fail) throw new Error('revoked'); return new Blob(['wave']); }
    };
    const ui = createVoiceUI({ getSettings: () => options });
    await ui.speak('One.'); assert.equal(mints, 1);
    options.realtimeToken = 'b'.repeat(32);
    await ui.speak('Bad pairing.'); assert.equal(mints, 2); assert.deepEqual(calls, ['ek_1']);
    options.realtimeToken = 'a'.repeat(32);
    await ui.speak('Return.'); assert.equal(mints, 3); assert.equal(calls.at(-1), 'ek_3');
    fail = true; await ui.speak('Revoked.'); assert.equal(mints, 3);
    fail = false; await ui.speak('Retry.'); assert.equal(mints, 4); assert.equal(calls.at(-1), 'ek_4');
    options.realtimeUrl = 'https://two.invalid'; await ui.speak('Different companion.'); assert.equal(mints, 5);
    ui.clearRealtimeSecret(); await ui.speak('Settings reset.'); assert.equal(mints, 6); ui.cancel();
  });

  await test('cancellation while obtaining a Realtime token never starts synthesis', async () => {
    let resolveToken, signal, syntheses = 0, mints = 0;
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      getRealtimeClientSecret: options => { mints++; if (mints > 1) return Promise.resolve('ek_new'); signal = options.signal; return new Promise(resolve => { resolveToken = resolve; }); },
      synthesizeRealtimeSpeech: async () => { syntheses++; return new Blob(['wave']); }
    };
    const ui = createVoiceUI({ getSettings: () => ({ ttsProvider: 'realtime', realtimeUrl: 'https://companion.invalid', realtimeToken: 'p'.repeat(32) }) });
    const pending = ui.speak('Hello.', 'voice'); await flush();
    ui.cancel(); assert.ok(signal.aborted); resolveToken('ek_late'); await pending;
    assert.equal(syntheses, 0);
    await ui.speak('Try again.', 'voice');
    assert.equal(mints, 2, 'a late cancelled result was not cached');
    assert.equal(syntheses, 1); ui.cancel();
  });

  await test('a failed prefetched segment aborts a later Realtime token request', async () => {
    let tokenSignal, resolveToken, audio, mints = 0, usedToken;
    URL.createObjectURL = () => 'blob:prefetch-failure'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { constructor() { audio = this; } async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      synthesize: async ({ text }) => {
        if (text === 'Broken.') throw new Error('Standard provider failed');
        return new Blob(['wave']);
      },
      getRealtimeClientSecret: ({ signal }) => {
        mints++;
        if (mints > 1) return Promise.resolve('ek_fresh');
        tokenSignal = signal; return new Promise(resolve => { resolveToken = resolve; });
      },
      synthesizeRealtimeSpeech: async ({ token }) => { usedToken = token; return new Blob(['wave']); }
    };
    const ui = createVoiceUI({ getSettings: () => ({ ttsProvider: 'realtime', realtimeUrl: 'https://companion.invalid', realtimeToken: 'p'.repeat(32), prefetchParts: '2', mode: 'mirid', baseUrl: 'https://tts.invalid' }) });
    await ui.speakSequence([
      { text: 'Opening.', overrides: { ttsProvider: 'standard' } },
      { text: 'Broken.', overrides: { ttsProvider: 'standard' } },
      { text: 'Later.', speaker: 'Niko' }
    ]);
    await flush(); assert.ok(tokenSignal && !tokenSignal.aborted);
    audio.onended(); await flush();
    assert.ok(tokenSignal.aborted, 'the shared request must stop with the failed sequence');
    resolveToken('ek_late'); await flush();
    assert.equal(usedToken, undefined, 'a late token does not start stopped speech');
    await ui.speak('Try again.', '', {}, 'Niko');
    assert.equal(mints, 2, 'the late token was not cached');
    assert.equal(usedToken, 'ek_fresh');
    ui.cancel();
  });

  await test('Nano segmentation retains exact text and never splits words or Unicode code points', async () => {
    const texts = [
      'An opening. '.repeat(45) + '“A final line… yes!”',
      'x'.repeat(179) + '😀' + 'y'.repeat(220) + ' end.',
      'start ' + ' '.repeat(380) + ' finish',
      'A sentence without an ending '.repeat(25)
    ];
    for (const text of texts) {
      const parts = splitNanoPassage(text);
      assert.equal(parts.join(''), text);
      assert.ok(parts.every(part => part.isWellFormed() && part.trim()), 'no broken code points or empty speech parts');
      for (let i = 0; i < parts.length - 1; i++) assert.ok(/\s$/.test(parts[i]) || /^\s/.test(parts[i + 1]), 'do not split an unbroken word');
    }
  });

  await test('Nano segmentation works without Array.prototype.at, as on early iOS 15', () => {
    const text = 'An opening sentence. '.repeat(25);
    const originalAt = Array.prototype.at;
    try {
      Array.prototype.at = undefined;
      assert.equal(splitNanoPassage(text).join(''), text);
    } finally {
      Array.prototype.at = originalAt;
    }
  });

  await test('a mixed passage speaks in order using the selected service for each speaker', async () => {
    const requests = [], players = [], urls = [];
    URL.createObjectURL = () => `blob:cast-${urls.length + 1}`;
    URL.revokeObjectURL = value => urls.push(value);
    globalThis.Audio = class {
      constructor(url) { this.src = url; this.plays = []; players.push(this); }
      async play() { this.plays.push(this.src); }
      pause() {} removeAttribute() {}
    };
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      synthesize: async options => { requests.push(options); return new Blob(['wave']); }
    };
    const ui = createVoiceUI({ getSettings: () => ({
      mode: 'mirid', baseUrl: 'https://transcription.invalid', apiKey: 'private-asr',
      ttsBaseUrl: 'https://kokoro.invalid', ttsMode: 'mirid', ttsEngine: 'kokoro'
    }) });
    await ui.speakSequence([
      { text: 'The tape is loose. ', voice: 'default', overrides: { ttsBaseUrl: 'https://chatterbox.invalid', ttsApiKey: '', ttsMode: 'mirid', ttsEngine: 'chatterbox_nano' } },
      { text: '“My brother wrote that.”', voice: 'am_adam' },
      { text: ' He smiles.', voice: 'default', overrides: { ttsBaseUrl: 'https://chatterbox.invalid', ttsApiKey: '', ttsMode: 'mirid', ttsEngine: 'chatterbox_nano' } }
    ]);
    await flush();
    assert.equal(players.length, 1);
    assert.equal(requests.length, 2, 'only the next voice is prefetched');
    assert.deepEqual(requests.map(r => [r.baseUrl, r.engine, r.voice]), [
      ['https://chatterbox.invalid', 'chatterbox_nano', 'default'],
      ['https://kokoro.invalid', 'kokoro', 'am_adam']
    ]);
    assert.ok(requests.every(r => !r.apiKey), 'transcription key stays out of both voice requests');
    players[0].onended(); await flush();
    assert.equal(requests.length, 3);
    assert.equal(requests[2].baseUrl, 'https://chatterbox.invalid');
    players[0].onended(); await flush();
    players[0].onended(); await flush();
    assert.equal(players[0].plays.length, 3);
    assert.equal(urls.length, 3);
  });

  await test('opt-in faster preparation keeps mixed voices in order when requests finish out of order', async () => {
    const requests = [], deferred = [], players = [];
    let nextUrl = 0;
    URL.createObjectURL = () => `blob:fast-${++nextUrl}`;
    URL.revokeObjectURL = () => {};
    globalThis.Audio = class {
      constructor(url) { this.src = url; this.plays = []; players.push(this); }
      async play() { this.plays.push(this.src); }
      pause() {} removeAttribute() {}
    };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: options => {
      requests.push(options);
      if (requests.length === 1) return Promise.resolve(new Blob(['first']));
      return new Promise((resolve, reject) => deferred.push({ resolve, reject, signal: options.signal }));
    } };
    const ui = createVoiceUI({ getSettings: () => ({
      mode: 'mirid', baseUrl: 'https://kokoro.invalid', ttsEngine: 'kokoro', prefetchParts: '2'
    }) });
    const reference = { ttsBaseUrl: 'https://chatterbox.invalid', ttsMode: 'mirid', ttsEngine: 'chatterbox_nano' };
    await ui.speakSequence([
      { text: 'First.', voice: 'default', overrides: reference },
      { text: 'Second.', voice: 'am_adam' },
      { text: 'Third.', voice: 'default', overrides: reference },
      { text: 'Fourth.', voice: 'am_adam' }
    ]);
    await flush();
    assert.deepEqual(requests.map(item => [item.text, item.baseUrl, item.voice]), [
      ['First.', 'https://chatterbox.invalid', 'default'],
      ['Second.', 'https://kokoro.invalid', 'am_adam'],
      ['Third.', 'https://chatterbox.invalid', 'default']
    ]);
    deferred[1].resolve(new Blob(['third'])); await flush();
    players[0].onended(); await flush();
    assert.equal(players[0].plays.length, 1, 'third must not play while second is pending');
    deferred[0].resolve(new Blob(['second'])); await flush();
    assert.equal(players[0].plays.length, 2);
    assert.equal(requests[3].text, 'Fourth.');
    players[0].onended(); await flush();
    assert.equal(players[0].plays.length, 3);
    deferred[2].resolve(new Blob(['fourth'])); await flush();
    players[0].onended(); await flush();
    assert.equal(players[0].plays.length, 4);
    players[0].onended(); await flush();
    ui.cancel();
  });

  await test('stopping faster preparation aborts both future requests and ignores late results', async () => {
    const requests = [], deferred = [], players = [];
    URL.createObjectURL = () => 'blob:fast-first'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { constructor() { players.push(this); this.plays = 0; } async play() { this.plays++; } pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: options => {
      requests.push(options);
      return requests.length === 1 ? Promise.resolve(new Blob(['first'])) : new Promise(resolve => deferred.push(resolve));
    } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'https://voice.invalid', mode:'mirid', ttsEngine:'kokoro', prefetchParts:'2' }) });
    await ui.speakSequence([{ text:'First.', voice:'a' }, { text:'Second.', voice:'b' }, { text:'Third.', voice:'c' }]); await flush();
    assert.equal(requests.length, 3);
    ui.cancel();
    assert.ok(requests[1].signal.aborted && requests[2].signal.aborted);
    deferred[0](new Blob(['second'])); deferred[1](new Blob(['third'])); await flush();
    assert.equal(players[0].plays, 1, 'no cancelled segment can start playback');
  });

  await test('a failed fast-prefetched part cancels later work and reports the interruption', async () => {
    const requests = [], players = []; let rejectNext, resolveLater, status = '', errors = 0;
    URL.createObjectURL = () => 'blob:fast-failure'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: options => {
      requests.push(options);
      if (requests.length === 1) return Promise.resolve(new Blob(['first']));
      if (requests.length === 2) return new Promise((_resolve, reject) => { rejectNext = reject; });
      return new Promise(resolve => { resolveLater = resolve; });
    } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'https://voice.invalid', mode:'mirid', ttsEngine:'kokoro', prefetchParts:'2' }), onStatus: value => { status = value; }, onSpeechError: () => { errors++; } });
    await ui.speakSequence([{ text:'First.', voice:'a' }, { text:'Second.', voice:'b' }, { text:'Third.', voice:'c' }]); await flush();
    rejectNext(new Error('provider error')); await flush();
    players[0].onended(); await flush();
    assert.equal(requests[2].signal.aborted, true);
    assert.match(status, /stopped partway/i); assert.equal(errors, 1);
    resolveLater(new Blob(['late'])); await flush();
    assert.match(status, /stopped partway/i);
    ui.cancel();
  });

  await test('stopping a mixed passage aborts the next speaker and ignores its late audio', async () => {
    const players = [], calls = []; let finishNext;
    URL.createObjectURL = () => 'blob:cast-first'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() { this.paused = true; } removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: options => {
      calls.push(options);
      return calls.length === 1 ? Promise.resolve(new Blob(['first'])) : new Promise(resolve => { finishNext = resolve; });
    } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'https://voice.invalid', mode: 'mirid', ttsEngine: 'kokoro' }) });
    await ui.speakSequence([{ text: 'First.', voice: 'af_heart' }, { text: 'Second.', voice: 'am_adam' }]); await flush();
    assert.equal(calls.length, 2);
    ui.cancel(); assert.equal(calls[1].signal.aborted, true);
    finishNext(new Blob(['late'])); await flush();
    assert.equal(players.length, 1); assert.equal(players[0].paused, true);
  });

  await test('long Nano speech starts early, prefetches one part and plays each part in order', async () => {
    const text = 'A soft sentence about an arcade and its friends. '.repeat(12).trim();
    const parts = splitNanoPassage(text);
    assert.ok(parts.length >= 3);
    const requests = [], deferred = [], revoked = [], ready = [], statuses = [], players = [];
    let nextUrl = 0;
    URL.createObjectURL = () => `blob:segment-${++nextUrl}`;
    URL.revokeObjectURL = value => revoked.push(value);
    globalThis.Audio = class {
      constructor(url) { this.src = url; this.plays = []; players.push(this); }
      async play() { this.plays.push(this.src); }
      pause() { this.paused = true; }
      removeAttribute() {}
    };
    globalThis.__voiceMocks = {
      microphone: { cancel() {} },
      synthesize: options => {
        requests.push(options);
        if (requests.length === 1) return Promise.resolve(new Blob(['first'], { type:'audio/wav' }));
        return new Promise(resolve => deferred.push(resolve));
      }
    };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'https://companion.invalid', mode:'mirid', ttsEngine:'chatterbox_nano', apiKey:'paired' }), onStatus: value => statuses.push(value), onPlaybackReady: value => ready.push(value) });
    await ui.speak(text, 'default'); await flush();
    assert.equal(players.length, 1); assert.equal(players[0].plays.length, 1, 'first part plays without waiting for the rest');
    assert.equal(requests.length, 2, 'at most the next part is prefetched');
    assert.equal(requests[0].text, parts[0]); assert.equal(requests[1].text, parts[1]);
    assert.ok(requests.every(item => item.voice === 'default' && item.apiKey === 'paired'));
    players[0].onended(); await flush();
    assert.match(statuses.at(-1), /next part/i);
    deferred.shift()(new Blob(['second'], { type:'audio/wav' })); await flush();
    assert.equal(players.length, 1, 'the media element is reused');
    assert.equal(players[0].plays.length, 2);
    assert.equal(requests.length, 3, 'the following part starts only after the second is ready');
    assert.deepEqual(revoked, ['blob:segment-1']);
    for (let index = 2; index < parts.length; index++) {
      players[0].onended(); await flush();
      deferred.shift()(new Blob([`part-${index}`], { type:'audio/wav' })); await flush();
    }
    assert.deepEqual(requests.map(item => item.text), parts);
    players[0].onended(); await flush();
    assert.equal(statuses.at(-1), 'Speech finished.');
    assert.equal(players[0].paused, true);
    assert.equal(revoked.length, parts.length);
    assert.equal(ready.at(-1), false);
  });

  await test('cancelling while the next Nano segment is pending aborts it and ignores late audio', async () => {
    let resolveNext; const requests = [], players = [], revoked = [];
    URL.createObjectURL = () => 'blob:first'; URL.revokeObjectURL = value => revoked.push(value);
    globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() { this.paused = true; } removeAttribute() {} };
    globalThis.__voiceMocks = { microphone:{ cancel() {} }, synthesize: options => {
      requests.push(options);
      return requests.length === 1 ? Promise.resolve(new Blob(['first'])) : new Promise(resolve => { resolveNext = resolve; });
    } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'http://localhost:8001', mode:'mirid', ttsEngine:'chatterbox_nano' }) });
    await ui.speak('One sentence for the team. '.repeat(20), 'default'); await flush();
    ui.cancel(); assert.equal(requests[1].signal.aborted, true);
    resolveNext(new Blob(['late'])); await flush();
    assert.equal(players.length, 1); assert.equal(players[0].paused, true);
    assert.deepEqual(revoked, ['blob:first']);
  });

  await test('blocked playback on a later Nano part remains retryable without resynthesis', async () => {
    const ready = [], players = [], requests = []; let blocked = true;
    URL.createObjectURL = () => `blob:${requests.length}`; URL.revokeObjectURL = () => {};
    globalThis.Audio = class {
      constructor() { this.plays = 0; players.push(this); }
      async play() { this.plays++; if (this.plays === 2 && blocked) { blocked = false; throw new Error('blocked'); } }
      pause() {} removeAttribute() {}
    };
    globalThis.__voiceMocks = { microphone:{ cancel() {} }, synthesize: async options => { requests.push(options); return new Blob(['part']); } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'http://localhost:8001', mode:'mirid', ttsEngine:'chatterbox_nano' }), onPlaybackReady:value => ready.push(value) });
    await ui.speak('A sentence about the arcade. '.repeat(12), 'default'); await flush();
    players[0].onended(); await flush();
    assert.equal(ready.at(-1), true);
    const count = requests.length;
    assert.equal(await ui.playReady(), true);
    assert.equal(requests.length, count, 'retry reuses the prepared audio');
    ui.cancel();
  });

  await test('fast preparation retains a blocked later part for retry without repeating requests', async () => {
    const ready = [], players = [], requests = [];
    URL.createObjectURL = () => `blob:${requests.length}`; URL.revokeObjectURL = () => {};
    globalThis.Audio = class {
      constructor() { this.plays = 0; players.push(this); }
      async play() { if (++this.plays === 2) throw new Error('blocked'); }
      pause() {} removeAttribute() {}
    };
    globalThis.__voiceMocks = { microphone:{ cancel() {} }, synthesize: async options => { requests.push(options); return new Blob(['part']); } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'http://localhost:8001', mode:'mirid', ttsEngine:'chatterbox_nano', prefetchParts:'2' }), onPlaybackReady:value => ready.push(value) });
    await ui.speak('A sentence about the arcade. '.repeat(20), 'default'); await flush();
    players[0].onended(); await flush();
    assert.equal(ready.at(-1), true);
    const count = requests.length;
    assert.equal(await ui.playReady(), true);
    assert.equal(requests.length, count, 'retry reuses the prepared audio');
    ui.cancel();
  });

  await test('a failed later segment reports that speech stopped partway', async () => {
    const statuses = [], players = []; let calls = 0, failures = 0;
    URL.createObjectURL = () => 'blob:first'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone:{ cancel() {} }, synthesize: async () => {
      if (++calls === 1) return new Blob(['first']);
      throw new Error('private provider detail');
    } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'http://localhost:8001', mode:'mirid', ttsEngine:'chatterbox_nano' }), onStatus:value => statuses.push(value), onSpeechError: () => { failures++; } });
    await ui.speak('A sentence about the arcade. '.repeat(12), 'default'); await flush();
    players[0].onended(); await flush();
    assert.equal(failures, 1);
    assert.match(statuses.at(-1), /stopped partway/i);
    assert.doesNotMatch(statuses.at(-1), /private provider detail/i);
  });

  await test('cancellation before the prefetch microtask prevents another request', async () => {
    let calls = 0, ui;
    URL.createObjectURL = () => 'blob:first'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() { ui.cancel(); } pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone:{ cancel() {} }, synthesize: async () => { calls++; return new Blob(['first']); } };
    ui = createVoiceUI({ getSettings: () => ({ baseUrl:'http://localhost:8001', mode:'mirid', ttsEngine:'chatterbox_nano' }) });
    await ui.speak('A sentence about the arcade. '.repeat(12), 'default'); await flush();
    assert.equal(calls, 1);
  });

  await test('a late media play resolution after cancellation cannot restore playback status', async () => {
    let resolvePlay; const statuses = [], ready = [];
    URL.createObjectURL = () => 'blob:first'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { play() { return new Promise(resolve => { resolvePlay = resolve; }); } pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone:{ cancel() {} }, synthesize: async () => new Blob(['part']) };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'http://localhost:8001', mode:'mirid', ttsEngine:'chatterbox_nano' }), onStatus:value => statuses.push(value), onPlaybackReady:value => ready.push(value) });
    const speaking = ui.speak('A sentence about the arcade. '.repeat(12), 'default'); await flush();
    ui.cancel(); const last = statuses.at(-1); resolvePlay(); await speaking; await flush();
    assert.equal(statuses.at(-1), last);
    assert.equal(ready.at(-1), false);
  });

  await test('a late earlier play promise cannot hide a later segment retry', async () => {
    let resolveFirst; const ready = [], players = []; let calls = 0;
    URL.createObjectURL = () => `blob:${++calls}`; URL.revokeObjectURL = () => {};
    globalThis.Audio = class {
      constructor() { this.plays = 0; players.push(this); }
      play() {
        this.plays++;
        if (this.plays === 1) return new Promise(resolve => { resolveFirst = resolve; });
        if (this.plays === 2) return Promise.reject(new Error('blocked'));
        return Promise.resolve();
      }
      pause() {} removeAttribute() {}
    };
    globalThis.__voiceMocks = { microphone:{ cancel() {} }, synthesize: async () => new Blob(['part']) };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'http://localhost:8001', mode:'mirid', ttsEngine:'chatterbox_nano' }), onPlaybackReady:value => ready.push(value) });
    const speaking = ui.speak('A sentence about the arcade. '.repeat(12), 'default'); await flush();
    players[0].onended(); await flush();
    assert.equal(ready.at(-1), true, 'later part needs a manual retry');
    resolveFirst(); await speaking; await flush();
    assert.equal(ready.at(-1), true, 'earlier promise cannot clear the retry');
    assert.equal(await ui.playReady(), true);
    ui.cancel();
  });

  await test('an expired Chatterbox voice produces a useful playback message', async () => {
    let status = '';
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async () => {
      throw new Error('Speech endpoint or voice reference was not found. Check the service URL or select or upload the voice again.');
    } };
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl: 'http://localhost:8001', mode: 'mirid', ttsEngine: 'chatterbox_nano' }), onStatus: value => { status = value; } });
    await ui.speak('Hello.', 'expired.wav');
    assert.match(status, /voice reference.*upload the voice again/i);
    ui.cancel();
  });

  await test('other speech engines remain single-request and Nano keeps the whole-passage limit', async () => {
    const calls = [], statuses = [];
    URL.createObjectURL = () => 'blob:one'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone:{ cancel() {} }, synthesize: async options => { calls.push(options); return new Blob(['wave']); } };
    const input = 'A sentence with a dot. '.repeat(30);
    const ui = createVoiceUI({ getSettings: () => ({ baseUrl:'https://example.invalid', mode:'mirid', ttsEngine:'kokoro' }) });
    await ui.speak(input, 'af_bella');
    assert.equal(calls.length, 1); assert.equal(calls[0].text, input);
    ui.cancel(); calls.length = 0;
    const nano = createVoiceUI({ getSettings: () => ({ baseUrl:'https://example.invalid', mode:'mirid', ttsEngine:'chatterbox_nano' }), onStatus: value => statuses.push(value) });
    await nano.speak('A '.repeat(1001), 'default');
    assert.equal(calls.length, 0); assert.match(statuses.at(-1), /2000/);
  });

  console.log('All voice UI tests passed.');
  await test('completion fires only once after all spoken parts, never after cancellation or failure', async () => {
    const players = []; let completed = 0;
    URL.createObjectURL = () => 'blob:auto'; URL.revokeObjectURL = () => {};
    globalThis.Audio = class { constructor() { players.push(this); } async play() {} pause() {} removeAttribute() {} };
    globalThis.__voiceMocks = { microphone: { cancel() {} }, synthesize: async () => new Blob(['wave']) };
    const ui = createVoiceUI({ getSettings: () => ({ mode: 'mirid', baseUrl: 'https://example.invalid' }), lookupBundledSpeech: async () => null });
    await ui.speakSequence([{ speaker: 'Narrator', text: 'First.' }, { speaker: 'Mira', text: 'Second.' }], { onComplete: () => completed++ });
    await flush(); assert.equal(ui.hasSpeech(), true); const stale = players[0].onended;
    players[0].onended(); await flush(); assert.equal(completed, 0, 'a first part cannot finish the sequence');
    players[0].onended(); await flush(); assert.equal(completed, 1); assert.equal(ui.hasSpeech(), false);
    stale(); await flush(); assert.equal(completed, 1, 'an old event cannot finish twice');
    await ui.speakSequence([{ speaker: 'Narrator', text: 'Third.' }], { onComplete: () => completed++ });
    const cancelled = players.at(-1).onended; ui.cancel(); cancelled(); await flush(); assert.equal(completed, 1);
    globalThis.__voiceMocks.synthesize = async () => { throw new Error('failed'); };
    await ui.speakSequence([{ speaker: 'Narrator', text: 'Unavailable.' }], { onComplete: () => completed++ });
    assert.equal(completed, 1, 'failed synthesis cannot advance the story');
  });
} finally {
  globalThis.Blob = originals.Blob;
  globalThis.document = originals.document;
  globalThis.Audio = originals.Audio;
  globalThis.Event = originals.Event;
  globalThis.__voiceMocks = originals.mocks;
  URL.createObjectURL = originals.makeUrl;
  URL.revokeObjectURL = originals.revokeUrl;
  await rm(temp, { recursive: true, force: true });
}
