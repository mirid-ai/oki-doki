import { readFile } from 'node:fs/promises';
// Synthetic local-only model-size comparison; never send real player text.
// Usage: node tests/rescue-model-size-eval.mjs LOCAL_ENDPOINT MODEL_ID
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a loopback HTTP completion endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
const root=process.cwd();
const dep=await readFile(`${root}/src/bounded-json.js`); const depurl=`data:text/javascript;base64,${dep.toString('base64')}`;
const load=async file=>import(`data:text/javascript;base64,${Buffer.from((await readFile(`${root}/src/${file}`,'utf8')).replaceAll("'./bounded-json.js'",`'${depurl}'`)).toString('base64')}`);
const {respond}=await load('ai.js');const {story,characters}=await load('story-next.js');
const fixtures=[
 {id:'niko-count',who:'Niko',node:'close_niko_chat',event:'Mira counted aloud and pushed while Niko held the release.',q:'What did Mira do before we opened the door?'},
 {id:'niko-reach',who:'Niko',node:'close_niko_chat',event:'Niko held Mira’s hand under the door; paper fingers unfolded beside them.',q:'What happened when you reached under the door?'},
 {id:'mira-reach',who:'Mira',node:'close_mira_chat',event:'Niko held Mira’s hand under the door; she warned him another hand was not hers.',q:'What happened when Niko reached under the door?'}
];
const orig=globalThis.fetch;
try{for(const seed of [1,42])for(const f of fixtures)for(const variant of ['baseline']){
 let raw='',status=0;
 globalThis.fetch=async(url,opt)=>{const b=JSON.parse(opt.body); b.seed=seed;
  const r=await orig(url,{...opt,redirect:'error',body:JSON.stringify(b)});status=r.status;if(r.ok)raw=(await r.clone().json()).choices?.[0]?.message?.content||'';return r};
 const result=await respond({settings:{endpoint,model,timeoutMs:120000},character:{...characters[f.who],name:f.who},context:story[f.node].ai.context,storyEvent:f.event,playerText:f.q,fallback:'I hear you.',privateOtherNames:['Niko','Mira','Ash'].filter(n=>n!==f.who)});
 if(status!==200 || !raw.trim())throw new Error(`No model response: ${f.id}, ${seed}, ${variant}, ${result.error||status}`);
 console.log(JSON.stringify({seed,id:f.id,variant,raw,accepted:result.source==='ai',displayed:result.text}));
}}finally{globalThis.fetch=orig}
