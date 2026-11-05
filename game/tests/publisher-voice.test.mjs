import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publisherVoice, publisherKokoro, resolvePublisherVoice, resolvePublisherKokoro, initializePublisherVoices, creatorVoiceAudition, creatorVoiceToolsForNative } from '../src/publisher-voice.js';

const cast = ['Narrator', 'Niko', 'Mira', 'Ash', 'Mallow'];
const fixture = { speaker: 'Mira', engine: 'chatterbox_nano', voice: 'default', baseUrl: 'https://speech.example/game/' };

test('a publisher can configure one separate public Kokoro service without credentials', () => {
  assert.equal(resolvePublisherKokoro(null), null);
  if (publisherKokoro !== null) assert.ok(resolvePublisherKokoro(publisherKokoro));
  assert.deepEqual(resolvePublisherKokoro({baseUrl: 'https://speech.example/kokoro/'}), {baseUrl: 'https://speech.example/kokoro'});
  for (const config of [
    {}, {baseUrl: 'http://speech.example'}, {baseUrl: ' https://speech.example'},
    {baseUrl: 'https://user:pass@speech.example'}, {baseUrl: 'https://speech.example?key=secret'},
    {baseUrl: 'https://speech.example/#secret'}, {baseUrl: 'https://speech.example', apiKey: 'secret'}
  ]) assert.equal(resolvePublisherKokoro(config), null);
  assert.equal(resolvePublisherKokoro(Object.assign(Object.create({baseUrl: 'https://speech.example'}), { unrelated: true })), null);
});

test('unconfigured builds select no speaker or voice', () => {
  assert.equal(resolvePublisherVoice(null, cast), null);
  // A future publisher build can fill this configuration without needing to
  // remove an assertion written for the deliberately empty prototype.
  if (publisherVoice !== null) assert.ok(resolvePublisherVoice(publisherVoice, cast));
});

test('one configured cast member can use one public compatible voice service', () => {
  assert.deepEqual(resolvePublisherVoice(fixture, cast), { ...fixture, baseUrl: 'https://speech.example/game' });
  for (const engine of ['chatterbox_nano', 'chatterbox', 'chatterbox_turbo']) {
    assert.equal(resolvePublisherVoice({ ...fixture, engine, voice: 'shared.wav' }, cast)?.engine, engine);
  }
  for (const voice of ['shared.ogg', 'shared.opus', 'shared.webm', 'shared.aac', 'shared.mp4', 'shared.3gp']) {
    assert.equal(resolvePublisherVoice({ ...fixture, voice }, cast)?.voice, voice);
  }
});

test('rejects unknown speakers, unsupported engines, paths and accidental credentials', () => {
  for (const change of [
    { speaker: 'Unknown' }, { speaker: ['Mira', 'Ash'] }, { engine: 'kokoro' },
    { voice: '../voice.wav' }, { voice: 'voice.txt' }, { voice: 'x'.repeat(201) },
    { baseUrl: 'http://speech.example' }, { baseUrl: 'https://user:password@speech.example' },
    { baseUrl: 'https://speech.example/?key=secret' }, { baseUrl: 'https://speech.example/#secret' },
    { baseUrl: ' https://speech.example' }, { apiKey: 'secret' }
  ]) assert.equal(resolvePublisherVoice({ ...fixture, ...change }, cast), null);
  assert.equal(resolvePublisherVoice(fixture, []), null);
});

test('startup assigns only the selected voice, retains its prior voice, and never embeds an API key', () => {
  const defaults = Object.freeze({ Narrator: 'af_heart', Mira: 'af_bella', Niko: 'am_adam' });
  const result = initializePublisherVoices(fixture, defaults);
  assert.deepEqual(result.voices, { Narrator: 'af_heart', Mira: 'default', Niko: 'am_adam' });
  assert.deepEqual(result.chatterboxVoices, { Mira: {
    engine: 'chatterbox_nano', voice: 'default', baseUrl: 'https://speech.example/game',
    apiKey: '', previousVoice: 'af_bella'
  } });
  assert.equal(defaults.Mira, 'af_bella', 'the caller can reuse its original Kokoro defaults');
});

test('disabled or invalid configuration preserves every existing voice', () => {
  const defaults = { Narrator: 'af_heart', Mira: 'af_bella' };
  for (const config of [null, { ...fixture, speaker: 'Niko' }, { ...fixture, apiKey: 'secret' }]) {
    const result = initializePublisherVoices(config, defaults);
    assert.deepEqual(result.voices, defaults);
    assert.notEqual(result.voices, defaults);
    assert.deepEqual(result.chatterboxVoices, {});
  }
});


test('creator voice audition appears only for an explicit local desktop URL', () => {
  for (const url of [
    'http://127.0.0.1:8766/?voice-creator=1',
    'http://localhost:8766/?voice-creator=1',
    'http://[::1]:8766/?voice-creator=1'
  ]) assert.equal(creatorVoiceAudition(url), true, url);
  for (const url of [
    undefined, null, '', 'not a url', 'http://127.0.0.1:8766/',
    'http://localhost:8766/?voice-creator=0',
    'http://localhost:8766/?voice-creator=1&voice-creator=1',
    'http://user:secret@localhost:8766/?voice-creator=1',
    'http://localhost.example/?voice-creator=1',
    'http://example.com/?voice-creator=1',
    'https://localhost/?voice-creator=1',
    'capacitor://localhost/?voice-creator=1',
    'file:///tmp/game/index.html?voice-creator=1'
  ]) assert.equal(creatorVoiceAudition(url), false, String(url));
});


test('native voice audition requires an explicit private build flag', () => {
  assert.equal(creatorVoiceToolsForNative, false, 'distributed source keeps creator tools off');
  for (const url of ['https://localhost/', 'capacitor://localhost/']) {
    assert.equal(creatorVoiceAudition(url), false);
    assert.equal(creatorVoiceAudition(url, true), true);
  }
  for (const url of ['https://example.com/', 'https://localhost:4444/', 'capacitor://localhost:4444/', 'capacitor://example.com/', 'file:///tmp/index.html']) {
    assert.equal(creatorVoiceAudition(url, true), false, url);
  }
});
