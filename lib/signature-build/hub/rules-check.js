// lib/signature-build/hub/rules-check.js
// The two Signature rules, enforced per hub choice (Jerry, Nov 4/5):
//   1. No straight-pull build on a mountain bike unless the spokes are bladed.
//   2. Berd spokes never go with a straight-pull hub (hook flange hubs are preferred, classic / J-bend is allowed).
// Plus the builder's own pairing (hub type against the spoke's interface) and two blockers for missing data.
// Pure. Hub options that fail are DROPPED with a reason by the plan; the plan stops only when none is left.
const { BLADED_SPOKES } = require('./constants');

const ci = (s) => String(s == null ? '' : s).trim().toLowerCase();

/** @param {object} spoke { title, meta:{ spoke_hub_interface, spoke_model_group, spoke_type } } */
function describeSpoke(spoke) {
    const m = (spoke && spoke.meta) || {};
    const title = (spoke && spoke.title) || '';
    return {
        title,
        interface: ci(m.spoke_hub_interface),
        bladed: BLADED_SPOKES.test(title) || BLADED_SPOKES.test(m.spoke_model_group || ''),
        berd: /berd/i.test(title) || ci(m.spoke_type) === 'berd',
    };
}

/**
 * Checks that depend only on the spoke product (run once per plan).
 * @returns {{code,message}[]} blockers
 */
function checkSpokeProduct(spoke) {
    const s = describeSpoke(spoke);
    if (!s.interface) return [{ code: 'SPOKE_INTERFACE_MISSING', message: `The spoke product ${s.title} has no hub interface (spoke_hub_interface), so the Signature rules cannot be checked. Nothing was changed.` }];
    return [];
}

/**
 * One hub choice against the spoke.
 * @param {object} p { ridingStyle, spoke (product), hubModel, hubTypes: string[] (front and rear hub_type) }
 * @returns {{ok:boolean, drop:{code,message}[], warnings:{code,message}[]}}
 */
function checkSignatureRules({ ridingStyle, spoke, hubModel, hubTypes }) {
    const s = describeSpoke(spoke);
    const drop = [], warnings = [];
    const types = (hubTypes || []).map(ci);
    if (!types.length || types.some((t) => !t)) return { ok: false, drop: [{ code: 'HUB_TYPE_MISSING', message: `${hubModel}: a hub has no hub type, so the Signature rules cannot be checked` }], warnings };
    if (!s.interface) return { ok: false, drop: [{ code: 'SPOKE_INTERFACE_MISSING', message: `${hubModel}: the spoke product has no hub interface` }], warnings };

    const straightHub = types.includes('straight pull');
    const straightSpoke = s.interface === 'straight pull';
    const mtb = ci(ridingStyle) === 'mtb';

    if (mtb && (straightHub || straightSpoke) && !s.bladed) {
        drop.push({ code: 'SP_ON_MTB', message: `${hubModel}: straight pull is not allowed on a mountain build unless the spokes are bladed (${s.title} is round)` });
    }
    if (s.berd && straightHub) {
        drop.push({ code: 'BERD_STRAIGHT_PULL', message: `${hubModel}: Berd spokes are never used with a straight pull hub` });
    }
    // the builder's pairing between the hub and the spoke interface
    if (s.interface === 'hook flange' && !types.every((t) => t === 'hook flange')) drop.push({ code: 'SPOKE_HUB_MISMATCH', message: `${hubModel}: ${s.title} needs hook flange hubs` });
    if (s.interface === 'j-bend' && straightHub) drop.push({ code: 'SPOKE_HUB_MISMATCH', message: `${hubModel}: J-bend spokes do not fit a straight pull hub` });
    if (s.interface === 'straight pull' && types.some((t) => t !== 'straight pull')) drop.push({ code: 'SPOKE_HUB_MISMATCH', message: `${hubModel}: straight pull spokes need straight pull hubs` });

    if (s.berd && !drop.length && !types.every((t) => t === 'hook flange')) warnings.push({ code: 'BERD_PREFER_HOOK_FLANGE', message: `${hubModel}: Berd spokes are better with hook flange hubs; a classic flange hub is allowed` });
    return { ok: drop.length === 0, drop, warnings };
}

/**
 * Do the hubs of this build need Berd Hub Inserts? Same condition as the builder (theme REQUIRED_ADDONS_CONFIG): Berd spokes, and the hub is neither
 * tagged Berd_insert_not_required nor hub_type:hook_flange. Used by the old tool's description sentence and by the hub-choice plan.
 */
function berdInsertsNeeded(spoke, hubProducts) {
    const s = describeSpoke(spoke);
    if (!s.berd) return false;
    return (hubProducts || []).some((h) => {
        const tags = (h && h.tags) || [];
        return !tags.includes('Berd_insert_not_required') && !tags.includes('hub_type:hook_flange') && ci(h && h.meta && h.meta.hub_type) !== 'hook flange';
    });
}

module.exports = { describeSpoke, checkSpokeProduct, checkSignatureRules, berdInsertsNeeded };
