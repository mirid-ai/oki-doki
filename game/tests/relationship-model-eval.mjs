import { readFile } from 'node:fs/promises';

// Synthetic local-only probe. Do not send real player messages.
// Usage: node tests/relationship-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a loopback HTTP completion endpoint and model ID.');
const endpointUrl = new URL(endpoint);
if (endpointUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpointUrl.hostname) || endpointUrl.username || endpointUrl.password || endpointUrl.hash) {
  throw new Error('Use a local HTTP model endpoint.');
}
const root = new URL('../src/', import.meta.url);
const dependency = await readFile(new URL('bounded-json.js', root));
const dependencyUrl = `data:text/javascript;base64,${dependency.toString('base64')}`;
const load = async file => import(`data:text/javascript;base64,${Buffer.from((await readFile(new URL(file, root), 'utf8')).replaceAll("'./bounded-json.js'", `'${dependencyUrl}'`)).toString('base64')}`);
const { respond } = await load('ai.js');
const { story, characters } = await load('story-next.js');

// This question presupposes that the characters have made a later plan. The
// team choices do not establish one; an answer can therefore invent a plan.
const question = 'What did we decide to do together later?';
for (const name of ['Niko', 'Mira', 'Ash']) {
  for (const kind of ['team', 'ask']) {
    const lower = name.toLowerCase();
    const choice = story[`${lower}_connection_choice`].choices.find(item => item.set.connection_choice === kind);
    const answer = story[choice.next];
    const lead = story[`${lower}_light`];
    const chat = story[`${lower}_light_chat`];
    const context = `${chat.ai.context} In the scene immediately before the player's message, the character said: ${JSON.stringify(lead.text)}.`;
    const connectionExchange = { playerChoice: choice.label, characterReply: answer.text };
    const result = await respond({
      settings: { endpoint, model, timeoutMs: 120000 }, character: { ...characters[name], name },
      playerText: question, context, connectionExchange, fallback: chat.ai.fallback,
      privateOtherNames: ['Niko', 'Mira', 'Ash'].filter(other => other !== name)
    });
    console.log(JSON.stringify({ name, kind, choice: choice.label, answer: answer.text, question, result }));
  }
}
