import { readFile } from 'node:fs/promises';
// Synthetic local replay of a browser-observed Ash follow-up.
// Usage: node tests/ash-followup-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
const base=process.cwd();
const bounded=await readFile(base+'/src/bounded-json.js');
const source=(await readFile(base+'/src/ai.js','utf8')).replaceAll("'./bounded-json.js'",`'data:text/javascript;base64,${bounded.toString('base64')}'`);
const { respond }=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const storysrc=await readFile(base+'/src/story-next.js');
const { story, characters }=await import(`data:text/javascript;base64,${storysrc.toString('base64')}`);
const node=story.ash_chat;
const setup=story.ash_bond_choice.text;
const action=story.ash_bond_choice.choices.find(c=>c.set.bond==='play').label;
const reply=story.ash_bond_play.text;
const lead=story.ash_private.text;
const context=`${node.ai.context} In the scene immediately before the player's message, the character said: ${JSON.stringify(lead)}. Earlier, ${JSON.stringify(setup)} player: ${JSON.stringify(action)} Ash: ${JSON.stringify(reply)}. Reply to the latest message without repeating.`;
const memory=[{speaker:'Player to Ash',text:'Do you think the little monster I drew approves of your map?'},{speaker:'Ash',text:"I think he's too busy checking the foundations to notice, but if he does, we'll know he's awake."}];
const original=globalThis.fetch;
for(const seed of [1,42]) for(const candidate of [false,true]) {
 let raw=''; globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);body.seed=seed;const response=await original(url,{...options,body:JSON.stringify(body)}); raw=(await response.clone().json()).choices?.[0]?.message?.content || '';return response};
 const result=await respond({settings:{endpoint,model,timeoutMs:120000},character:{...characters.Ash,name:'Ash'},playerText:'What did we decide the monster’s job was?',context:context+(candidate?' Ash called the monster a building inspector and said it could watch the exits.':''), memory, privateOtherNames:['Niko','Mira','Mallow'],fallback:node.ai.fallback});
 console.log(JSON.stringify({seed,candidate,raw,display:result.text,source:result.source}));
}
globalThis.fetch=original;
