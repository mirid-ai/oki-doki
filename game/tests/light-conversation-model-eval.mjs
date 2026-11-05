/** Synthetic, local-only exploration of the early light conversations.
 * Usage: node tests/light-conversation-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
 * It sends no player data. Responses and seed handling vary by backend.
 */
import { readFile } from 'node:fs/promises';
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/light-conversation-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) {
  throw new Error('Use a local HTTP model endpoint.');
}
const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
async function load(name) {
  const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
    .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond } = await load('ai');
const { story, characters } = await load('story-next');
const actualFetch = globalThis.fetch;
const questions = {
  Niko: 'What should we listen for next?',
  Mira: 'How do you decide when it looks right?',
  Ash: 'What should we check first?'
};
for (const name of ['Niko', 'Mira', 'Ash']) for (const seed of [1, 42]) {
  const prefix = name.toLowerCase();
  const node = story[`${prefix}_light_chat`];
  const activity = story[`${prefix}_bond_choice`];
  const choice = activity.choices.find(item => item.set.bond === 'care');
  let context = node.ai.context + ` In the scene immediately before the player's message, the character said: ${JSON.stringify(story[`${prefix}_light`].text)}.`;
  context += ` Earlier, ${JSON.stringify(activity.text)} player: ${JSON.stringify(choice.label)} ${name}: ${JSON.stringify(story[choice.next].text)}.`;
  if (name === 'Niko') context += ' A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.';
  let raw = '';
  globalThis.fetch = async (requestUrl, options) => {
    const body = JSON.parse(options.body);
    body.seed = seed;
    const response = await actualFetch(requestUrl, { ...options, body: JSON.stringify(body) });
    raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
    return response;
  };
  const result = await respond({
    settings: { endpoint, model, timeoutMs: 120000 },
    character: { ...characters[name], name },
    playerText: questions[name], context, memory: [],
    privateOtherNames: ['Niko', 'Mira', 'Ash'].filter(other => other !== name),
    fallback: node.ai.fallback
  });
  console.log(JSON.stringify({ name, seed, question: questions[name], contextLength: context.length, raw, source: result.source, displayed: result.text }));
}
globalThis.fetch = actualFetch;
