// Synthetic, local-only comparison of the companion's witnessed dialogue.
// Usage: node tests/personal-history-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
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
const choice = story.ash_question.choices.find(item => item.set.topic === 'past');
const history = `Ash said: ${JSON.stringify(story.ash_private.text)} Player asked: ${JSON.stringify(choice.label)} Ash replied: ${JSON.stringify(story.ash_question_past.text)}`;
const context = `${story.close_ash_chat.ai.context} The team is safe upstairs.`;
const original = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const question of ['Where was the person you lost sight of when you found them?', 'What did the person give you afterwards?']) for (const withHistory of [false, true]) {
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await original(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 }, character: { ...characters.Ash, name: 'Ash' },
      playerText: question, context, earlierConversation: withHistory ? history : '', memory: [],
      privateOtherNames: ['Mira', 'Niko', 'Mallow'], fallback: story.close_ash_chat.ai.fallback });
    if (!raw) throw new Error(`No output for ${seed}/${question}/${withHistory}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, question, withHistory, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = original; }
