import {readFile} from 'node:fs/promises';
// Synthetic local-only probe; never send real player text.
// Usage: node tests/epistemic-correction-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a loopback HTTP completion endpoint and model ID.');
const endpointUrl = new URL(endpoint);
if (endpointUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpointUrl.hostname) || endpointUrl.username || endpointUrl.password || endpointUrl.hash) {
  throw new Error('Use a local HTTP model endpoint.');
}
const root = new URL('../src/', import.meta.url);
const dep=await readFile(new URL('bounded-json.js', root)); const depurl=`data:text/javascript;base64,${dep.toString('base64')}`;
const load=async file=>import(`data:text/javascript;base64,${Buffer.from((await readFile(new URL(file, root),'utf8')).replaceAll("'./bounded-json.js'",`'${depurl}'`)).toString('base64')}`);
const {respond}=await load('ai.js'); const {story,characters}=await load('story-next.js');
const fixtures=[
 {id:'niko-unknown', who:'Niko', context:story.niko_chat.ai.context+` In the scene immediately before the player's message, the character said: ${JSON.stringify(story.niko_private.text)}.`, question:'Does your brother know you have been waiting for him?', memory:[]},
 {id:'niko-correct', who:'Niko', context:story.niko_chat.ai.context+` In the scene immediately before the player's message, the character said: ${JSON.stringify(story.niko_private.text)}.`, memory:[{speaker:'Player to Niko',text:'Does your brother know you have been waiting for him?'},{speaker:'Niko',text:"He knows, but does he remember? It's hard to tell with all this time apart."}],question:"I don't know him, and neither of us can know that. What did he teach you?"},
 {id:'mira-unknown', who:'Mira',context:story.mira_chat.ai.context+` In the scene immediately before the player's message, the character said: ${JSON.stringify(story.mira_private.text)}.`,question:'Do your friends know you want to go?',memory:[]},
 {id:'ash-unknown', who:'Ash',context:story.ash_chat.ai.context+` In the scene immediately before the player's message, the character said: ${JSON.stringify(story.ash_private.text)}.`,question:'Did the person you lost sight of feel scared too?',memory:[]},
 {id:'niko-play',who:'Niko',context:story.niko_chat.ai.context+` In the scene immediately before the player's message, the character said: ${JSON.stringify(story.niko_private.text)}.`,question:'Can you invent a silly name for the ticket machine?',memory:[]}
];
const orig=globalThis.fetch;
try {for (const seed of [1,42]) for(const f of fixtures) for(const variant of ['baseline','candidate']){
 let raw='',status=0;
 globalThis.fetch=async (url,opt)=>{const body=JSON.parse(opt.body);body.seed=seed;if(variant==='candidate')body.messages[0].content+=' If the scene does not establish someone else’s private knowledge, thoughts, or future actions, express uncertainty rather than stating them as fact. If the player corrects what you just said, briefly respond to the correction as well as their question. Stay in character and invent playful ideas when invited.';const resp=await orig(url,{...opt,body:JSON.stringify(body)});status=resp.status;if(resp.ok)raw=(await resp.clone().json()).choices?.[0]?.message?.content||'';return resp};
 const result=await respond({settings:{endpoint,model,timeoutMs:120000},character:{...characters[f.who],name:f.who},context:f.context,memory:f.memory,playerText:f.question,fallback:'I hear you.',privateOtherNames:['Niko','Mira','Ash'].filter(n=>n!==f.who)});
 if (status !== 200 || !raw.trim()) throw new Error(`No model response for ${f.id}, seed ${seed}, ${variant}: ${result.error || status}`);
 console.log(JSON.stringify({seed,id:f.id,variant,status,raw,accepted:result.source==='ai',displayed:result.text,error:result.error||null}));
}}finally{globalThis.fetch=orig}
