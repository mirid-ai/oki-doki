import { createMicrophone } from './microphone.js';
import { synthesizeSpeech, transcribeSpeech, validateTranscriptionSettings } from './speech.js';
import { getRealtimeClientSecretInfo, synthesizeRealtimeSpeech, validateRealtimeSpeechInput } from './realtime-speech.js';

// Realtime uses a fresh session for each spoken segment. Give the original
// cast distinct supported voices while respecting the narrator's chosen voice.
const realtimeCastVoices = Object.freeze({
  Narrator: 'marin', You: 'coral', Service: 'sage', Niko: 'cedar',
  Mira: 'shimmer', Ash: 'echo', Mallow: 'ballad'
});
export function realtimeVoiceFor(speaker, narratorVoice = 'marin') {
  const narrator = typeof narratorVoice === 'string' && narratorVoice.trim() ? narratorVoice.trim() : 'marin';
  if (speaker === 'Narrator' || !Object.prototype.hasOwnProperty.call(realtimeCastVoices, speaker)) return narrator;
  const voice = realtimeCastVoices[speaker];
  // If the narrator takes another character's default, exchange that one
  // voice with the narrator's original default so no two cast members share it.
  return voice === narrator ? 'marin' : voice;
}

// These files are optional: an incomplete pack must never prevent live speech.
// The text itself is looked up locally and is never sent to this static URL.
const bundledVoices = Object.freeze({
  Narrator: 'af_heart', You: 'af_sarah', Service: 'af_nicole', Niko: 'am_adam',
  Mira: 'af_bella', Ash: 'bm_george', Mallow: 'bf_emma'
});
const bundledManifestUrl = new URL('../assets/voices/manifest.json', import.meta.url);

export function createBundledSpeechLookup(fetchImpl = (...args) => fetch(...args)) {
  let manifest = null;
  return async (part, signal) => {
    const { settings, speaker, voice, text } = part;
    if (part.authored === false || settings.ttsProvider === 'realtime' || settings.mode !== 'mirid' ||
        (settings.ttsEngine && settings.ttsEngine !== 'kokoro') ||
        (settings.speed != null && Number(settings.speed) !== 1) ||
        !Object.prototype.hasOwnProperty.call(bundledVoices, speaker) || bundledVoices[speaker] !== voice) return null;
    try {
      if (!manifest) {
        const response = await fetchImpl(bundledManifestUrl, { signal, cache: 'no-cache' });
        if (!response.ok) return null;
        const value = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        manifest = value;
      }
      if (signal.aborted) return null;
      const key = JSON.stringify([speaker, voice, text.trim()]);
      const filename = Object.prototype.hasOwnProperty.call(manifest, key) ? manifest[key] : '';
      if (typeof filename !== 'string' || !/^[a-f0-9]{64}\.mp3$/.test(filename)) return null;
      const response = await fetchImpl(new URL(filename, bundledManifestUrl), { signal });
      if (!response.ok) return null;
      if (/^text\/html\b/i.test(response.headers?.get('content-type') || '')) return null;
      const blob = await response.blob();
      return blob.size ? blob : null;
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
  };
}

async function defaultLocalKokoro(options) {
  const { synthesizeLocalKokoro } = await import('./local-kokoro.js');
  return synthesizeLocalKokoro(options);
}

// Divide a long Nano passage at sentence/word boundaries so the first part can
// play while the next is prepared. Every character remains in order; a single
// unusually long word stays whole instead of splitting a Unicode code point.
export function splitNanoPassage(text, limit = 180) {
  if (typeof text !== 'string' || !text.trim() || text.length <= limit) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    const sentences = [...window.matchAll(/[.!?]["'”’]?\s+/g)];
    const lastSentence = sentences[sentences.length - 1];
    let end = lastSentence ? lastSentence.index + lastSentence[0].length : window.search(/\s+\S*$/);
    if (end <= 0) {
      const later = rest.slice(limit).search(/\s/);
      if (later < 0) break;
      end = limit + later + 1;
    }
    // Include whitespace in an adjacent part rather than generating empty
    // speech from it; exact text still survives joining all parts.
    const part = rest.slice(0, end);
    if (!part.trim() && parts.length) parts[parts.length - 1] += part;
    else if (!part.trim()) break;
    else parts.push(part);
    rest = rest.slice(end);
  }
  if (rest) {
    if (!rest.trim() && parts.length) parts[parts.length - 1] += rest;
    else parts.push(rest);
  }
  return parts.length ? parts : [text];
}

/** Attach optional, user-initiated recording and speech to the current scene.
 * The caller owns navigation and must call cancel() before replacing the scene. */
export function createVoiceUI({ getSettings, onStatus, onPlaybackReady, onSpeechError, lookupBundledSpeech = createBundledSpeechLookup(), localKokoro = defaultLocalKokoro } = {}) {
  if (typeof getSettings !== 'function') throw new Error('Voice settings are unavailable.');
  let onRecordingLimit = null;
  const microphone = createMicrophone({ onLimit: () => onRecordingLimit?.(), onInterrupted: () => {
    cancel();
    status('Recording was interrupted. Select Record a reply to try again.');
  } });
  let generation = 0;
  let pending = null;
  let timeout = null;
  let recording = false;
  let busy = false;
  let button = null;
  let audioElement = null;
  let audioUrl = null;
  let segmented = null;
  let completion = null;
  let playAttempt = 0;
  // Only this UI instance may reuse a secret, and only for the same companion
  // and pairing credential. Never persist it or rely on an assumed lifetime.
  let realtimeSecret = null;
  let realtimeRequest = null;
  let realtimeExpiryTimer = null;
  const discardRealtimeSecret = () => {
    realtimeSecret = null;
    if (realtimeExpiryTimer !== null) clearTimeout(realtimeExpiryTimer);
    realtimeExpiryTimer = null;
  };
  const abortRealtimeRequest = () => {
    const request = realtimeRequest;
    realtimeRequest = null;
    request?.controller.abort();
  };
  const clearRealtimeSecret = () => {
    discardRealtimeSecret();
    abortRealtimeRequest();
  };
  const matchesCredentials = (entry, settings) => entry && entry.baseUrl === settings.realtimeUrl && entry.pairingToken === settings.realtimeToken;
  const getSecret = async (settings, signal) => {
    if (signal.aborted) throw new DOMException('Speech request cancelled.', 'AbortError');
    if (realtimeSecret && !matchesCredentials(realtimeSecret, settings)) clearRealtimeSecret();
    if (realtimeRequest && !matchesCredentials(realtimeRequest, settings)) clearRealtimeSecret();
    // Leave a margin for the WebSocket handshake, even when the issuer returns
    // a shorter lifetime than requested.
    if (realtimeSecret && realtimeSecret.expiresAt - Date.now() > 5000) return realtimeSecret.value;
    discardRealtimeSecret();
    if (!realtimeRequest) {
      const request = { baseUrl: settings.realtimeUrl, pairingToken: settings.realtimeToken, controller: new AbortController() };
      realtimeRequest = request;
      request.promise = getRealtimeClientSecretInfo({ baseUrl: request.baseUrl, pairingToken: request.pairingToken, signal: request.controller.signal })
        .then((info) => {
          if (realtimeRequest === request && !request.controller.signal.aborted && info.expiresAt - Date.now() > 5000) {
            realtimeSecret = { ...info, baseUrl: request.baseUrl, pairingToken: request.pairingToken };
            realtimeExpiryTimer = setTimeout(discardRealtimeSecret, Math.min(info.expiresAt - Date.now() - 5000, 2147483647));
            realtimeExpiryTimer?.unref?.();
          }
          return info.value;
        }).finally(() => { if (realtimeRequest === request) realtimeRequest = null; });
    }
    const request = realtimeRequest;
    let abortListener;
    const aborted = new Promise((_, reject) => {
      abortListener = () => reject(new DOMException('Speech request cancelled.', 'AbortError'));
      signal.addEventListener('abort', abortListener, { once: true });
      if (signal.aborted) abortListener();
    });
    try { return await Promise.race([request.promise, aborted]); }
    finally { signal.removeEventListener('abort', abortListener); }
  };

  const status = (value) => {
    if (typeof onStatus !== 'function') return;
    // Status is plain text, never markup. Avoid forwarding control characters.
    const message = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 220);
    onStatus(message);
  };
  const updateButton = () => {
    if (!button) return;
    button.disabled = busy;
    button.textContent = recording ? 'Stop recording and transcribe' : 'Record a reply';
    button.setAttribute('aria-pressed', String(recording));
  };
  const speechFailed = () => {
    if (typeof onSpeechError === 'function') onSpeechError();
  };
  const setPlaybackReady = (ready) => {
    if (typeof onPlaybackReady === 'function') onPlaybackReady(Boolean(ready));
  };
  const playbackCleanup = () => {
    setPlaybackReady(false);
    if (audioElement) {
      audioElement.onended = null;
      audioElement.onerror = null;
      try { audioElement.pause(); } catch {}
      audioElement.removeAttribute('src');
      audioElement = null;
    }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  };
  const stopTimer = () => { if (timeout !== null) clearTimeout(timeout); timeout = null; };
  const config = (provided) => {
    const settings = provided || getSettings() || {};
    if (typeof settings.baseUrl !== 'string' || !settings.baseUrl.trim()) {
      throw new Error('Configure a speech service URL in settings first.');
    }
    return settings;
  };
  const friendlyError = (error) => {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Microphone access was denied. Allow access in your browser and try again.';
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return 'No microphone was found. Connect one and try again.';
    if (error?.name === 'NotReadableError') return 'The microphone is unavailable. Check whether another application is using it.';
    if (error?.name === 'AbortError') return 'Recording was cancelled.';
    // Only relay locally authored messages, never raw provider or browser errors.
    const message = typeof error?.message === 'string' ? error.message : '';
    if (/^(Configure a speech|Microphone recording requires|Microphone audio could not start|Microphone audio could not be prepared|No audio was captured|No speech was recognised|Record or choose audio|The recording is too large|The reply field is full|Choose Mirid|Enter a valid speech|The speech |The local speech|Local Kokoro|Speech |Use HTTPS|Could not connect to the speech|Could not connect to the local speech|Could not send text to the local speech|Enter the companion|The companion returned|Could not obtain a Realtime|The Realtime |Could not connect to the Realtime|Enter a valid Realtime)/.test(message)) return message;
    return 'Voice is unavailable. Check your speech settings and try again.';
  };
  const cancel = () => {
    const wasActive = Boolean(recording || busy || pending || audioElement);
    generation++;
    completion = null;
    abortRealtimeRequest();
    stopTimer();
    pending?.abort();
    pending = null;
    for (const controller of segmented?.controllers || []) controller.abort();
    segmented = null;
    microphone.cancel();
    recording = false;
    busy = false;
    updateButton();
    playbackCleanup();
    return wasActive;
  };

  const attachRecorder = (container, textarea) => {
    if (!container || !textarea) throw new Error('A reply field is required for voice input.');
    cancel();
    if (button) button.remove();
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice voice-record';
    updateButton();
    container.append(button);

    function hasRoomForTranscript() {
      const previous = textarea.value || '';
      const limit = Number.isInteger(textarea.maxLength) && textarea.maxLength >= 0 ? textarea.maxLength : Infinity;
      const separatorLength = previous && !/\s$/.test(previous) ? 1 : 0;
      return limit - previous.length > separatorLength;
    }

    async function finish(myGeneration) {
      if (myGeneration !== generation || !recording || busy) return;
      recording = false;
      busy = true;
      stopTimer();
      updateButton();
      status('Preparing your recording…');
      try {
        const audio = await microphone.stop();
        if (myGeneration !== generation) return;
        // The player can keep typing while recording or while the audio is
        // draining. Recheck before sending the recording to the service.
        if ('isConnected' in textarea && !textarea.isConnected) return;
        if (!hasRoomForTranscript()) {
          status('The reply field is full. Edit it before recording.');
          return;
        }
        const settings = config();
        const controller = new AbortController();
        pending = controller;
        status('Transcribing your recording…');
        const transcript = await transcribeSpeech({
          baseUrl: settings.baseUrl, mode: settings.mode || 'mirid', apiKey: settings.apiKey,
          engine: settings.asrEngine, model: settings.asrModel, audio, signal: controller.signal
        });
        if (myGeneration !== generation || ('isConnected' in textarea && !textarea.isConnected)) return;
        const previous = textarea.value || '';
        const separator = previous && !/\s$/.test(previous) ? ' ' : '';
        const limit = Number.isInteger(textarea.maxLength) && textarea.maxLength >= 0 ? textarea.maxLength : Infinity;
        const available = Math.max(0, limit - previous.length);
        // HTML maxlength counts UTF-16 code units. Do not leave half of an
        // emoji or non-BMP character behind when the limit cuts through it.
        let addition = (separator + transcript).slice(0, available);
        if (/[\uD800-\uDBFF]$/.test(addition)) addition = addition.slice(0, -1);
        if (!addition.trim()) { status('The reply field is full.'); return; }
        textarea.value = previous + addition;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        status(addition.length < separator.length + transcript.length ? 'Transcription added up to the reply limit.' : 'Transcription added to your reply.');
      } catch (error) {
        if (myGeneration === generation) status(friendlyError(error));
      } finally {
        if (myGeneration === generation) { pending = null; busy = false; updateButton(); }
      }
    }

    // Also finish when the capture itself reaches its limit: a backgrounded
    // browser may delay the wall-clock timer while continuing microphone input.
    onRecordingLimit = () => { void finish(generation); };

    button.addEventListener('click', async () => {
      if (busy) return;
      if (recording) { await finish(generation); return; }
      // Transcription is appended to the existing reply. Don't ask for the
      // microphone or send audio when there is no room for even one character
      // after the separator that an existing non-space reply needs.
      if (!hasRoomForTranscript()) {
        status('The reply field is full. Edit it before recording.');
        return;
      }
      // Check configuration before the browser asks for microphone access.
      try {
        const settings = config();
        validateTranscriptionSettings({ baseUrl: settings.baseUrl, mode: settings.mode || 'mirid', apiKey: settings.apiKey,
          engine: settings.asrEngine, model: settings.asrModel });
      } catch (error) { status(friendlyError(error)); return; }
      cancel();
      const myGeneration = generation;
      busy = true;
      updateButton();
      status('Waiting for microphone permission…');
      try {
        await microphone.start();
        if (myGeneration !== generation) return;
        busy = false;
        recording = true;
        updateButton();
        status('Recording. Select Stop recording and transcribe when ready.');
        timeout = setTimeout(() => { void finish(myGeneration); }, 60000);
      } catch (error) {
        if (myGeneration === generation) { busy = false; recording = false; updateButton(); status(friendlyError(error)); }
      }
    });
    return button;
  };

  // play() may be blocked after synthesis awaits a network request, especially
  // on mobile. Retain the prepared audio until a direct retry or cancellation.
  const playReady = async () => {
    const player = audioElement;
    const myGeneration = generation;
    const playingUrl = audioUrl;
    if (!player) return false;
    // Rapid retries can settle in a different order. Only the latest attempt
    // may change the controls or status for this same prepared segment.
    const myAttempt = ++playAttempt;
    try {
      await player.play();
      if (myGeneration !== generation || myAttempt !== playAttempt || audioElement !== player || audioUrl !== playingUrl) return false;
      setPlaybackReady(false);
      status('Playing speech.');
      return true;
    } catch (error) {
      if (myGeneration !== generation || myAttempt !== playAttempt || audioElement !== player || audioUrl !== playingUrl) return false;
      // Unsupported or undecodable media cannot be fixed by another gesture.
      // Treat it as a terminal speech failure; policy-blocked playback remains
      // available for a direct retry with the same prepared audio.
      if (error?.name === 'NotSupportedError') {
        cancel();
        speechFailed();
        status('This browser could not play the returned audio.');
        return false;
      }
      setPlaybackReady(true);
      status('Audio is ready. Select Play ready audio to start.');
      return false;
    }
  };

  // The default holds at most one future part; an explicit player setting can
  // hold two. Each speculative request has its own abort controller. Retain
  // failures as values so a stopped or later part cannot reject unhandled.
  const prefetchNext = (queue, myGeneration) => {
    while (queue.index < queue.parts.length && queue.next.length < queue.lookahead) {
      const part = queue.parts[queue.index++];
      const controller = new AbortController();
      queue.controllers.add(controller);
      const future = Promise.resolve().then(() => {
        if (myGeneration !== generation || controller.signal.aborted) throw new Error('Speech request cancelled.');
        return synthesizePart(part, controller.signal);
      }).then(blob => ({ blob }), error => ({ error })).finally(() => queue.controllers.delete(controller));
      queue.next.push(future);
    }
  };

  const loadAudio = (blob, myGeneration) => {
    const nextUrl = URL.createObjectURL(blob);
    const oldUrl = audioUrl;
    audioUrl = nextUrl;
    // Reuse the same media element across chunks. Some browsers grant
    // autoplay permission per element rather than per page.
    if (!audioElement) audioElement = new Audio(nextUrl);
    else audioElement.src = nextUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    audioElement.onended = () => { void onAudioEnded(myGeneration); };
    audioElement.onerror = () => {
      if (myGeneration !== generation) return;
      cancel();
      speechFailed();
      status('This browser could not play the returned audio.');
    };
  };
  const onAudioEnded = async (myGeneration) => {
    if (myGeneration !== generation) return;
    const queue = segmented;
    if (!queue?.next.length) {
      segmented = null;
      const done = completion?.generation === myGeneration ? completion.callback : null;
      completion = null;
      playbackCleanup();
      status('Speech finished.');
      if (typeof done === 'function') { try { done(); } catch { /* Playback completion must not break the voice queue. */ } }
      return;
    }
    const next = queue.next.shift();
    if (audioElement) audioElement.onended = null;
    setPlaybackReady(false);
    status('Preparing the next part…');
    const result = await next;
    if (myGeneration !== generation || segmented !== queue) return;
    if (result.error) {
      completion = null;
      abortRealtimeRequest();
      for (const controller of queue.controllers) controller.abort();
      segmented = null;
      playbackCleanup();
      speechFailed();
      status('Speech stopped partway. Select Read aloud to retry.');
      return;
    }
    try {
      loadAudio(result.blob, myGeneration);
      prefetchNext(queue, myGeneration);
      await playReady();
    } catch (error) {
      if (myGeneration === generation) {
        completion = null;
        abortRealtimeRequest();
        pending?.abort(); pending = null;
        for (const controller of queue.controllers) controller.abort();
        segmented = null;
        playbackCleanup(); speechFailed(); status(friendlyError(error));
      }
    }
  };

  // Freeze settings for each part at the start. A single passage may contain
  // authored dialogue from several speakers and therefore use several TTS
  // services. The selected reference remains scoped to its one speaker.
  const resolveSettings = (base, overrides) => {
    const settings = { ...base, ...overrides };
    if (settings.ttsBaseUrl) {
      settings.baseUrl = settings.ttsBaseUrl;
      settings.apiKey = settings.ttsApiKey || '';
    } else if (settings.ttsApiKey) settings.apiKey = settings.ttsApiKey;
    if (settings.ttsMode) settings.mode = settings.ttsMode;
    return settings;
  };

  const synthesizePart = async (part, signal) => {
    const { settings, voice, text } = part;
    if (settings.ttsProvider === 'realtime') {
      const realtimeVoice = settings.realtimeVoice || 'marin';
      const token = await getSecret(settings, signal);
      if (signal.aborted) throw new Error('Speech request cancelled.');
      try { return await synthesizeRealtimeSpeech({ text, token, voice: realtimeVoice, signal }); }
      catch (error) {
        if (!signal.aborted && realtimeSecret?.value === token && matchesCredentials(realtimeSecret, settings)) clearRealtimeSecret();
        throw error;
      }
    }
    const bundled = await lookupBundledSpeech(part, signal);
    if (signal.aborted) throw new DOMException('Speech request cancelled.', 'AbortError');
    if (bundled) return bundled;
    // The bundled engine supplies dynamic text without a server. An explicit
    // separate TTS endpoint, different voice or engine remains authoritative.
    // The desktop transcriber does not provide /tts. Its selection should
    // leave the already-bundled Kokoro voice available for generated text.
    const localTranscriber = settings.baseUrl === 'http://127.0.0.1:49564/local-asr';
    const defaultEndpoint = !settings.ttsBaseUrl && (!settings.baseUrl || settings.baseUrl === 'http://127.0.0.1:8000' || localTranscriber);
    const localVoice = Object.prototype.hasOwnProperty.call(bundledVoices, part.speaker) && bundledVoices[part.speaker] === voice;
    const localEligible = defaultEndpoint && settings.mode === 'mirid' && (!settings.ttsEngine || settings.ttsEngine === 'kokoro') &&
        (settings.speed == null || Number(settings.speed) === 1) && localVoice;
    const tryLocal = async () => {
      try {
        const local = await localKokoro({ text, voice, signal });
        if (signal.aborted) throw new DOMException('Speech request cancelled.', 'AbortError');
        return local;
      } catch (error) {
        if (signal.aborted || error?.name === 'AbortError') throw error;
        return null;
      }
    };
    if (localEligible && (!settings.baseUrl || localTranscriber)) {
      const local = await tryLocal();
      if (local) return local;
    }
    try {
      config(settings);
      return await synthesizeSpeech({
        baseUrl: settings.baseUrl, mode: settings.mode || 'mirid', apiKey: settings.apiKey,
        engine: settings.ttsEngine, model: settings.ttsModel, speed: settings.speed,
        voice, text, signal
      });
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError') throw error;
      if (localEligible && settings.baseUrl) {
        const local = await tryLocal();
        if (local) return local;
      }
      throw error;
    }
  };

  const speakSequence = async (segments, { onComplete } = {}) => {
    cancel();
    const myGeneration = generation;
    completion = typeof onComplete === 'function' ? { generation: myGeneration, callback: onComplete } : null;
    try {
      if (!Array.isArray(segments) || !segments.length) throw new Error('Speech text must contain 1–2000 characters.');
      const base = { ...(getSettings() || {}) };
      const parts = [];
      for (const segment of segments) {
        const text = typeof segment?.text === 'string' ? segment.text : '';
        if (!text.trim()) continue;
        const settings = resolveSettings(base, segment.overrides || {});
        if (settings.ttsProvider === 'realtime') {
          settings.realtimeVoice = realtimeVoiceFor(segment.speaker, settings.realtimeVoice);
          validateRealtimeSpeechInput({ text, voice: settings.realtimeVoice });
        }
        const useChunks = settings.ttsProvider !== 'realtime' && settings.mode === 'mirid' && settings.ttsEngine === 'chatterbox_nano';
        if (useChunks && text.trim().length > 2000) throw new Error('Speech text must contain 1–2000 characters.');
        for (const part of useChunks ? splitNanoPassage(text.trim()) : [text]) {
          parts.push({ text: part, voice: segment.voice, speaker: segment.speaker, authored: segment.authored, settings });
        }
      }
      if (!parts.length) throw new Error('Speech text must contain 1–2000 characters.');
      const controller = new AbortController();
      pending = controller;
      status('Preparing speech…');
      if (parts.length > 1) segmented = { parts, index: 1, next: [], controllers: new Set(), lookahead: base.prefetchParts === '2' ? 2 : 1 };
      const blob = await synthesizePart(parts[0], controller.signal);
      if (myGeneration !== generation) return;
      pending = null;
      loadAudio(blob, myGeneration);
      if (segmented) prefetchNext(segmented, myGeneration);
      await playReady();
    } catch (error) {
      if (myGeneration === generation) { completion = null; abortRealtimeRequest(); pending?.abort(); pending = null; for (const controller of segmented?.controllers || []) controller.abort(); segmented = null; playbackCleanup(); speechFailed(); status(friendlyError(error)); }
    }
  };

  const speak = (text, voice, overrides = {}, speaker = '') => speakSequence([{ text, voice, overrides, speaker }]);

  // `busy` is used only for microphone permission, audio preparation and
  // transcription; ordinary read-aloud playback does not set it.
  return { attachRecorder, speak, speakSequence, playReady, cancel, clearRealtimeSecret,
    hasSpeech: () => Boolean(pending || audioElement || segmented),
    hasPendingCapture: () => Boolean(recording || busy) };
}
