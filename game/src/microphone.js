/** Capture a short mono WAV for Mirid's local and remote speech engines.
 * The player must explicitly start recording. No audio is saved to disk. */
const SAMPLE_RATE = 16000;
const MAX_SECONDS = 60;
const ACTIVATION_TIMEOUT_MS = 5000;
const RESAMPLE_TIMEOUT_MS = 30000;

function encodeWav(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return buffer;
}

export function createMicrophone({ mediaDevices = globalThis.navigator?.mediaDevices,
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
  OfflineAudioContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext,
  AudioWorkletNode = globalThis.AudioWorkletNode, onInterrupted, onLimit } = {}) {
  let active = null;
  const pendingResamples = new Set();
  function stopTracks(stream) { for (const track of stream?.getTracks?.() || []) track.stop(); }
  function release(session) {
    if (!session || session.released) return;
    session.released = true;
    session.cancelled = true;
    // A permission prompt is allowed to remain open indefinitely. Release
    // the caller immediately, while the permission promise below still owns
    // cleanup of any stream granted after cancellation.
    session.cancelPermission?.();
    // A browser may never settle AudioContext.resume(). Unblock a pending
    // startup immediately when the player cancels or the track ends.
    session.cancelActivation?.();
    // Unblock a stop waiting on the worklet when the scene is cancelled.
    session.finishCapture?.();
    for (const track of session.tracks || []) {
      try { track.removeEventListener?.('ended', session.onTrackEnded); } catch {}
    }
    try { session.context?.removeEventListener?.('statechange', session.onContextStateChange); } catch {}
    if (session.processor) {
      session.processor.onaudioprocess = null;
      if (session.processor.port) session.processor.port.onmessage = null;
      try { session.processor.disconnect(); } catch {}
    }
    if (session.source) { try { session.source.disconnect(); } catch {} }
    if (session.silence) { try { session.silence.disconnect(); } catch {} }
    stopTracks(session.stream);
    // Track and graph teardown above is synchronous. Some browsers can leave
    // close() pending indefinitely after an interruption; initiate closure but
    // do not strand a completed recording or a retry waiting on that promise.
    try { Promise.resolve(session.context?.close()).catch(() => {}); } catch {}
  }
  function cancelled() { return new DOMException('Recording cancelled.', 'AbortError'); }
  async function awaitActivation(session, resume) {
    if (session.cancelled) throw cancelled();
    let timer;
    const interrupted = new Promise((_, reject) => {
      session.cancelActivation = () => reject(cancelled());
      timer = setTimeout(() => reject(new Error('Microphone audio could not start. Check your device audio and try again.')), ACTIVATION_TIMEOUT_MS);
    });
    try {
      const error = await Promise.race([resume, interrupted]);
      if (error) throw error;
    } finally {
      clearTimeout(timer);
      session.cancelActivation = null;
    }
  }
  return {
    async start() {
      if (!mediaDevices?.getUserMedia || !AudioContext || !OfflineAudioContext) throw new Error('Microphone recording requires a supported browser on localhost or HTTPS.');
      if (active) throw new Error('A recording is already in progress.');
      const session = { cancelled: false, chunks: [], sampleCount: 0 };
      active = session;
      try {
        // On iOS, a permission prompt can outlive the tap that opened it.
        // Create and resume the context in that tap's synchronous turn; no
        // microphone input is connected until permission is actually granted.
        session.context = new AudioContext();
        const resume = session.context.state === 'suspended'
          ? Promise.resolve(session.context.resume()).then(() => null, () => new Error('Microphone audio could not start. Check your device audio and try again.'))
          : Promise.resolve(null);
        const permission = Promise.resolve(mediaDevices.getUserMedia({ audio: { channelCount: 1 } })).then(stream => {
          if (active !== session || session.cancelled) { stopTracks(stream); return null; }
          return stream;
        });
        const interrupted = new Promise((_, reject) => { session.cancelPermission = () => reject(cancelled()); });
        let stream;
        try { stream = await Promise.race([permission, interrupted]); }
        finally { session.cancelPermission = null; }
        if (active !== session || session.cancelled) { stopTracks(stream); throw cancelled(); }
        session.stream = stream;
        session.tracks = stream.getTracks?.() || [];
        // A phone call, revoked permission or disconnected microphone can end
        // a track without the player pressing Stop. End the session immediately
        // rather than displaying a recording state that captures only silence.
        session.onTrackEnded = () => {
          if (active !== session || session.cancelled) return;
          active = null;
          session.chunks.length = 0;
          void release(session);
          try { onInterrupted?.(); } catch {}
        };
        for (const track of session.tracks) track.addEventListener?.('ended', session.onTrackEnded, { once: true });
        if (session.tracks.some(track => track.readyState === 'ended')) {
          session.onTrackEnded();
          throw cancelled();
        }
        // Start the timeout only after permission is granted: a permission
        // prompt may legitimately stay open while the player decides.
        await awaitActivation(session, resume);
        if (active !== session || session.cancelled) throw cancelled();
        session.source = session.context.createMediaStreamSource(stream);
        const capture = (channel) => {
          if (active !== session || session.cancelled || !channel?.length) return;
          const remaining = Math.max(0, Math.floor(session.context.sampleRate * MAX_SECONDS) - session.sampleCount);
          if (remaining) {
            const chunk = new Float32Array(channel.subarray(0, remaining));
            session.chunks.push(chunk);
            session.sampleCount += chunk.length;
          }
          if (remaining && session.sampleCount >= Math.floor(session.context.sampleRate * MAX_SECONDS) && !session.limitNotified) {
            session.limitNotified = true;
            // Browser timers can be throttled on phones while audio continues.
            // Stop when the actual capture limit is reached, without invoking
            // stop() reentrantly from a worklet or audio processing callback.
            queueMicrotask(() => {
              if (active === session && !session.cancelled && !session.stopping) {
                try { onLimit?.(); } catch {}
              }
            });
          }
        };
        if (session.context.audioWorklet && AudioWorkletNode) {
          try {
            // Module loading can stall independently of AudioContext.resume().
            // Bound it and allow cancellation so a broken worklet cannot leave
            // the record button permanently busy after permission was granted.
            await awaitActivation(session, Promise.resolve(
              session.context.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url).href)
            ).then(() => null));
            if (active !== session || session.cancelled) throw cancelled();
            session.processor = new AudioWorkletNode(session.context, 'reply-capture');
            session.processor.port.onmessage = (event) => {
              if (event.data?.type === 'finished') session.finishCapture?.();
              else capture(event.data);
            };
          } catch (error) {
            if (active !== session || session.cancelled) throw error;
          }
        }
        if (!session.processor) {
          if (typeof session.context.createScriptProcessor !== 'function') throw new Error('This browser cannot capture microphone audio.');
          session.processor = session.context.createScriptProcessor(4096, 1, 1);
          session.processor.onaudioprocess = (event) => capture(event.inputBuffer.getChannelData(0));
        }
        session.silence = session.context.createGain();
        session.silence.gain.value = 0;
        session.source.connect(session.processor);
        session.processor.connect(session.silence);
        session.silence.connect(session.context.destination);
        if (active !== session || session.cancelled) throw cancelled();
        // A resolved resume() need not mean the context is still running. Don't
        // report a recording in that state: release the microphone and allow a
        // fresh user-initiated attempt instead of submitting an empty capture.
        if (session.context.state !== 'running') throw new Error('Microphone audio could not start. Check your device audio and try again.');
        // On some phones the audio context can be interrupted while its input
        // track remains live. Stop rather than present a silently paused
        // recording as active; retry still needs an explicit user gesture.
        session.onContextStateChange = () => {
          if (session.context.state !== 'running') session.onTrackEnded();
        };
        session.context.addEventListener?.('statechange', session.onContextStateChange);
        if (session.context.state !== 'running') {
          session.onContextStateChange();
          throw cancelled();
        }
      } catch (error) {
        if (active === session) active = null;
        release(session);
        throw error;
      }
    },
    async stop() {
      const session = active;
      if (!session || !session.context || session.stopping) throw new Error('No active recording.');
      session.stopping = true;
      const inputRate = session.context.sampleRate;
      // Stop receiving microphone input immediately, but allow audio messages
      // already posted by the worklet to reach the main thread before closing
      // its port. The acknowledgement follows those messages in port order.
      if (session.processor?.port?.postMessage) {
        try { session.source?.disconnect(); } catch {}
        stopTracks(session.stream);
        session.stream = null;
        if (active !== session || session.cancelled) throw cancelled();
        await new Promise((resolve) => {
          let timer;
          session.finishCapture = () => {
            clearTimeout(timer);
            session.finishCapture = null;
            resolve();
          };
          // A stalled or old worklet cannot leave the UI waiting indefinitely.
          timer = setTimeout(session.finishCapture, 300);
          try { session.processor.port.postMessage({ type: 'finish' }); }
          catch { session.finishCapture(); }
        });
        if (active !== session || session.cancelled) throw cancelled();
      }
      active = null;
      release(session);
      const total = session.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (!total) throw new Error('No audio was captured. Try recording again.');
      const input = new Float32Array(total);
      let offset = 0;
      for (const chunk of session.chunks) { input.set(chunk, offset); offset += chunk.length; }
      session.chunks.length = 0;
      let samples = input;
      if (inputRate !== SAMPLE_RATE) {
        const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(total * SAMPLE_RATE / inputRate)), SAMPLE_RATE);
        const buffer = offline.createBuffer(1, total, inputRate);
        buffer.copyToChannel(input, 0);
        const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start();
        // A device can leave offline resampling pending after interruption.
        // Keep cancellation available after the microphone track has stopped,
        // and bound the wait so the player can retry instead of being stuck.
        let cancelResample, timer;
        const interrupted = new Promise((_, reject) => {
          cancelResample = () => reject(cancelled());
          timer = setTimeout(() => reject(new Error('Microphone audio could not be prepared. Try recording again.')), RESAMPLE_TIMEOUT_MS);
        });
        pendingResamples.add(cancelResample);
        try {
          samples = (await Promise.race([offline.startRendering(), interrupted])).getChannelData(0);
        } finally {
          clearTimeout(timer);
          pendingResamples.delete(cancelResample);
        }
      }
      return new Blob([encodeWav(samples)], { type: 'audio/wav' });
    },
    cancel() {
      const session = active;
      active = null;
      if (session) session.chunks.length = 0;
      for (const cancelResample of pendingResamples) cancelResample();
      release(session);
    }
  };
}
