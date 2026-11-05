// Optional synthetic-only local-model comparison; sends no real player data.
// node tests/niko-note-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
async function load(name) {
  const dep = await readFile(new URL('../src/bounded-json.js', import.meta.url));
  const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
    .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dep.toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond } = await load('ai');
const { story, characters } = await load('story-next');
const node = story.niko_chat;
const choiceNode = story.niko_bond_choice;
const choice = choiceNode.choices.find(item => item.set.bond === 'play');
const scene = `${node.ai.context} In the scene immediately before the player's message, the character said: ${JSON.stringify(story.niko_private.text)}. Earlier, ${JSON.stringify(choiceNode.text)} player: ${JSON.stringify(choice.label)} Niko: ${JSON.stringify(story[choice.next].text)}.`;
const note = ' A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.';
const original = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const question of ['What did the note inside the panel say?', 'Who wrote the note inside the panel?']) for (const withNote of [false, true]) {
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await original(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 },
      character: { ...characters.Niko, name: 'Niko' }, playerText: question,
      context: scene + (withNote ? note : ''), memory: [], privateOtherNames: ['Mira', 'Ash', 'Mallow'], fallback: node.ai.fallback });
    if (!raw) throw new Error(`No output for ${seed}/${question}/${withNote}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, question, withNote, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = original; }
