import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
  .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
const { respond } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('AI request bounds preserve complete Unicode characters in scene, player and memory', async () => {
  const requests = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(JSON.parse(options.body).messages[1].content));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'I hear you.' } }] }),
      { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const settings = { endpoint: 'http://localhost:1234/v1/chat/completions', model: 'fixture' };
    for (const offset of [1, 2]) {
      await respond({ settings, character: { name: 'Mira' },
        context: 'x'.repeat(1800 - offset) + '😀', playerText: 'y'.repeat(500 - offset) + '😀',
        memory: [{ speaker: 'Player', text: 'z'.repeat(700 - offset) + '😀' }], fallback: 'Hello.' });
    }
    const [split, exact] = requests;
    for (const value of [split.scene, split.player_says, split.memory[0].text]) {
      assert.ok(value.isWellFormed());
      assert.ok(!value.endsWith('😀'));
    }
    assert.deepEqual([split.scene.length, split.player_says.length, split.memory[0].text.length], [1799, 499, 699]);
    for (const value of [exact.scene, exact.player_says, exact.memory[0].text]) {
      assert.ok(value.isWellFormed());
      assert.ok(value.endsWith('😀'));
    }
    assert.deepEqual([exact.scene.length, exact.player_says.length, exact.memory[0].text.length], [1800, 500, 700]);

    await respond({ settings, character: { name: 'Mira' }, context: 'a\uD800b\uDC00c',
      playerText: 'hello\uD800', memory: [{ speaker: 'Player', text: 'a\uDC00b' }], fallback: 'Hello.' });
    assert.equal(requests[2].scene, 'a\uFFFDb\uFFFDc');
    assert.equal(requests[2].player_says, 'hello\uFFFD');
    assert.equal(requests[2].memory[0].text, 'a\uFFFDb');
  } finally {
    globalThis.fetch = original;
  }
});
