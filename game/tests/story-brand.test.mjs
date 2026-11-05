/** Check the title phrase is established and echoed in the authored story. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'okie-story-test-'));
try {
  const file = join(temp, 'story.mjs');
  await writeFile(file, await readFile(new URL('../src/story.js', import.meta.url)));
  const { story, title, episodeTitle } = await import(pathToFileURL(file).href);
  assert.equal(title, 'Oki Doki');
  assert.equal(episodeTitle, 'After the Signal');
  assert.equal(story.intro_noor.speaker, 'Noor');
  assert.match(story.intro_noor.text, /\bokie dokie\b/i);
  assert.equal(story.caller.speaker, 'Caller');
  assert.match(story.caller.text, /\bokie dokie\b/i);
  assert.match(story.caller_noor.text, /that’s my line/i);
  console.log('✓ Noor establishes the title phrase and the caller echoes it');
} finally {
  await rm(temp, { recursive: true, force: true });
}
