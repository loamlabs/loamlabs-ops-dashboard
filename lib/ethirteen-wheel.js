// lib/ethirteen-wheel.js
// Picks the REAR wheel variant of an e*thirteen wheel-set rule from the vendor's product JSON. PURE: no network.
//
// Since the Oct 2026 re-listing, e*thirteen's rear-wheel pages are COMPLETE wheels: one variant per size / hub spacing / freehub
// ("29" / 148x12mm Boost / XD", SKU WHS50-209+HBS40-201), the freehub is already in the price, and the title no longer contains "Rear".
// The older listing had no freehub in the variant title and the freehub kit was added separately.
//   - listing with the freehub in the variant title ("complete wheel"): take exactly that freehub's variant, add NO separate kit price
//   - older listing (no freehub in any title): highest price among size/axle matches, kit price added by the caller (as before)
// If the rear wheel cannot be found, the caller must skip the rule. A missing rear wheel must never be priced as $0.

const { kitForDriver } = require('./ethirteen-surcharge');

const clean = (t) => String(t || '').replace(/×/g, 'x').replace(/\s+/g, ' ').trim().toLowerCase().replace(/["']/g, '');
const cents = (v) => Math.max(Number(v.price) || 0, Number(v.compare_at_price) || 0);

// freehub kit named in the LAST segment of a variant title ("... / XD"), or null
function kitOfTitle(publicTitle) {
    const last = String(publicTitle || '').split(' / ').slice(-1)[0];
    return kitForDriver(last);
}

/**
 * @param {object[]} variants  vendor product variants (public_title, price, compare_at_price, available)
 * @param {object} want  { size: '29'|'27.5'|null, axle: '148'|'157'|null, superboost: boolean, driver: string|null (lower-case) }
 * @returns {{ok:true, variant:object, kitIncluded:boolean, price:number}|{ok:false, reason:string}}
 */
function pickRearVariant(variants, want) {
    const all = Array.isArray(variants) ? variants : [];
    if (all.length === 0) return { ok: false, reason: 'rear wheel page has no variants' };

    const legacyTitles = all.some(v => clean(v.public_title).includes('rear'));    // older listing: the word "rear" is in the title
    let candidates = all.filter(v => {
        const vt = clean(v.public_title);
        if (legacyTitles && !vt.includes('rear')) return false;
        if (want.size && !vt.includes(want.size)) return false;
        if (want.axle && !vt.includes(want.axle)) return false;
        if (want.superboost && !vt.includes('superboost') && !vt.includes('super boost') && !vt.includes('157')) return false;
        if (!want.superboost && (vt.includes('superboost') || vt.includes('super boost') || vt.includes('157'))) return false;
        return true;
    });
    if (candidates.length === 0) return { ok: false, reason: 'no rear wheel variant matches this size / hub spacing on the vendor page' };

    const completeListing = candidates.some(v => kitOfTitle(v.public_title) !== null);
    if (completeListing) {
        const kit = kitForDriver(want.driver);
        if (!kit) return { ok: false, reason: `freehub "${want.driver}" is not a known freehub for the complete-wheel listing` };
        candidates = candidates.filter(v => kitOfTitle(v.public_title) === kit);
        if (candidates.length === 0) return { ok: false, reason: `no rear wheel variant with freehub "${kit}" on the vendor page` };
    }
    const best = candidates.reduce((a, b) => (cents(a) >= cents(b) ? a : b));
    if (!(cents(best) > 0)) return { ok: false, reason: 'the matching rear wheel variant has no readable price' };
    return { ok: true, variant: best, kitIncluded: completeListing, price: cents(best) };
}

module.exports = { pickRearVariant, kitOfTitle };
