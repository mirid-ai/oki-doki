/** The player may combine both requests, with a real cost and later consequences. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'okie-announcement-test-'));
try {
  const file = join(dir, 'story.mjs');
  await writeFile(file, await readFile(new URL('../src/story.js', import.meta.url)));
  const { story } = await import(pathToFileURL(file).href);
  const combined = story.airtime_decide.choices.find(choice => choice.set?.broadcast === 'combined');
  assert.ok(combined, 'The combined announcement must be selectable.');
  const initial = story[combined.next];
  const notice = story[initial.next];
  const cost = story[notice.next];
  assert.match(initial.text, /light/i);
  assert.match(notice.text, /north gate.*12:10/i);
  assert.match(cost.text, /shorten/i);
  assert.equal(cost.next, 'phone');
  const corrupted = story.broadcast_corruption.nextBy.cases[combined.set.broadcast];
  assert.equal(corrupted, 'corrupt_combined');
  assert.match(story[corrupted].text, /light is out/i);
  assert.match(story[corrupted].text, /south gate/i);
  const correctedNoor = story[story[corrupted].next];
  const correctedEllis = story[correctedNoor.next];
  assert.match(correctedNoor.text, /light on/i);
  assert.match(correctedEllis.text, /north gate/i);
  assert.equal(correctedEllis.next, 'reveal');
  const ending = story.broadcast_close.nextBy.cases[combined.set.broadcast];
  assert.equal(ending, 'close_combined');
  assert.match(story[ending].text, /dedication/i);
  assert.match(story[story[ending].next].text, /gate/i);
  console.log('✓ Combined announcement has both messages, a cost, corruption and closing consequences');
} finally {
  await rm(dir, { recursive: true, force: true });
}
