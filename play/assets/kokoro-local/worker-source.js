import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('./models/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
// Capacitor's iOS asset handler has a built-in MIME mapping for .js but not
// .mjs. Give ONNX an explicit .js URL so WebKit can load this module even when
// the device's UTI database does not recognize the .mjs extension.
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('./runtime/ort-wasm-simd-threaded.jsep.js', import.meta.url).href,
  wasm: new URL('./runtime/ort-wasm-simd-threaded.jsep.wasm', import.meta.url).href
};
let modelPromise;
function splitText(text) {
  const chunks=[];
  let rest=text.trim();
  while (rest.length > 120) {
    let split=rest.lastIndexOf(' ',120);
    if (split < 30) split=120;
    chunks.push(rest.slice(0,split));
    rest=rest.slice(split).trimStart();
  }
  if(rest) chunks.push(rest);
  return chunks;
}
async function render({id,text,voice}) {
  try {
    modelPromise ||= KokoroTTS.from_pretrained('kokoro', {dtype:'q8',device:'wasm'});
    const model=await modelPromise;
    const chunks=[];
    for (const part of splitText(text)) {
      const audio=await model.generate(part,{voice});
      chunks.push(audio.audio);
    }
    let length=chunks.reduce((n,c)=>n+c.length,0);
    const samples=new Float32Array(length);
    let offset=0;
    for(const c of chunks) {samples.set(c,offset);offset+=c.length;}
    postMessage({id,samples,rate:24000},[samples.buffer]);
  } catch(error) {
    modelPromise=null;
    postMessage({id,error:String(error?.message||error)});
  }
}
let queue=Promise.resolve();
onmessage=({data})=>{queue=queue.then(()=>render(data),()=>render(data));};
