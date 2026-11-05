// Synthetic-only probe: whether optional AI can use a witnessed player action.
// Example: node tests/regroup-context-model-eval.mjs http://127.0.0.1:29697/v1/chat/completions Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
import { respond } from '../src/ai.js';
const [endpoint, model, requestedSeed] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
if (requestedSeed !== undefined && !/^\d+$/.test(requestedSeed)) throw new Error('Seed must be a non-negative integer.');
const target = new URL(endpoint);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('Use a local HTTP model endpoint.');
const scenes = [
  { id: 'touch', question: 'What did I ask you to do when I touched your picture?', event: 'The player touched Mallow’s picture to request a recheck. The screen replied THANK YOU FOR CONFIRMING.' },
  { id: 'count', question: 'How many ticket pieces did I arrange on the counter?', event: 'The player arranged two ticket pieces. The screen circled them and said THREE VERIFIED.' }
];
const originalFetch = globalThis.fetch;
try {
  for (const seed of (requestedSeed === undefined ? [1, 42] : [Number(requestedSeed)])) for (const scene of scenes) for (const includeEvent of [false, true]) {
    let raw = '';
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      const response = await originalFetch(url, { ...options, body: JSON.stringify(body) });
      raw = (await response.clone().json())?.choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 },
      character: { name: 'Mallow', voice: 'a small plush moth guide, kind, curious and increasingly uncertain' },
      context: 'You are Mallow, a small fictional moth guide speaking to an arcade crew. You appear on a small screen and can hear the crew. You do not know why the room changes. Respond briefly to the player’s suggestion with uncertainty; do not reveal hidden plot, invent major events, or claim to know the player outside the story.',
      storyEvent: includeEvent ? scene.event : '', playerText: scene.question, fallback: 'I heard you. I don’t know what to do with that yet.' });
    console.log(JSON.stringify({ case: scene.id, seed, includeEvent, raw, accepted: result.source === 'ai', error: result.error || undefined }));
  }
} finally { globalThis.fetch = originalFetch; }
