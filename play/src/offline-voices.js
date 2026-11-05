// The installable web version can optionally keep the public voice assets on
// this device. The native apps already contain these files. No story text or
// player data is sent through this channel.
function controller() {
  const worker = globalThis.navigator?.serviceWorker?.controller;
  if (!worker) throw new Error('Offline voices need the installed web app. Open or refresh it once while online.');
  return worker;
}

function exchange(type, { signal, onProgress } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Voice download canceled.', 'AbortError'));
  let worker;
  try { worker = controller(); } catch (error) { return Promise.reject(error); }
  if (typeof MessageChannel !== 'function') return Promise.reject(new Error('This browser cannot prepare offline voices.'));
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let settled = false;
    const timeout = type === 'OFFLINE_VOICES_STATUS' ? 5000 : 20 * 60 * 1000;
    const timer = setTimeout(() => { channel.port1.postMessage({ type: 'cancel' }); finish(new Error('The offline voice request timed out. Refresh the game and try again.')); }, timeout);
    const abort = () => { channel.port1.postMessage({ type: 'cancel' }); finish(new DOMException('Voice download canceled.', 'AbortError')); };
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      channel.port1.close();
      if (error) reject(error); else resolve(result);
    }
    channel.port1.onmessage = event => {
      const data = event.data;
      if (data?.type === 'progress' && typeof onProgress === 'function') {
        try { onProgress({ completed: data.completed, total: data.total, bytes: data.bytes }); } catch { /* UI callbacks do not interrupt the download. */ }
      } else if (data?.type === 'done' || data?.type === 'status') finish(null, { ready: data.ready === true });
      else if (data?.type === 'error') finish(new Error(data.message || 'Could not prepare offline voices.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { worker.postMessage({ type }, [channel.port2]); }
    catch { finish(new Error('Could not contact the offline game.')); }
  });
}

export const offlineVoicesStatus = () => exchange('OFFLINE_VOICES_STATUS');
export const downloadOfflineVoices = ({ onProgress, signal } = {}) => exchange('DOWNLOAD_OFFLINE_VOICES', { onProgress, signal });
