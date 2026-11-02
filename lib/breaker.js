// lib/breaker.js
// Sync circuit breaker: decides whether a vendor's "vendor does not offer this variant" writes should be held back.
// Only items that are LIVE in Shopify count (product active and still sellable or in stock). Items that have been
// unavailable for months (old spoke sizes the vendor dropped) are ignored for the ratio, otherwise the breaker trips every day.

const BREAKER_MIN_LIVE_UNMATCHED = 5;   // at least this many live items without a vendor match
const BREAKER_MAX_RATIO = 0.2;          // and more than 20% of the vendor's live items

// A Shopify variant read: { inventoryQuantity, inventoryPolicy ('CONTINUE'|'DENY'), product: { status } }
function isLiveVariant(variant) {
  if (!variant) return false;
  const status = variant.product && variant.product.status;
  if (status && String(status).toUpperCase() !== 'ACTIVE') return false;
  return variant.inventoryPolicy === 'CONTINUE' || (variant.inventoryQuantity || 0) > 0;
}

/**
 * @param {{liveTotal:number, liveNoMatch:number}} stats  per vendor, live items only
 * @returns {boolean} true = hold back this vendor's "not offered" writes
 */
function breakerTripped(stats, opts = {}) {
  const min = opts.minLiveUnmatched ?? BREAKER_MIN_LIVE_UNMATCHED;
  const ratio = opts.maxRatio ?? BREAKER_MAX_RATIO;
  if (!stats || !stats.liveTotal) return false;
  return stats.liveNoMatch >= min && stats.liveNoMatch / stats.liveTotal > ratio;
}

module.exports = { isLiveVariant, breakerTripped, BREAKER_MIN_LIVE_UNMATCHED, BREAKER_MAX_RATIO };
