// Reconstruct a musical phase from the current passage and saved story flags.
// Most nodes deliberately omit a mood; the phase should survive reloads and
// avoid flickering back to warm between a hint and the player's hint choice.
export function resolveStoryMood(nodeId, node, flags = {}) {
  const explicit = node?.mood;
  if (['warm', 'uneasy', 'fracture', 'ending'].includes(explicit)) return explicit;
  if (flags?.ending) return 'ending';
  if (node?.location === 'playroom' || (typeof nodeId === 'string' && nodeId.startsWith('basement_'))) return 'fracture';
  if (flags?.vote_a || (typeof nodeId === 'string' && nodeId.startsWith('hint_'))) return 'uneasy';
  return 'warm';
}

/** Original, synthesized music and story cues. No audio starts until enable(). */
export function createStorySound({ AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext, activationTimeoutMs = 5000, cueTimeoutMs = 2000 } = {}) {
  let context = null;
  let master = null;
  let enabled = false;
  let visible = true;
  let revision = 0;
  let music = null;
  let musicBuffer = null;
  let undertone = null;
  let undertoneBuffer = null;
  let mood = 'warm';
  let cancelUnlock = null;
  const active = new Set();
  let cueCompletion = null;

  function settleCue() {
    if (!cueCompletion) return;
    const completion = cueCompletion;
    cueCompletion = null;
    clearTimeout(completion.timer);
    completion.resolve();
  }

  function stop() {
    for (const item of [...active]) {
      active.delete(item);
      item.source.onended = null;
      try { item.source.stop(); } catch {}
      try { item.source.disconnect(); } catch {}
      try { item.gain.disconnect(); } catch {}
    }
    settleCue();
  }

  function stopMusic() {
    if (music) {
      try { music.source.stop(); } catch {}
      try { music.source.disconnect(); } catch {}
      try { music.gain.disconnect(); } catch {}
      music = null;
    }
    if (undertone) {
      try { undertone.source.stop(); } catch {}
      try { undertone.source.disconnect(); } catch {}
      try { undertone.gain.disconnect(); } catch {}
      undertone = null;
    }
  }

  function disable() {
    revision++;
    cancelUnlock?.();
    enabled = false;
    stop();
    stopMusic();
    const old = context;
    context = null;
    master = null;
    musicBuffer = null;
    undertoneBuffer = null;
    if (old && old.state !== 'closed') {
      try { Promise.resolve(old.close()).catch(() => {}); } catch {}
    }
  }

  async function enable() {
    if (enabled && context?.state === 'running') return true;
    if (!AudioContext) throw new Error('This browser cannot play story sounds.');
    const currentRevision = ++revision;
    let current;
    try {
      // A context can be closed independently by its environment. Its gain and
      // sources cannot be reused by the replacement context.
      if (context?.state === 'closed') {
        stop();
        stopMusic();
        context = null;
        master = null;
        musicBuffer = null;
        undertoneBuffer = null;
        enabled = false;
      }
      current = context && context.state !== 'closed' ? context : new AudioContext();
      context = current;
      // Call resume while still inside the user's click handler, before awaiting.
      if (current.state === 'suspended') {
        let timer;
        let cancel;
        const interrupted = new Promise((_, reject) => {
          cancel = () => reject(new Error('Audio unlock cancelled.'));
          cancelUnlock = cancel;
          timer = setTimeout(() => reject(new Error('Audio unlock timed out.')), activationTimeoutMs);
        });
        try {
          await Promise.race([Promise.resolve(current.resume()), interrupted]);
        } finally {
          clearTimeout(timer);
          if (cancelUnlock === cancel) cancelUnlock = null;
        }
      }
      if (revision !== currentRevision || context !== current) return false;
      if (current.state !== 'running') throw new Error('Audio did not start.');
      if (!master) {
        master = current.createGain();
        master.gain.value = 0.07; // Fixed low ceiling for all procedural cues.
        master.connect(current.destination);
      }
      if (visible) startMusic(current);
      enabled = true;
      return true;
    } catch {
      if (revision !== currentRevision) return false;
      disable();
      throw new Error('Story sounds could not start. Check your device audio and try again.');
    }
  }

  // Keep the preference enabled while a backgrounded page is silent. A new
  // source is created on return; an AudioBufferSourceNode cannot be restarted.
  function setVisible(isVisible) {
    visible = Boolean(isVisible);
    if (!visible) {
      stop();
      stopMusic();
      return true;
    }
    if (enabled && context && context.state !== 'closed') {
      try { startMusic(context); }
      catch { disable(); return false; }
    }
    return true;
  }

  function startMusic(audio) {
    if (music) return;
    if (!musicBuffer) musicBuffer = makeMusicBuffer(audio);
    if (!undertoneBuffer) undertoneBuffer = makeUndertoneBuffer(audio);
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    music = { source, gain };
    source.buffer = musicBuffer;
    source.loop = true;
    gain.gain.value = 0.25;
    source.connect(gain);
    gain.connect(master);
    const start = audio.currentTime + 0.025;
    source.start(start);
    const shadow = audio.createBufferSource();
    const shadowGain = audio.createGain();
    undertone = { source: shadow, gain: shadowGain };
    shadow.buffer = undertoneBuffer;
    shadow.loop = true;
    shadowGain.gain.value = 0;
    shadow.connect(shadowGain);
    shadowGain.connect(master);
    shadow.start(start);
    fadeUndertone();
    shiftMusic();
  }

  // The second layer follows the story, never starts audio on its own, and
  // changes gradually so a passage change cannot produce a sharp jump.
  const undertoneLevels = { warm: 0, uneasy: 0.055, fracture: 0.13, ending: 0.035 };
  // The familiar melody slowly sags in the playroom while the undertone keeps
  // its original time. This makes the same tune feel subtly displaced rather
  // than replacing it with a sudden horror sting.
  const melodyRates = { warm: 1, uneasy: 0.997, fracture: 0.985, ending: 0.995 };
  function shiftMusic() {
    if (!music || !context || context.state !== 'running') return;
    const parameter = music.source.playbackRate;
    const now = context.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      const current = parameter.value;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(current, now);
    }
    parameter.linearRampToValueAtTime(melodyRates[mood], now + 3);
  }
  function fadeUndertone() {
    if (!undertone || !context || context.state !== 'running') return;
    const parameter = undertone.gain.gain;
    const now = context.currentTime;
    const current = parameter.value;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(current, now);
    }
    parameter.linearRampToValueAtTime(undertoneLevels[mood], now + 1.5);
  }
  function setMood(next) {
    if (!Object.prototype.hasOwnProperty.call(undertoneLevels, next) || next === mood) return false;
    mood = next;
    try { fadeUndertone(); shiftMusic(); } catch { /* The story continues without a sound transition. */ }
    return true;
  }

  function makeMusicBuffer(audio) {
    // An original, quiet eight-bar music-box phrase in D minor. Its second
    // half revisits the opening before reaching a different little turn.
    // Each note has a short attack and release; the loop ends at silence.
    const melody = [293.66, 349.23, 440, 523.25, 440, 349.23, 329.63, 293.66,
                    261.63, 329.63, 392, 493.88, 440, 349.23, 329.63, 293.66,
                    293.66, 349.23, 440, 587.33, 523.25, 440, 392, 349.23,
                    329.63, 293.66, 261.63, 329.63, 349.23, 329.63, 293.66, 293.66];
    const bass = [146.83, 174.61, 130.81, 146.83, 146.83, 174.61, 130.81, 146.83];
    const rate = audio.sampleRate;
    const buffer = audio.createBuffer(1, Math.round(rate * 16), rate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const time = i / rate;
      const note = Math.min(31, Math.floor(time * 2));
      const elapsed = time - note * 0.5;
      const envelope = Math.min(1, elapsed / 0.015, (0.5 - elapsed) / 0.045) * Math.exp(-elapsed * 3);
      const phase = 2 * Math.PI * melody[note] * elapsed;
      const bell = (Math.sin(phase) + 0.18 * Math.sin(phase * 2)) * envelope * 0.32;
      const barTime = time % 2;
      const bassEnvelope = Math.min(1, barTime / 0.04, (2 - barTime) / 0.10) * 0.15;
      const low = Math.sin(2 * Math.PI * bass[Math.min(7, Math.floor(time / 2))] * barTime) * bassEnvelope;
      samples[i] = bell + low;
    }
    return buffer;
  }

  function makeUndertoneBuffer(audio) {
    // A faint, slower reply to the music-box melody. A low sustained tone and
    // detuned upper notes make the familiar phrase feel less certain without
    // introducing a sudden sting or relying on external audio assets.
    const notes = [146.83, 174.61, 219.00, 195.05];
    const rate = audio.sampleRate;
    const buffer = audio.createBuffer(1, Math.round(rate * 8), rate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const time = i / rate;
      const bar = Math.min(3, Math.floor(time / 2));
      const local = time - bar * 2;
      const envelope = Math.min(1, local / 0.14, (2 - local) / 0.2);
      const tone = Math.sin(2 * Math.PI * notes[bar] * local) * 0.2;
      const overtone = Math.sin(2 * Math.PI * notes[bar] * 2.01 * local) * 0.045;
      samples[i] = (tone + overtone) * envelope;
    }
    return buffer;
  }

  function register(source, gain) {
    const item = { source, gain };
    active.add(item);
    source.onended = () => {
      active.delete(item);
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      if (!active.size) settleCue();
    };
    return item;
  }

  function tone(start, duration, frequency, amplitude, shape = 'sine', endFrequency = frequency) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (frequency !== endFrequency) oscillator.frequency.linearRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(amplitude, start + Math.min(0.012, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    register(oscillator, gain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  function staticBurst(start, duration, callback) {
    const count = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, count, context.sampleRate);
    const samples = buffer.getChannelData(0);
    // Fixed pseudo-random samples keep the sound reproducible and entirely local.
    let seed = callback ? 0x13da5 : 0x72bc1;
    for (let i = 0; i < count; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = ((seed / 0xffffffff) * 2 - 1) * 0.45;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain); gain.connect(master);
    register(source, gain);
    source.start(start); source.stop(start + duration + 0.01);
  }

  function play(nodeId) {
    stop();
    if (!enabled || !visible || !context || context.state !== 'running' || !master) return false;
    const start = context.currentTime + 0.025;
    try {
      if (nodeId === 'keepsake_bell' || nodeId === 'close_bell') {
        // A little brass bell, echoed once when the crew returns to the fort.
        tone(start, 0.34, 880, 0.18);
        tone(start, 0.24, 1320, 0.07);
        if (nodeId === 'close_bell') tone(start + 0.42, 0.26, 880, 0.12);
      } else if (nodeId === 'hint_intro') {
        // The arcade machine wakes up with a gentle two-note chirp.
        tone(start, 0.13, 530, 0.12);
        tone(start + 0.15, 0.18, 710, 0.12);
      } else if (nodeId === 'regroup') {
        tone(start, 0.24, 760, 0.14);
        tone(start, 0.18, 1140, 0.05);
      } else if (nodeId === 'regroup_signal_bell') {
        // The image echoes the real bell, thinner and slightly out of tune.
        tone(start, 0.24, 864, 0.10);
        tone(start, 0.17, 1296, 0.035);
      } else if (nodeId === 'regroup_signal_touch' || nodeId === 'regroup_signal_count' || nodeId === 'evidence_confirm') {
        // The same cheery acknowledgement follows very different actions;
        // the optional confirmation also makes the still-locked latch click.
        tone(start, 0.13, 530, 0.09);
        tone(start + 0.15, 0.18, 710, 0.09);
        if (nodeId === 'evidence_confirm') tone(start + 0.29, 0.07, 155, 0.12, 'sine', 105);
      } else if (nodeId === 'basement_door') {
        // Three soft knocks from underneath the counter.
        for (let i = 0; i < 3; i++) tone(start + i * 0.19, 0.09, 155, 0.20, 'sine', 105);
      } else if (nodeId === 'room_shift') {
        // The light fails in every route; this cue does not imply a bell.
        tone(start, 0.35, 410, 0.08, 'sine', 260);
        staticBurst(start + 0.10, 0.38, true);
      } else if (nodeId === 'descent_bell') {
        // Mira's bell rings once before she touches it.
        tone(start, 0.34, 880, 0.15);
        tone(start, 0.24, 1320, 0.06);
      } else if (nodeId === 'shift_bell') {
        // One nearby ring, then two fainter rings from behind the door.
        tone(start, 0.28, 880, 0.14);
        tone(start + 0.36, 0.25, 880, 0.08);
        tone(start + 0.67, 0.25, 880, 0.06);
      } else if (nodeId === 'correction_again' || nodeId === 'correction_absorbed' ||
                 nodeId === 'fourth_wall_intro_compact' || nodeId === 'fourth_wall_intro_confirm') {
        // The condensed scenes include the same correction on current routes;
        // older checkpoints still use the two original passage IDs above.
        staticBurst(start, 0.30, false);
        tone(start + 0.04, 0.20, 410, 0.07, 'sine', 320);
      } else if (nodeId === 'history_brief_direct' || nodeId === 'history_brief_warm' ||
                 nodeId === 'history_direct' || nodeId === 'history_warm' ||
                 nodeId === 'history_compare_direct' || nodeId === 'history_compare_warm') {
        // The unspoken alternative appears beneath Mallow's original answer.
        // Echo the earlier machine chirp softly, then let its second note sag
        // out of tune: a familiar sound with a small wrongness in it.
        tone(start, 0.13, 530, 0.07);
        tone(start + 0.15, 0.23, 710, 0.055, 'sine', 650);
      } else {
        return false;
      }
      // Web Audio normally fires onended when the last scheduled sound ends.
      // If a device suspends a context without firing it, do not leave
      // automatic speech waiting indefinitely. All current cues end within a
      // second; the fallback stops a stalled cue before releasing the wait.
      if (active.size) {
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        const completion = { promise, resolve, timer: null };
        cueCompletion = completion;
        completion.timer = setTimeout(() => {
          if (cueCompletion === completion) stop();
        }, cueTimeoutMs);
      }
      return true;
    } catch {
      stop();
      return false;
    }
  }

  return { enable, disable, play, stop, setMood, setVisible, dispose: disable,
    waitForCue: () => cueCompletion?.promise || null, isEnabled: () => enabled };
}
