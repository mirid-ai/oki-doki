// Synthetic, opt-in model experiment; no real player data or hosted providers.
// Usage: node tests/mallow-context-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/mallow-context-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use a local HTTP model endpoint.');
async function load(name) {
  const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
  const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
    .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond } = await load('ai');
const { story, characters } = await load('story-next');
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const name of ['Niko', 'Mira']) for (const choice of story.policy_mallow_choice.choices) for (const includeChoice of [false, true]) {
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const node = story[`close_${name.toLowerCase()}_chat`];
    const reply = story[choice.next];
    const mallowContext = ` Earlier in the playroom, the player chose: ${JSON.stringify(choice.label)} Mallow replied: ${JSON.stringify(reply.text)}.`;
    const facts = ' Mallow chose to help, pointed out a hidden catch, and its screen went dark. Mira has returned safely with the third ticket piece. The player kept the false receipt as evidence.';
    const history = [{ speaker: `Player to ${name}`, text: 'I am glad you are here.' }, { speaker: name, text: 'I am glad you are here too.' }];
    const question = 'What did I ask Mallow just before we planned how to open the door?';
    const result = await respond({ settings: { endpoint, model, timeoutMs: 60000 }, character: { ...characters[name], name },
      playerText: question, context: `${node.ai.context}${includeChoice ? mallowContext : ''}${facts}`, memory: history,
      privateOtherNames: Object.keys(characters).filter(key => characters[key]?.portrait && key !== name), fallback: node.ai.fallback });
    if (!raw) throw new Error(`No output for ${name}/${choice.set.mallow_response}/${seed}/${includeChoice}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, character: name, choice: choice.set.mallow_response, includeChoice, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = originalFetch; }
