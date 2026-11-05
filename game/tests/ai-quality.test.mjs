/** Conservative dialogue quality fallbacks for observed local-model errors. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'signal-quality-test-'));
const originalFetch = globalThis.fetch;
try {
  await writeFile(join(temp, 'bounded-json.mjs'), await readFile(new URL('../src/bounded-json.js', import.meta.url)));
  const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
    .replace("'./bounded-json.js'", "'./bounded-json.mjs'");
  await writeFile(join(temp, 'ai.mjs'), source);
  const { respond } = await import(pathToFileURL(join(temp, 'ai.mjs')).href);
  const cases = [
    { player: 'What do you think?', output: 'Niko: I hear you.\nPlayer: I agree.', character: 'Niko', source: 'ai', expected: 'I hear you.' },
    { player: 'What do you think?', output: 'I hear you.\nYou: I agree.', character: 'Niko', source: 'ai', expected: 'I hear you.' },
    { player: 'What do you think?', output: 'Niko: I hear you.\nPlayer: "I agree."', character: 'Niko', source: 'ai', expected: 'I hear you.' },
    { player: 'What do you think?', output: 'Niko: "I hear you."\nPlayer: "I agree."', character: 'Niko', source: 'ai', expected: 'I hear you.' },
    { player: 'What do you think?', output: 'I hear you.\nYou: “I agree.”', character: 'Niko', source: 'ai', expected: 'I hear you.' },
    { player: 'What do you think?', output: 'Player: "I agree."', character: 'Niko', source: 'scripted' },
    { player: 'What do you think?', output: 'I think\nPlayer: yes', character: 'Niko', source: 'scripted' },
    { player: 'What do you think?', output: 'USER: I agree.', character: 'Niko', source: 'scripted' },
    { player: 'What do you think?', output: 'The note said, “\nPlayer: READY\n” and I kept it.', character: 'Niko', source: 'ai' },
    { player: 'What do you think?', output: 'You: the one person who brought a spare battery.', character: 'Niko', source: 'ai' },
    { player: 'What do you think?', output: 'The player: a very tired repairer. That could be you.', character: 'Niko', source: 'ai' },
    { player: "If the lights go out, I'll remember you.", output: "If the lights go out, I'll remember you.", character: 'Caller', source: 'scripted' },
    { player: 'If the lights go out, I’ll remember you.', output: 'IF THE LIGHTS GO OUT I\'LL REMEMBER YOU', character: 'Caller', source: 'scripted' },
    { player: "If the lights go out, I'll remember you.", output: 'Caller: "If the lights go out, I\'ll remember you."', character: 'Caller', source: 'scripted' },
    { player: 'We are here.', output: 'We are here.', character: 'Noor', source: 'ai' },
    { player: "If the lights go out, I'll remember you.", output: "If the lights go out, I'll remember you. Thank you.", character: 'Caller', source: 'ai' },
    { player: 'Hello.', output: 'Lights fade,Caller. I\'ll hear you still.', character: 'Caller', source: 'scripted' },
    { player: 'Hello.', output: "Oh Noor, I'm not sure they'll forget me.", character: 'Noor', source: 'scripted' },
    // Local Mirid's 1.5B model addressed its own character by name; the
    // comma after the greeting must be handled without rejecting mentions.
    { player: 'What do you think?', output: "Oh, Niko! You always seem to fix everything before your brother returns.", character: 'Niko', source: 'scripted' },
    { player: 'Hello.', output: 'Hey, Mira! You can tell me.', character: 'Mira', source: 'scripted' },
    { player: 'Hello.', output: 'Oh, Niko makes the best repairs.', character: 'Niko', source: 'ai' },
    { player: 'Hello.', output: 'She said, “Oh, Niko!” when I arrived.', character: 'Niko', source: 'ai' },
    { player: 'Hello.', output: 'Oh, Ash! You remembered the map.', character: 'Niko', source: 'ai' },
    { player: 'You do not have to face this alone.', output: "Don't worry, Niko. We've got it under control here. Just stay calm and we'll figure something out together!", character: 'Niko', source: 'scripted' },
    { player: 'Hello.', output: '“Don’t worry, Niko. We can do this.”', character: 'Niko', source: 'scripted' },
    { player: 'Hello.', output: 'Don’t worry, Mira, we can do this.', character: 'Mira', source: 'scripted' },
    { player: 'Hello.', output: 'Do not worry, Niko!', character: 'Niko', source: 'scripted' },
    { player: 'Hello.', output: 'Don’t worry, Ash. We have time.', character: 'Niko', source: 'ai' },
    { player: 'Hello.', output: 'Niko, the person who made this, left a note.', character: 'Niko', source: 'ai' },
    { player: 'Hello.', output: 'She said, “Don’t worry, Niko.” I remember that.', character: 'Niko', source: 'ai' },
    { player: 'Hello.', output: 'Don’t worry about Niko. He will return.', character: 'Niko', source: 'ai' },
    { player: 'You do not have to face this alone.', output: 'Niko grins warmly, his eyes gleaming with determination. "I\'ve got you covered, bro! We\'ll get through this together!"', character: 'Niko', source: 'scripted' },
    { player: 'Hello.', output: 'Niko grinned at the little machine.', character: 'Niko', source: 'scripted' },
    { player: 'Hello.', output: 'I remember when Niko grinned at the machine.', character: 'Niko', source: 'ai' },
    { player: 'Hello.', output: 'Ash grins at me. That helps.', character: 'Niko', source: 'ai' },
    { player: 'Hello.', output: 'She said, “Oh Noor, please listen.”', character: 'Noor', source: 'ai' },
    { player: 'Hello.', output: 'She wrote, “Lights fade, Caller.”', character: 'Caller', source: 'ai' },
    { player: 'Hello.', output: 'My friend, Noor, is listening.', character: 'Noor', source: 'ai' },
    { player: 'Hello.', output: 'I told the caller, Caller.', character: 'Caller', source: 'ai' },
    { player: 'Would your friends understand if you went?', output: '"Of course they would, Mira. Everyone here would understand perfectly," Mira replies, her voice filled with determination and love for her friends.', character: 'Mira', source: 'scripted' },
    { player: 'Hello.', output: '“I’m thinking about it,” Mira answered.', character: 'Mira', source: 'ai', expected: 'I’m thinking about it.' },
    { player: 'Hello.', output: 'Mira says, “I’m thinking about it.”', character: 'Mira', source: 'ai', expected: 'I’m thinking about it.' },
    { player: 'Hello.', output: '"I’m thinking about it," Mira says.', character: 'Mira', source: 'ai', expected: 'I’m thinking about it.' },
    { player: 'Hello.', output: '“Of course, Mira!” Mira says.', character: 'Mira', source: 'scripted' },
    { player: 'Hello.', output: '“I’m thinking about it,” Mira answered and closed the door.', character: 'Mira', source: 'scripted' },
    { player: 'Hello.', output: '“I’m thinking about it,” Niko replied.', character: 'Mira', source: 'ai' },
    { player: 'Hello.', output: 'I wrote “Mira replied” on the tag.', character: 'Mira', source: 'ai' }
  ];
  for (const item of cases) {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: item.output } }] }), {
      headers: { 'content-type': 'application/json' }
    });
    const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' },
      character: { name: item.character }, playerText: item.player, fallback: 'A written response.' });
    assert.equal(result.source, item.source, `Unexpected source for ${item.output}`);
    if (item.source === 'scripted') assert.equal(result.text, 'A written response.');
    else assert.equal(result.text, item.expected ?? item.output);
  }
  // A private exchange must not address the player as another character.
  // Keep the observed failure narrow: ordinary references, reported speech
  // and group exchanges may legitimately mention or address that character.
  for (const item of [
    { output: 'Of course, Niko! Attending that workshop would be so interesting.', names: ['Niko', 'Ash'], source: 'scripted' },
    { output: "Oh, Niko! It's so exciting! I'm already planning new designs.", names: ['Niko', 'Ash'], source: 'scripted' },
    { output: "Oh, Niko! It's so exciting! I'm already planning new designs.", names: [], source: 'ai' },
    { output: 'I said, “Oh, Niko!” when he arrived.', names: ['Niko'], source: 'ai' },
    { output: 'Oh, Niko makes the best plush toys.', names: ['Niko'], source: 'ai' },
    { output: '“Of course, Niko! Attending that workshop would be so interesting.”', names: ['Niko'], source: 'scripted' },
    { output: 'Of course, Niko! Attending that workshop would be so interesting.', names: [], source: 'ai' },
    { output: 'Of course, Niko is welcome at the workshop.', names: ['Niko'], source: 'ai' },
    { output: 'I told her, “Of course, Niko!” before the lights went out.', names: ['Niko'], source: 'ai' },
    { output: 'Of course, Nikolas! We can go.', names: ['Niko'], source: 'ai' },
    { output: 'Of course, Mira! We can go.', names: ['Niko'], source: 'scripted' },
    { output: 'Of course, Mira makes beautiful plushies.', names: ['Niko'], source: 'ai' },
    { output: 'I said, “Of course, Mira!” before we left.', names: ['Niko'], source: 'ai' }
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: item.output } }] }), { headers: { 'content-type': 'application/json' } });
    const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' },
      character: { name: 'Mira' }, playerText: 'Do you still want to go?', privateOtherNames: item.names, fallback: 'A written response.' });
    assert.equal(result.source, item.source, `Unexpected source for ${item.output}`);
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Caller: "Thank you for being here."' } }] }), { headers: { 'content-type': 'application/json' } });
  const labeled = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, character: { name: 'Caller' }, playerText: 'Hello.', fallback: 'A written response.' });
  assert.equal(labeled.source, 'ai');
  assert.equal(labeled.text, 'Thank you for being here.');
  // Separate quoted passages must retain both pairs, including when the
  // provider prepends the character name to its output.
  for (const item of [
    { output: '“Wait,” she said, “look again.”', expected: '“Wait,” she said, “look again.”' },
    { output: 'Niko: "Wait," she said, "look again."', expected: '"Wait," she said, "look again."' },
    { output: 'Niko: “She said "wait" and left.”', expected: 'She said "wait" and left.' }
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: item.output } }] }), { headers: { 'content-type': 'application/json' } });
    const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, character: { name: 'Niko' }, playerText: 'Hello.', fallback: 'A written response.' });
    assert.equal(result.source, 'ai');
    assert.equal(result.text, item.expected);
  }
  // A provider may not respect the requested token limit (or the player may
  // configure no limit). The UI limit should never leave half a sentence.
  for (const item of [
    { output: `First, let's look closer. ${'unfinished '.repeat(90)}`, expected: "First, let's look closer.", source: 'ai' },
    { output: `Niko: “We have time. ${'unfinished '.repeat(90)}”`, expected: 'We have time.', source: 'ai' },
    { output: 'unfinished '.repeat(90), expected: 'A written response.', source: 'scripted' },
    { output: `We should ask Dr. ${'unfinished '.repeat(90)}`, expected: 'A written response.', source: 'scripted' },
    { output: `We can wait. Ask Dr. ${'unfinished '.repeat(90)}`, expected: 'We can wait.', source: 'ai' },
    { output: `“We have time. ${'unfinished '.repeat(90)}`, expected: 'A written response.', source: 'scripted' },
    { output: `We have time. She said, “Wait here. ${'unfinished '.repeat(90)}`, expected: 'We have time.', source: 'ai' },
    { output: `She said, “Wait here. ${'unfinished '.repeat(90)}`, expected: 'A written response.', source: 'scripted' },
    { output: `She said, “Wait here.” ${'unfinished '.repeat(90)}`, expected: 'She said, “Wait here.”', source: 'ai' },
    { output: `We're here. She said, 'Don't go. ${'unfinished '.repeat(90)}`, expected: "We're here.", source: 'ai' },
    // A decimal at the display edge is not a completed sentence.
    { output: `${'a'.repeat(699)}.123 ${'unfinished '.repeat(10)}`, expected: 'A written response.', source: 'scripted' },
    { output: `${'a'.repeat(699)}. ${'unfinished '.repeat(10)}`, expected: `${'a'.repeat(699)}.`, source: 'ai' }
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: item.output } }] }), { headers: { 'content-type': 'application/json' } });
    const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test', tokenParameter: 'none' }, character: { name: 'Niko' }, playerText: 'Hello.', fallback: 'A written response.' });
    assert.equal(result.source, item.source);
    assert.equal(result.text, item.expected);
    assert.ok(result.text.length <= 700);
  }
  // Token limits commonly stop a short local-model reply mid-sentence. Keep
  // a complete first sentence rather than replacing the entire response.
  for (const item of [
    { output: 'I remember the little crown. We can look for', expected: 'I remember the little crown.', source: 'ai' },
    { output: 'I remember the little crown! It was', expected: 'I remember the little crown!', source: 'ai' },
    { output: 'There is only a partial', expected: 'A written response.', source: 'scripted' },
    { output: 'We should ask Dr. F', expected: 'A written response.', source: 'scripted' },
    { output: '“I remember the little crown. We can', expected: 'A written response.', source: 'scripted' },
    { output: 'She said, “Wait here. We can', expected: 'A written response.', source: 'scripted' },
    { output: 'We have time. She said, “Wait here. We can', expected: 'We have time.', source: 'ai' },
    { output: 'She said, “Wait here.” We can', expected: 'She said, “Wait here.”', source: 'ai' },
    { output: "We're here. She said, 'Don't go. We can", expected: "We're here.", source: 'ai' },
    // A stop on punctuation inside a still-open quotation is not a complete reply.
    { output: 'She said, “Wait here.', expected: 'A written response.', source: 'scripted' },
    { output: 'We have time. She said, “Wait here.', expected: 'We have time.', source: 'ai' },
    { output: "We're here. She said, 'Don't go.", expected: "We're here.", source: 'ai' },
    { output: 'She said, “Wait here.”', expected: 'She said, “Wait here.”', source: 'ai' }
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: item.output } }] }), { headers: { 'content-type': 'application/json' } });
    const result = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, character: { name: 'Niko' }, playerText: 'What do you remember?', fallback: 'A written response.' });
    assert.equal(result.source, item.source);
    assert.equal(result.text, item.expected);
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'If the lights go out, I will remember you. We could' } }] }), { headers: { 'content-type': 'application/json' } });
  const echo = await respond({ settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, character: { name: 'Niko' }, playerText: 'If the lights go out, I will remember you.', fallback: 'A written response.' });
  assert.equal(echo.source, 'scripted', 'echo checks run on the sentence retained after trimming');
  console.log(`Observed local-model quality regressions passed ${cases.length} offline cases.`);
} finally {
  globalThis.fetch = originalFetch;
  await rm(temp, { recursive: true, force: true });
}
