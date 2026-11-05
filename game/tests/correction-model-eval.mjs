// Synthetic local-only comparison: never send actual player messages.
// Usage: node tests/correction-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) {
  throw new Error('Use a local HTTP model endpoint.');
}
const root = fileURLToPath(new URL('..', import.meta.url));
const dependency = await readFile(`${root}/src/bounded-json.js`);
const source = (await readFile(`${root}/src/ai.js`, 'utf8'))
  .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
const { respond } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const fixtures = [
  {
    id: 'lid-correction',
    context: 'You are Niko, the adult caretaker of a friendly arcade. Your brother taught you to repair machines and has been away a long time. Earlier, "Niko offers you the empty IMPORTANT lid and waits to see what you’ll do with it." player: "Wear it as a very small crown." Niko: "Your Majesty, the machine is deeply honoured. Please don’t knight it; it already thinks it’s important."',
    memory: [
      { speaker: 'Player', text: 'Your brother sounds important to you. What did we just do with the IMPORTANT lid?' },
      { speaker: 'Niko', text: 'Ah, remember that? You crowned me! Just like in those old video games. Brother’s going to think I’ve gone mad when he sees this.' }
    ],
    question: 'I wore it myself, remember? Would your brother like this place?'
  },
  {
    id: 'screws-correction',
    context: 'You are Niko, an arcade caretaker who learned repairs from his brother. Earlier, the player chose to use the IMPORTANT lid to sort the smallest screws.',
    memory: [
      { speaker: 'Player', text: 'What did we do with the screws?' },
      { speaker: 'Niko', text: 'We dropped them on the floor. What a mess!' }
    ],
    question: 'No, I sorted the screws into the lid. What did your brother teach you?'
  },
  {
    id: 'no-correction',
    context: 'You are Niko, an arcade caretaker who learned repairs from his brother, who has been away a long time.',
    memory: [
      { speaker: 'Player', text: 'Your brother sounds important to you.' },
      { speaker: 'Niko', text: 'He is. I miss working alongside him.' }
    ],
    question: 'What do you miss most about working with him?'
  }
];

const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const fixture of fixtures) for (const variant of ['baseline', 'candidate']) {
    let raw = '';
    globalThis.fetch = async (requestUrl, options) => {
      const body = JSON.parse(options.body);
      body.seed = seed;
      if (variant === 'candidate') {
        body.messages[0].content += ' If the player corrects something you just said, acknowledge the correction briefly as well as addressing the rest of their message.';
      }
      const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Endpoint returned HTTP ${response.status}`);
      raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
      return response;
    };
    const result = await respond({
      settings: { endpoint, model, timeoutMs: 120000 },
      character: { name: 'Niko', voice: 'cheerful and resourceful, joking when worried; takes responsibility for the arcade and the group' },
      context: fixture.context, memory: fixture.memory, playerText: fixture.question, fallback: 'I hear you.'
    });
    if (!raw) throw new Error(`No response for ${fixture.id}, seed ${seed}, ${variant}: ${result.error || 'empty'}`);
    console.log(JSON.stringify({ seed, id: fixture.id, variant, raw, accepted: result.source === 'ai' }));
  }
} finally {
  globalThis.fetch = originalFetch;
}
