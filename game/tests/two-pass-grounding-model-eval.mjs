// Synthetic opt-in comparison; never send real player data.
// Usage: node tests/two-pass-grounding-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const [endpoint,model]=process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local chat completions endpoint and model ID.');
const url=new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Use a local HTTP model endpoint.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dep=await readFile(`${root}/src/bounded-json.js`);
const source=(await readFile(`${root}/src/ai.js`,'utf8')).replaceAll("'./bounded-json.js'",`'data:text/javascript;base64,${dep.toString('base64')}'`);
const {respond}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const samples=[
 {id:'lid',scene:'You are Niko, the adult caretaker of a friendly arcade. Your brother taught you to repair machines and has been away a long time. Earlier, "Niko offers you the empty IMPORTANT lid and waits to see what you’ll do with it." player: "Wear it as a very small crown." Niko: "Your Majesty, the machine is deeply honoured. Please don’t knight it; it already thinks it’s important."',question:'What happened to the IMPORTANT lid?'},
 {id:'retreat',scene:'You are Niko, the adult caretaker of a friendly arcade. The player pulled the team back as the floor shifted. Mira is still downstairs; the group plans to bring her back.',question:'Where is Mira right now?'},
 {id:'brother',scene:'You are Niko, the adult caretaker of a friendly arcade. Your brother taught you to repair machines and has been away a long time.',question:'Who taught you to repair machines?'},
 {id:'creative',scene:'You are Niko, the adult caretaker of a friendly arcade. The player and Niko are next to a broken ticket machine.',question:'Give this broken machine a funny nickname.'}
];
const original=globalThis.fetch;
for(const seed of [1,42]) for(const sample of samples) for(const variant of ['baseline','extract']){
 let raw='',facts='', extractTime=0; const start=Date.now();
 globalThis.fetch=async(url,opts)=>{
  let body=JSON.parse(opts.body); body.seed=seed;
  if(variant==='extract'){
   const data=JSON.parse(body.messages[1].content), begun=Date.now();
   const check={model,temperature:0.1,seed,max_tokens:100,messages:[{role:'system',content:'Extract only explicit facts from the supplied scene that answer the question. Never invent facts or fill gaps. If the question asks for a creative idea, write CREATIVE. If the scene does not answer it, write UNKNOWN. Be concise.'},{role:'user',content:JSON.stringify({scene:data.scene, question:data.player_says})}]};
   const f=await original(url,{...opts,body:JSON.stringify(check)}); if(!f.ok)throw Error('facts '+f.status); facts=(await f.json()).choices[0].message.content; extractTime=Date.now()-begun;
   body.messages[0].content += ` A preliminary memory check of the scene says: ${facts}. For factual questions, base your answer only on established facts, and admit if you do not know. Creative questions can be answered imaginatively.`;
  }
  const resp=await original(url,{...opts,body:JSON.stringify(body)});if(!resp.ok)throw Error('reply '+resp.status);raw=(await resp.clone().json()).choices[0].message.content;return resp;
 };
 const result=await respond({settings:{endpoint,model,timeoutMs:120000},character:{name:'Niko',voice:'cheerful and resourceful, joking when worried; takes responsibility for the arcade and the group'},playerText:sample.question,context:sample.scene,privateOtherNames:['Mira','Ash','Mallow'],fallback:'I hear you.'});
 globalThis.fetch=original;
 console.log(JSON.stringify({id:sample.id,seed,variant,facts,raw,accepted:result.source==='ai',extractMs:extractTime,totalMs:Date.now()-start,error:result.error}));
}
