// lib/watcher-project321.js
// Reading Project321's hub pages (Shopify product JSON). Pure. What the real pages look like (read Nov 6 2026 in the browser, 5 pages):
//   options are ["Hole Count","Color","Model"] on rears (Model = the driver: 3 variants per color and hole count) and ["Hole Count","Color"] or ["Color","Hole Count"] on fronts;
//   there is NO brake option (one page per brake type); a color can carry a status in its text: "Maple (Pre-Order: December)", "Black (Available Now)";
//   on the 6-Bolt rear pre-order colors have available:false, on the 6-Bolt FRONT they have available:true (!), and on the G3Ti rear the 28h hole count carries
//   "28 (Pre-Order: December)" with available:true. So `available` alone cannot tell a pre-order: the text "Pre-Order" in ANY option is the only signal.
//   Prices: Black is $10 (front) or $15 (rear) cheaper than every other color.

const lower = (s) => String(s == null ? '' : s).toLowerCase();
const parts = (publicTitle) => String(publicTitle == null ? '' : publicTitle).split(' / ').map((s) => s.trim());

/** "Ultra Violet (Pre-Order: December)" -> "ultraviolet"; "Ultraviolet" -> "ultraviolet". */
const normColour = (s) => lower(s).replace(/\([^)]*\)/g, '').replace(/[^a-z]/g, '');
/** The hole count of a vendor variant: the option that starts with 24, 28 or 32 ("32", "28 (Pre-Order: December)"). */
function holeOf(publicTitle) {
    for (const p of parts(publicTitle)) { const m = /^(\d{2})(?:\s*\(|\s*h|\s*$)/i.exec(p); if (m) return m[1]; }
    return null;
}
const isPreorderText = (publicTitle) => /pre-?\s*order/i.test(String(publicTitle || ''));

/** The rule's own color and hole count from option_values ({ "Spoke Count": "32h", "Color": "Black" }). */
function wantedOptions(optionValues) {
    let colour = null, holes = null;
    for (const [name, value] of Object.entries(optionValues || {})) {
        const n = lower(name);
        if (n.includes('color') || n.includes('colour')) colour = normColour(value);
        else if (n.includes('spoke') || n.includes('hole') || n.includes('count')) { const d = String(value).replace(/\D/g, ''); if (d) holes = d.slice(0, 2); }
    }
    return { colour, holes };
}

/** Vendor variants of this color and hole count (all drivers). The driver ("Model") is not part of our variant. */
function matchColourHoles(variants, optionValues) {
    const w = wantedOptions(optionValues);
    if (!w.colour || !w.holes) return [];
    return (variants || []).filter((v) => holeOf(v.public_title) === w.holes && parts(v.public_title).some((p) => normColour(p) === w.colour));
}

/** price_scope = max_color: the highest price (in the vendor's cents) over EVERY color at this hole count. */
function maxColourPrice(variants, holes) {
    let best = 0;
    (variants || []).forEach((v) => { if (holeOf(v.public_title) === holes) best = Math.max(best, Number(v.price) || 0, Number(v.compare_at_price) || 0); });
    return best;
}

/**
 * @param {object} p { candidates (matched variants), variants (all of the page), rule { tags, option_values } }
 * @returns {null | { price, available, preorder, holdStock, note }}
 *   preorder: any matched variant says Pre-Order in any option. Unless the rule has the tag 'preorder-closes' (Jerry's decision, NOT given yet) the stock of a pre-order
 *   color is left alone (holdStock) and the log says so; with the tag it counts as out of stock.
 */
function readProject321({ candidates, variants, rule }) {
    if (!candidates || !candidates.length) return null;
    const tags = Array.isArray(rule && rule.tags) ? rule.tags : [];
    const w = wantedOptions(rule && rule.option_values);
    const price = tags.includes('price-max-color') ? maxColourPrice(variants, w.holes) || Math.max(...candidates.map((c) => Math.max(Number(c.price) || 0, Number(c.compare_at_price) || 0)))
        : Math.max(...candidates.map((c) => Math.max(Number(c.price) || 0, Number(c.compare_at_price) || 0)));
    const preorder = candidates.some((c) => isPreorderText(c.public_title));
    let available = candidates.some((c) => c.available);
    let holdStock = false, note = '';
    if (preorder) {
        if (tags.includes('preorder-closes')) { available = false; note = 'Pre-Order label: counted as out of stock'; }
        else { holdStock = true; note = 'Pre-Order label: stock left alone (waiting for Jerry\'s decision)'; }
    }
    return { price, available, preorder, holdStock, note };
}

module.exports = { normColour, holeOf, isPreorderText, wantedOptions, matchColourHoles, maxColourPrice, readProject321 };
