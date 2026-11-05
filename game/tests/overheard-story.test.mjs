/** The overheard lines come from the witnessed companion scene, not player text. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/story-next.js', import.meta.url), 'utf8');
const { story } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originals = {
  Niko: { light: ['niko_light', 'the motor has a much more dramatic voice'], personal: ['niko_private', 'i can fix everything'] },
  Mira: { light: ['mira_light', 'very scientific'], personal: ['mira_private', 'what i’d make just for me'] },
  Ash: { light: ['ash_light', 'that has happened precisely once'], personal: ['ash_private', 'places where people can find each other again'] }
};
function next(id, flags) {
  const node = story[id];
  return node.nextBy?.cases?.[flags[node.nextBy.key]] || node.next;
}
for (const entrance of ['private_signal', 'private_signal_after_group']) {
  for (const [companion, tones] of Object.entries(originals)) {
    for (const [tone, [originalNode, phrase]] of Object.entries(tones)) {
      const flags = { companion, private_tone: tone };
      const gate = next(entrance, flags);
      const trace = next(gate, flags);
      assert.equal(trace, `signal_trace_${companion.toLowerCase()}_${tone}`);
      assert.ok(story[originalNode].text.toLowerCase().includes(phrase), `${trace} must quote a witnessed line`);
      assert.ok(story[trace].text.toLowerCase().includes(phrase), `${trace} quotes the right character`);
      assert.ok(!/\{(?:privateAnswer|answer|privateFollowup)\}/.test(story[trace].text), 'Player text is not exposed by the trace');
      assert.equal(story[trace].next, 'mallow_privacy_request');
      assert.equal(story.mallow_privacy_request.next, 'signal_choice');
    }
  }
  assert.equal(next(entrance, { companion: 'Niko' }), 'mallow_privacy_request', 'Legacy checkpoints without a tone bypass invented traces');
}
assert.deepEqual(story.signal_choice.choices.map(choice => [choice.next, choice.set.signal]), [['signal_repeat', 'repeat'], ['signal_private', 'private']]);
assert.equal(story.signal_private.next, 'signal_private_receipt');
assert.equal(story.signal_repeat.next, 'signal_repeat_react');
console.log('Overheard traces follow the witnessed companion and tone, preserve the player’s separate choice, and bypass older checkpoints.');
