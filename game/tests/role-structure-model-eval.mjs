// Synthetic, opt-in comparison of request message structure.
// Usage: node tests/role-structure-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
// Never use this script with real player data or a hosted provider.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/role-structure-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use a local HTTP model endpoint.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function load(name) {
  const dep = await readFile(`${root}/src/bounded-json.js`, 'utf8');
  const source = (await readFile(`${root}/src/${name}`, 'utf8')).replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${Buffer.from(dep).toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond } = await load('ai.js');
const { story, characters } = await load('story-next.js');
const samples = [
  { name: 'Niko', node: story.close_niko_chat,
    facts: 'The player pulled the team back as the floor shifted. Mira is still downstairs; the group plans to bring her back. The player asked Mira to describe the room behind the door as evidence.',
    history: [{ speaker: 'Player to Niko', text: 'You do not have to fix everything alone.' }, { speaker: 'Niko', text: 'I hear you. I do not have to solve it this minute.' }],
    question: 'What should we do about Mira now?' },
  { name: 'Mira', node: story.close_mira_chat,
    facts: 'The player and Niko opened Mira’s door immediately. Mira has returned safely with the third ticket piece, but the machine ate the paper roll. The player kept the false receipt as evidence.',
    history: [{ speaker: 'Player to Mira', text: 'Your friends can care about you and your art.' }, { speaker: 'Mira', text: 'I am still figuring out what I want to do.' }],
    question: 'Do you still want to go to the workshop?' },
  { name: 'Niko', node: story.niko_chat,
    facts: 'Earlier, the player chose: "Wear it as a very small crown." Niko replied: "Your Majesty, the machine is deeply honoured. Please don’t knight it; it already thinks it’s important."',
    history: [{ speaker: 'Player to Niko', text: 'You do not have to fix everything alone.' }, { speaker: 'Niko', text: 'I hear you. I do not have to solve it this minute.' }],
    question: 'What did we do with the lid a little while ago?' }
];
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const sample of samples) for (const mode of ['json', 'chat']) {
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      if (mode === 'chat') {
        const data = JSON.parse(body.messages[1].content);
        const scene = JSON.stringify({ character: data.character, voice: data.voice, scene: data.scene });
        const history = data.memory.map(item => ({ role: item.speaker === data.character ? 'assistant' : 'user', content: item.text }));
        body.messages = [body.messages[0], { role: 'user', content: `Scene context: ${scene}` }, ...history,
          { role: 'user', content: data.player_says }];
      }
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 60000 },
      character: { ...characters[sample.name], name: sample.name }, playerText: sample.question,
      context: `${sample.node.ai.context} ${sample.facts}`, memory: sample.history, fallback: sample.node.ai.fallback });
    if (!raw) throw new Error(`Empty or unavailable response for ${sample.name}, seed ${seed}, ${mode}: ${result.error || 'no text'}`);
    console.log(JSON.stringify({ seed, character: sample.name, question: sample.question, mode, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = originalFetch; }
