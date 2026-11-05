/** Exercise the actual game adapters against an isolated Mirid service. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [baseUrl, fixturePath, model] = process.argv.slice(2);
if (!baseUrl || !fixturePath || !model) throw new Error('Usage: node mirid-live-client.mjs BASE_URL FIXTURE_WAV MODEL');

async function load(relative) {
  const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
  const dependencyUrl = `data:text/javascript;base64,${dependency.toString('base64')}`;
  const source = (await readFile(new URL(relative, import.meta.url), 'utf8'))
    .replaceAll("'./bounded-json.js'", `'${dependencyUrl}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const { discoverMirid } = await load('../src/mirid.js');
const { respond } = await load('../src/ai.js');
const { transcribeSpeech, synthesizeSpeech } = await load('../src/speech.js');
const { story, characters } = await load('../src/story-next.js');

const discovery = await discoverMirid({ baseUrl, timeoutMs: 10000 });
assert.equal(discovery.health?.status, 'healthy');
assert.ok(discovery.text.models.some((entry) => entry.id === model && entry.kind === 'local'));
assert.equal(discovery.stt.probed, false);
console.log('PASS game discovery: local model advertised, speech probe remains opt-in');

// Keep transport verification separate from stochastic dialogue quality: a
// correctly functioning model may produce text the game's filter rejects.
const originalFetch = globalThis.fetch;
let textResponse = null;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (String(args[0]) === `${baseUrl}/v1/chat/completions`) {
    textResponse = { status: response.status, content: null };
    try { textResponse.content = (await response.clone().json())?.choices?.[0]?.message?.content; }
    catch { /* The assertion below reports a malformed response. */ }
  }
  return response;
};
let reply;
try {
  reply = await respond({
    settings: { endpoint: `${baseUrl}/v1/chat/completions`, model, timeoutMs: 30000 },
    character: { ...characters.Niko, name: 'Niko' },
    playerText: 'You do not have to face this alone.',
    context: `${story.niko_chat.ai.context} In the scene immediately before the player's message, the character said: ${JSON.stringify(story.niko_private.text)}.`,
    privateOtherNames: ['Mira', 'Ash', 'Mallow'],
    fallback: story.niko_chat.ai.fallback
  });
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(textResponse?.status, 200, 'Mirid text request did not succeed');
assert.equal(typeof textResponse?.content, 'string', 'Mirid text response had no text');
assert.ok(textResponse.content.trim(), 'Mirid returned empty text');
assert.ok(reply.text.length > 0);
console.log(`PASS game text transport: HTTP ${textResponse.status}, model returned text`);
console.log(`DIALOGUE QUALITY: ${reply.source === 'ai' ? 'accepted by the format filter' : 'authored fallback used'}; model output ${JSON.stringify(textResponse.content)}`);

// Sample the new end-of-story private exchange with entirely synthetic player
// messages. App integration tests independently verify context construction;
// here we exercise the real adapter and local model with representative facts.
for (const sample of [
  {
    name: 'Niko', node: story.close_niko_chat,
    outcome: 'The player pulled the team back as the floor shifted. Mira is still downstairs; the group plans to bring her back.',
    history: [
      { speaker: 'Player to Niko', text: 'You do not have to fix everything alone.' },
      { speaker: 'Niko', text: 'I hear you. I do not have to solve it this minute.' }
    ],
    question: 'What should we do about Mira now?'
  },
  {
    name: 'Mira', node: story.close_mira_chat,
    outcome: 'The player and Niko opened Mira’s door immediately. Mira has returned safely with the third ticket piece, but the machine ate the paper roll.',
    history: [
      { speaker: 'Player to Mira', text: 'Your friends can care about you and your art.' },
      { speaker: 'Mira', text: 'I am still figuring out what I want to do.' }
    ],
    question: 'Do you still want to go to the workshop?'
  }
]) {
  let raw = null;
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (String(args[0]) === `${baseUrl}/v1/chat/completions`) {
      try { raw = { status: response.status, content: (await response.clone().json())?.choices?.[0]?.message?.content }; }
      catch { raw = { status: response.status }; }
    }
    return response;
  };
  let result;
  try {
    result = await respond({
      settings: { endpoint: `${baseUrl}/v1/chat/completions`, model, timeoutMs: 30000 },
      character: { ...characters[sample.name], name: sample.name },
      playerText: sample.question, context: `${sample.node.ai.context} ${sample.outcome}`,
      memory: sample.history,
      privateOtherNames: ['Niko', 'Mira', 'Ash', 'Mallow'].filter((name) => name !== sample.name),
      fallback: sample.node.ai.fallback
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(raw?.status, 200, `${sample.name} epilogue request failed`);
  assert.equal(typeof raw.content, 'string', `${sample.name} epilogue output was not text`);
  assert.ok(raw.content.trim());
  assert.ok(result.text.length);
  console.log(`EPILOGUE ${sample.name}: ${result.source}; model output ${JSON.stringify(raw.content)}`);
}

const fixture = await readFile(fixturePath);
const transcript = await transcribeSpeech({
  baseUrl, mode: 'mirid-local-kokoro', engine: 'parakeet-cpp:tdt_ctc-110m:q4_k',
  audio: new Blob([fixture], { type: 'audio/wav' }), timeoutMs: 30000
});
assert.equal(transcript.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(),
  'hello there the green garden has five bright flowers');
console.log(`PASS game STT adapter: ${JSON.stringify(transcript)}`);

const speech = await synthesizeSpeech({
  baseUrl, mode: 'mirid-local-kokoro', text: 'Hello there. We are listening.', timeoutMs: 90000
});
assert.ok(speech instanceof Blob && speech.size > 44);
const wav = new Uint8Array(await speech.arrayBuffer());
assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
assert.equal(new TextDecoder().decode(wav.slice(8, 12)), 'WAVE');
console.log(`PASS game TTS adapter: ${speech.size} bytes, RIFF/WAVE audio`);

// Opt-in: exercise actual multi-part Kokoro synthesis with a synthetic passage.
// Short default smoke tests stay quick; this can take minutes on CPU.
if (process.argv.includes('--long-speech')) {
  const passage = ('The rain taps on the window while the arcade lights shine. ').repeat(9).trim();
  assert.ok(Array.from(passage).length > 500);
  const longSpeech = await synthesizeSpeech({
    baseUrl, mode: 'mirid-local-kokoro', text: passage, timeoutMs: 300000
  });
  const audio = new Uint8Array(await longSpeech.arrayBuffer());
  assert.ok(audio.length > 44);
  assert.equal(new TextDecoder().decode(audio.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(audio.slice(8, 12)), 'WAVE');
  console.log(`PASS multi-chunk local Kokoro: ${Array.from(passage).length} characters, ${audio.length} bytes RIFF/WAVE`);
}
