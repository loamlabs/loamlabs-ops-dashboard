// lib/signature-build/recipe.js
// The recipe the Step 3 button sends in the link fragment (see SIGNATURE_BUTTON_CONTRACT.md).
const ROLES = ['frontRim', 'rearRim', 'frontHub', 'rearHub', 'frontSpokes', 'rearSpokes', 'frontNipples', 'rearNipples'];
const STYLES = ['mtb', 'gravelroad', 'hybrid'];
const MAX_BYTES = 4096;

/** Fragment "#r=<base64url(JSON)>" (or just the base64url text) -> recipe object, or throws. */
function decodeFragment(text) {
    let s = String(text || '').trim();
    if (s.startsWith('#')) s = s.slice(1);
    if (s.startsWith('r=')) s = s.slice(2);
    if (!s) throw new Error('empty');
    if (s.length > MAX_BYTES * 2) throw new Error('too large');
    const json = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
}

function encodeFragment(recipe) {
    return Buffer.from(JSON.stringify(recipe), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const isId = (v) => typeof v === 'string' && /^\d{6,20}$/.test(v);

/** @returns {{ok:boolean, errors:string[]}} */
function validateRecipe(r) {
    const errors = [];
    if (!r || typeof r !== 'object') return { ok: false, errors: ['recipe is missing'] };
    if (JSON.stringify(r).length > MAX_BYTES) errors.push('recipe is larger than 4 KB');
    if (r.v !== 1) errors.push('v must be 1');
    if (!STYLES.includes(r.ridingStyle)) errors.push('ridingStyle must be one of ' + STYLES.join(', '));
    const s = r.specs || {};
    ['frontWheelSize', 'rearWheelSize', 'frontSpokeCount', 'rearSpokeCount', 'brakeStyle', 'frontHubSpacing', 'rearHubSpacing'].forEach((k) => {
        if (typeof s[k] !== 'string' || !s[k]) errors.push(`specs.${k} is missing`);
    });
    ['frontHubSpacing', 'rearHubSpacing'].forEach((k) => { if (/mm/i.test(s[k] || '')) errors.push(`specs.${k} must not contain "mm"`); });
    const p = r.parts || {};
    ROLES.forEach((k) => { if (!isId(p[k])) errors.push(`parts.${k} must be a numeric variant id (text)`); });
    // spokeLengths is optional (the builder does not calculate them); when present it must be complete
    if (r.spokeLengths !== undefined) {
        const sl = r.spokeLengths || {};
        ['front', 'rear'].forEach((w) => ['left', 'right'].forEach((side) => {
            const v = sl[w] && sl[w][side];
            if (typeof v !== 'number' || !(v >= 200 && v <= 400)) errors.push(`spokeLengths.${w}.${side} must be a number of mm between 200 and 400`);
        }));
    }
    if (typeof r.freehub !== 'string' || !r.freehub) errors.push('freehub is missing');
    if (r.displayedTotal !== undefined && (typeof r.displayedTotal !== 'number' || !(r.displayedTotal > 0))) errors.push('displayedTotal must be a positive number');
    return { ok: errors.length === 0, errors };
}

module.exports = { ROLES, STYLES, decodeFragment, encodeFragment, validateRecipe, MAX_BYTES };
