// Synthetic, opt-in comparison of factual grounding and creative responses.
// Usage: node tests/ai-grounding-model-eval.mjs LOCAL_ENDPOINT MODEL_ID [--explicit]
// Never use real player data or a hosted provider.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [endpoint, model, option] = process.argv.slice(2);
if (!endpoint || !model || (option && option !== '--explicit')) throw new Error('Usage: node tests/ai-grounding-model-eval.mjs LOCAL_ENDPOINT MODEL_ID [--explicit]');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use a local HTTP model endpoint.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dep = await readFile(`${root}/src/bounded-json.js`);
const source = (await readFile(`${root}/src/ai.js`, 'utf8')).replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dep.toString('base64')}'`);
const { respond } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const samples = [
  { id: 'lid', context: 'You are Niko, the adult caretaker of a friendly arcade. Your brother taught you to repair machines and has been away a long time. Earlier, "Niko offers you the empty IMPORTANT lid and waits to see what you’ll do with it." player: "Wear it as a very small crown." Niko: "Your Majesty, the machine is deeply honoured. Please don’t knight it; it already thinks it’s important."', question: 'What happened to the IMPORTANT lid?' },
  { id: 'retreat', context: 'You are Niko, the adult caretaker of a friendly arcade. The player pulled the team back as the floor shifted. Mira is still downstairs; the group plans to bring her back.', question: 'Where is Mira right now?' },
  { id: 'creative', context: 'You are Niko, the adult caretaker of a friendly arcade. The player and Niko are next to a broken ticket machine.', question: 'Give this broken machine a funny nickname.' }
];
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const sample of option ? samples.slice(0, 1) : samples) for (const variant of option ? ['current', 'explicit'] : ['current', 'uncertainty']) {
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body);
      body.seed = seed;
      if (variant === 'uncertainty') body.messages[0].content += ' When recalling specific past events or current locations, use only the facts in the scene and conversation; if they do not establish the answer, say you do not know rather than guessing. You may still invent creative ideas when asked.';
      if (variant === 'explicit') {
        const data = JSON.parse(body.messages[1].content);
        data.scene += ' The player chose to wear the IMPORTANT lid as a small crown.';
        body.messages[1].content = JSON.stringify(data);
      }
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 },
      character: { name: 'Niko', voice: 'cheerful and resourceful, joking when worried; takes responsibility for the arcade and the group' },
      playerText: sample.question, context: sample.context, privateOtherNames: ['Mira', 'Ash', 'Mallow'], fallback: 'I hear you.' });
    if (!raw) throw new Error(`Empty or unavailable response for ${sample.id}, seed ${seed}, ${variant}: ${result.error || 'no text'}`);
    console.log(JSON.stringify({ id: sample.id, seed, variant, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = originalFetch; }
