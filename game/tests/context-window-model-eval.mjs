import { readFile } from 'node:fs/promises';

// Synthetic loopback-only context-capacity probe. No player data.
// Use a server configured with the context window being investigated.
// node tests/context-window-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
const [endpoint, model, ...extra] = process.argv.slice(2);
if (!endpoint || !model || extra.length) throw new Error('Usage: node tests/context-window-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) {
  throw new Error('Use an HTTP endpoint at the literal loopback address 127.0.0.1 or [::1].');
}
const root = new URL('../src/', import.meta.url);
const dep = await readFile(new URL('bounded-json.js', root));
const depUrl = `data:text/javascript;base64,${dep.toString('base64')}`;
const source = (await readFile(new URL('ai.js', root), 'utf8')).replaceAll("'./bounded-json.js'", `'${depUrl}'`);
const { respond } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const paragraph = '不思議な部屋の窓の向こうに、誰かが残した紙の切れ端が光っています。ミラは静かに笑いながら、階段の下に隠れていたぬいぐるみの話を始めました。';
const filled = max => paragraph.repeat(Math.ceil(max / paragraph.length)).slice(0, max);
const memory = Array.from({ length: 4 }, (_, i) => ({ speaker: i % 2 ? 'Mira' : 'Player to Mira', text: filled(i % 2 ? 700 : 500) }));
const context = 'Mira points to the strange lavender sign, and a folded paper ticket lies on the floor. '.repeat(20).slice(0, 1654);
const originalFetch = globalThis.fetch;
let status, errorType, promptTokens, contextTokens;
try {
  globalThis.fetch = async (requestUrl, options) => {
    if (String(requestUrl) !== endpoint) throw new Error('Unexpected model endpoint');
    const response = await originalFetch(requestUrl, { ...options, redirect: 'error' });
    status = response.status;
    if (response.status === 400) {
      const body = await response.clone().json();
      errorType = body?.error?.type;
      promptTokens = body?.error?.n_prompt_tokens;
      contextTokens = body?.error?.n_ctx;
    }
    return response;
  };
  const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 }, character: { name: 'Mira', voice: 'Kind and observant.' }, playerText: filled(500), context, memory, fallback: 'A written response.' });
  console.log(JSON.stringify({ status, errorType, promptTokens, contextTokens, result }));
} finally {
  globalThis.fetch = originalFetch;
}
