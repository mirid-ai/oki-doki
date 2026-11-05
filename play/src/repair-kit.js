/** A playful quote only. This module does not charge money or verify identity. */
const freeNames = new Set(['aviva sofia', 'aviva sophia', 'sophia']);

/** Product metadata must come from a configured store billing integration.
 * The integrator separately confirms that this product is set to the lowest
 * available paid tier. This function cannot verify prices or launch purchases. */
export function quoteRepairKit({ username = '', billingConfigured = false, minimumTierConfigured = false, storeProduct = null } = {}) {
  const normalized = typeof username === 'string' ? username.trim().replace(/\s+/gu, ' ').toLowerCase() : '';
  const base = {
    name: 'Wrench & Bandage Field Repair',
    description: 'A little engineering, a little medicine, and one extremely serious invoice.'
  };
  if (!normalized) return { ...base, status: 'username_required', price: null };
  if (freeNames.has(normalized)) return { ...base, status: 'free', price: 'Free' };

  const productId = typeof storeProduct?.id === 'string' ? storeProduct.id.trim() : '';
  const formattedPrice = typeof storeProduct?.formattedPrice === 'string' ? storeProduct.formattedPrice.trim() : '';
  if (billingConfigured !== true || minimumTierConfigured !== true || !productId || !formattedPrice) {
    return { ...base, status: 'payment_unavailable', price: null };
  }
  return { ...base, status: 'payment_required', price: formattedPrice, productId };
}
