/** Adapter for a native, single-product RepairKitBilling bridge.
 * The platform bridge owns product configuration and store verification. */
export function createRepairBilling({ bridge = null, queryTimeoutMs = 30000 } = {}) {
  let generation = 0;
  let inFlight = false;
  let productId = '';
  const lookupTimeout = Number.isFinite(queryTimeoutMs) && queryTimeoutMs > 0
    ? Math.min(queryTimeoutMs, 60000) : 30000;

  // Invalidation prevents a late result from changing a scene that has gone
  // away. It does not cancel or reverse a store transaction already launched.
  function invalidate() { generation++; productId = ''; }
  async function invoke(method, validStatuses) {
    if (inFlight) return { status: 'busy' };
    if (method === 'getProduct') productId = '';
    if (!bridge || typeof bridge[method] !== 'function') return { status: 'unavailable' };
    if (method !== 'getProduct' && !productId) return { status: 'error' };
    inFlight = true;
    const current = generation;
    let timer;
    try {
      // A product lookup is read-only and can be retried if a native store
      // never responds. Never use this timeout for purchase, restore or an
      // entitlement query: their native work may still be in progress.
      const operation = bridge[method]();
      const result = method === 'getProduct'
        ? await Promise.race([operation, new Promise(resolve => {
          timer = setTimeout(() => resolve({ status: 'unavailable' }), lookupTimeout);
        })])
        : await operation;
      if (current !== generation) return { status: 'stale' };
      if (!result || typeof result !== 'object' || !validStatuses.has(result.status)) return { status: 'error' };
      if (method === 'getProduct' && result.status === 'available') {
        const id = typeof result.productId === 'string' ? result.productId.trim() : '';
        const price = typeof result.formattedPrice === 'string' ? result.formattedPrice.trim() : '';
        if (!id || !price) return { status: 'error' };
        productId = id;
        return { status: 'available', productId: id, formattedPrice: price };
      }
      if (result.status === 'purchased') {
        const id = typeof result.productId === 'string' ? result.productId.trim() : '';
        if (result.verified !== true || !productId || id !== productId) return { status: 'error' };
        return { status: 'purchased', productId: id };
      }
      return { status: result.status };
    } catch {
      return { status: current === generation ? 'error' : 'stale' };
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
  }
  return {
    getProduct: () => invoke('getProduct', new Set(['available', 'unavailable'])),
    getEntitlement: () => invoke('getEntitlement', new Set(['purchased', 'not_owned', 'pending', 'unavailable', 'error'])),
    purchase: () => invoke('purchase', new Set(['purchased', 'pending', 'cancelled', 'unavailable', 'error'])),
    restore: () => invoke('restore', new Set(['purchased', 'not_owned', 'pending', 'unavailable', 'error'])),
    invalidate
  };
}
