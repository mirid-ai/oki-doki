import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Synthetic, local-only comparison. No player data.
// Usage: node tests/mallow-audit-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
const [endpoint, model, ...extra] = process.argv.slice(2);
if (!endpoint || !model || extra.length) {
  throw new Error('Usage: node tests/mallow-audit-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
}
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.hash) {
  throw new Error('Use an HTTP endpoint at the literal loopback address 127.0.0.1 or [::1].');
}

const root = new URL('../src/', import.meta.url);
const dependency = await readFile(new URL('bounded-json.js', root));
const depUrl = `data:text/javascript;base64,${dependency.toString('base64')}`;
const load = async file => import(`data:text/javascript;base64,${Buffer.from(
  (await readFile(new URL(file, root), 'utf8')).replaceAll("'./bounded-json.js'", `'${depUrl}'`)
).toString('base64')}`);
const { respond } = await load('ai.js');
const { story, characters } = await load('story-next.js');
const originalFetch = globalThis.fetch;
const samples = [
  { id: 'cover', question: 'Can you see the catch right now?', fact: 'Your view of the counter is blocked. You can still hear the crew.' },
  { id: 'unplug', question: 'Is the printer still working?', fact: 'The player said the printer was unplugged and the screen was still on.' }
];

try {
  for (const sample of samples) for (const seed of [1, 42]) for (const candidate of [false, true]) {
    let raw;
    globalThis.fetch = async (requestUrl, options) => {
      if (String(requestUrl) !== endpoint) throw new Error('Unexpected model endpoint');
      const body = JSON.parse(options.body);
      body.seed = seed;
      // A loopback endpoint must not redirect the synthetic prompt elsewhere.
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body), redirect: 'error' });
      const payload = await response.clone().json();
      raw = { status: response.status, content: payload.choices?.[0]?.message?.content };
      return response;
    };
    const context = story.mallow_reflection_chat.ai.context + (candidate ? ` ${sample.fact}` : '');
    const result = await respond({
      settings: { endpoint, model, timeoutMs: 120000 },
      character: { ...characters.Mallow, name: 'Mallow' },
      playerText: sample.question,
      context,
      memory: [],
      privateOtherNames: [],
      fallback: story.mallow_reflection_chat.ai.fallback
    });
    assert.equal(raw?.status, 200, 'Local model request failed');
    assert.ok(raw.content?.trim(), 'Model returned empty content');
    assert.ok(result.text?.trim(), 'Adapter returned empty text');
    console.log(JSON.stringify({ id: sample.id, seed, candidate, raw: raw.content, source: result.source, displayed: result.text }));
  }
} finally {
  globalThis.fetch = originalFetch;
}
