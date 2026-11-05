import createEngine from './espeak.mjs';
const enginePromise = createEngine().then(engine => {
  if (engine.ccall('oki_init', 'number', [], []) <= 0) throw new Error('Unable to initialize eSpeak.');
  return engine;
});
export async function phonemize(text, language='en-us') {
  if (language !== 'en' && language !== 'en-us') throw new Error('Unsupported language: ' + language);
  const engine = await enginePromise;
  if (engine.ccall('oki_synthesize', 'number', ['string','string'], [text, language]) !== 0) throw new Error('Phonemization failed.');
  return engine.FS.readFile('/tmp/oki-phonemes.txt', {encoding:'utf8'}).split('\n').filter(Boolean);
}
