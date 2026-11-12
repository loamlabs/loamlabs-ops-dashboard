// lib/watcher-philwood.js
// Reading Phil Wood's hub pages (philwood.com is a Shopify store: /products/<handle>.js). Pure. What the real pages look like (read Nov 11-12 2026, 22 pages):
//   options are ["Spoke Hole Count","Hub Shell Color","Bearing"] (or "Bearing Type"); public_title "28 / Silver / Standard".
//   Classic and standard hubs offer Standard and Carbonyte bearings (Carbonyte = +$10); Pro hubs offer Carbonyte only.
//   Our store sells ONE price per spoke count and shell color = Phil Wood retail of the Standard bearing (Pro: the only bearing, Carbonyte).
//   Black shell = +$20. Several of our products share one Phil Wood page (e.g. the four Center Lock front hubs), so a rule matches on hole count + color only.
const { wantedOptions, normColour } = require('./watcher-project321');

const parts = (publicTitle) => String(publicTitle == null ? '' : publicTitle).split(' / ').map((s) => s.trim());
const isPhilWood = (vendorName) => String(vendorName || '').trim().toLowerCase() === 'phil wood';

/** { holes: '28', colour: 'silver', bearing: 'standard' } from "28 / Silver / Standard"; null parts when absent. */
function readTitle(publicTitle) {
    const p = parts(publicTitle);
    const m = /^(\d{2})\b/.exec(p[0] || '');
    return { holes: m ? m[1] : null, colour: p[1] ? normColour(p[1]) : null, bearing: p[2] ? p[2].toLowerCase() : null };
}

/**
 * Vendor variants that stand for one of our variants: same hole count and color. When the page has a Standard bearing, ONLY that one counts
 * (the Carbonyte variants cost $10 more and are not what we sell); a Pro page has Carbonyte only, so that one counts.
 */
function matchPhilWood(variants, optionValues) {
    const w = wantedOptions(optionValues);
    if (!w.colour || !w.holes) return [];
    const same = (variants || []).filter((v) => { const t = readTitle(v.public_title); return t.holes === w.holes && t.colour === w.colour; });
    const standard = same.filter((v) => readTitle(v.public_title).bearing === 'standard');
    return standard.length ? standard : same;
}

module.exports = { isPhilWood, readTitle, matchPhilWood };
