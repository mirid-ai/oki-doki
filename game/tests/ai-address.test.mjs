/** Offline regressions for direct-address role confusion. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'signal-address-test-'));
const originalFetch = globalThis.fetch;
try {
  const dependency = join(temp, 'bounded-json.mjs');
  const adapter = join(temp, 'ai.mjs');
  await writeFile(dependency, await readFile(new URL('../src/bounded-json.js', import.meta.url)));
  const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
    .replace("'./bounded-json.js'", "'./bounded-json.mjs'");
  await writeFile(adapter, source);
  const { respond } = await import(pathToFileURL(adapter).href);
  const cases = [
    { text: "I'm glad you're here, Noor. We'll make it through this together.", source: 'scripted' },
    { text: 'I hear you, Noor. We can listen together.', source: 'scripted' },
    { text: 'Noor, I am glad you are here.', source: 'scripted' },
    { text: 'I trust you, Noor, and I will listen.', source: 'scripted' },
    { text: 'Of course. You are here, Noor! We can begin.', source: 'scripted' },
    { text: 'I’m glad you’re here, Noor. We can begin.', source: 'scripted' },
    { text: 'I’m glad you’re here, Ellis. We can begin.', source: 'ai' },
    { text: 'I spoke with my sister, Noor. She left a message.', source: 'ai' },
    { text: 'You met my sister, Noor. She left a message.', source: 'ai' },
    { text: 'You can ask my friend, Noor, about the studio.', source: 'ai' },
    { text: 'She told you, Noor. That was her decision.', source: 'ai' },
    { text: 'She said, “I hear you, Noor.” Then she left.', source: 'ai' },
    { text: 'She said, "I hear you, Noor." Then she left.', source: 'ai' },
    { text: "She said, 'I hear you, Noor.' Then she left.", source: 'ai' },
    { text: 'She said, ‘I hear you, Noor.’ Then she left.', source: 'ai' },
    { text: 'I heard Noor on the radio.', source: 'ai' },
    { text: 'You can tell Noor I am listening.', source: 'ai' }
  ];
  for (const item of cases) {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: item.text } }] }), {
      headers: { 'content-type': 'application/json' }
    });
    const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' },
      character: { name: 'Noor' }, fallback: 'Still here.' });
    assert.equal(result.source, item.source, `Unexpected response source: ${item.text}`);
    if (item.source === 'scripted') assert.equal(result.text, 'Still here.');
    else assert.equal(result.text, item.text);
  }
  console.log(`Direct-address filtering passed ${cases.length} offline cases.`);
} finally {
  globalThis.fetch = originalFetch;
  await rm(temp, { recursive: true, force: true });
}
