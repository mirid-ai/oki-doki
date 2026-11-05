/** Mock the bridge only; never connect to a store or initiate a real purchase. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/repair-billing.js', import.meta.url), 'utf8');
const { createRepairBilling } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const unavailable = createRepairBilling();
for (const name of ['getProduct', 'purchase', 'getEntitlement', 'restore']) assert.deepEqual(await unavailable[name](), { status: 'unavailable' });

let calls = [];
let purchaseResult = { status: 'purchased', verified: true, productId: 'kit' };
let entitlementResult = { status: 'not_owned' };
let restoreResult = { status: 'purchased', verified: true, productId: 'kit' };
const billing = createRepairBilling({ bridge: {
  async getProduct(...args) { calls.push(['getProduct', args]); return { status: 'available', productId: 'kit', formattedPrice: '¥50', ignored: 'secret' }; },
  async purchase(...args) { calls.push(['purchase', args]); return purchaseResult; },
  async getEntitlement(...args) { calls.push(['getEntitlement', args]); return entitlementResult; },
  async restore(...args) { calls.push(['restore', args]); return restoreResult; }
} });
assert.deepEqual(calls, [], 'Construction must not contact the store');
assert.deepEqual(await billing.getProduct(), { status: 'available', productId: 'kit', formattedPrice: '¥50' });
assert.deepEqual(await billing.getEntitlement(), { status: 'not_owned' });
assert.deepEqual(calls.map(([method]) => method), ['getProduct', 'getEntitlement'], 'Product and entitlement queries must not buy or restore');
assert.deepEqual(await billing.purchase(), { status: 'purchased', productId: 'kit' });
assert.deepEqual(await billing.restore(), { status: 'purchased', productId: 'kit' });
assert.ok(calls.every(([, args]) => args.length === 0), 'JS must not choose a product or pass credentials');

for (const value of [
  { status: 'purchased' }, { status: 'purchased', verified: false, productId: 'kit' },
  { status: 'purchased', verified: true }, { status: 'purchased', verified: true, productId: 'other' },
  { status: 'strange' }, null
]) {
  purchaseResult = value;
  assert.deepEqual(await billing.purchase(), { status: 'error' });
}
for (const state of ['pending', 'cancelled', 'unavailable', 'error']) {
  purchaseResult = { status: state, verified: true, productId: 'kit' };
  assert.deepEqual(await billing.purchase(), { status: state }, `${state} must not grant entitlement`);
}
for (const state of ['pending', 'not_owned', 'unavailable', 'error']) {
  entitlementResult = { status: state };
  restoreResult = { status: state };
  assert.deepEqual(await billing.getEntitlement(), { status: state });
  assert.deepEqual(await billing.restore(), { status: state });
}
const rejected = createRepairBilling({ bridge: { async getProduct() { return { status: 'available', productId: 'kit', formattedPrice: '$0.29' }; }, async purchase() { throw new Error('sensitive store details'); } } });
await rejected.getProduct();
assert.deepEqual(await rejected.purchase(), { status: 'error' });
const badProduct = createRepairBilling({ bridge: { async getProduct() { return { status: 'available', productId: 'kit' }; } } });
assert.deepEqual(await badProduct.getProduct(), { status: 'error' });

const verified = { status: 'purchased', verified: true, productId: 'kit' };
let productResponse = { status: 'available', productId: 'kit', formattedPrice: '$0.29' };
let protectedCalls = 0;
const readiness = createRepairBilling({ bridge: {
  getProduct: async () => productResponse,
  purchase: async () => { protectedCalls++; return verified; },
  restore: async () => { protectedCalls++; return verified; },
  getEntitlement: async () => { protectedCalls++; return verified; }
} });
for (const method of ['purchase', 'restore', 'getEntitlement']) assert.deepEqual(await readiness[method](), { status: 'error' }, `${method} requires a loaded product`);
assert.equal(protectedCalls, 0, 'Uninitialized calls must not launch store operations');
assert.equal((await readiness.getProduct()).status, 'available');
assert.equal((await readiness.getEntitlement()).status, 'purchased');
for (const bad of [{ status: 'unavailable' }, { status: 'available', productId: 'kit' }, null]) {
  productResponse = bad;
  await readiness.getProduct();
  assert.equal((await readiness.getEntitlement()).status, 'error', 'An unavailable or invalid product must clear the cached ID');
  productResponse = { status: 'available', productId: 'kit', formattedPrice: '$0.29' };
  await readiness.getProduct();
}
readiness.invalidate();
assert.equal((await readiness.getEntitlement()).status, 'error', 'Navigation invalidation must clear product state');
const dynamicBridge = {
  getProduct: async () => ({ status: 'available', productId: 'kit', formattedPrice: '$0.29' }),
  getEntitlement: async () => verified
};
const dynamic = createRepairBilling({ bridge: dynamicBridge });
await dynamic.getProduct();
dynamicBridge.getProduct = async () => { throw new Error('store unavailable'); };
assert.equal((await dynamic.getProduct()).status, 'error');
assert.equal((await dynamic.getEntitlement()).status, 'error', 'A failing lookup must clear product state');
dynamicBridge.getProduct = async () => ({ status: 'available', productId: 'kit', formattedPrice: '$0.29' });
await dynamic.getProduct();
delete dynamicBridge.getProduct;
assert.equal((await dynamic.getProduct()).status, 'unavailable');
assert.equal((await dynamic.getEntitlement()).status, 'error', 'A missing lookup must clear product state');

let resolvePurchase;
const delayed = createRepairBilling({ bridge: { getProduct: async () => ({ status: 'available', productId: 'kit', formattedPrice: '$0.29' }), purchase: () => new Promise(resolve => { resolvePurchase = resolve; }), restore: async () => ({ status: 'not_owned' }) } });
await delayed.getProduct();
const pendingPurchase = delayed.purchase();
assert.deepEqual(await delayed.purchase(), { status: 'busy' }, 'Do not start a second billing flow');
assert.deepEqual(await delayed.restore(), { status: 'busy' }, 'Do not restore during an active billing flow');
delayed.invalidate();
resolvePurchase({ status: 'purchased', verified: true, productId: 'kit' });
assert.deepEqual(await pendingPurchase, { status: 'stale' }, 'Late result must not update a departed scene');
await delayed.getProduct();
assert.deepEqual(await delayed.restore(), { status: 'not_owned' }, 'A later explicit restore remains available after reloading the product');
let rejectRestore;
const delayedFailure = createRepairBilling({ bridge: {
  getProduct: async () => ({ status: 'available', productId: 'kit', formattedPrice: '$0.29' }),
  restore: () => new Promise((_resolve, reject) => { rejectRestore = reject; })
} });
await delayedFailure.getProduct();
const pendingRestore = delayedFailure.restore();
delayedFailure.invalidate();
rejectRestore(new Error('sensitive store error'));
assert.deepEqual(await pendingRestore, { status: 'stale' }, 'Late failure must not update a departed scene or expose provider details');

let finishSlowLookup;
let lookupCount = 0;
const slowLookup = createRepairBilling({ queryTimeoutMs: 5, bridge: {
  getProduct: () => ++lookupCount === 1
    ? new Promise(resolve => { finishSlowLookup = resolve; })
    : Promise.resolve({ status: 'available', productId: 'fresh', formattedPrice: '$0.29' }),
  getEntitlement: async () => ({ status: 'purchased', verified: true, productId: 'fresh' })
} });
assert.deepEqual(await slowLookup.getProduct(), { status: 'unavailable' }, 'A stalled read-only lookup eventually releases the offer');
assert.deepEqual(await slowLookup.getProduct(), { status: 'available', productId: 'fresh', formattedPrice: '$0.29' }, 'The player can retry');
finishSlowLookup({ status: 'available', productId: 'old', formattedPrice: '$9.99' });
await Promise.resolve();
assert.deepEqual(await slowLookup.getEntitlement(), { status: 'purchased', productId: 'fresh' }, 'A late lookup cannot replace the newer product');

let finishFinancialFlow;
const slowPurchase = createRepairBilling({ queryTimeoutMs: 5, bridge: {
  getProduct: async () => ({ status: 'available', productId: 'kit', formattedPrice: '$0.29' }),
  purchase: () => new Promise(resolve => { finishFinancialFlow = resolve; })
} });
await slowPurchase.getProduct();
const ongoingPurchase = slowPurchase.purchase();
await new Promise(resolve => setTimeout(resolve, 15));
assert.deepEqual(await slowPurchase.getProduct(), { status: 'busy' }, 'The lookup timeout must not release an active purchase');
finishFinancialFlow({ status: 'purchased', verified: true, productId: 'kit' });
assert.deepEqual(await ongoingPurchase, { status: 'purchased', productId: 'kit' });
console.log('Billing adapter enforces verified ownership, pending/cancel states, single flight and stale-scene handling.');
