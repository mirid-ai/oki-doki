import test from 'node:test';
import assert from 'node:assert/strict';
import { respond } from '../src/ai.js';

test('a private reply can refer to the person the player asked about', async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    { player: 'What do you think of Niko?', reply: 'Oh, Niko! He always helps everyone when the machines break.', source: 'ai' },
    { player: 'What about Ash?', reply: 'Oh, Ash! They always carry that map.', source: 'ai' },
    { player: 'What about Niko?', reply: 'Oh, Niko! Niko is very patient with me.', source: 'ai' },
    { player: 'What about Niko?', reply: 'Oh, Niko! You always know what to say.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'Of course, Niko! He can help with that.', source: 'scripted' },
    { player: 'What about Ash?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { player: 'What about Nikolas?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'Oh, Niko! He is waiting, Niko.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'I said, “Oh, Niko!” when he arrived.', source: 'ai' }
  ];
  try {
    for (const item of cases) {
      globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: item.reply }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
      const result = await respond({
        settings: { endpoint: 'https://example.invalid/chat', model: 'test' },
        character: { name: 'Mira' }, playerText: item.player,
        privateOtherNames: ['Niko', 'Ash'], fallback: 'A written response.'
      });
      assert.equal(result.source, item.source, `${item.player} / ${item.reply}`);
      assert.equal(result.text, item.source === 'ai' ? item.reply : 'A written response.');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
