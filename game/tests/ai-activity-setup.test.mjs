import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('only a bounded authored activity setup is sent with a configured request', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'oki-activity-setup-'));
  const originalFetch = globalThis.fetch;
  try {
    const source = (await readFile(new URL('../src/ai.js', import.meta.url), 'utf8')).replace("'./bounded-json.js'", "'./bounded-json.mjs'");
    await writeFile(join(temp, 'bounded-json.mjs'), await readFile(new URL('../src/bounded-json.js', import.meta.url)));
    await writeFile(join(temp, 'ai.mjs'), source);
    const { respond } = await import(pathToFileURL(join(temp, 'ai.mjs')).href);
    let sent;
    globalThis.fetch = async (_url, options) => {
      sent = JSON.parse(JSON.parse(options.body).messages[1].content);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'I remember.' } }] }), { headers: { 'content-type': 'application/json' } });
    };
    const options = { settings: { endpoint: 'https://example.invalid/chat', model: 'test' }, character: { name: 'Niko' }, playerText: 'What did we do?', fallback: 'I hear you.' };
    await respond(options);
    assert.equal(sent.activity_setup, undefined);
    await respond({ ...options, activitySetup: ` Niko offers the lid.\u0000 ${'x'.repeat(500)} ` });
    assert.equal(sent.activity_setup.length, 400);
    assert.ok(sent.activity_setup.startsWith('Niko offers the lid. '));
    assert.ok(!sent.activity_setup.includes('\u0000'));
    await respond({ ...options, activitySetup: { text: 'not an authored string' } });
    assert.equal(sent.activity_setup, undefined);
    const note = 'A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.';
    const longSetup = `${'S'.repeat(300)} ${note}`;
    await respond({ ...options, activitySetup: longSetup });
    assert.equal(sent.activity_setup, longSetup, 'a maximum-length witnessed setup and the separately witnessed note must both arrive');
    await respond({ ...options, activityExchange: { playerAction: `Choose ${'x'.repeat(295)}`, characterReply: `Reply ${'y'.repeat(694)}` }, context: 'z'.repeat(1800) });
    assert.equal(sent.scene.length, 1800);
    assert.equal(sent.activity_exchange.player_action.length, 300);
    assert.equal(sent.activity_exchange.character_reply.length, 700);
    await respond({ ...options, activityExchange: { playerAction: 'Pick one', characterReply: 42 } });
    assert.equal(sent.activity_exchange, undefined);
    await respond({ ...options, context: 'z'.repeat(1800), dateMoment: ` A witnessed date plan.\u0000 ${'x'.repeat(700)} ` });
    assert.equal(sent.scene.length, 1800);
    assert.equal(sent.date_moment.length, 600);
    assert.ok(sent.date_moment.startsWith('A witnessed date plan. '));
    assert.ok(!sent.date_moment.includes('\u0000'));
    await respond({ ...options, dateMoment: { text: 'not an authored string' } });
    assert.equal(sent.date_moment, undefined);
    await respond({ ...options, earlierConversation: ` A witnessed line.\u0000 ${'x'.repeat(1000)} ` });
    assert.equal(sent.earlier_conversation.length, 900);
    assert.ok(sent.earlier_conversation.startsWith('A witnessed line. '));
    assert.ok(!sent.earlier_conversation.includes('\u0000'));
    await respond({ ...options, earlierConversation: { text: 'not authored dialogue' } });
    assert.equal(sent.earlier_conversation, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temp, { recursive: true, force: true });
  }
});
