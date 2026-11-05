// Synthetic opt-in comparison; no real player data or hosted providers.
// Usage: node tests/work-choice-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/work-choice-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use a local HTTP model endpoint.');
async function load(name) {
  const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
  const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
    .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond, SCENE_CHARACTER_LIMIT } = await load('ai');
const { story, characters } = await load('story-next');
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const choice of story.niko_work_choice.choices) for (const includeChoice of [false, true]) {
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const node = story.close_niko_chat;
    const activity = story.niko_bond_choice.choices.find(item => item.set.bond === 'play');
    const mallow = story.policy_mallow_choice.choices.find(item => item.set.mallow_response === 'voice');
    const facts = ` Earlier, the player chose: ${JSON.stringify(activity.label)} Niko replied: ${JSON.stringify(story[activity.next].text)}.` +
      ` Before the player chose to speak again, Niko said: ${JSON.stringify(story.close_niko_future.text)}.` +
      ` Earlier in the playroom, the player chose: ${JSON.stringify(mallow.label)} Mallow replied: ${JSON.stringify(story[mallow.next].text)}.`;
    const work = ` Earlier while searching with Niko, the player chose: ${JSON.stringify(choice.label)} The scene described: ${JSON.stringify(story[choice.next].text)}.`;
    const ending = ' The player and Niko opened Mira’s door immediately. Mira has returned safely with the third ticket piece, but the machine ate the paper roll. The player kept the false receipt as evidence.';
    const history = [{ speaker: 'Player to Niko', text: 'You do not have to fix everything alone.' }, { speaker: 'Niko', text: 'I hear you. I do not have to solve it this minute.' }];
    const context = `${node.ai.context}${facts}${includeChoice ? work : ''}${ending}`;
    if (context.length > SCENE_CHARACTER_LIMIT) throw new Error('The example exceeds the adapter scene limit.');
    const result = await respond({ settings: { endpoint, model, timeoutMs: 60000 }, character: { ...characters.Niko, name: 'Niko' },
      playerText: 'What did we choose to take or make before we met the others?', context, memory: history,
      privateOtherNames: ['Mira', 'Ash', 'Mallow'], fallback: node.ai.fallback });
    if (!raw) throw new Error(`No output for ${choice.set.route_action}/${seed}/${includeChoice}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, choice: choice.set.route_action, includeChoice, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = originalFetch; }
