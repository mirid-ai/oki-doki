/** In-fiction preferences route consistently, remain optional and reunite before the ending. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'okie-preferences-story-'));
try {
  const paths = ['story', 'preference'];
  for (const name of paths) await writeFile(join(dir, `${name}.mjs`), await readFile(new URL(`../src/${name}.js`, import.meta.url)));
  const { story } = await import(pathToFileURL(join(dir, 'story.mjs')).href);
  const { evaluatePreference } = await import(pathToFileURL(join(dir, 'preference.mjs')).href);
  for (const first of ['direct', 'warm', 'skip']) {
    for (const second of ['direct', 'warm', 'skip']) {
      const a = story.preference_a.choices.find(choice => choice.set?.vote_a === first);
      const b = story.preference_b.choices.find(choice => choice.set?.vote_b === second);
      assert.ok(a && b, `Missing preference choices: ${first}, ${second}`);
      assert.equal(story[a.next].next, 'preference_b_intro');
      assert.equal(story[story.preference_b_intro.next], story.preference_b);
      assert.equal(story[b.next].next, 'caller_request');
      assert.equal(story.caller_request.next, 'ask_message');
      assert.equal(story.ask_message.input.next, 'ai_reflection', 'Preferences precede generated Caller dialogue');
      const { scores, style } = evaluatePreference({ vote_a: first, vote_b: second });
      const direct = Number(first === 'direct') + Number(second === 'direct');
      const warm = Number(first === 'warm') + Number(second === 'warm');
      assert.deepEqual(scores, { direct, warm });
      assert.equal(style, direct + warm === 0 ? 'neutral' : direct >= warm ? 'direct' : 'warm');
      for (const relationship of ['Noor', 'Ellis']) {
        let id = story.steering_discovery.nextBy.cases[relationship];
        const visited = [];
        while (id !== 'reveal_caller') {
          assert.ok(story[id], `Missing node ${id}`);
          assert.ok(!visited.includes(id), `Loop at ${id}`);
          visited.push(id);
          const node = story[id];
          assert.doesNotMatch(node.text, /\{privateAnswer\}/, 'Reveal must not repeat private input');
          const value = node.nextBy?.key === 'preference_style' ? style : relationship;
          id = node.nextBy?.cases?.[value] || node.next;
        }
        assert.ok(visited.includes(`reward_${style}`));
        assert.ok(visited.includes('steering_feedback') && visited.includes('steering_runtime'));
        assert.equal(visited.includes('steering_none'), style === 'neutral');
        assert.equal(story.reveal_caller.nextBy.cases[relationship], relationship === 'Noor' ? 'noor_offer' : 'ellis_offer');
      }
    }
  }
  assert.match(story.steering_feedback.text, /reward signal/i);
  assert.match(story.steering_feedback.text, /doesn’t update weights/i);
  assert.match(story.steering_runtime.text, /written line/i);
  console.log('✓ All nine preference combinations shape the later line and converge without leaking private input');
} finally {
  await rm(dir, { recursive: true, force: true });
}
