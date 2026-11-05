import { readFile } from 'node:fs/promises';
// Synthetic audit-memory comparison. Run with a local OpenAI-compatible endpoint:
// node tests/audit-focus-model-eval.mjs http://127.0.0.1:PORT/v1/chat/completions MODEL_ID
const [endpoint, model] = process.argv.slice(2);
if (!endpoint || !model) throw new Error('Supply a local HTTP endpoint and model ID.');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
const dir = new URL('../src/', import.meta.url);
const bounded = await readFile(new URL('bounded-json.js',dir));
const ai = (await readFile(new URL('ai.js',dir),'utf8')).replaceAll("'./bounded-json.js'",`'data:text/javascript;base64,${bounded.toString('base64')}'`);
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const {respond} = await load(ai);
const {story,characters} = await load(await readFile(new URL('story-next.js',dir),'utf8'));
const originalFetch=globalThis.fetch;
for (const seed of [1,42]) for (const updated of [false,true]) {
 let raw='';
 globalThis.fetch=async (url,options)=>{ const body=JSON.parse(options.body);body.seed=seed;const result=await originalFetch(url,{...options,body:JSON.stringify(body)});raw=(await result.clone().json()).choices?.[0]?.message?.content || '';return result;};
 const node=story.close_niko_chat;
 const result=await respond({settings:{endpoint,model,timeoutMs:120000},character:{...characters.Niko,name:'Niko'},playerText:'What did Mallow do during the audit?',context:node.ai.context,storyEvent:updated?'Ash: one audit mark was repeated; Mallow watched the counter.':'Ash: one audit mark was repeated; Mallow took part in the audit.',memory:[],privateOtherNames:['Mira','Ash','Mallow'],fallback:node.ai.fallback});
 console.log(JSON.stringify({seed,updated,raw,accepted:result.source==='ai',error:result.error}));
}
globalThis.fetch=originalFetch;
