// Synthetic local-only comparison of the earlier malformed pronoun and its fix.
// Usage: node tests/midpoint-pronoun-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a loopback HTTP completion endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) {
  throw new Error('Use a local HTTP model endpoint.');
}
const dep = await readFile(new URL('../src/bounded-json.js', import.meta.url));
const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
  .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dep.toString('base64')}'`);
const { respond } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const storySource = await readFile(new URL('../src/story-next.js', import.meta.url));
const { story, characters } = await import(`data:text/javascript;base64,${storySource.toString('base64')}`);
const node = story.mid_niko_chat, lead = story.mid_niko_input;
const scene = `${node.ai.context} Before the player's message, Niko said: ${JSON.stringify(lead.text)}.`;
const observation = story.moment_niko_care.text;
const original = observation.replace(/\byour\b/gi, match => match[0] === 'Y' ? "The player's" : "the player's")
  .replace(/\byou\b/gi, match => match[0] === 'Y' ? 'The player' : 'the player');
const corrected = observation.replace(/\bthe two of you\b/gi, 'the player and Niko')
  .replace(/\byour\b/gi, match => match[0] === 'Y' ? "The player's" : "the player's")
  .replace(/\byou\b/gi, match => match[0] === 'Y' ? 'The player' : 'the player');
const previousFetch = globalThis.fetch;
try {
  for (const seed of [1, 42, 73]) for (const [condition, wording] of [['original', original], ['corrected', corrected]]) {
    let status = 0;
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await previousFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      status = response.status;
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 },
      character: { ...characters.Niko, name: 'Niko' }, context: scene,
      activitySetup: `${wording} The player folded and kept the card.`,
      playerText: 'How many people were at the machine', fallback: node.ai.fallback });
    if (status !== 200) throw new Error(`Local endpoint returned ${status}: ${result.error || 'request failed'}`);
    console.log(JSON.stringify({ seed, condition, ...result }));
  }
} finally { globalThis.fetch = previousFetch; }
