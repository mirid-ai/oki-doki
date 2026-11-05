import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function load(name) {
  const source = await readFile(new URL(`../src/${name}.js`, import.meta.url));
  return import(`data:text/javascript;base64,${source.toString('base64')}`);
}
const { story } = await load('story-next');
const { dimPlayroomNodes, createPortraitController } = await load('visual-phase');
const dim = dimPlayroomNodes(story);
const targets = node => [node.next, node.input?.next, ...(node.choices || []).map(choice => choice.next),
  ...Object.values(node.nextBy?.cases || {}), node.offer?.skip, node.offer?.grant?.next, node.offer?.paidGrant?.next].filter(Boolean);

test('portrait changes hide the old speaker until the new image decodes', async () => {
  const waiting = [];
  const image = {
    hidden: true, complete: false, naturalWidth: 0,
    set src(value) { this.value = value; this.complete = false; this.naturalWidth = 0; },
    get src() { return this.value; },
    decode() { return new Promise((resolve, reject) => waiting.push({ resolve, reject })); }
  };
  const portrait = createPortraitController(image);
  const load = () => { image.complete = true; image.naturalWidth = 100; image.onload(); };
  portrait.show('niko.png'); load();
  assert.equal(image.hidden, true, 'wait for decode before showing a speaker');
  waiting.shift().resolve(); await Promise.resolve();
  assert.equal(image.hidden, false);
  portrait.show('niko.png');
  assert.equal(image.hidden, false, 'keep the same fully decoded character visible');
  portrait.show('mira.png');
  assert.equal(image.hidden, true, 'do not leave Niko visible while Mira loads');
  load(); const lateMira = waiting.shift();
  portrait.show('ash.png');
  lateMira.resolve(); await Promise.resolve();
  assert.equal(image.hidden, true, 'a late Mira decode cannot show during Ash');
  image.onerror();
  assert.equal(image.hidden, true, 'a missing image does not expose the old portrait');
  portrait.show('mira.png'); load(); const lateAfterReset = waiting.shift();
  portrait.show('');
  lateAfterReset.resolve(); await Promise.resolve();
  assert.equal(image.hidden, true, 'a delayed decode cannot restore a portrait after reset');
});

test('the playroom stays lit on every reachable passage before the shift', () => {
  const seen = new Set();
  const queue = ['descent'];
  while (queue.length) {
    const id = queue.pop();
    if (id === 'room_shift' || seen.has(id)) continue;
    const node = story[id];
    if (!node || node.location !== 'playroom') continue;
    seen.add(id);
    assert.equal(dim.has(id), false, `${id} occurs before the light fails`);
    queue.push(...targets(node));
  }
  assert.ok(seen.has('moment_choice') && seen.has('signal_choice') && seen.has('ai_reflection'));
});

test('the dark room continues across every branch, stops on exit, and supports earlier checkpoints', () => {
  for (const id of ['room_shift', 'shift_bell', 'mira_missing', 'evidence_choice', 'door_choice',
    'fourth_wall_intro', 'history_paper_choice', 'history_paper_public_choice', 'history_paper_quote', 'audit_action_choice', 'audit_unplug',
    'plan_choice', 'end_rescue', 'end_record', 'end_mallow', 'end_retreat',
    'correction_absorbed', 'reason_result_team', 'reason_result_prize', 'reason_result_company']) {
    assert.equal(dim.has(id), true, `Expected light-out art for ${id}`);
  }
  for (const id of dim) {
    const node = story[id];
    assert.equal(node.location, 'playroom');
    for (const next of targets(node)) {
      if (story[next]?.location === 'playroom') assert.equal(dim.has(next), true, `${id} → ${next} lost the light-out phase`);
      else assert.equal(dim.has(next), false, `${id} → ${next} carried the playroom phase outside the room`);
    }
  }
  for (const [id, node] of Object.entries(story)) {
    if (node.location !== 'playroom') assert.equal(dim.has(id), false, `${id} is outside the playroom`);
  }
});
