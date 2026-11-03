// lib/signature-build/pricing.js
// Parts sum, margin and floor price. Advisory only: Jerry sets the final price.
const { money } = require('./util');

const DEFAULTS = { labour: 60, shipping: 35, feePct: 0.03 };

/**
 * @param {object} p { parts:[{role, price, cost|null}], price|null, displayedTotal|null, costOverrides:{id:cost}, labour, shipping, feePct }
 */
function computePricing(p) {
    const labour = p.labour ?? DEFAULTS.labour;
    const shipping = p.shipping ?? DEFAULTS.shipping;
    const feePct = p.feePct ?? DEFAULTS.feePct;
    const partsSum = money(p.parts.reduce((s, x) => s + x.price, 0));
    let missing = 0;
    const lines = p.parts.map((x) => {
        const over = p.costOverrides && p.costOverrides[x.id];
        const cost = over !== undefined ? Number(over) : x.cost;
        if (cost === null || cost === undefined) { if (x.price > 0) missing++; return { ...x, cost: null }; }
        return { ...x, cost: money(cost) };
    });
    const partsCost = money(lines.reduce((s, x) => s + (x.cost || 0), 0));
    const floor = money((partsCost + labour + shipping) / (1 - feePct));
    const out = {
        partsSum, partsCost, labour, shipping, feePct, floor,
        costMissing: missing, incomplete: missing > 0,
        suggestedPrice: typeof p.displayedTotal === 'number' ? money(p.displayedTotal) : null,
        lines,
    };
    if (typeof p.price === 'number') {
        const fees = money(p.price * feePct);
        out.price = p.price;
        out.fees = fees;
        out.marginBeforeLabour = money(p.price - partsCost - shipping - fees);
        out.marginAfterLabour = money(out.marginBeforeLabour - labour);
        out.belowFloor = p.price < floor;
    }
    return out;
}

module.exports = { computePricing, DEFAULTS };
