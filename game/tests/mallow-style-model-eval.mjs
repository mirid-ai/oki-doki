// Opt-in synthetic local evaluation; no real player data or hosted providers.
// Usage: node tests/mallow-style-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/mallow-style-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
async function load(name) {
  const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
  const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
    .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond } = await load('ai');
const { story, characters } = await load('story-next');
const { evaluatePreference } = await load('preference');
const examples = [
  { card_preference: 'direct', notice_preference: 'direct' },
  { card_preference: 'warm', notice_preference: 'warm' },
  { card_preference: 'skip', notice_preference: 'skip' }
];
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const flags of examples) {
    const node = story.ai_reflection, style = evaluatePreference(flags).style;
    // Reconstruct the app's initial context for the private-signal path.
    let context = node.ai.context + ` In the scene immediately before the player's message, the character said: ${JSON.stringify(story.mallow_request.text)}.`;
    if (style === 'direct') context += ' When answering, use a clear, direct tone.';
    else if (style === 'warm') context += ' When answering, use a warm, reassuring tone.';
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 },
      character: { ...characters.Mallow, name: 'Mallow' },
      playerText: 'I think we should look behind the counter. Can you stay with us?',
      context, memory: [], fallback: node.ai.fallback });
    if (!raw) throw new Error(`No output for ${seed}/${style}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, style, raw, accepted: result.source === 'ai' }));
  }
} finally { globalThis.fetch = originalFetch; }
