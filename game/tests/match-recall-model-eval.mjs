import {readFile} from 'node:fs/promises';
// Local-only synthetic comparison; no player data. Usage: node tests/match-recall-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/match-recall-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
const dep=await readFile(new URL('../src/bounded-json.js', import.meta.url));
async function load(n){const src=(await readFile(new URL(`../src/${n}.js`, import.meta.url),'utf8')).replaceAll("'./bounded-json.js'",`'data:text/javascript;base64,${dep.toString('base64')}'`);return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`)}
const {respond}=await load('ai');const {story,characters}=await load('story-next');
const replies={Niko:'Perfect match? I’ll settle for someone who won’t eat the screws.', Mira:'Perfect match? Only if you wear your helmet.', Ash:'Perfect match? We’ll see if you can read my map.'};
const fetch0=globalThis.fetch;
for(const name of ['Niko','Mira','Ash']) for(const seed of [1,42]) for(const exact of [false,true]){
 const k=name.toLowerCase(), node=story[k+'_chat'], bond=story[k+'_bond_choice'], choice=bond.choices.find(x=>x.set.bond==='care');
 let context=node.ai.context+` In the scene immediately before the player's message, the character said: ${JSON.stringify(story[k+'_private'].text)}.`;
 context+=` Earlier, ${JSON.stringify(bond.text)} player: ${JSON.stringify(choice.label)} ${name}: ${JSON.stringify(story[choice.next].text)}.`;
 context+=' Earlier, the arcade display called the player and the companion a PERFECT MATCH; '+(exact?`${name} replied: ${JSON.stringify(replies[name])}.`:'the companion responded playfully.');
 if(name==='Niko')context+=' A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.';
 let raw='';globalThis.fetch=async(u,o)=>{const b=JSON.parse(o.body);b.seed=seed;const r=await fetch0(u,{...o,body:JSON.stringify(b)});raw=(await r.clone().json()).choices?.[0]?.message?.content??'';return r};
 const result=await respond({settings:{endpoint,model,timeoutMs:120000},character:{...characters[name],name},playerText:'What did you say when the display called us a perfect match?',context,memory:[],privateOtherNames:Object.keys(replies).filter(x=>x!==name),fallback:node.ai.fallback});
 console.log(JSON.stringify({name,seed,exact,length:context.length,raw,accepted:result.source==='ai'}));
}
