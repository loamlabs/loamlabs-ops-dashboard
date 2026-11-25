// lib/spoke-length-skip.js
// Vendor lengths we have decided NOT to add to a Shopify spoke product, so the Watcher email stops repeating them.
// Keyed by Shopify product id AND exact length text: nothing else is hidden (a future 316mm, or the same length on another product, is still reported).
// Remove an entry if you ever create that length as a variant (an entry for a length that exists is harmless).
const SKIPPED_NEW_LENGTHS = {
    // (empty) The Sapim CX-Ray Straight Pull 275mm entry (Jerry, 2026-11-03) was REMOVED on 2026-11-25: he wants 275mm added to the store, so the email reports it until the variants exist.
};

/** @param {string|number} productId @param {string[]} lengths @returns {string[]} lengths minus the ones decided to skip for this product */
function withoutSkippedLengths(productId, lengths, skipMap = SKIPPED_NEW_LENGTHS) {
    const skip = skipMap[String(productId)] || [];
    return lengths.filter((l) => !skip.includes(l));
}

module.exports = { SKIPPED_NEW_LENGTHS, withoutSkippedLengths };
