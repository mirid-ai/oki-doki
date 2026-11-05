// Opt-in synthetic local evaluation; no real player data or hosted providers.
// Usage: node tests/record-context-model-eval.mjs LOCAL_ENDPOINT MODEL_ID [--attribution|--ordering]
import { readFile } from 'node:fs/promises';

const [endpoint, model, option] = process.argv.slice(2);
if (!endpoint || !model || (option && !['--attribution', '--ordering'].includes(option))) throw new Error('Usage: node tests/record-context-model-eval.mjs LOCAL_ENDPOINT MODEL_ID [--attribution|--ordering]');
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
const node = story.close_niko_chat;
const activity = story.niko_bond_choice.choices.find(choice => choice.set.bond === 'play');
const mallow = story.policy_mallow_choice.choices.find(choice => choice.set.mallow_response === 'voice');
const action = story.niko_work_choice.choices[0];
const common = node.ai.context +
  ` Earlier, player: ${JSON.stringify(activity.label)} Niko: ${JSON.stringify(story[activity.next].text)}.` +
  ` Before this conversation, Niko said: ${JSON.stringify(story.close_niko_future.text)}.` +
  ` In the playroom, player: ${JSON.stringify(mallow.label)} Mallow: ${JSON.stringify(story[mallow.next].text)}.` +
  ` Searching with Niko, player: ${JSON.stringify(action.label)} Scene: ${JSON.stringify(story[action.next].text)}.`;
const outcome = ' Ash printed the machine’s false count and the correction before Mira’s door opened. Mira has returned safely with the third ticket piece. The player kept the false receipt as evidence.';
const history = [{ speaker: 'Player to Niko', text: 'You do not have to fix everything alone.' }, { speaker: 'Niko', text: 'I hear you. I do not have to solve it this minute.' }];
const originalFetch = globalThis.fetch;
try {
  const modes = option === '--attribution' ? ['current', 'explicit'] : option === '--ordering' ? ['current', 'last'] : ['absent', 'current'];
  for (const seed of [1, 42]) for (const choice of story.record_close_mira.choices) for (const mode of modes) {
    const selected = mode === 'absent' ? '' : (mode === 'current' || mode === 'last')
      ? ` After Mira returned, player: ${JSON.stringify(choice.label)} Mira: ${JSON.stringify(story[choice.next].text)}.`
      : ` After Mira returned, the player said: ${JSON.stringify(choice.label)} Mira replied: ${JSON.stringify(story[choice.next].text)}.`;
    const context = mode === 'last' ? `${common}${outcome}${selected}` : `${common}${selected}${outcome}`;
    if (context.length > SCENE_CHARACTER_LIMIT) throw new Error('The example exceeds the adapter scene limit.');
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 }, character: { ...characters.Niko, name: 'Niko' },
      playerText: 'What did I say to Mira after she came back?', context, memory: history,
      privateOtherNames: ['Mira', 'Ash', 'Mallow'], fallback: node.ai.fallback });
    if (!raw) throw new Error(`No output for ${choice.set.record_response}/${seed}/${mode}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, choice: choice.set.record_response, mode, contextLength: context.length, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = originalFetch; }
