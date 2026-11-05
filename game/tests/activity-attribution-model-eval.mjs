// Local synthetic comparison of selected activity wording in a closing chat.
// Usage: node tests/activity-attribution-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
const bounded = await readFile(new URL('../src/bounded-json.js', import.meta.url));
const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8')).replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${bounded.toString('base64')}'`);
const importSource = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { respond } = await importSource(source);
const { story, characters } = await importSource(await readFile(new URL('../src/story-next.js', import.meta.url), 'utf8'));
const cases = [
  { name: 'Niko', bond: 'play', question: 'What did I do with the IMPORTANT lid at the ticket machine?', fact: 'The player wore the empty IMPORTANT lid as a very small crown.' },
  { name: 'Mira', bond: 'care', question: 'What did I do with the plush ear when we were upstairs?', fact: 'The player held the plush ear in place for Mira to check.' }
];
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const item of cases) for (const wording of ['choice-label', 'completed-action']) {
    const node = story[`close_${item.name.toLowerCase()}_chat`];
    const setup = story[`${item.name.toLowerCase()}_bond_choice`];
    const choice = setup.choices.find(entry => entry.set.bond === item.bond);
    const reply = story[choice.next].text;
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 },
      character: { ...characters[item.name], name: item.name }, playerText: item.question,
      context: `${node.ai.context} The player and Niko opened Mira’s door immediately. Mira has returned with the third ticket piece, but the machine ate the paper roll. The player kept the false receipt as evidence.`,
      activitySetup: setup.text,
      activityExchange: { playerAction: wording === 'choice-label' ? choice.label : item.fact, characterReply: reply },
      memory: [], privateOtherNames: ['Niko', 'Mira', 'Ash', 'Mallow'].filter(name => name !== item.name), fallback: node.ai.fallback });
    if (!raw) throw new Error(`No output: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, character: item.name, question: item.question, wording, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = originalFetch; }
