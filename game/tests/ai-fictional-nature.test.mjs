import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('a character can discuss their fictional nature without leaving the scene', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'oki-fictional-nature-'));
  const originalFetch = globalThis.fetch;
  try {
    const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url), 'utf8');
    const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8'))
      .replace("'./bounded-json.js'", "'./bounded-json.mjs'");
    await writeFile(join(temp, 'bounded-json.mjs'), dependency);
    await writeFile(join(temp, 'ai.mjs'), source);
    const { respond } = await import(pathToFileURL(join(temp, 'ai.mjs')).href);
    let request;
    globalThis.fetch = async (_url, options) => {
      request = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'I can hear you through the machine, but I do not know why the room is changing.' } }] }), {
        headers: { 'content-type': 'application/json' }
      });
    };
    const result = await respond({
      settings: { endpoint: 'https://example.invalid/chat', model: 'test' },
      character: { name: 'Mallow', voice: 'a fictional moth guide' },
      context: 'Mallow appears on a small screen and can hear the crew.',
      playerText: 'Are you part of this machine?',
      fallback: 'I heard you.'
    });
    assert.equal(result.source, 'ai');
    assert.equal(result.text, 'I can hear you through the machine, but I do not know why the room is changing.');
    const system = request.messages.find(message => message.role === 'system').content;
    assert.doesNotMatch(system, /do not[^.]*claim to be an AI/i, 'the fictional machine must not be forbidden from discussing its nature');
    assert.match(system, /fictional circumstances/i);
    assert.match(system, /real-world model or provider/i);
    assert.equal(JSON.parse(request.messages.find(message => message.role === 'user').content).player_says, 'Are you part of this machine?');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temp, { recursive: true, force: true });
  }
});
