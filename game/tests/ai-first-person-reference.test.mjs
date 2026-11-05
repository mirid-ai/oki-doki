import test from 'node:test';
import assert from 'node:assert/strict';
import { respond } from '../src/ai.js';

test('a private first-person opinion can refer to the character the player named', async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    { player: 'What do you think of Niko?', reply: 'Oh, Niko! I love how he fixes things for everyone.', source: 'ai' },
    { player: 'What do you think of Niko?', reply: 'Oh, Niko! I think he likes you.', source: 'ai' },
    { player: 'What do you think of Ash?', reply: 'Oh, Niko! I think he likes you.', source: 'scripted' },
    { player: 'What do you think of Ash?', reply: 'Oh, Ash! I like how they look after the map.', source: 'ai' },
    { player: 'What do you think of Ash?', reply: 'Oh, Niko! I love how he fixes things.', source: 'scripted' },
    { player: 'What about Niko and Ash?', reply: 'Oh, Niko! I love how he fixes things.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'Oh, Niko! I think Ash knows him.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'Oh, Niko! I told you he was kind.', source: 'ai' },
    { player: 'What about Niko?', reply: 'Oh, Niko! I love our team. He fixes things.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'Oh, Niko! I miss you.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'Oh, Niko! I said “he helps” yesterday.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'Oh, Niko! I think he likes you, Niko.', source: 'scripted' },
    { player: 'What about Niko?', reply: 'Oh, Niko! I love how he helps, Niko.', source: 'scripted' }
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
