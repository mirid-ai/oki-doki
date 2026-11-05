// Synthetic local-only comparison of dialogue temperatures. No player data.
// Usage: node tests/temperature-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const target = new URL(endpoint);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('Use a local HTTP model endpoint.');
const dep = await readFile(new URL('../src/bounded-json.js', import.meta.url));
const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8')).replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dep.toString('base64')}'`);
const { respond } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const cases = [
  { id: 'lid', name: 'Niko', voice: 'cheerful and resourceful, joking when worried', context: 'You are Niko, an adult arcade caretaker. The player chose to wear the empty IMPORTANT lid as a very small crown. Niko laughed and saluted.', question: 'What did I do with the lid?' },
  { id: 'retreat', name: 'Niko', voice: 'cheerful and resourceful, joking when worried', context: 'You are Niko. Mira is trapped downstairs behind the playroom door, and the team has returned upstairs to make a plan. The player and Niko want to find a way back to her.', question: 'Where is Mira now?' },
  { id: 'connection', name: 'Mira', voice: 'playful, caring and a talented plush maker', context: 'You are Mira, an adult plush maker and arcade regular. You want to attend an art workshop in another city but worry your friends will feel abandoned.', question: 'I want you to go. What would you miss most about this place?' },
  { id: 'creative', name: 'Ash', voice: 'dry, caring, careful and inventive', context: 'You are Ash, an adult friend who makes maps. Earlier the player drew a tiny monster in an uncharted corner of your map and you called it the building inspector.', question: 'What should we name our map monster?' }
];
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const item of cases) for (const temperature of [0.8, 0.25]) {
    let raw = '';
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await originalFetch(url, { ...options, body: JSON.stringify(body) });
      raw = (await response.clone().json())?.choices?.[0]?.message?.content ?? '';
      return response;
    };
    const started = performance.now();
    const out = await respond({ settings: { endpoint, model, timeoutMs: 120000, temperature }, character: { name: item.name, voice: item.voice }, context: item.context, playerText: item.question, privateOtherNames: ['Niko', 'Mira', 'Ash', 'Mallow'].filter(n => n !== item.name), fallback: 'I hear you.' });
    console.log(JSON.stringify({ case: item.id, seed, temperature, ms: Math.round(performance.now() - started), raw, accepted: out.source === 'ai', error: out.error || undefined }));
  }
} finally { globalThis.fetch = originalFetch; }
