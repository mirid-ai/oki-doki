// Synthetic, opt-in model comparison; no real player data or hosted provider.
// Usage: node tests/fewshot-grounding-model-eval.mjs LOCAL_ENDPOINT MODEL_ID [SEED]
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const [endpoint, model, seedArg] = process.argv.slice(2);
if (!endpoint || !model || (seedArg && !/^\d+$/.test(seedArg))) throw new Error('Supply a local HTTP endpoint, model, and optional numeric seed.');
const target = new URL(endpoint);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.username || target.password || target.hash) throw new Error('Use a local HTTP model endpoint.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dep = await readFile(`${root}/src/bounded-json.js`);
const source = (await readFile(`${root}/src/ai.js`, 'utf8')).replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${dep.toString('base64')}'`);
const {respond} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const cases = [
{id:'lid', name:'Niko', voice:'cheerful and resourceful, joking when worried', context:'You are Niko, an adult arcade caretaker. The player chose to wear the empty IMPORTANT lid as a very small crown. Niko laughed and saluted.', question:'What did I do with the lid?'},
{id:'retreat', name:'Niko', voice:'cheerful and resourceful, joking when worried', context:'You are Niko. Mira is trapped downstairs behind the playroom door, and the team has returned upstairs to make a plan. The player and Niko want to find a way back to her.', question:'Where is Mira now?'},
{id:'unknown', name:'Niko', voice:'cheerful and resourceful, joking when worried', context:'You are Niko, an adult arcade caretaker. The player wore the empty IMPORTANT lid as a small crown earlier. The lid’s current location is unknown to the team.', question:'Where is the lid now?'},
{id:'connection',name:'Mira',voice:'playful, caring and a talented plush maker',context:'You are Mira, an adult plush maker and arcade regular. You want to attend an art workshop in another city but worry your friends will feel abandoned.',question:'I want you to go. What would you miss most about this place?'},
{id:'creative',name:'Ash',voice:'dry, caring, careful and inventive',context:'You are Ash, an adult friend who makes maps. Earlier the player drew a tiny monster in an uncharted corner of your map and you called it the building inspector.',question:'What should we name our map monster?'}];
const originalFetch=globalThis.fetch;
try {for(const seed of (seedArg ? [Number(seedArg)] : [1,42])) for(const item of cases) for(const variant of ['baseline','examples']) {
 let raw='';
 globalThis.fetch=async (url,options)=>{const body=JSON.parse(options.body);body.seed=seed;if(variant==='examples')body.messages[0].content += " Use established scene facts to answer questions about what happened or where someone is; do not fill gaps with guesses. If the answer is unknown, say so naturally. For example, if the scene says Bea is behind a blue door and the player asks 'Where is Bea?', a grounded reply is 'She is behind the blue door.' If the scene does not say where Bea went, a grounded reply is 'I don't know where she went.' For imaginative requests, you can still make up ideas."; const res=await originalFetch(url,{...options,body:JSON.stringify(body)});if(!res.ok)throw new Error(`HTTP ${res.status}`);raw=(await res.clone().json()).choices?.[0]?.message?.content??'';return res;};
 const out=await respond({settings:{endpoint,model,timeoutMs:120000},character:{name:item.name,voice:item.voice},context:item.context,playerText:item.question,privateOtherNames:['Niko','Mira','Ash','Mallow'].filter(n=>n!==item.name),fallback:'I hear you.'});
 console.log(JSON.stringify({id:item.id,seed,variant,raw,accepted:out.source==='ai',error:out.error||undefined}));
}}finally{globalThis.fetch=originalFetch;}
