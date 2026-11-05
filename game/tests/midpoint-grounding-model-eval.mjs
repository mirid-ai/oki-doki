// Synthetic local-model comparison; no real player data or hosted providers.
// node tests/midpoint-grounding-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
async function load(name) {
  const dep = await readFile(new URL('../src/bounded-json.js', import.meta.url));
  const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8')).replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dep.toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond } = await load('ai');
const { story, characters } = await load('story-next');
const cases = [
  { id:'count', name:'Niko', bond:'care', action:'keep', question:'How many pairs of hands did you see on the card?' },
  { id:'visor', name:'Mira', bond:'play', action:'tear', question:'What did we see in the knight’s visor?' },
  { id:'tea', name:'Ash', bond:'care', action:'keep', question:'What was shown at the rest stop?' },
  { id:'imagine', name:'Ash', bond:'play', action:'keep', question:'What silly name would you give our building inspector?' }
];
const candidate = 'When asked about a specific past detail, check the supplied activity setup carefully and answer from what was actually witnessed. If the detail is not given, say you do not know. When invited to imagine or create something new, you can still do so.';
const original = globalThis.fetch;
try {
  for (const scenario of cases) for (const seed of [1, 42]) for (const variant of ['baseline', 'candidate']) {
    const lower = scenario.name.toLowerCase(), node = story[`mid_${lower}_chat`], lead = story[`mid_${lower}_input`];
    const observation = story[`moment_${lower}_${scenario.bond}`].text
      .replace(/\byour\b/gi, match => match[0] === 'Y' ? "The player's" : "the player's")
      .replace(/\byou\b/gi, match => match[0] === 'Y' ? 'The player' : 'the player');
    const decision = scenario.action === 'keep' ? 'The player folded and kept the card.' : 'The player tore and kept the pieces.';
    const activitySetup = `${observation} ${decision}`;
    if (activitySetup.length > 300) throw new Error('Fixture exceeds the production setup limit.');
    const context = `${node.ai.context} Before the player's message, ${scenario.name} said: ${JSON.stringify(lead.text)}.`;
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body); body.seed = seed;
      if (variant === 'candidate') body.messages[0].content += ` ${candidate}`;
      const response = await original(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({ settings:{endpoint, model, timeoutMs:120000}, character:{...characters[scenario.name], name:scenario.name}, playerText:scenario.question, context, activitySetup, memory:[], fallback:node.ai.fallback });
    if (!raw) throw new Error(`No output for ${scenario.id}/${seed}/${variant}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({id:scenario.id, seed, variant, raw, accepted:result.source === 'ai'}));
  }
} finally { globalThis.fetch = original; }
