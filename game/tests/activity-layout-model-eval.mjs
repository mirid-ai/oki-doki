// Synthetic comparison of the earlier inline and current structured closing
// activity contexts. Usage: node tests/activity-layout-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
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
const current = await importSource(aiSource);
// The earlier adapter did not mention the new field in its system instruction.
const old = await importSource(aiSource.replace('activity setup, activity exchange, earlier conversation', 'activity setup, earlier conversation'));
const { story, characters } = await importSource(await readFile(new URL('../src/story-next.js', import.meta.url), 'utf8'));
const cases = [
  { name: 'Mira', bond: 'care', question: 'What did I do with the plush ear when we were upstairs?' },
  { name: 'Niko', bond: 'play', question: 'What did I do with the IMPORTANT lid when we were at the machine?' }
];
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const item of cases) for (const layout of ['inline', 'structured']) {
    const lower = item.name.toLowerCase();
    const node = story[`close_${lower}_chat`];
    const setup = story[`${lower}_bond_choice`];
    const choice = setup.choices.find(entry => entry.set.bond === item.bond);
    const reply = story[choice.next].text;
    const activity = ` Earlier, player: ${JSON.stringify(choice.label)} ${item.name}: ${JSON.stringify(reply)}.`;
    const outcome = ' The player and Niko opened Mira’s door immediately. Mira has returned with the third ticket piece, but the machine ate the paper roll. The player kept the false receipt as evidence.';
    const context = node.ai.context + (layout === 'inline' ? activity : '') + outcome;
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await (layout === 'inline' ? old.respond : current.respond)({
      settings: { endpoint, model, timeoutMs: 120000 }, character: { ...characters[item.name], name: item.name },
      playerText: item.question, context, activitySetup: setup.text,
      activityExchange: layout === 'structured' ? { playerAction: choice.label, characterReply: reply } : null,
      memory: [], privateOtherNames: ['Niko', 'Mira', 'Ash', 'Mallow'].filter(name => name !== item.name),
      fallback: node.ai.fallback
    });
    if (!raw) throw new Error(`No output for ${seed}/${item.name}/${layout}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, character: item.name, question: item.question, layout, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = originalFetch; }
