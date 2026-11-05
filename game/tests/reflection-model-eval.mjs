import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Synthetic, local-only reflection probe. No player data.
// Usage: node tests/reflection-model-eval.mjs LOCAL_ENDPOINT MODEL_ID
const root = new URL('../src/', import.meta.url);
const [endpoint,model]=process.argv.slice(2);
if (!endpoint || !model) throw new Error('Usage: node tests/reflection-model-eval.mjs LOCAL_ENDPOINT MODEL_ID');
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) throw new Error('Use a local HTTP model endpoint.');
const dependency=await readFile(new URL('bounded-json.js',root));
const depUrl=`data:text/javascript;base64,${dependency.toString('base64')}`;
const load=async file=>import(`data:text/javascript;base64,${Buffer.from((await readFile(new URL(file,root),'utf8')).replaceAll("'./bounded-json.js'",`'${depUrl}'`)).toString('base64')}`);
const {respond}=await load('ai.js'); const {story,characters}=await load('story-next.js');
const fetchOriginal=globalThis.fetch;
for(const sample of [
 { label:'skip/neutral', style:'', question:'Did the machine decide what you were allowed to say?' },
 { label:'warm', style:' When answering, use a warm, reassuring tone.', question:'Are you still afraid of saying the wrong thing?' },
 { label:'direct', style:' When answering, use a clear, direct tone.', question:'What happens to Mira if we wait?' }
]) {
 let raw;
 globalThis.fetch=async (...args)=>{const response=await fetchOriginal(...args); if(String(args[0])===endpoint) {const body=await response.clone().json();raw={status:response.status,content:body.choices?.[0]?.message?.content};}return response;};
 const result=await respond({settings:{endpoint:endpoint,model,timeoutMs:120000},character:{...characters.Mallow,name:'Mallow'},playerText:sample.question,context:story.mallow_reflection_chat.ai.context+sample.style,memory:[],privateOtherNames:[],fallback:story.mallow_reflection_chat.ai.fallback});
 assert.equal(raw?.status,200);assert.ok(raw.content?.trim());assert.ok(result.text?.trim());
 console.log(JSON.stringify({sample:sample.label,question:sample.question,raw:raw.content,source:result.source,displayed:result.text}));
}
globalThis.fetch=fetchOriginal;
