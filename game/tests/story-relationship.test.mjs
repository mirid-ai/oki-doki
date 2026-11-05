/** Character closing beats must follow every outcome without changing it. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'okie-relationship-test-'));
try {
  const file = join(dir, 'story.mjs');
  await writeFile(file, await readFile(new URL('../src/story.js', import.meta.url)));
  const { story } = await import(pathToFileURL(file).href);
  for (const outcome of ['end_listeners', 'end_mobile', 'end_broadcast', 'end_record']) {
    for (const relationship of ['Noor', 'Ellis']) {
      for (const broadcast of ['dedication', 'notice', 'combined']) {
        for (const disclosure of ['public', 'private']) {
          for (const signal of ['repeat', 'private']) {
            const flags = { relationship, broadcast, disclosure, signal, reason: 'help', keepsake: 'mug' };
            let id = outcome; const visited = new Set();
            while (!story[id].end) {
              assert.ok(!visited.has(id), `${outcome} looped at ${id}`);
              visited.add(id);
              const node = story[id];
              assert.ok(!node.choices && !node.input, `${outcome} must finish without another choice`);
              id = node.nextBy?.cases?.[flags[node.nextBy.key]] || node.next;
              assert.ok(story[id], `Missing node ${id}`);
            }
            assert.ok(visited.has(`relationship_close_${relationship.toLowerCase()}`));
            assert.ok(!visited.has(`relationship_close_${relationship === 'Noor' ? 'ellis' : 'noor'}`));
          }
        }
      }
    }
  }
  assert.match(story.relationship_close_noor.text, /don’t know if my sister will answer/i);
  assert.match(story.relationship_close_noor.text, /try calling/i);
  assert.match(story.relationship_close_ellis.text, /remembering.*alone/i);
  console.log('✓ Relationship payoffs follow every ending and choice combination');
} finally {
  await rm(dir, { recursive: true, force: true });
}
