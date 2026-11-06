// lib/signature-build/hub/naming.js
// Titles, handles, SEO and rule names for hub-choice products (contract section A.1). Pure.
const { slugify } = require('../util');
const { FORBIDDEN } = require('../naming');
const { TITLE_SUFFIX, spacingName } = require('./constants');

const SEO_MIN = 47, SEO_MAX = 59;

/**
 * SEO title: the contract pattern first, then shorter ones until it is 47 to 59 characters (Mullet names are too long for the first pattern:
 * "Reserve 30|DH Mullet 6-Bolt Wheelset, Choose Your Hub | LoamLabs" is 64). Jerry can edit it on the plan page.
 */
function seoTitleFor(name) {
    const candidates = [`${name} 6-Bolt Wheelset, Choose Your Hub | LoamLabs`, `${name} 6-Bolt Wheelset, Choose Hub | LoamLabs`, `${name} 6-Bolt Wheelset | LoamLabs`];
    const hit = candidates.find((t) => t.length >= SEO_MIN && t.length <= SEO_MAX);
    return { title: hit || candidates[0], inRange: !!hit, tried: candidates.map((t) => t.length) };
}

/** @param {string} name short name, e.g. "Reserve 30|DH Mullet" */
function hubChoiceNames(name) {
    const clean = String(name || '').trim().replace(/^LoamLabs\s+/i, '');
    const seo = seoTitleFor(clean);
    return {
        name: clean,
        title: `LoamLabs ${clean} ${TITLE_SUFFIX}`,
        handle: `loamlabs-${slugify(clean)}-wheelset`,
        seoTitle: seo.title, seoTitleInRange: seo.inRange,
        forbidden: FORBIDDEN.test(clean),
    };
}

/** Unique, readable rule name, equal to ruleName in build_variant_recipe: "LoamLabs Reserve 30|DH Mullet + Industry Nine Hydra2 15x110/12x157". */
const ruleNameFor = (name, hubModel, spacing) => `LoamLabs ${String(name).trim().replace(/^LoamLabs\s+/i, '')} + ${hubModel} ${spacingName(spacing)}`;

/** 120 to 140 characters: the full hub list when it fits, then shorter wordings. */
function seoDescriptionFor({ use, rim, hubs }) {
    const n = hubs.length;
    const head = `Hand-built ${use} 6-Bolt wheelset: ${rim} rims, `;
    const tail = ' Built by LoamLabs.';
    const candidates = [
        `${head}choose your hub (${hubs.join(', ')}), Sapim Race spokes.${tail}`,
        `${head}choose from ${n} hubs including ${hubs.slice(0, 2).join(' and ')}, with Sapim Race spokes.${tail}`,
        `${head}choose from ${n} hubs, with Sapim Race spokes.${tail}`,
        `${head}choose from ${n} hubs and Sapim Race spokes, built to order.${tail}`,
    ];
    return candidates.find((t) => t.length >= 120 && t.length <= 140) || candidates.reduce((best, t) => (Math.abs(t.length - 130) < Math.abs(best.length - 130) ? t : best), candidates[0]);
}

module.exports = { hubChoiceNames, ruleNameFor, seoTitleFor, seoDescriptionFor, SEO_MIN, SEO_MAX };
