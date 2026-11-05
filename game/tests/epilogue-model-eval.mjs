// Synthetic, opt-in local model comparison. Usage: node tests/epilogue-model-eval.mjs ENDPOINT MODEL
// The endpoint must be local; all dialogue and memory below are fabricated.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/epilogue-model-eval.mjs ENDPOINT MODEL');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use a local HTTP model endpoint.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function load(name) {
 let dep=await readFile(`${root}/src/bounded-json.js`,'utf8');
 let src=await readFile(`${root}/src/${name}`,'utf8');
 src=src.replaceAll("'./bounded-json.js'", `'data:text/javascript;base64,${Buffer.from(dep).toString('base64')}'`);
 return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
}
const {respond}=await load('ai.js'); const {story,characters}=await load('story-next.js');
const examples=[
 {name:'Niko', node:story.close_niko_chat, outcome:'The player pulled the team back as the floor shifted. Mira is still downstairs; the group plans to bring her back. The player asked Mira to describe the room behind the door as evidence.', history:[{speaker:'Player to Niko',text:'You do not have to fix everything alone.'},{speaker:'Niko',text:'I hear you. I do not have to solve it this minute.'}],question:'What should we do about Mira now?'},
 {name:'Mira', node:story.close_mira_chat, outcome:'The player and Niko opened Mira’s door immediately. Mira has returned safely with the third ticket piece, but the machine ate the paper roll. The player kept the false receipt as evidence.', history:[{speaker:'Player to Mira',text:'Your friends can care about you and your art.'},{speaker:'Mira',text:'I am still figuring out what I want to do.'}],question:'Do you still want to go to the workshop?'}
];
const orig=globalThis.fetch;
for (let seed of [1,42]) for (const sample of examples) for (const mode of ['baseline','grounded']) {
 let raw='';globalThis.fetch=async (url,options)=>{let body=JSON.parse(options.body);body.seed=seed;const res=await orig(url,{...options,body:JSON.stringify(body)});if(!res.ok) throw new Error(`Endpoint returned HTTP ${res.status}`);raw=(await res.clone().json()).choices?.[0]?.message?.content??'';return res};
 let context=`${sample.node.ai.context} ${sample.outcome}`;
 if(mode==='grounded')context+=' Do not claim that an unmentioned action has happened or make new promises or invitations. If a detail is uncertain, say so.';
 const result=await respond({settings:{endpoint,model,timeoutMs:60000},character:{...characters[sample.name],name:sample.name},playerText:sample.question,context,memory:sample.history,fallback:sample.node.ai.fallback});
 if (!raw) throw new Error(`Empty or unavailable response for ${sample.name}, seed ${seed}, ${mode}: ${result.error || 'no text'}`);
 console.log(JSON.stringify({seed,character:sample.name,mode,raw,accepted:result.source==='ai'}));
}
globalThis.fetch=orig;
