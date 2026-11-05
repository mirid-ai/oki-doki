// Synthetic local-only evaluation. Usage: node tests/question-response-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import { readFile } from 'node:fs/promises';
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const target = new URL(endpoint);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('Use a local HTTP model endpoint.');
const root=process.cwd(), dep=await readFile(`${root}/src/bounded-json.js`);
const src=(await readFile(`${root}/src/ai.js`,'utf8')).replaceAll("'./bounded-json.js'",`'data:text/javascript;base64,${dep.toString('base64')}'`);
const { respond }=await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
const cases=[
{id:'ash_name',char:'Ash',voice:'dry and caring, careful and inventive',context:'You are Ash, an adult friend who makes careful plans after once losing sight of someone in a crowd; that person was found. In the scene immediately before the player’s message, Ash said: "I make a lot of maps. Once, when we were younger, I lost sight of someone in a crowd. We found them. I still make plans as if a good enough map could stop it happening again." Earlier the player drew a tiny monster in the uncharted corner of the map and Ash called it the building inspector.',question:'I like our map monster. What should we call it?'},
{id:'ash_crowd',char:'Ash',voice:'dry and caring, careful and inventive',context:'You are Ash, an adult friend who makes careful plans after once losing sight of someone in a crowd; that person was found. In the scene immediately before the player’s message, Ash said: "I make a lot of maps. Once, when we were younger, I lost sight of someone in a crowd. We found them. I still make plans as if a good enough map could stop it happening again."',question:'That sounds frightening. Did you find them again?'},
{id:'mira_workshop',char:'Mira',voice:'playful and caring, a plush maker',context:'You are Mira, an adult plush maker and playful arcade regular. You have an offer from an art workshop in another city and worry your friends will feel abandoned. You want to go. In the scene immediately before the player’s message, Mira said she wants to attend but worries that others would hear it as leaving them.',question:'I hope you go. What would you make there?'},
{id:'niko_brother',char:'Niko',voice:'cheerful and resourceful, joking when worried',context:'You are Niko, an adult arcade caretaker. Your brother taught you to repair machines and has been away a long time. You are unsure whether you are keeping the arcade ready or keeping yourself waiting.',question:'I can help with the machines. What did your brother teach you?'}];
const orig=globalThis.fetch;
for(const seed of [1,42,13])for(const c of cases)for(const variant of ['baseline','answer']){
 let raw='';globalThis.fetch=async(url,opt)=>{let body=JSON.parse(opt.body);body.seed=seed;if(variant==='answer') body.messages[0].content+=' If the player asks a question, answer it directly before changing the subject; for creative questions, give an imaginative answer.';let r=await orig(url,{...opt,body:JSON.stringify(body)});raw=(await r.clone().json()).choices[0].message.content;return r;};
 let out=await respond({settings:{endpoint,model,timeoutMs:120000},character:{name:c.char,voice:c.voice},context:c.context,playerText:c.question,privateOtherNames:['Niko','Mira','Ash','Mallow'].filter(n=>n!==c.char),fallback:'I hear you.'});console.log(JSON.stringify({id:c.id,seed,variant,raw,accepted:out.source==='ai'}));
}
globalThis.fetch=orig;
