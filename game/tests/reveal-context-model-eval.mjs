// Synthetic opt-in comparison; no real player data or hosted providers.
// Usage: node tests/reveal-context-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';

const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/reveal-context-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
async function load(name) {
  const dependency = await readFile(new URL('../src/bounded-json.js', import.meta.url));
  const source = (await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8'))
    .replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dependency.toString('base64')}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { respond } = await load('ai');
const { story, characters } = await load('story-next');
const node = story.close_niko_chat;
const activity = story.niko_bond_choice.choices.find(choice => choice.set.bond === 'play');
const mallow = story.policy_mallow_choice.choices.find(choice => choice.set.mallow_response === 'voice');
const action = story.niko_work_choice.choices[0];
const common = node.ai.context +
  ` Earlier, player: ${JSON.stringify(activity.label)} Niko: ${JSON.stringify(story[activity.next].text)}.` +
  ` Before this conversation, Niko said: ${JSON.stringify(story.close_niko_future.text)}.` +
  ` In the playroom, player: ${JSON.stringify(mallow.label)} Mallow: ${JSON.stringify(story[mallow.next].text)}.` +
  ` Searching with Niko, player: ${JSON.stringify(action.label)} Scene: ${JSON.stringify(story[action.next].text)}.`;
const outcome = ' The player and Niko opened Mira’s door immediately. Mira has returned safely with the third ticket piece, but the machine ate the paper roll. The player kept the false receipt as evidence.';
const history = [{ speaker: 'Player to Niko', text: 'You do not have to fix everything alone.' }, { speaker: 'Niko', text: 'I hear you. I do not have to solve it this minute.' }];
const originalFetch = globalThis.fetch;
try {
  for (const seed of [1, 42]) for (const [cardStyle, noticeStyle] of [['direct', 'warm'], ['warm', 'direct']]) {
    const card = story.card_choice.choices.find(choice => choice.set.card_preference === cardStyle);
    const notice = story.notice_choice.choices.find(choice => choice.set.notice_preference === noticeStyle);
    const revealed = ` In the shared reveal, the player selected welcome card: ${JSON.stringify(card.label)}; map notice: ${JSON.stringify(notice.label)}.`;
    for (const [subject, question] of [
      ['card', 'What did I choose for Niko’s welcome card?'],
      ['notice', 'What did I choose for Ash’s map notice?']
    ]) for (const includeChoice of [false, true]) {
      const context = `${common}${includeChoice ? revealed : ''}${outcome}`;
      if (context.length > 1800) throw new Error('The example exceeds the adapter scene limit.');
      let raw = '';
      globalThis.fetch = async (requestUrl, options) => {
        const body = JSON.parse(options.body); body.seed = seed;
        const response = await originalFetch(requestUrl, { ...options, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`Local endpoint returned HTTP ${response.status}`);
        raw = (await response.clone().json()).choices?.[0]?.message?.content ?? '';
        return response;
      };
      const result = await respond({ settings: { endpoint, model, timeoutMs: 120000 }, character: { ...characters.Niko, name: 'Niko' },
        playerText: question, context, memory: history, privateOtherNames: ['Mira', 'Ash', 'Mallow'], fallback: node.ai.fallback });
      if (!raw) throw new Error(`No output for ${seed}/${cardStyle}/${noticeStyle}/${subject}/${includeChoice}: ${result.error || 'empty'}`);
      console.log(JSON.stringify({ seed, cardStyle, noticeStyle, subject, includeChoice, contextLength: context.length, raw, accepted: result.source === 'ai' }));
    }
  }
} finally { globalThis.fetch = originalFetch; }
