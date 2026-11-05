// Synthetic, opt-in prompt comparison against a local OpenAI-compatible model.
// Usage: node tests/narration-model-eval.mjs LOCAL_ENDPOINT MODEL_ID [--format-comparison]
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const [endpoint, model, mode] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a loopback HTTP completion endpoint and model ID.');
if (mode && mode !== '--format-comparison') throw new Error('Unknown comparison mode.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) {
  throw new Error('Use a local HTTP model endpoint.');
}
const dep = await readFile(new URL('../src/bounded-json.js', import.meta.url));
const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
  .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dep.toString('base64')}'`);
const { respond } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const storySource = await readFile(new URL('../src/story-next.js', import.meta.url));
const { characters } = await import(`data:text/javascript;base64,${storySource.toString('base64')}`);
const scenarios = [
  ['Niko', 'What do you like about fixing machines?', 'You are Niko, an adult arcade caretaker. You and the player are beside the ticket machine. Your brother taught you repairs.'],
  ['Mira', 'What would you like to make next?', 'You are Mira, an adult plush maker. You and the player are in your sewing room, with an unfinished plush on the table.'],
  ['Ash', 'What does the map mean to you?', 'You are Ash, an adult friend who drew a map of the arcade. The player has helped you study it.'],
  ['Mallow', 'Are you worried about the changing room?', 'You are Mallow, a small fictional moth guide speaking to the arcade crew. You appear on a screen and do not know why the room changes.'],
  ['Niko', 'Do you think Mira likes your machines?', 'You are Niko, an adult arcade caretaker. Mira is your friend. You and the player are beside the ticket machine.']
];
const originalFetch = globalThis.fetch;
try {
  const conditions = mode === '--format-comparison' ? ['baseline', 'tail', 'cool', 'json'] : ['baseline', 'candidate'];
  for (const [name, question, context] of scenarios) for (const seed of [1, 42]) for (const condition of conditions) {
    let raw = '', status = 0;
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body);
      body.seed = seed;
      if (condition === 'candidate') body.messages[0].content += ` You are ${name} speaking to the player. Speak directly in first person as ${name}; refer to yourself as I, not by name. Give only words ${name} says aloud.`;
      if (condition === 'tail') body.messages[1].content += `\nRespond directly to the player with only ${name}'s spoken words. ${name} says:`;
      if (condition === 'cool') body.temperature = 0.2;
      if (condition === 'json') body.messages[0].content = body.messages[0].content.replace(
        "Output only the character's spoken words: no narration, stage directions, name prefix, or quotation marks around the entire response.",
        'Return only a valid JSON object with one key speech. Its value must contain just the character’s spoken words, without narration or stage directions.'
      );
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      status = response.status;
      raw = (await response.clone().json()).choices?.[0]?.message?.content || '';
      if (condition === 'json') {
        // Test a candidate parser without changing the production adapter.
        // If the model fails to produce the requested object, preserve the
        // response so the adapter's normal handling remains observable.
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.speech === 'string') {
            const data = await response.clone().json();
            data.choices[0].message.content = parsed.speech;
            return new Response(JSON.stringify(data), { status: response.status, headers: { 'Content-Type': 'application/json' } });
          }
        } catch { /* retain raw output */ }
      }
      return response;
    };
    const start = performance.now();
    const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 },
      character: { ...characters[name], name }, context, playerText: question, fallback: 'The written response.' });
    if (status !== 200) throw new Error(`Local endpoint returned ${status}: ${result.error || 'request failed'}`);
    console.log(JSON.stringify({ name, question, seed, condition, raw, result, seconds: +((performance.now() - start) / 1000).toFixed(1) }));
  }
} finally {
  globalThis.fetch = originalFetch;
}
