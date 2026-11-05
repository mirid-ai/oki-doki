import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(execFileSync(process.execPath, [path.join(root, 'tools/voice_catalog.mjs')], { encoding: 'utf8' }));
assert.equal(catalog.version, 1);
assert.ok(catalog.entries.length > 800);
assert.ok(catalog.skippedDynamic.includes('story:signal_repeat'));
const keys = new Set();
for (const item of catalog.entries) {
  assert.equal(item.key, JSON.stringify([item.speaker, item.voice, item.text.trim()]));
  assert.ok(!/\{[^}]+\}/.test(item.text), item.origin);
  assert.ok(!keys.has(item.key), item.origin);
  keys.add(item.key);
}
assert.ok(catalog.entries.some(x => x.origin === 'story:opening' && x.voice === 'af_heart'));
assert.ok(catalog.entries.some(x => x.origin === 'choice:reason_choice' && x.voice === 'af_sarah'));
assert.ok(catalog.entries.some(x => x.origin === 'exchange-reply:niko_input' && x.voice === 'am_adam'));
assert.ok(catalog.entries.some(x => x.origin === 'input-prompt:niko_light_input' && x.voice === 'af_heart'));
assert.ok(catalog.entries.some(x => x.origin === 'input-guide:default' && x.voice === 'af_heart'));
assert.ok(catalog.entries.some(x => x.origin === 'variant:early_rescue_setup'));
assert.ok(catalog.entries.some(x => x.origin === 'variant:close_signal:repeat:thread'));
assert.ok(catalog.entries.some(x => x.origin === 'exchange-reply:close_mira_light'));
assert.equal(catalog.entries.filter(x => x.origin.startsWith('date:')).length, 6);
assert.equal(catalog.entries.filter(x => x.origin.startsWith('opening-ui:')).length, 6);
console.log(`${catalog.entries.length} fixed voice clips and dynamic exclusions verified.`);

assert.equal(catalog.entries.filter(x => x.origin.startsWith('policy-opening:')).length, 4);
assert.equal(catalog.entries.filter(x => x.origin.startsWith('comparison:early_together:')).length, 9);
assert.ok(catalog.entries.some(x => x.origin === 'control:story' && x.text === 'Write on the map →'));
assert.ok(catalog.entries.some(x => x.origin === 'variant:early_together_note_default' && x.speaker === 'Narrator' && x.voice === 'af_heart'));
