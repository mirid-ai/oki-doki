/** Read JSON without buffering an unbounded provider response. */
export async function readBoundedJson(response, { limit = 128 * 1024, signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid response limit.');
  const length = response?.headers?.get?.('content-length');
  if (length !== null && length !== undefined && (!/^\d+$/.test(length) || Number(length) > limit)) {
    try { Promise.resolve(response.body?.cancel?.()).catch(() => {}); } catch {}
    throw new Error('Response is too large or has an invalid length.');
  }
  // Refuse unstreamable bodies instead of using arrayBuffer()/json(), which
  // could allocate an arbitrarily large response before its size is checked.
  if (!response?.body?.getReader) throw new Error('Response body is unavailable.');
  if (signal?.aborted) {
    try { Promise.resolve(response.body.cancel?.()).catch(() => {}); } catch {}
    throw new DOMException('Request cancelled.', 'AbortError');
  }
  const reader = response.body.getReader();
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const cancel = () => {
    rejectAbort(new DOMException('Request cancelled.', 'AbortError'));
    try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) { cancel(); return await aborted; }
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('Invalid response body.');
      size += value.byteLength;
      if (size > limit) {
        try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
        throw new Error('Response is too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    signal?.removeEventListener('abort', cancel);
    try { reader.releaseLock(); } catch {}
  }
}
