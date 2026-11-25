// lib/compare-at.js
// Which compare-at price the Watcher writes together with a new price (Jerry, Nov 25: "when a vendor price DROP is applied to a Watcher-managed variant, the old price must not stay on the page as a crossed-out compare-at").
// Convention already used by pages/api/sync.js: compare-at EQUAL to the price means "no strike-through". Pure.
//
// Before: a compare-at above the new price was kept, so after a drop the old price stayed crossed out (it looks like a sale we did not choose).
// Now: when this write LOWERS the price, compare-at becomes the new price. Kept as before (compare-at above the new price stays) for:
//   - a write that does not lower the price (a rise or an equal price: compare-at is only lifted to the price when it is below it, as before),
//   - Reserve and Chris King (their compare-at is deliberate), Berd (told not to touch),
//   - a "drastic sale" (the Watcher itself prices a vendor sale: the strike is the point),
//   - an inventory-managed (BTI-owned) variant.

const KEEP_VENDORS = ['reserve', 'chris king', 'berd'];
const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * @param {object} p { myPrice, goalPrice, myCompare, vendorName, isDeepSale, btiManaged }  (prices as numbers or numeric strings; myCompare may be null/0)
 * @returns {string|number} the compare_at_price to send with the price (goalPrice itself, or the unchanged myCompare)
 */
function compareAtForPriceWrite({ myPrice, goalPrice, myCompare, vendorName, isDeepSale = false, btiManaged = false }) {
    const goal = Number(goalPrice), base = myCompare ? Number(myCompare) : 0;
    if (!(base > goal)) return goalPrice;                                   // no strike above the new price: compare-at = price (unchanged behaviour)
    const dropping = Number(myPrice) > goal;
    const keep = isDeepSale || btiManaged || KEEP_VENDORS.includes(norm(vendorName));
    return dropping && !keep ? goalPrice : myCompare;                      // drop: clear the strike (equal to price); everything else: keep the compare-at as before
}

module.exports = { compareAtForPriceWrite, KEEP_VENDORS };
