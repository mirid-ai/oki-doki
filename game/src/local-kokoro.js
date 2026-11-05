// On-device Kokoro for text not present in the prerecorded voice library.
const voices = new Set(['af_heart','af_sarah','af_nicole','am_adam','af_bella','bm_george','bf_emma']);
let worker = null;
let nextId = 0;
const pending = new Map();
function stopWorker(error) {
  worker?.terminate();
  worker = null;
  for (const item of pending.values()) { item.cleanup(); item.reject(error); }
  pending.clear();
}
function getWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') throw new Error('This device cannot run local speech. Configure a speech service instead.');
  // Change the query when the worker's bundled runtime wiring changes, so an
  // existing browser installation cannot reuse an older HTTP-cached worker.
  worker = new Worker(new URL('../assets/kokoro-local/worker.js?rev=3', import.meta.url), {type:'module'});
  worker.onmessage = ({data}) => {
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    item.cleanup();
    if (data.error) item.reject(new Error(`Local speech failed: ${data.error}`));
    else item.resolve(wav(data.samples, data.rate));
  };
  worker.onerror = () => stopWorker(new Error('Local speech could not start on this device. Configure a speech service instead.'));
  return worker;
}
function wav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const out = new DataView(buffer);
  const ascii=(offset,text)=>{for(let i=0;i<text.length;i++)out.setUint8(offset+i,text.charCodeAt(i));};
  ascii(0,'RIFF');out.setUint32(4,36+samples.length*2,true);ascii(8,'WAVE');ascii(12,'fmt ');
  out.setUint32(16,16,true);out.setUint16(20,1,true);out.setUint16(22,1,true);out.setUint32(24,rate,true);
  out.setUint32(28,rate*2,true);out.setUint16(32,2,true);out.setUint16(34,16,true);
  ascii(36,'data');out.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));out.setInt16(44+i*2,s<0?s*32768:s*32767,true);}
  return new Blob([buffer],{type:'audio/wav'});
}
export function synthesizeLocalKokoro({text,voice,signal}={}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Speech request cancelled.','AbortError'));
  if (typeof text !== 'string' || !text.trim()) return Promise.reject(new Error('Enter text to speak.'));
  if (!voices.has(voice)) return Promise.reject(new Error(`Local Kokoro voice ${voice} is not bundled.`));
  return new Promise((resolve,reject)=>{
    try {
      const instance = getWorker();
      const id = ++nextId;
      const abort = () => stopWorker(new DOMException('Speech request cancelled.','AbortError'));
      const cleanup=()=>signal?.removeEventListener('abort',abort);
      pending.set(id,{resolve,reject,cleanup});
      signal?.addEventListener('abort',abort,{once:true});
      if (signal?.aborted) {abort();return;}
      instance.postMessage({id,text,voice});
    } catch(error) { stopWorker(error); reject(error); }
  });
}
