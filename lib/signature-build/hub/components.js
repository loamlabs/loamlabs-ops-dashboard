// lib/signature-build/hub/components.js
// Per-variant data for a hub-choice product: build_components (read by the guard) and build_variant_recipe (read by the page / builder).
// Pure.
const { variantGid, productGid } = require('../util');
const { BRAKE_STYLE, FREEHUB_LABELS } = require('./constants');

const gid = (v) => variantGid(v && v.id ? v.id : v);
const group = (role, variants, mode) => ({ role, variants: variants.map(gid), ...(mode && variants.length > 1 ? { mode } : {}) });
const unique = (arr) => [...new Set(arr)];
const productNum = (p) => String(p.gid || p).split('/').pop();

/**
 * build_components JSON for one variant. Roles in the same order as the single-build tool.
 * Every colour of the hub at the rim's hole count is an "any" group (a colour that is out never closes the build; the builder page checks
 * colour stock); every offered freehub body is "any"; spokes are the left and right length variants of THIS variant ("all": both must exist).
 * Spoke length stock is a running tally (negative, CONTINUE), so it carries no availability signal: those groups stay as they are today.
 */
function buildComponents(s) {
    const spokeGroup = (side, role) => {
        const l = s.lengths && s.lengths[side];
        if (l) return group(role, unique([l.left, l.right]).map((id) => ({ id })), 'all');
        return group(role, [s.builderSpokes[side]]);   // no length data: the guard watches the builder (Length -) variant, as the single tool does
    };
    const components = [
        group('front_rim', [s.rims.front]),
        group('rear_rim', [s.rims.rear]),
        group('front_hub', s.colours.map((c) => c.front), 'any'),
        group('rear_hub', s.colours.map((c) => c.rear), 'any'),
        group('freehub', s.freehubs.map((f) => f.gid), 'any'),
        group('nipples', [s.nipples]),
        spokeGroup('front', 'spokes_front'),
        spokeGroup('rear', 'spokes_rear'),
    ];
    return { v: 1, components };
}

const label = (v) => (v && v.productTitle ? v.productTitle : '');
const colourName = (v, optVal, COLOUR) => optVal(v, COLOUR);

/**
 * build_variant_recipe JSON (contract section B). `rows` are the readable lines the page shows for this hub choice.
 * @param {object} s variant spec; { holes, defaultColour, ruleName, hubModel, spacing, front{product,default}, rear{...}, colours, freehubs, rims, spokeProduct, nipples, productTitles }
 */
function buildVariantRecipe(s) {
    const hubText = (side, p, d) => `${s.hubModel}, ${BRAKE_STYLE}, ${side === 'front' ? s.spacing.front : s.spacing.rear}, ${s.holes}h, ${s.defaultColour}`;
    const freehubKeys = s.freehubs.map((f) => f.label);
    const map = {};
    s.freehubs.forEach((f) => { map[f.label] = gid(f.gid); });
    return {
        v: 1,
        hubModel: s.hubModel,
        spacing: { front: s.spacing.front, rear: s.spacing.rear },
        brakeStyle: BRAKE_STYLE,
        ruleName: s.ruleName,
        rows: [
            { label: 'Front Hub', value: hubText('front') },
            { label: 'Rear Hub', value: hubText('rear') },
        ],
        frontHub: { productId: Number(productNum(s.front.product)), variantGid: gid(s.front.default), defaultColor: s.defaultColour },
        rearHub: { productId: Number(productNum(s.rear.product)), variantGid: gid(s.rear.default), defaultColor: s.defaultColour },
        hubColors: s.colours.map((c) => c.name),
        freehubs: freehubKeys,
        freehubVariantMap: map,
    };
}

/** The shared product-level build_recipe: rim, spokes, nipples, wheel sizes, use sentence, brake style. No hub, no spacing, no freehub. */
function buildSharedRecipe(c) {
    return {
        ridingStyle: c.ridingStyle,
        specs: { frontWheelSize: c.specs.frontWheelSize, rearWheelSize: c.specs.rearWheelSize, frontSpokeCount: String(c.specs.spokeCount), rearSpokeCount: String(c.specs.spokeCount), brakeStyle: BRAKE_STYLE },
        parts: { frontRim: String(c.rims.front), rearRim: String(c.rims.rear), frontSpokes: String(c.spokes), rearSpokes: String(c.spokes), frontNipples: String(c.nipples), rearNipples: String(c.nipples) },
        ...(c.useSentence ? { useSentence: c.useSentence } : {}),
        ...(c.category ? { category: c.category } : {}),
    };
}

module.exports = { buildComponents, buildVariantRecipe, buildSharedRecipe, FREEHUB_LABELS, productGid, label, colourName };
