// lib/review-flag.js
// What the Watcher does with a rule's "needs review" flag after it has worked out what (if anything) is waiting for approval. PURE.
//
//   hold     something is waiting for approval now (a price change, or a vendor-OOS switch to unavailable): flag on, reason refreshed
//   approve  Jerry approved (force_approve): flag off, the updates are applied
//   clear    nothing is waiting any more: a stale flag is switched off. This is true whether or not the vendor has the item in stock;
//            before, only in-stock items were cleared, so a "Price Change" flag on a vendor-sold-out item stayed forever
//            even after the computed vendor price equalled the Shopify price again.
//   keep     leave the flag as it is (it was not set)
function decideReviewFlag({ needsPriceUpdate, requiresReviewForStock, forceApprove, flagged }) {
    if ((needsPriceUpdate || requiresReviewForStock) && !forceApprove) return 'hold';
    if (forceApprove) return 'approve';
    if (flagged) return 'clear';
    return 'keep';
}

module.exports = { decideReviewFlag };
