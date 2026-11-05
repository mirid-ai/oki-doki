/** Branch-specific clues and explicit consent for the on-air signal test. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'okie-privacy-test-'));
try {
  const file = join(dir, 'story.mjs');
  await writeFile(file, await readFile(new URL('../src/story.js', import.meta.url)));
  const { story } = await import(pathToFileURL(file).href);
  const choice = story.signal_choice;
  const repeat = choice.choices.find(item => item.set?.signal === 'repeat');
  const decline = choice.choices.find(item => item.set?.signal === 'private');
  assert.ok(repeat && decline);
  assert.match(choice.text, /on air/i);
  assert.match(repeat.label, /on air/i);
  assert.match(story[repeat.next].text, /\{privateAnswer\}/);
  const privateBranch = story[decline.next];
  assert.equal(privateBranch.nextBy.key, 'relationship');
  assert.equal(privateBranch.nextBy.cases.Noor, 'signal_private_noor');
  assert.equal(privateBranch.nextBy.cases.Ellis, 'signal_private_ellis');
  for (const id of ['signal_private', 'signal_private_noor', 'signal_private_ellis', 'signal_private_reaction']) {
    assert.doesNotMatch(story[id].text, /\{privateAnswer\}/, `${id} must not repeat private words`);
  }
  assert.match(story.signal_private_noor.text, /no incoming call/i);
  assert.match(story.signal_private_ellis.text, /before i spoke/i);
  assert.equal(story.signal_private_noor.next, 'signal_private_reaction');
  assert.equal(story.signal_private_ellis.next, 'signal_private_reaction');
  assert.match(story.disclosure_private_reply.text, /earlier conversation too/i);
  console.log('✓ On-air consent and relationship-specific private clues');
} finally {
  await rm(dir, { recursive: true, force: true });
}
