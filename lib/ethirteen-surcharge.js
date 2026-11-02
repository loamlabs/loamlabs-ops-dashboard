// lib/ethirteen-surcharge.js
// The driver / freehub-kit surcharge added to e*thirteen wheel sets, read from e*thirteen's product JSON
// (https://www.ethirteen.com/products/sidekick-freehub-kits.js). PURE: no network.
//
// Reads the PRICE only. Availability of the kit is deliberately never read: a sold-out kit still has a readable price,
// and "kit sold out" must never be mistaken for "page broken" or change the wheel set's availability.
// If the price cannot be determined this returns { ok: false } and the caller skips the rule. It never guesses a number.

const SURCHARGE_URL = 'https://www.ethirteen.com/products/sidekick-freehub-kits';

// Option value of the page's "Freehub Kit" option for each driver kind
const KIT = { XD: 'XD', HG: 'HG', MS: 'Microspline', MINI_HG: 'Mini HG', DH7: '7 speed 9-24t DM Cassette Kit' };

// Our driver variant text (already lower-cased) -> the page's kit name, or null when not recognised.
function kitForDriver(driverValue) {
    const d = String(driverValue || '').toLowerCase().replace(/["']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!d) return null;
    if (d.includes('7 spd') || d.includes('7spd') || d.includes('7 speed') || d.includes('7-speed') || d.includes('cassette')) return KIT.DH7;
    if (d.includes('mini')) return KIT.MINI_HG;
    if (/\bxd\b/.test(d) && !/\bms\b/.test(d)) return KIT.XD;
    if (d.includes('microspline') || /\bms\b/.test(d)) return KIT.MS;
    if (/\bhg\b/.test(d)) return KIT.HG;
    return null;
}

/**
 * @param {object} product  e*thirteen product .js JSON
 * @param {string} driverValue  our driver option text, lower-case
 * @returns {{ok:true, cents:number, kit:string, hubModels:string[], pricesDiffer:boolean, kitAvailable:boolean|null}
 *          | {ok:false, reason:string}}
 */
function findSurchargeCents(product, driverValue) {
    const kit = kitForDriver(driverValue);
    if (!kit) return { ok: false, reason: `driver "${driverValue}" is not a known freehub kit` };
    const variants = product && Array.isArray(product.variants) ? product.variants : [];
    if (variants.length === 0) return { ok: false, reason: 'surcharge page has no variants' };

    // find which optionN holds "Freehub Kit" and which holds "Hub Model" (fall back to the public title "Hub Model / Kit")
    const options = Array.isArray(product.options) ? product.options : [];
    const idx = (name) => { const i = options.findIndex(o => String(o && o.name).toLowerCase() === name); return i >= 0 ? `option${i + 1}` : null; };
    const kitKey = idx('freehub kit'), hubKey = idx('hub model');
    const kitOf = (v) => String((kitKey && v[kitKey]) || String(v.public_title || '').split(' / ').slice(-1)[0] || '').trim().toLowerCase();
    const hubOf = (v) => String((hubKey && v[hubKey]) || '').trim();

    const matches = variants.filter(v => kitOf(v) === kit.toLowerCase());
    if (matches.length === 0) return { ok: false, reason: `kit "${kit}" not found on the surcharge page` };

    // price in cents: the higher of price and compare-at (same convention as the rest of the watcher)
    const prices = matches.map(v => Math.max(Number(v.price) || 0, Number(v.compare_at_price) || 0));
    if (prices.some(p => !(p > 0))) return { ok: false, reason: `kit "${kit}" has a variant without a readable price` };
    const cents = Math.max(...prices);                       // if the two hub models ever differ, use the higher (never under-charge)
    const avail = matches.map(v => v.available);
    return {
        ok: true, cents, kit,
        hubModels: matches.map(hubOf).filter(Boolean),
        pricesDiffer: new Set(prices).size > 1,
        kitAvailable: avail.every(a => typeof a === 'boolean') ? avail.some(Boolean) : null,   // information only, never used for decisions
    };
}

module.exports = { SURCHARGE_URL, KIT, kitForDriver, findSurchargeCents };
