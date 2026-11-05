// Optional public build configuration. Leave null until the creator chooses
// both a speaker and a separately deployed Chatterbox-compatible service.
// Never put an API key, pairing token, or private voice file in this module.
export const publisherVoice = null;

// Optional public multi-voice Kokoro service for speakers without the
// Chatterbox assignment. It is deliberately unconfigured in this prototype.
export const publisherKokoro = null;

// Off in distributed builds. Turn on only in a private native audition build.
export const creatorVoiceToolsForNative = false;

// Creator audition is an explicit development affordance, not a security
// boundary. Native controls require an opt-in private build; public defaults stay off.
export function creatorVoiceAudition(locationHref, nativeBuild = false) {
  if (typeof locationHref !== 'string') return false;
  let url;
  try { url = new URL(locationHref); } catch { return false; }
  if (url.username || url.password) return false;
  // Private native builds explicitly opt in at build time; this flag is not
  // enabled in the distributed app and cannot enable controls on a remote site.
  if (nativeBuild === true && url.hostname === 'localhost' && !url.port &&
      ['https:', 'capacitor:'].includes(url.protocol)) return true;
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false;
  const values = url.searchParams.getAll('voice-creator');
  return values.length === 1 && values[0] === '1';
}

/** Resolve a credential-free, public Kokoro service when a publisher sets one. */
export function resolvePublisherKokoro(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).length !== 1 || !Object.prototype.hasOwnProperty.call(config, 'baseUrl') || typeof config.baseUrl !== 'string' ||
      config.baseUrl.length > 2048 || config.baseUrl !== config.baseUrl.trim()) return null;
  let url;
  try { url = new URL(config.baseUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  return Object.freeze({ baseUrl: url.href.replace(/\/+$/, '') });
}

/** Validate one publisher assignment for this cast; invalid settings select none. */
export function resolvePublisherVoice(config, speakers) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || !Array.isArray(speakers)) return null;
  const keys = Object.keys(config);
  if (keys.length !== 4 || keys.some(key => !['speaker', 'engine', 'voice', 'baseUrl'].includes(key))) return null;
  const { speaker, engine, voice, baseUrl } = config;
  if (typeof speaker !== 'string' || !speakers.includes(speaker) ||
      !['chatterbox_nano', 'chatterbox', 'chatterbox_turbo'].includes(engine) ||
      typeof voice !== 'string' || voice.length > 200 || /[/\\\x00-\x1f\x7f]/.test(voice) ||
      !(voice === 'default' || /\.(wav|mp3|flac|m4a|aac|mp4|3gp|ogg|opus|webm)$/i.test(voice)) ||
      typeof baseUrl !== 'string' || baseUrl.length > 2048 || baseUrl !== baseUrl.trim()) return null;
  let url;
  try { url = new URL(baseUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  return Object.freeze({ speaker, engine, voice, baseUrl: url.href.replace(/\/+$/, '') });
}

/** Prepare startup defaults without mutating the caller's speaker voice map. */
export function initializePublisherVoices(config, defaults) {
  const voices = { ...defaults };
  const selected = resolvePublisherVoice(config, Object.keys(voices));
  if (!selected || typeof voices[selected.speaker] !== 'string' || !voices[selected.speaker]) {
    return { voices, chatterboxVoices: {} };
  }
  const previousVoice = voices[selected.speaker];
  voices[selected.speaker] = selected.voice;
  return { voices, chatterboxVoices: { [selected.speaker]: {
    engine: selected.engine, voice: selected.voice, baseUrl: selected.baseUrl,
    apiKey: '', previousVoice
  } } };
}
