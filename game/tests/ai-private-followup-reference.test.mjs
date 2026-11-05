import test from 'node:test';
import assert from 'node:assert/strict';
import { respond } from '../src/ai.js';

test('a pronoun follow-up may refer to one person named in the preceding exchange', async () => {
  const originalFetch = globalThis.fetch;
  const niko = [
    { speaker: 'Player to Mira', text: 'What do you think of Niko?' },
    { speaker: 'Mira', text: 'I like how he fixes things.' }
  ];
  const ash = [
    { speaker: 'Player to Mira', text: 'What do you think of Ash?' },
    { speaker: 'Mira', text: 'They make wonderful maps.' }
  ];
  const cases = [
    { memory: niko, player: 'How does he help?', reply: 'Oh, Niko! He always helps everyone when the machines break.', source: 'ai' },
    { memory: ash, player: 'Can you tell me about them?', reply: 'Oh, Ash! They always carry that map.', source: 'ai' },
    { memory: niko, player: 'How does she help?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { memory: niko, player: 'How do he and they help?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { memory: niko, player: 'What did Ash say about him?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { memory: [{ speaker: 'Player to Mira', text: 'How are Ash and Niko?' }, niko[1]], player: 'How does he help?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { memory: [niko[0]], player: 'How does he help?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { memory: [niko[0], { speaker: 'Ash', text: 'I like how he fixes things.' }], player: 'How does he help?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { memory: [...niko, { speaker: 'Player to Mira', text: 'What about Ash?' }, { speaker: 'Mira', text: 'They are kind.' }], player: 'How does he help?', reply: 'Oh, Niko! He always helps.', source: 'scripted' },
    { memory: niko, player: 'How does he help?', reply: 'Oh, Niko! He is waiting, Niko.', source: 'scripted' },
    { memory: niko, player: 'How does he help?', reply: 'Of course, Niko! He can help.', source: 'scripted' },
    { memory: niko, player: 'How does he help?', reply: 'I said, “Oh, Niko!” when he arrived.', source: 'ai' }
  ];
  try {
    for (const item of cases) {
      globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: item.reply }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
      const result = await respond({
        settings: { endpoint: 'https://example.invalid/chat', model: 'test' },
        character: { name: 'Mira' }, playerText: item.player, memory: item.memory,
        privateOtherNames: ['Niko', 'Ash'], fallback: 'A written response.'
      });
      assert.equal(result.source, item.source, `${item.player} / ${item.reply}`);
      assert.equal(result.text, item.source === 'ai' ? item.reply : 'A written response.');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
