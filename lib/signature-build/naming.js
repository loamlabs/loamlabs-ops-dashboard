// lib/signature-build/naming.js
// Proposes the master's name from the part products. Jerry edits the short name on the plan page before confirming.
const { slugify } = require('./util');

const TITLE_SUFFIX = 'Wheelset | Custom-built MTB/Gravel Wheels';
const FORBIDDEN = /we\s*are\s*one|\bwao\b/i;   // never in a master's name

function rimModel(title) {
    return String(title || '').replace(/\s+(Carbon|Alloy|Aluminum|Aluminium)?\s*Rims?\b.*$/i, '').trim();
}

function hubModel(title) {
    return String(title || '').replace(/\s+(Front|Rear)?\s*Hub\b.*$/i, '').replace(/\s+-\s+.*$/, '').trim();
}

/** @param {object} p { frontRimTitle, rearRimTitle, frontHubTitle, spokeTitle } -> { name, warnings[] } */
function proposeName(p) {
    const warnings = [];
    const fr = rimModel(p.frontRimTitle), rr = rimModel(p.rearRimTitle);
    let rim = fr;
    if (fr !== rr) { rim = `${fr} / ${rr}`; warnings.push('Front and rear rims are different models: check the name wording (for example "40/44").'); }
    let hub = hubModel(p.frontHubTitle);
    if (/berd/i.test(p.spokeTitle || '') && !/berd/i.test(hub)) hub += ' Berd';
    return { name: `${rim} + ${hub}`, warnings };
}

/** Everything derived from the short name. */
function derive(name) {
    const clean = String(name).trim().replace(/^LoamLabs\s+/i, '');
    return {
        name: clean,
        title: `LoamLabs ${clean} ${TITLE_SUFFIX}`,
        handle: `loamlabs-${slugify(clean)}-wheelset`,
        ruleName: `LoamLabs ${clean}`,
        seoTitle: `${clean} Wheelset | LoamLabs`,
        forbidden: FORBIDDEN.test(clean),
    };
}

const USE_WORD = { mtb: 'MTB', gravelroad: 'gravel', hybrid: 'hybrid' };

function seoDescription({ use, rim, hub, spoke }) {
    return `Hand-built ${use} wheelset: ${rim}, ${hub}, ${spoke}. Built in our shop by LoamLabs.`;
}

module.exports = { proposeName, derive, rimModel, hubModel, seoDescription, USE_WORD, FORBIDDEN, TITLE_SUFFIX };
