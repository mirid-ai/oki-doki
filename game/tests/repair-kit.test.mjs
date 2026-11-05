/** Quote calculation is entirely local: no payments, identity checks or I/O. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/repair-kit.js', import.meta.url), 'utf8');
const { quoteRepairKit } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

for (const username of ['Aviva Sofia', 'Aviva Sophia', 'Sophia', ' aviva  SOFIA ', 'SOPHIA']) {
  const offer = quoteRepairKit({ username });
  assert.equal(offer.status, 'free');
  assert.equal(offer.price, 'Free');
  assert.equal(quoteRepairKit({ username, billingConfigured: true, minimumTierConfigured: true, storeProduct: { id: 'kit', formattedPrice: '$0.29' } }).status, 'free');
}
for (const username of ['Sofia', 'Sophia Smith', 'Aviva', 'anything else']) {
  const product = { id: 'kit', formattedPrice: '¥50' };
  assert.deepEqual({ status: quoteRepairKit({ username }).status, price: quoteRepairKit({ username }).price }, { status: 'payment_unavailable', price: null });
  assert.equal(quoteRepairKit({ username, billingConfigured: true, storeProduct: product }).status, 'payment_unavailable');
  assert.equal(quoteRepairKit({ username, minimumTierConfigured: true, storeProduct: product }).status, 'payment_unavailable');
  assert.equal(quoteRepairKit({ username, billingConfigured: true, minimumTierConfigured: true }).status, 'payment_unavailable');
  const offer = quoteRepairKit({ username, billingConfigured: true, minimumTierConfigured: true, storeProduct: product });
  assert.equal(offer.status, 'payment_required');
  assert.equal(offer.price, '¥50');
  assert.equal(offer.productId, 'kit');
}
for (const storeProduct of [{ id: 'kit', formattedPrice: '' }, { id: '', formattedPrice: '$0.29' }, { id: 'kit', formattedPrice: 0.29 }, null]) {
  assert.equal(quoteRepairKit({ username: 'other', billingConfigured: true, minimumTierConfigured: true, storeProduct }).status, 'payment_unavailable');
}
assert.equal(quoteRepairKit().status, 'username_required');
assert.equal(quoteRepairKit({ username: '  ' }).status, 'username_required');
assert.equal(quoteRepairKit({ username: null }).status, 'username_required');
console.log('The field-repair offer accepts the specified usernames and uses only configured store prices.');
