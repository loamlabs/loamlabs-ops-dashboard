// lib/signature-build/hub/fit.js
// Does a hub model exist in a spacing, at the rim's hole count, in 6-Bolt, with the data the order webhook needs? Pure (products are passed in).
// A combination that fails makes NO variant (decision 4): it cannot be ordered. Stock never decides this: a variant is created even when the hub is
// out of stock today (the guard switches it off).
const { BRAKE_STYLE, BUILDER_SPACING_LABELS } = require('./constants');

const ci = (s) => String(s == null ? '' : s).trim().toLowerCase();
const optVal = (v, re) => { const o = (v.selectedOptions || []).find((x) => re.test(x.name)); return o ? o.value : null; };
const COLOUR = /^colou?r$/i, HOLES = /spoke count|hole/i;

const HUB_FIELDS = ['hub_flange_diameter_left', 'hub_flange_diameter_right', 'hub_flange_offset_left', 'hub_flange_offset_right', 'hub_spoke_hole_diameter'];
const positive = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0; };

/** Which of the numbers the spoke calculator needs are missing or zero on this hub product? (hub_type is checked separately) */
function missingHubFields(product) {
    const m = (product && product.meta) || {};
    return HUB_FIELDS.filter((f) => !positive(m[f]));
}

/** "12x157mm (SuperBoost)" -> "12x157" (the numbers of a store label). */
const numericSpacing = (s) => { const m = /^\s*(\d+x\d+)/i.exec(String(s == null ? '' : s)); return m ? m[1].toLowerCase() : null; };
const spacingOk = (v, productTitle, want) => {
    const n = numericSpacing(v.spacing);
    if (n) return n === ci(want);
    return ci(productTitle).includes(ci(want) + 'mm') || ci(productTitle).includes(ci(want));
};

/**
 * The exact label the store gives a hub's variants (custom.wheel_spec_hub_spacing), per side, with what is wrong with it.
 * The builder compares this text, so a missing or unknown label means NO variant; labels that differ between colour variants of one product
 * are reported (the default colour's label is used).
 */
function spacingLabel(side, variants, defaultVariant) {
    const known = BUILDER_SPACING_LABELS[side];
    const labels = variants.map((v) => (v.spacing ? String(v.spacing).trim() : null));
    const distinct = [...new Set(labels.filter(Boolean))];
    const label = (defaultVariant && defaultVariant.spacing ? String(defaultVariant.spacing).trim() : null) || distinct[0] || null;
    const notes = [];
    const missing = labels.filter((l) => !l).length;
    if (missing) notes.push({ code: 'SPACING_LABEL_VARIANT_EMPTY', message: `${missing} of ${variants.length} ${side} hub variants have no spacing label` });
    if (distinct.length > 1) notes.push({ code: 'SPACING_LABEL_SIBLINGS_DIFFER', message: `the ${side} hub variants carry different spacing labels (${distinct.join(' / ')})` });
    const bad = !label ? { code: 'SPACING_LABEL_MISSING', message: `the ${side} hub has no spacing label in the store, so the builder could not match it` }
        : !known.includes(label) ? { code: 'SPACING_LABEL_UNKNOWN', message: `the ${side} hub's spacing label "${label}" is not one of the builder's Step 2 labels (${known.join(', ')})` } : null;
    return { label, notes, bad };
}
const brakeOk = (v, productTitle) => {
    const b = v.brake;
    const text = Array.isArray(b) ? b.join(' ') : String(b == null ? '' : b);
    if (text) return ci(text).includes(ci(BRAKE_STYLE));
    return ci(productTitle).includes(ci(BRAKE_STYLE));
};

/** Variants of one hub product that count: right hole count, right spacing, 6-Bolt. */
function usableVariants(product, holes, wantSpacing) {
    return (product.variants || []).filter((v) => ci(optVal(v, HOLES)) === ci(`${holes}h`) && spacingOk(v, product.title, wantSpacing) && brakeOk(v, product.title));
}

/**
 * @param {object} p { spacing:{front,rear}, holes:'32', frontProduct, rearProduct, defaultColor? }
 * @returns {{ok:boolean, reasons:{code,message}[], front?, rear?, colours?, excludedColours?}}
 */
function evaluateHubCombo({ spacing, holes, frontProduct, rearProduct, defaultColor }) {
    const reasons = [];
    const bad = (code, message) => reasons.push({ code, message });
    if (!frontProduct) bad('NO_HUB_IN_SPACING', `no front hub product for ${spacing.front}`);
    if (!rearProduct) bad('NO_HUB_IN_SPACING', `no rear hub product for ${spacing.rear}`);
    if (reasons.length) return { ok: false, reasons };

    const sides = [['front', frontProduct, spacing.front], ['rear', rearProduct, spacing.rear]];
    for (const [side, P, want] of sides) {
        const atHoles = (P.variants || []).filter((v) => ci(optVal(v, HOLES)) === ci(`${holes}h`));
        if (!atHoles.length) { bad('NO_HOLE_COUNT', `the ${side} hub (${P.title}) has no ${holes}h variant`); continue; }
        if (!atHoles.some((v) => spacingOk(v, P.title, want))) bad('SPACING_MISMATCH', `the ${side} hub product (${P.title}) is not the ${want} product`);
        else if (!atHoles.some((v) => brakeOk(v, P.title))) bad('WRONG_BRAKE', `the ${side} hub (${P.title}) is not ${BRAKE_STYLE}`);
        if (!ci(P.meta && P.meta.hub_type)) bad('HUB_TYPE_MISSING', `the ${side} hub (${P.title}) has no hub type, so its spoke lengths would be calculated wrongly without a warning`);
        const miss = missingHubFields(P);
        if (miss.length) bad('HUB_DATA_MISSING', `the ${side} hub (${P.title}) is missing ${miss.join(', ')}`);
    }
    if (reasons.length) return { ok: false, reasons };

    const fv = usableVariants(frontProduct, holes, spacing.front), rv = usableVariants(rearProduct, holes, spacing.rear);
    if (!fv.length || !rv.length) { bad('NO_HOLE_COUNT', `no ${holes}h 6-Bolt variant on the ${!fv.length ? 'front' : 'rear'} hub at this spacing`); return { ok: false, reasons }; }

    const colour = (v) => optVal(v, COLOUR);
    const pickDefault = (list) => {
        const want = ci(defaultColor || 'black');
        return list.find((v) => ci(colour(v)) === want) || list.find((v) => ci(colour(v)).startsWith('black')) || list[0];
    };
    const fd = pickDefault(fv);
    const rd = pickDefault(rv.filter((v) => ci(colour(v)) === ci(colour(fd)))) || pickDefault(rv);
    if (ci(colour(fd)) !== ci(colour(rd))) { bad('COLOUR_MISMATCH', `front hub default is ${colour(fd)} but the rear hub has no ${colour(fd)}`); return { ok: false, reasons }; }

    // colours offered: on BOTH hubs at the hole count, and at the same price as the default (rule: all colours of one model cost the same)
    const names = [...new Set([...fv, ...rv].map(colour).filter(Boolean))];
    const colours = [], excluded = [];
    for (const c of names) {
        const f = fv.find((v) => ci(colour(v)) === ci(c)), r = rv.find((v) => ci(colour(v)) === ci(c));
        if (!f || !r) excluded.push({ name: c, reason: `not on both the front and rear hub at ${holes}h` });
        else if (Number(f.price) !== Number(fd.price) || Number(r.price) !== Number(rd.price)) excluded.push({ name: c, reason: `its price differs from ${colour(fd)} (front $${Number(f.price).toFixed(2)} / rear $${Number(r.price).toFixed(2)}), so the master price would be wrong` });
        else colours.push({ name: c, front: f, rear: r });
    }
    colours.sort((a, b) => (ci(a.name) === ci(colour(fd)) ? -1 : ci(b.name) === ci(colour(fd)) ? 1 : 0));   // default first
    const lf = spacingLabel('front', fv, fd), lr = spacingLabel('rear', rv, rd);
    [lf, lr].forEach((l) => { if (l.bad) bad(l.bad.code, l.bad.message); });
    if (reasons.length) return { ok: false, reasons };
    return { ok: true, reasons, labels: { front: lf.label, rear: lr.label }, labelNotes: [...lf.notes, ...lr.notes], front: { product: frontProduct, default: fd, variants: fv }, rear: { product: rearProduct, default: rd, variants: rv }, colours, excludedColours: excluded, defaultColour: colour(fd) };
}

/** Rim data the order webhook needs; blockers for the plan. */
function checkRimData(rimProduct, rimVariant) {
    const out = [];
    const m = (rimProduct && rimProduct.meta) || {};
    if (!positive(rimVariant && rimVariant.erd)) out.push({ code: 'RIM_ERD_MISSING', message: `The rim ${rimProduct.title} (${rimVariant ? rimVariant.title : '?'}) has no rim ERD.` });
    if (m.rim_spoke_hole_offset === undefined || m.rim_spoke_hole_offset === null || m.rim_spoke_hole_offset === '') out.push({ code: 'RIM_OFFSET_MISSING', message: `The rim ${rimProduct.title} has no spoke hole offset (a blank one calculates as zero without a warning).` });
    const policy = ci(m.rim_washer_policy);
    if (policy === 'mandatory' && !positive(m.nipple_washer_thickness)) out.push({ code: 'WASHER_THICKNESS_MISSING', message: `The rim ${rimProduct.title} needs a washer (policy Mandatory) but its washer thickness is blank or zero: spoke lengths would come out 2 mm short.` });
    return out;
}

module.exports = { evaluateHubCombo, checkRimData, missingHubFields, usableVariants, optVal, spacingLabel, numericSpacing, COLOUR, HOLES, HUB_FIELDS };
