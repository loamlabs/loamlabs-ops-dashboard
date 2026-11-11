// lib/ethirteen-valve.js
// Matches our Quick Fill Tubeless Valve variants (Color x Length) to a variant on e*thirteen's "Quick Fill Presta Tubeless Bike Valves" page
// (https://www.ethirteen.com/products/quick-fill-plasma-valve). PURE.
//   vendor variant titles look like "Eggplant / 12.5-24mm / Fits Grappler/Sylvan/Optimus/LG1/TRS/alloy XCX rims" and "Intergalactic PVD / 23-31mm / Fits Piedmont/XCXr rims"
//   our options:  Color = Black | Bronze | Eggplant | Intergalactic | Naranja | Sterling Silver ;  Length = 16-24mm | 23-31mm
//   our "16-24mm" is their "12.5-24mm"; "23-31mm" is the same. The two "Bosch Speed Sensor Compatible (Black Only)" variants are a different product and never match.

const LENGTH_MAP = { '16-24mm': '12.5-24mm', '23-31mm': '23-31mm' };
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** @param {string} publicTitle vendor variant title @param {{Color?:string, Length?:string}} options our rule options @returns {boolean} */
function valveMatches(publicTitle, options) {
    const t = clean(publicTitle);
    if (!t || t.includes('bosch')) return false;
    const parts = t.split(' / ').map((x) => x.trim());
    const color = clean(options && options.Color);
    const length = LENGTH_MAP[clean(options && options.Length)] || clean(options && options.Length);
    if (!color || !length) return false;
    if (!(parts[0] === color || parts[0].startsWith(color + ' '))) return false;      // "intergalactic pvd" starts with "intergalactic"; "black" must be the whole color
    return (parts[1] || '').startsWith(length);
}

module.exports = { valveMatches, LENGTH_MAP };
