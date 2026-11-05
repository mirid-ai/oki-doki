// Synthetic local-only comparison. It sends no player data and does not grade
// generated text automatically. Usage: node tests/activity-referent-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/activity-referent-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
async function load(name) {
  const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
  const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
    .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond } = await load('ai');
const { story, characters } = await load('story-next');
const node = story.niko_chat;
const choiceNode = story.niko_bond_choice;
const choice = choiceNode.choices.find(item => item.set.bond === 'play');
const context = `${node.ai.context} In the scene immediately before the player's message, the character said: ${JSON.stringify(story.niko_private.text)}.`;
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const question of ['What did I do with the lid?', 'What happened to the IMPORTANT lid?']) {
    for (const withSetup of [false, true]) {
      let raw = '';
      globalThis.fetch = async (requestUrl, options) => {
        const body = JSON.parse(options.body); body.seed = seed;
        const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
        raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
        return response;
      };
      const scene = context + ` Earlier,${withSetup ? ` ${JSON.stringify(choiceNode.text)}` : ''} player: ${JSON.stringify(choice.label)} Niko: ${JSON.stringify(story[choice.next].text)}.`;
      const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 }, character: { ...characters.Niko, name: 'Niko' },
        playerText: question, context: scene, memory: [],
        privateOtherNames: ['Mira', 'Ash', 'Mallow'], fallback: node.ai.fallback });
      if (!raw) throw new Error(`No output for ${seed}/${question}/${withSetup}: ${result.error || 'empty'}`);
      console.log(JSON.stringify({ seed, question, withSetup, raw, accepted: result.source === 'ai' }));
    }
  }
} finally { globalThis.fetch = originalFetch; }
