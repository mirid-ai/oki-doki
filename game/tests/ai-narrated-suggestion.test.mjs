import test from 'node:test';
import assert from 'node:assert/strict';
import { respond } from '../src/ai.js';

// These cases use synthetic provider output; no model service is contacted.
test('recover wholly quoted speech after the speaker’s narrated suggestion', async () => {
  const oldFetch = globalThis.fetch;
  try {
    const examples = [
      ['Ash thoughtfully considered for a moment before suggesting, "Why not call it The Builder? It seems fitting."', 'ai', 'Why not call it The Builder? It seems fitting.'],
      ['Ash thought for a moment before replying, “I like that idea.”', 'ai', 'I like that idea.'],
      ['Ash considered the question before suggesting, "I like that idea.', 'scripted', 'A written response.'],
      ['Ash considered the question before suggesting, I like that idea.', 'scripted', 'A written response.'],
      ['I think Ash considered it before suggesting a name.', 'ai', 'I think Ash considered it before suggesting a name.'],
      ['Niko considered it before suggesting, "Call it George."', 'ai', 'Niko considered it before suggesting, "Call it George."']
    ];
    for (const [content, source, text] of examples) {
      globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { 'content-type': 'application/json' } });
      const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, character: { name: 'Ash' }, fallback: 'A written response.' });
      assert.equal(result.source, source, content);
      assert.equal(result.text, text, content);
    }
  } finally { globalThis.fetch = oldFetch; }
});

test('keep the spoken part of an observed possessive narration without altering its words', async () => {
  const oldFetch = globalThis.fetch;
  const preamble = 'Mira’s fingers trembled as she traced the stitches of a new toy’s face, her voice dropping like a secret.';
  const speech = 'Nothing, really. Just… his hand felt too warm, like he was holding on too tight.';
  try {
    for (const [content, source, expected] of [
      [`${preamble}\n\n*"${speech}"*`, 'ai', speech],
      [`${preamble}\n\n“${speech}”`, 'ai', speech],
      ['Mira’s shoulders tightened, her voice suddenly quiet.\n\n"I want to hear your idea."', 'ai', 'I want to hear your idea.'],
      ['Mira\'s gloved hands shook as her voice dropped.\n\n“Can we try again?”', 'ai', 'Can we try again?'],
      [`${preamble}\n\n*"Nothing, really.`, 'scripted', 'A written response.'],
      [`${preamble}\n\nNothing, really.`, 'scripted', 'A written response.'],
      [`I saw ${preamble} “${speech}”`, 'ai', `I saw ${preamble} “${speech}”`],
      [`Mira’s fingers trembled before she told me, "${speech}"`, 'ai', `Mira’s fingers trembled before she told me, "${speech}"`],
      ['Niko’s hands shook, his voice quiet.\n\n"I am all right."', 'ai', 'Niko’s hands shook, his voice quiet.\n\n"I am all right."'],
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
      const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'fixture' },
        character: { name: 'Mira' }, playerText: 'What happened at the door?', fallback: 'A written response.' });
      assert.equal(result.source, source, content);
      assert.equal(result.text, expected, content);
    }
  } finally { globalThis.fetch = oldFetch; }
});
