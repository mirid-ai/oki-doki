import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
  .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
const { respond } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('exact configured voice labels do not leak into generated dialogue', async () => {
  const originalFetch = globalThis.fetch;
  const voice = 'a small arcade moth with an uncertain, thoughtful voice; answers briefly and never claims to know the player outside the story';
  let output = '';
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: output } }] }),
    { headers: { 'Content-Type': 'application/json' } });
  const reply = async (text) => {
    output = text;
    return respond({ settings: { endpoint: 'http://localhost:1234/v1/chat/completions', model: 'fixture' },
      character: { name: 'Mallow', voice }, playerText: 'What do you hear?', fallback: 'I am listening.' });
  };
  try {
    assert.deepEqual(await reply('A small arcade moth with an uncertain, thoughtful voice: "I\'m not sure if there\'s anything new outside."'),
      { text: "I'm not sure if there's anything new outside.", source: 'ai' });
    assert.deepEqual(await reply(`Mallow: ${voice}: “I can hear you.”`), { text: 'I can hear you.', source: 'ai' });
    for (const text of ['A small arcade moth with an uncertain, thoughtful voice:',
      'A small arcade moth with an uncertain, thoughtful voice: ""',
      'A small arcade moth with an uncertain, thoughtful voice: "I can hear']) {
      const result = await reply(text);
      assert.equal(result.source, 'scripted');
      assert.equal(result.text, 'I am listening.');
    }
    for (const text of ['A small arcade moth waits outside.',
      'A small arcade moth with an uncertain voice: "I can hear you."',
      'I heard someone say, "A small arcade moth with an uncertain, thoughtful voice."']) {
      assert.deepEqual(await reply(text), { text, source: 'ai' }, 'ordinary dialogue and non-matching labels stay intact');
    }
    const echo = await reply('A small arcade moth with an uncertain, thoughtful voice: "What do you hear?"');
    assert.deepEqual(echo, { text: 'What do you hear?', source: 'ai' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('named stage direction recovers only a complete quoted reply', async () => {
  const originalFetch = globalThis.fetch;
  let output = '';
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: output } }] }),
    { headers: { 'Content-Type': 'application/json' } });
  const reply = async (text) => {
    output = text;
    return respond({ settings: { endpoint: 'http://localhost:1234/v1/chat/completions', model: 'fixture' },
      character: { name: 'Mallow', voice: 'a small arcade moth with an uncertain, thoughtful voice' },
      playerText: 'Should we check the counter?', fallback: 'I am listening.' });
  };
  try {
    assert.deepEqual(await reply('Mallow clicks its wings nervously as it hears the player\'s suggestion: "I\'ll go check the counter with you."'),
      { text: "I'll go check the counter with you.", source: 'ai' });
    assert.deepEqual(await reply('Mallow nods slowly: “I can stay.”'), { text: 'I can stay.', source: 'ai' });
    assert.deepEqual(await reply('Mallow chuckles, "I can stay."'), { text: 'I can stay.', source: 'ai' });
    assert.deepEqual(await reply('Mallow nodded, wings low: “I can stay.”'), { text: 'I can stay.', source: 'ai' });
    for (const text of ['Mallow clicks its wings nervously:', 'Mallow clicks its wings nervously: ""',
      'Mallow clicks its wings nervously: "I can stay', 'Mallow clicks its wings nervously.']) {
      const result = await reply(text);
      assert.equal(result.source, 'scripted');
      assert.equal(result.text, 'I am listening.');
    }
    for (const text of ['I saw Mallow click its wings: "like this".', 'Mallow: "I can stay."',
      'Mallow clicked before I did.']) {
      const result = await reply(text);
      assert.equal(result.source, 'ai');
      assert.equal(result.text, text === 'Mallow: "I can stay."' ? 'I can stay.' : text);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keep the spoken part of an observed local-model chuckle without reading third-person narration', async () => {
  const originalFetch = globalThis.fetch;
  const spoken = "That's a good one! But I reckon it'd be more like a dragon's breath, causing chaos but with a sweet, soothing side.";
  try {
    for (const [output, source, expected] of [
      [`Niko chuckles, "${spoken}"`, 'ai', spoken],
      ['Niko chuckles, "That is a fun idea.', 'scripted', 'A written response.'],
      ['Niko chuckles, That is a fun idea.', 'scripted', 'A written response.'],
      ['Niko said his brother chuckles, "I like it."', 'ai', 'Niko said his brother chuckles, "I like it."']
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: output }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
      const result = await respond({ settings: { endpoint: 'http://localhost:1234/v1/chat/completions', model: 'fixture' },
        character: { name: 'Niko' }, playerText: 'If we turned a broken machine into a tiny dragon, what would it do?', fallback: 'A written response.' });
      assert.equal(result.source, source, output);
      assert.equal(result.text, expected, output);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('a named speech attribution keeps only an unambiguous complete utterance', async () => {
  const originalFetch = globalThis.fetch;
  let output = '';
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: output } }] }),
    { headers: { 'Content-Type': 'application/json' } });
  const reply = async (text, character = 'Niko') => {
    output = text;
    return respond({ settings: { endpoint: 'http://localhost:1234/v1/chat/completions', model: 'fixture' },
      character: { name: character }, playerText: 'What do you like about fixing machines?', fallback: 'Let me think.' });
  };
  try {
    for (const text of ['Niko says cheerfully, "It is like a puzzle."',
      'Niko jokes cheerfully: “It is like a puzzle.”', 'Niko says with a grin, "It is like a puzzle."']) {
      assert.deepEqual(await reply(text), { text: 'It is like a puzzle.', source: 'ai' });
    }
    for (const text of ['Niko says cheerfully, "It is like a puzzle', 'Niko says cheerfully, It is like a puzzle.',
      'Niko jokes cheerfully: ""', 'Niko says cheerfully, "It is like a puzzle." Player: Really?']) {
      assert.equal((await reply(text)).source, 'scripted');
    }
    for (const text of ['I remember when Niko says cheerfully, "We can fix it."',
      'Niko says the machine is working.', 'Mira says cheerfully, "We can fix it."']) {
      assert.deepEqual(await reply(text), { text, source: 'ai' }, 'other speakers and ordinary references stay intact');
    }
    assert.deepEqual(await reply('Mallow replies softly, “I can hear you.”', 'Mallow'),
      { text: 'I can hear you.', source: 'ai' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an unquoted question does not address the player as the current speaker', async () => {
  const originalFetch = globalThis.fetch;
  let output = '';
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: output } }] }),
    { headers: { 'Content-Type': 'application/json' } });
  const reply = async (text) => {
    output = text;
    return respond({ settings: { endpoint: 'http://localhost:1234/v1/chat/completions', model: 'fixture' },
      character: { name: 'Niko' }, playerText: 'What do you like about fixing machines?', fallback: 'I like figuring them out.' });
  };
  try {
    // This was an actual local-model reply, not a claim about other models.
    const observed = "Oh, that's easy! It's fun when you can make the machines work again after they've broken down. Plus, it helps keep the arcade running smoothly. What about you, Niko? What do you like about fixing machines?";
    assert.deepEqual(await reply(observed), { text: 'I like figuring them out.', source: 'scripted', error: 'The AI response was not usable as dialogue. Using scripted dialogue.' });
    assert.equal((await reply('How about you, Niko?')).source, 'scripted');
    for (const text of ['What about you, Mira?', 'What about you?', 'I thought about you, Niko.',
      'My brother asked, what about you, Niko?', 'He asked me, “What about you, Niko?”']) {
      assert.deepEqual(await reply(text), { text, source: 'ai' }, 'other names and quoted or reported references stay intact');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
