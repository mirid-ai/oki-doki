// Compare a synthetic retreat conversation with and without the witnessed search.
// Run: node tests/retreat-search-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) {
  throw new Error('Use a local HTTP model endpoint.');
}
const bounded = await readFile(new URL('../src/bounded-json.js', import.meta.url));
const aiSource = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
  .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${bounded.toString('base64')}'`);
const importSource = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { respond } = await importSource(aiSource);
const { story, characters } = await importSource(await readFile(new URL('../src/story-next.js', import.meta.url), 'utf8'));
const cases = [
  { name: 'Niko', question: 'What did we find when we checked the first step?', event: 'The player pressed the first stair; its edge dipped and exposed a loose bracket.' },
  { name: 'Ash', question: 'Where did we hear the next knock?', event: 'The player and Ash heard a knock under the fort; Ash marked it with a question mark.' }
];
const otherEvents = 'The player tried two taps, a pause, then one; a knock sounded below before their last tap. Niko propped the stair door with the wrench; Ash bandaged his knuckles.';
const oldFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const item of cases) for (const include of [false, true]) {
    const node = item.name === 'Ash' ? story.close_ash_retreat_chat : story.close_niko_chat;
    const context = `${node.ai.context} The floor shifted; Mira is still downstairs and the team plans to bring her back.`;
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await oldFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 },
      character: { ...characters[item.name], name: item.name }, playerText: item.question,
      context, storyEvent: include ? `${otherEvents} ${item.event}` : otherEvents, memory: [],
      privateOtherNames: ['Niko', 'Mira', 'Ash', 'Mallow'].filter(name => name !== item.name),
      fallback: node.ai.fallback });
    if (!raw) throw new Error(`No output for ${seed}/${item.name}/${include}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, character: item.name, question: item.question, withEvent: include, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = oldFetch; }
