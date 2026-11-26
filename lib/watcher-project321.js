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
    if (!w.colour) return [];
    // Add-on parts (rotor flange, endcap kit) have a colour but no hole count, and their vendor pages have a colour option only: match the colour on variants that carry no hole count.
    // A rule WITH a hole count still needs a hole count (and a rule without one never matches a hub page, whose variants all carry a hole count).
    if (!w.holes) return (variants || []).filter((v) => holeOf(v.public_title) === null && parts(v.public_title).some((p) => normColour(p) === w.colour));
    return (variants || []).filter((v) => holeOf(v.public_title) === w.holes && parts(v.public_title).some((p) => normColour(p) === w.colour));
}

/**
 * price_scope = max_color: the highest price (in the vendor's cents) over EVERY color at this hole count.
 * Exception (Nov 26): a hole count that offers FEWER color/driver combinations than another hole count of the same page (the real case: 24-hole exists in Black only, and Black is
 * $10 to $15 cheaper than every other color) would read Black's own cheaper price and drop our 24h Black below the rest. It then uses the highest price at the hole counts
 * that DO offer every combination, so 24h Black is priced like 28h and 32h Black.
 */
function maxColourPrice(variants, holes) {
    const by = new Map();   // hole count -> { combos: Set, best }
    (variants || []).forEach((v) => {
        const h = holeOf(v.public_title); if (h === null) return;
        const e = by.get(h) || by.set(h, { combos: new Set(), best: 0 }).get(h);
        e.combos.add(parts(v.public_title).filter((p) => holeOf(p) === null).map(normColour).join('|'));
        e.best = Math.max(e.best, Number(v.price) || 0, Number(v.compare_at_price) || 0);
    });
    const here = by.get(holes); if (!here) return 0;
    const full = Math.max(...[...by.values()].map((e) => e.combos.size));
    if (here.combos.size >= full) return here.best;
    let best = here.best;
    for (const e of by.values()) if (e.combos.size === full) best = Math.max(best, e.best);
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
