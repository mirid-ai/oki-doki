/** Offline Web Audio mocks: no speaker, microphone, or network is used. */
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temp = await mkdtemp(join(tmpdir(), 'okie-sound-test-'));
const modulePath = join(temp, 'sound.mjs');
await writeFile(modulePath, await readFile(new URL('../src/sound.js', import.meta.url)));
const { createStorySound, resolveStoryMood } = await import(pathToFileURL(modulePath).href);
const storySource = await readFile(new URL('../src/story-next.js', import.meta.url));
const { story } = await import(`data:text/javascript;base64,${storySource.toString('base64')}`);
await rm(temp, { recursive: true, force: true });

function makeAudio({ resume, sampleRate = 16000 } = {}) {
  const instances = [];
  class Parameter { constructor() { this.value = 1; this.events = []; } cancelScheduledValues(t) { this.cancelledAt = t; } setValueAtTime(v, t) { this.events.push([v,t]); } linearRampToValueAtTime(v,t) { this.events.push([v,t]); } exponentialRampToValueAtTime(v,t) { this.events.push([v,t]); } }
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 10; this.sampleRate = sampleRate; this.destination = {}; this.sources = []; this.gains = []; instances.push(this); }
    async resume() { if (resume) await resume(); this.state = 'running'; }
    async close() { this.state = 'closed'; }
    createGain() { const gain = { gain: new Parameter(), connect() {}, disconnect() {} }; this.gains.push(gain); return gain; }
    makeSource() { const source = { frequency: new Parameter(), playbackRate: new Parameter(), started: [], stopped: [], connect() {}, disconnect() {}, start(t) { this.started.push(t); }, stop(t) { this.stopped.push(t); } }; this.sources.push(source); return source; }
    createOscillator() { return this.makeSource(); }
    createBufferSource() { return this.makeSource(); }
    createBuffer(_channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  }
  return { Context, instances };
}
const test = async (name, fn) => { await fn(); console.log(`✓ ${name}`); };
await test('scene mood follows story and survives checkpoints without a transient reset', async () => {
  assert.equal(resolveStoryMood('opening', story.opening, {}), 'warm');
  for (const id of ['hint_intro', 'hint_mallow', 'hint_choice']) {
    assert.equal(resolveStoryMood(id, story[id], {}), 'uneasy', `${id} before the hint vote`);
  }
  assert.equal(resolveStoryMood('niko_route', story.niko_route, { vote_a: 'skip' }), 'uneasy');
  assert.equal(resolveStoryMood('basement_team', story.basement_team, { vote_a: 'skip' }), 'fracture');
  assert.equal(resolveStoryMood('history_skip', story.history_skip, {}), 'fracture', 'older playroom checkpoint needs no new flag');
  assert.equal(resolveStoryMood('end_mallow', story.end_mallow, { ending: 'mallow' }), 'ending');
  assert.equal(resolveStoryMood('mallow_camera_touch', story.mallow_camera_touch, { ending: 'mallow' }), 'ending');
  assert.equal(resolveStoryMood('close_reason', story.close_reason, { ending: 'rescue' }), 'uneasy', 'the final explicit unease wins');
  assert.equal(resolveStoryMood('opening', null, null), 'warm');
});
await test('no audio context, playback, or sound occurs before explicit enable', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  assert.equal(sound.play('keepsake_bell'), false); assert.equal(h.instances.length, 0); assert.equal(sound.isEnabled(), false);
  sound.disable(); assert.equal(h.instances.length, 0);
});
await test('cue completion waits for every sound and releases on stop, mute or stall', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context, cueTimeoutMs: 15 });
  assert.equal(sound.waitForCue(), null);
  await sound.enable();
  const ctx = h.instances[0];
  assert.equal(sound.play('basement_door'), true);
  let finished = false;
  const waiting = sound.waitForCue().then(() => { finished = true; });
  const knocks = ctx.sources.slice(2);
  assert.equal(knocks.length, 3);
  knocks[0].onended(); knocks[1].onended();
  await Promise.resolve();
  assert.equal(finished, false, 'speech must wait for the final knock');
  knocks[2].onended(); await waiting;
  assert.equal(sound.waitForCue(), null);
  sound.play('basement_door');
  const stopped = sound.waitForCue(); sound.stop(); await stopped;
  assert.equal(sound.waitForCue(), null, 'explicit cancellation releases the wait');
  sound.play('basement_door');
  const muted = sound.waitForCue(); sound.disable(); await muted;
  assert.equal(sound.waitForCue(), null, 'muting releases the wait');
  await sound.enable(); sound.play('basement_door');
  const stalled = sound.waitForCue(); await stalled;
  assert.equal(sound.waitForCue(), null, 'a stalled audio context cannot hang auto-read');
  assert.ok(h.instances.at(-1).sources.slice(2).every(source => source.stopped.length >= 2), 'the fallback stops stalled sounds before releasing speech');
  sound.disable();
});
await test('story moods fade a quiet original undertone without restarting the music', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  assert.equal(sound.setMood('fracture'), true);
  assert.equal(h.instances.length, 0, 'setting the scene never starts audio');
  await sound.enable();
  const ctx = h.instances[0], shadow = ctx.sources[1], shadowGain = ctx.gains[2].gain;
  assert.deepEqual(shadowGain.events.at(-1), [0.13, ctx.currentTime + 1.5], 'a resumed playroom fades in the tense layer');
  assert.deepEqual(ctx.sources[0].playbackRate.events.at(-1), [0.985, ctx.currentTime + 3], 'the familiar tune slowly sags in the playroom');
  assert.equal(shadow.playbackRate.events.length, 0, 'the counterline keeps its original speed');
  assert.equal(sound.setMood('unknown'), false);
  assert.equal(sound.setMood('fracture'), false);
  assert.equal(ctx.sources.length, 2);
  for (const [mood, target, rate] of [['uneasy', 0.055, 0.997], ['ending', 0.035, 0.995], ['warm', 0, 1]]) {
    assert.equal(sound.setMood(mood), true);
    assert.deepEqual(shadowGain.events.at(-1), [target, ctx.currentTime + 1.5]);
    assert.deepEqual(ctx.sources[0].playbackRate.events.at(-1), [rate, ctx.currentTime + 3]);
    assert.equal(ctx.sources.length, 2, 'changing mood does not restart either source');
    assert.equal(shadow.stopped.length, 0);
  }
  const data = shadow.buffer.getChannelData(0);
  assert.ok(data.some(sample => Math.abs(sample) > 0.05));
  assert.ok(data.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 0.25));
  assert.ok(Math.abs(data[0] - data.at(-1)) < 0.005, 'the undertone loops at a quiet seam');
  sound.disable();
});
await test('new story cues are bounded, exist in the actual story, and navigation stops prior sources', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  assert.equal(await sound.enable(), true); assert.equal(sound.isEnabled(), true);
  const ctx = h.instances[0]; assert.equal(ctx.gains[0].gain.value, 0.07);
  const music = ctx.sources[0], shadow = ctx.sources[1];
  assert.equal(music.loop, true);
  assert.equal(music.buffer.getChannelData(0).length, ctx.sampleRate * 16);
  assert.equal(ctx.gains[1].gain.value, 0.25);
  assert.ok(music.buffer.getChannelData(0).some(sample => sample !== 0));
  assert.ok(music.buffer.getChannelData(0).every(sample => Number.isFinite(sample) && Math.abs(sample) <= 0.6));
  assert.equal(music.buffer.getChannelData(0)[0], 0);
  const phrase = music.buffer.getChannelData(0);
  assert.ok(phrase.slice(0, ctx.sampleRate * 8).some((sample, i) => Math.abs(sample - phrase[i + ctx.sampleRate * 8]) > 0.01), 'the second half varies the opening phrase');
  assert.equal(shadow.loop, true);
  assert.deepEqual(shadow.started, music.started, 'both layers start in phase');
  assert.equal(shadow.buffer.getChannelData(0).length, ctx.sampleRate * 8);
  assert.equal(ctx.gains[2].gain.value, 0, 'the undertone begins silently');
  assert.equal(await sound.enable(), true);
  assert.equal(ctx.sources.length, 2, 'enabling twice does not duplicate the loops');
  const cues = [
    ['keepsake_bell', 2], ['close_bell', 3], ['hint_intro', 2], ['regroup', 2],
    ['basement_door', 3], ['room_shift', 2], ['descent_bell', 2], ['evidence_confirm', 3],
    ['shift_bell', 3], ['correction_absorbed', 2],
    ['history_direct', 2], ['history_warm', 2], ['history_compare_direct', 2], ['history_compare_warm', 2]
  ];
  let total = 2;
  for (const [nodeId, count] of cues) {
    assert.ok(story[nodeId], `sound cue ${nodeId} must be a real story node`);
    const prior = ctx.sources.slice(2);
    assert.equal(sound.play(nodeId), true);
    total += count;
    assert.equal(ctx.sources.length, total);
    assert.ok(prior.every(source => source.stopped.length >= 2), 'navigation stops every preceding cue');
    assert.equal(music.stopped.length, 0, 'the theme continues between passages');
    assert.equal(shadow.stopped.length, 0, 'the undertone continues without restarting');
  }
  assert.equal(sound.play('other_node'), false);
  assert.ok(ctx.sources.slice(2).every(source => source.stopped.length >= 2));
  for (const gain of ctx.gains.slice(3)) {
    assert.ok(gain.gain.events.every(([amplitude]) => amplitude >= 0 && amplitude <= 0.22));
  }
  sound.disable(); assert.equal(sound.isEnabled(), false); assert.equal(ctx.state, 'closed');
  assert.equal(music.stopped.length, 1, 'muting stops the theme');
  assert.equal(shadow.stopped.length, 1, 'muting also stops the undertone');
  assert.equal(sound.play('keepsake_bell'), false);
});
await test('the unspoken-answer reveal echoes the earlier chirp only when comparison is shown', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  await sound.enable();
  const ctx = h.instances[0];
  assert.equal(sound.play('history_skip'), false, 'skipping the hint does not imply a comparison');
  for (const nodeId of ['history_direct', 'history_warm', 'history_compare_direct', 'history_compare_warm']) {
    const before = ctx.sources.length;
    assert.equal(sound.play(nodeId), true);
    const echo = ctx.sources.slice(before);
    assert.equal(echo.length, 2);
    assert.deepEqual(echo.map(source => source.frequency.events[0][0]), [530, 710]);
    assert.equal(echo[1].frequency.events.at(-1)[0], 650, 'second note drops from its original pitch');
    assert.ok(echo[1].started[0] > echo[0].started[0]);
  }
  sound.setVisible(false);
  assert.equal(sound.play('history_compare_direct'), false, 'backgrounded pages stay silent');
  sound.disable();
  assert.equal(sound.play('history_compare_warm'), false, 'the cue respects mute');
});
await test('the screen echoes the bell only on its route and acknowledges either action alike', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  assert.equal(sound.play('regroup_signal_bell'), false, 'sound starts muted');
  await sound.enable();
  const ctx = h.instances[0];
  assert.equal(sound.play('regroup_signal_star'), false);
  assert.equal(sound.play('regroup_signal_ribbon'), false);
  let before = ctx.sources.length;
  assert.equal(sound.play('regroup_signal_bell'), true);
  const bell = ctx.sources.slice(before);
  assert.deepEqual(bell.map(source => source.frequency.events[0][0]), [864, 1296]);
  const phrases = [];
  for (const node of ['regroup_signal_touch', 'regroup_signal_count']) {
    before = ctx.sources.length;
    assert.equal(sound.play(node), true);
    phrases.push(ctx.sources.slice(before).map(source => source.frequency.events[0][0]));
  }
  assert.deepEqual(phrases, [[530, 710], [530, 710]]);
  assert.equal(sound.play('correction_again'), true, 'older correction scenes retain their cue');
  sound.setVisible(false);
  assert.equal(sound.play('regroup_signal_bell'), false);
  sound.disable();
});
await test('the current correction scenes play the same cue and respect mute and visibility', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  const current = ['fourth_wall_intro_compact', 'fourth_wall_intro_confirm'];
  for (const node of current) assert.equal(sound.play(node), false, 'sound starts muted');
  assert.equal(story.early_door_brace.next, current[0]);
  assert.equal(story.early_door_brace.nextBy.cases.yes, current[1]);
  assert.equal(story.early_door_listen.next, current[0]);
  assert.equal(story.early_door_listen.nextBy.cases.yes, current[1]);
  await sound.enable();
  const ctx = h.instances[0];
  for (const node of ['correction_again', ...current]) {
    const before = ctx.sources.length;
    assert.equal(sound.play(node), true);
    const [noise, fallingTone] = ctx.sources.slice(before);
    assert.equal(ctx.sources.length - before, 2);
    assert.ok(noise.buffer, 'correction begins with the existing static burst');
    assert.deepEqual(fallingTone.frequency.events.map(event => event[0]), [410, 320]);
    assert.ok(sound.waitForCue(), 'auto-read can wait for the cue');
  }
  sound.setVisible(false);
  for (const node of current) assert.equal(sound.play(node), false, 'backgrounded pages stay silent');
  sound.disable();
  for (const node of current) assert.equal(sound.play(node), false, 'muted pages stay silent');
});
await test('the three impossible bell rings are confined to the bell route', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  await sound.enable();
  const ctx = h.instances[0];
  sound.play('room_shift');
  assert.ok(ctx.sources.every(source => !source.frequency.events.some(([frequency]) => frequency === 880)), 'the shared scene does not ring the bell');
  assert.equal(sound.play('shift_star'), false);
  assert.equal(sound.play('shift_ribbon'), false);
  const before = ctx.sources.length;
  assert.equal(sound.play('shift_bell'), true);
  const bells = ctx.sources.slice(before);
  assert.equal(bells.length, 3);
  assert.ok(bells.every(source => source.frequency.events.some(([frequency]) => frequency === 880)));
  assert.ok(bells[0].started[0] < bells[1].started[0] && bells[1].started[0] < bells[2].started[0]);
  sound.disable();
});
await test('backgrounding silences cues and music without changing the sound preference', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  await sound.enable();
  const ctx = h.instances[0], firstMusic = ctx.sources[0], firstShadow = ctx.sources[1];
  sound.setMood('fracture');
  sound.play('hint_intro');
  const cue = ctx.sources[2];
  assert.equal(sound.setVisible(false), true);
  assert.equal(sound.isEnabled(), true);
  assert.equal(firstMusic.stopped.length, 1);
  assert.equal(firstShadow.stopped.length, 1);
  assert.ok(cue.stopped.length >= 2);
  assert.equal(sound.play('hint_intro'), false, 'a late passage cannot play in the background');
  const before = ctx.sources.length;
  assert.equal(sound.setVisible(true), true);
  assert.equal(ctx.sources.length, before + 2);
  const resumedMusic = ctx.sources.at(-2), resumedShadow = ctx.sources.at(-1);
  assert.equal(resumedMusic.loop, true);
  assert.equal(resumedMusic.buffer, firstMusic.buffer, 'foreground playback reuses the synthesized waveform');
  assert.equal(resumedShadow.buffer, firstShadow.buffer, 'foreground playback reuses the undertone waveform');
  assert.deepEqual(ctx.gains.at(-1).gain.events.at(-1), [0.13, ctx.currentTime + 1.5], 'the prior mood fades back in');
  sound.setVisible(true);
  assert.equal(ctx.sources.length, before + 2, 'repeated visibility events do not duplicate music');
  sound.disable();
  assert.equal(resumedMusic.stopped.length, 1);
  assert.equal(resumedShadow.stopped.length, 1);
  sound.setVisible(false); sound.setVisible(true);
  assert.equal(ctx.sources.length, before + 2, 'a muted game stays silent on return');
});
await test('a closed context is replaced together with its audio graph and cached music', async () => {
  const h = makeAudio(), sound = createStorySound({ AudioContext: h.Context });
  await sound.enable();
  const original = h.instances[0], previousMusic = original.sources[0];
  original.state = 'closed';
  assert.equal(await sound.enable(), true);
  assert.equal(h.instances.length, 2);
  const replacement = h.instances[1];
  assert.equal(replacement.state, 'running');
  assert.equal(replacement.sources[0].loop, true);
  assert.notEqual(replacement.sources[0].buffer, previousMusic.buffer, 'a new context gets a fresh buffer');
  assert.equal(previousMusic.stopped.length, 1);
  assert.equal(sound.play('hint_intro'), true);
  sound.disable();
  assert.equal(replacement.state, 'closed');
});
await test('backgrounding during audio unlock prevents the loop from starting until return', async () => {
  let finish; const wait = new Promise(resolve => { finish = resolve; });
  const h = makeAudio({ resume: () => wait }), sound = createStorySound({ AudioContext: h.Context });
  const enabling = sound.enable();
  sound.setVisible(false); finish();
  assert.equal(await enabling, true);
  assert.equal(h.instances[0].sources.length, 0);
  sound.setVisible(true);
  assert.equal(h.instances[0].sources.length, 2);
  sound.disable();
});
await test('the music buffer has a bounded quiet seam at common device sample rates', async () => {
  for (const sampleRate of [16000, 44100, 48000]) {
    const h = makeAudio({ sampleRate }), sound = createStorySound({ AudioContext: h.Context });
    await sound.enable();
    const data = h.instances[0].sources[0].buffer.getChannelData(0);
    let peak = 0;
    for (const sample of data) {
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample));
    }
    assert.ok(peak > 0.05 && peak < 0.6, `unexpected peak ${peak}`);
    assert.ok(Math.abs(data[0] - data.at(-1)) < 0.005, 'loop seam remains near silence');
    const undertone = h.instances[0].sources[1].buffer.getChannelData(0);
    assert.ok(undertone.every(sample => Number.isFinite(sample) && Math.abs(sample) < 0.25));
    assert.ok(Math.abs(undertone[0] - undertone.at(-1)) < 0.005, 'undertone seam remains near silence');
    sound.disable();
  }
});
await test('disable during pending unlock prevents late audio from starting', async () => {
  let finish; const wait = new Promise(resolve => { finish = resolve; });
  const h = makeAudio({ resume: () => wait }), sound = createStorySound({ AudioContext: h.Context });
  const enabling = sound.enable(); sound.disable(); finish();
  assert.equal(await enabling, false); assert.equal(sound.isEnabled(), false);
  assert.equal(sound.play('keepsake_bell'), false); assert.equal(h.instances[0].sources.length, 0);
});
await test('missing or blocked Web Audio reports failure without enabling', async () => {
  const missing = createStorySound({ AudioContext: null });
  await assert.rejects(missing.enable(), /cannot play/); assert.equal(missing.isEnabled(), false);
  const h = makeAudio({ resume: async () => { throw new Error('blocked'); } });
  const blocked = createStorySound({ AudioContext: h.Context });
  await assert.rejects(blocked.enable(), /could not start/); assert.equal(blocked.isEnabled(), false);
  assert.equal(h.instances[0].state, 'closed');
});
await test('stalled audio unlock times out, closes the context and permits a retry', async () => {
  let finish;
  let attempts = 0;
  const h = makeAudio({ resume: () => {
    attempts++;
    return attempts === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve();
  } });
  const sound = createStorySound({ AudioContext: h.Context, activationTimeoutMs: 10 });
  await assert.rejects(sound.enable(), /could not start/);
  assert.equal(sound.isEnabled(), false);
  assert.equal(h.instances[0].state, 'closed');
  assert.equal(await sound.enable(), true);
  const replacement = h.instances[1];
  finish();
  await Promise.resolve();
  assert.equal(h.instances[0].sources.length, 0, 'late unlock cannot start old audio');
  assert.equal(replacement.sources.length, 2);
  sound.disable();
});
await test('disable settles a stalled unlock without waiting for resume', async () => {
  const h = makeAudio({ resume: () => new Promise(() => {}) });
  const sound = createStorySound({ AudioContext: h.Context, activationTimeoutMs: 10000 });
  const enabling = sound.enable();
  sound.disable();
  assert.equal(await enabling, false);
  assert.equal(sound.isEnabled(), false);
  assert.equal(h.instances[0].state, 'closed');
  assert.equal(h.instances[0].sources.length, 0);
});
