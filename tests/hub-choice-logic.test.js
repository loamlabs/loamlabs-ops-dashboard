// Run with: npm test   (no network)
// Hub-choice build, step 1: the pure logic (lengths import, fit, rules check, pricing, naming, rules, components).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, importLengths, lookupLengths } = require('../lib/signature-build/hub/lengths');
const { assemblyPerWheel, variantPrice } = require('../lib/signature-build/hub/pricing');
const { evaluateHubCombo, checkRimData } = require('../lib/signature-build/hub/fit');
const { checkSignatureRules, checkSpokeProduct, berdInsertsNeeded } = require('../lib/signature-build/hub/rules-check');
const { hubChoiceNames, ruleNameFor, seoDescriptionFor } = require('../lib/signature-build/hub/naming');
const { buildHubRule, checkHubRules, appendRules, removeRules, withRealVariants } = require('../lib/signature-build/hub/rules-build');
const { buildComponents, buildVariantRecipe, buildSharedRecipe } = require('../lib/signature-build/hub/components');
const { conflicts, spacingsCompatible } = require('../lib/signature-build/rules');
const { SPACINGS, spacingValue } = require('../lib/signature-build/hub/constants');
const { makeHubWorld, makeLengthsCsv } = require('./helpers/hub-fakes');

// ---------------------------------------------------------------- lengths import
test('csv: BOM, quotes, doubled quotes and CRLF', () => {
    const rows = parseCsv('﻿product,hub\r\n"A ""b"" c","x, y"\r\nplain,z\r\n');
    assert.deepEqual(rows, [{ product: 'A "b" c', hub: 'x, y' }, { product: 'plain', hub: 'z' }]);
});

test('lengths import: rows are indexed by product, hub, spacing and side; the variant cells give ids', () => {
    const w = makeHubWorld();
    const imp = importLengths(makeLengthsCsv(w));
    assert.equal(imp.problems.length, 0); assert.equal(imp.count, 24);
    const r = lookupLengths(imp.index, { product: 'Reserve 30|DH Mullet (29 F / 27.5 R)', hub: 'Hope Pro 5', spacingKey: 'B' });
    assert.equal(r.ok, true); assert.equal(r.front.leftMm, 290); assert.equal(r.rear.rightMm, 272);
    assert.equal(r.front.leftVariantId, w.lenVar[290].id);
});

test('lengths import: missing columns, duplicate rows and an empty file are reported; lookups say why they fail', () => {
    assert.match(importLengths('').problems[0], /empty/);
    assert.match(importLengths('product,hub\r\nx,y\r\n').problems[0], /missing column/);
    const w = makeHubWorld();
    const csv = makeLengthsCsv(w); const lines = csv.trim().split('\r\n');
    assert.match(importLengths([...lines, lines[1]].join('\r\n')).problems.join(' '), /Duplicate row/);
    const imp = importLengths(makeLengthsCsv(w, { drop: ['Hope Pro 5|A|rear'], status: { 'Hope Pro 5|B|front': 'calc failed' } }));
    const key = (hub, k) => lookupLengths(imp.index, { product: 'Reserve 30|DH Mullet (29 F / 27.5 R)', hub, spacingKey: k });
    assert.match(key('Hope Pro 5', 'A').reason, /no spoke lengths in the table/);
    assert.match(key('Hope Pro 5', 'B').reason, /did not calculate/);
    assert.equal(key('Hope Pro 5', 'C').ok, true);
});

// ---------------------------------------------------------------- assembly fee and price
test('assembly fee per wheel follows the builder table: higher of hub and rim rate, else the one that exists, else $60', () => {
    assert.equal(assemblyPerWheel('Industry Nine', 'Reserve').fee, 50);      // I9 $40 vs Reserve $50
    assert.equal(assemblyPerWheel('Hope', 'Reserve').fee, 70);
    assert.equal(assemblyPerWheel('Onyx Racing', 'Reserve').fee, 80);
    assert.equal(assemblyPerWheel('e*thirteen', 'Reserve').fee, 50);         // e*thirteen is not in the hub table: rim rate
    assert.equal(assemblyPerWheel('Project321', 'Reserve').fee, 50);
    assert.equal(assemblyPerWheel('e*thirteen', 'DT Swiss').fee, 60);        // neither has a rate: default
    assert.equal(assemblyPerWheel('Industry Nine', 'DT Swiss').fee, 40);     // DT Swiss is not in the rim table: hub rate
    assert.match(assemblyPerWheel('e*thirteen', 'Reserve').rule, /no rate in the builder/);
});

test('variant price: builder total (parts + 2 x assembly) minus 10 percent; a manual override wins; spokes and nipples count per wheel', () => {
    const base = { frontRim: 649, rearRim: 649, frontHub: 240, rearHub: 510, spokes: 54.99, nipples: 19.99, hubVendor: 'Industry Nine', rimVendor: 'Reserve' };
    const p = variantPrice(base);
    assert.equal(p.listTotal, 2297.96);                                      // 1298 + 750 + 2 x 54.99 + 2 x 19.99 + 2 x 50
    assert.equal(p.builderPrice, 2068.16); assert.equal(p.price, 2068.16); assert.equal(p.overridden, false);
    const o = variantPrice({ ...base, override: 1999 });
    assert.equal(o.price, 1999); assert.equal(o.builderPrice, 2068.16); assert.equal(o.overridden, true);
    // the same method as master 4 (Onyx Vesper, assembly $80 per wheel): 2403.00 -> 2162.70
    assert.equal(variantPrice({ frontRim: 649, rearRim: 649, frontHub: 245, rearHub: 550, spokes: 55, nipples: 20, hubVendor: 'Onyx Racing', rimVendor: 'Reserve' }).builderPrice, 2162.70);
});

// ---------------------------------------------------------------- fit
const prodOf = (w, id) => ({ ...w.P[id], variants: w.P[id].variants });
const hubIds = (w, model) => { const h = w.hubs.find((x) => x.model === model); return { h, f15: prodOf(w, h.frontProducts['15x110']), f20: h.frontProducts['20x110'] ? prodOf(w, h.frontProducts['20x110']) : null, r148: prodOf(w, h.rearProducts['12x148']), r157: prodOf(w, h.rearProducts['12x157']) }; };

test('fit: a hub exists in a spacing at the rim hole count in 6-Bolt: colours, default and prices come out', () => {
    const w = makeHubWorld(); const { f15, r157 } = hubIds(w, 'Industry Nine Hydra2');
    const r = evaluateHubCombo({ spacing: SPACINGS[1], holes: '32', frontProduct: f15, rearProduct: r157 });
    assert.equal(r.ok, true); assert.equal(r.defaultColour, 'Black'); assert.deepEqual(r.colours.map((c) => c.name), ['Black', 'Blue', 'Red']);
    assert.equal(r.front.default.price, 240);
});

test('fit: wrong spacing product, missing hole count, wrong brake, missing hub type and missing flange numbers each make NO variant', () => {
    const w = makeHubWorld(); const { f15, f20, r148 } = hubIds(w, 'Industry Nine Hydra2');
    const spacingMix = evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: f20, rearProduct: r148 });   // 20x110 product used for 15x110
    assert.equal(spacingMix.ok, false); assert.equal(spacingMix.reasons[0].code, 'SPACING_MISMATCH');
    const noHoles = evaluateHubCombo({ spacing: SPACINGS[0], holes: '24', frontProduct: f15, rearProduct: r148 });
    assert.equal(noHoles.reasons[0].code, 'NO_HOLE_COUNT');
    const brake = prodOf(w, w.hubs[0].frontProducts['15x110']); const cl = { ...brake, title: 'Hydra2 Front Hub - Centerlock - 15x110mm', variants: brake.variants.map((v) => ({ ...v, brake: ['Centerlock'] })) };
    assert.equal(evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: cl, rearProduct: r148 }).reasons[0].code, 'WRONG_BRAKE');
    const noType = { ...f15, meta: { ...f15.meta, hub_type: '' } };
    assert.equal(evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: noType, rearProduct: r148 }).reasons[0].code, 'HUB_TYPE_MISSING');
    const noFlange = { ...f15, meta: { ...f15.meta, hub_flange_offset_left: '' } };
    const nf = evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: noFlange, rearProduct: r148 });
    assert.equal(nf.reasons[0].code, 'HUB_DATA_MISSING'); assert.match(nf.reasons[0].message, /hub_flange_offset_left/);
    assert.equal(evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: null, rearProduct: r148 }).reasons[0].code, 'NO_HUB_IN_SPACING');
});

test('fit: only colours on both hubs at the same price are offered; Project321 at 20x110 has the shorter list; Onyx style default colour is found', () => {
    const w = makeHubWorld(); const { f20, r157 } = hubIds(w, 'Project321 G3');
    const c = evaluateHubCombo({ spacing: SPACINGS[2], holes: '32', frontProduct: f20, rearProduct: r157 });
    assert.deepEqual(c.colours.map((x) => x.name), ['Black']); assert.match(c.excludedColours.map((x) => x.name).join(), /Blue|Gold|Silver/);
    // a colour with another price is left out with the reason
    const h = hubIds(w, 'Hope Pro 5'); const odd = { ...h.f15, variants: h.f15.variants.map((v) => (v.title === '32h / Blue' ? { ...v, price: v.price + 50 } : v)) };
    const e = evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: odd, rearProduct: h.r148 });
    assert.deepEqual(e.colours.map((x) => x.name), ['Black']); assert.match(e.excludedColours[0].reason, /price differs/);
    // "Black (Anodized)" counts as the default when there is no plain Black
    const on = { ...h.f15, variants: h.f15.variants.map((v) => ({ ...v, selectedOptions: v.selectedOptions.map((o) => (o.name === 'Color' ? { ...o, value: o.value === 'Black' ? 'Black (Anodized)' : o.value } : o)) })) };
    const on2 = { ...h.r148, variants: h.r148.variants.map((v) => ({ ...v, selectedOptions: v.selectedOptions.map((o) => (o.name === 'Color' ? { ...o, value: o.value === 'Black' ? 'Black (Anodized)' : o.value } : o)) })) };
    assert.equal(evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: on, rearProduct: on2 }).defaultColour, 'Black (Anodized)');
});

test('rim data the order webhook needs: ERD, hole offset and (when Mandatory) washer thickness', () => {
    const w = makeHubWorld(); const rim = prodOf(w, 100);
    assert.deepEqual(checkRimData(rim, rim.variants[0]), []);
    assert.equal(checkRimData(rim, { ...rim.variants[0], erd: null })[0].code, 'RIM_ERD_MISSING');
    assert.equal(checkRimData({ ...rim, meta: { ...rim.meta, rim_spoke_hole_offset: '' } }, rim.variants[0])[0].code, 'RIM_OFFSET_MISSING');
    const fr = { ...rim, meta: { ...rim.meta, rim_washer_policy: 'Mandatory', nipple_washer_thickness: '' } };
    assert.equal(checkRimData(fr, rim.variants[0])[0].code, 'WASHER_THICKNESS_MISSING');
    assert.deepEqual(checkRimData({ ...rim, meta: { ...rim.meta, rim_washer_policy: 'Mandatory', nipple_washer_thickness: '1.0' } }, rim.variants[0]), []);
});

// ---------------------------------------------------------------- Signature rules
const spoke = (title, iface, extra = {}) => ({ title, meta: { spoke_hub_interface: iface, ...extra } });
test('rule 1: no straight pull on a mountain build unless the spokes are bladed', () => {
    const sp = { ridingStyle: 'mtb', hubModel: 'DT 240 SP', hubTypes: ['Straight Pull'] };
    assert.equal(checkSignatureRules({ ...sp, spoke: spoke('Sapim Laser Spokes - Straight Pull', 'Straight Pull') }).drop[0].code, 'SP_ON_MTB');
    assert.equal(checkSignatureRules({ ...sp, spoke: spoke('Sapim CX-Ray Spokes - Straight Pull', 'Straight Pull') }).ok, true);        // bladed
    assert.equal(checkSignatureRules({ ...sp, spoke: spoke('Sapim D-Light Spokes - Straight Pull', 'Straight Pull') }).ok, true);
    assert.equal(checkSignatureRules({ ...sp, ridingStyle: 'gravelroad', spoke: spoke('Sapim Laser Spokes - Straight Pull', 'Straight Pull') }).ok, true);   // not an MTB build
    assert.equal(checkSignatureRules({ ridingStyle: 'mtb', hubModel: 'Hydra2', hubTypes: ['Classic Flange'], spoke: spoke('Sapim Race Spokes- J-Bend', 'J-Bend') }).ok, true);
});

test('rule 2: Berd never with a straight pull hub; hook flange preferred, classic allowed with a warning', () => {
    const berd = spoke('Berd PolyLight Spokes', 'All', { spoke_type: 'Berd' });
    const sp = checkSignatureRules({ ridingStyle: 'gravelroad', spoke: berd, hubModel: 'DT 240 SP', hubTypes: ['Straight Pull'] });
    assert.equal(sp.ok, false); assert.ok(sp.drop.some((d) => d.code === 'BERD_STRAIGHT_PULL'));
    const classic = checkSignatureRules({ ridingStyle: 'mtb', spoke: berd, hubModel: 'Hydra2', hubTypes: ['Classic Flange'] });
    assert.equal(classic.ok, true); assert.equal(classic.warnings[0].code, 'BERD_PREFER_HOOK_FLANGE');
    const hook = checkSignatureRules({ ridingStyle: 'mtb', spoke: berd, hubModel: 'Talon', hubTypes: ['Hook Flange', 'Hook Flange'] });
    assert.equal(hook.ok, true); assert.equal(hook.warnings.length, 0);
});

test('the builder pairing and missing metafields: PolyLightX needs hook flange, J-bend does not fit straight pull, missing type or interface drops/blocks', () => {
    const x = spoke('Berd PolyLightX Spokes', 'Hook Flange', { spoke_type: 'Berd' });
    assert.equal(checkSignatureRules({ ridingStyle: 'mtb', spoke: x, hubModel: 'Hydra2', hubTypes: ['Classic Flange'] }).drop[0].code, 'SPOKE_HUB_MISMATCH');
    assert.equal(checkSignatureRules({ ridingStyle: 'gravelroad', spoke: spoke('Sapim Race J-Bend', 'J-Bend'), hubModel: 'SP', hubTypes: ['Straight Pull'] }).drop[0].code, 'SPOKE_HUB_MISMATCH');
    assert.equal(checkSignatureRules({ ridingStyle: 'mtb', spoke: spoke('Sapim Race', 'J-Bend'), hubModel: 'H', hubTypes: ['Classic Flange', ''] }).drop[0].code, 'HUB_TYPE_MISSING');
    assert.equal(checkSignatureRules({ ridingStyle: 'mtb', spoke: spoke('Sapim Race', ''), hubModel: 'H', hubTypes: ['Classic Flange'] }).drop[0].code, 'SPOKE_INTERFACE_MISSING');
    assert.equal(checkSpokeProduct(spoke('Sapim CX-Ray J-Bend Spokes', ''))[0].code, 'SPOKE_INTERFACE_MISSING');
    assert.deepEqual(checkSpokeProduct(spoke('Sapim Race', 'J-Bend')), []);
});

test('Berd inserts: only when the hub is not tagged hook flange or insert-not-required (same condition as the builder)', () => {
    const berd = spoke('Berd PolyLight Spokes', 'All', { spoke_type: 'Berd' });
    assert.equal(berdInsertsNeeded(berd, [{ tags: [], meta: { hub_type: 'Classic Flange' } }]), true);
    assert.equal(berdInsertsNeeded(berd, [{ tags: ['hub_type:hook_flange'], meta: {} }]), false);
    assert.equal(berdInsertsNeeded(berd, [{ tags: ['Berd_insert_not_required'], meta: {} }]), false);
    assert.equal(berdInsertsNeeded(spoke('Sapim Race', 'J-Bend'), [{ tags: [], meta: {} }]), false);
});

// ---------------------------------------------------------------- naming
test('naming: titles, handles, SEO title chain (47 to 59 characters) for the four products, rule names unique', () => {
    const four = ['Reserve 30|DH Mullet', 'Reserve 30|DH', 'DT Swiss FR 571 Mullet', 'DT Swiss FR 571'].map(hubChoiceNames);
    assert.equal(four[0].title, 'LoamLabs Reserve 30|DH Mullet Wheelset | Custom-built MTB/Gravel Wheels');
    assert.equal(four[3].handle, 'loamlabs-dt-swiss-fr-571-wheelset'); assert.equal(four[0].handle, 'loamlabs-reserve-30-dh-mullet-wheelset');
    four.forEach((n) => { assert.ok(n.seoTitle.length >= 47 && n.seoTitle.length <= 59, n.seoTitle); assert.equal(n.seoTitleInRange, true); assert.match(n.seoTitle, /6-Bolt/); });
    assert.equal(four[1].seoTitle, 'Reserve 30|DH 6-Bolt Wheelset, Choose Your Hub | LoamLabs');       // the contract pattern fits when it can
    assert.equal(four[0].seoTitle, 'Reserve 30|DH Mullet 6-Bolt Wheelset, Choose Hub | LoamLabs');       // the contract pattern is 64 characters here
    assert.equal(hubChoiceNames('We Are One X').forbidden, true);
    const names = new Set(); for (const h of ['Industry Nine Hydra2', 'Hope Pro 5']) for (const s of SPACINGS) names.add(ruleNameFor('Reserve 30|DH Mullet', h, s));
    assert.equal(names.size, 8); assert.ok(names.has('LoamLabs Reserve 30|DH Mullet + Hope Pro 5 20x110/12x157 DH')); assert.ok(names.has('LoamLabs Reserve 30|DH Mullet + Industry Nine Hydra2 15x110/12x157'));
});

test('seo description is 120 to 140 characters for four and five hubs', () => {
    for (const hubs of [['a', 'b', 'c', 'd'], ['Industry Nine Hydra2', 'Hope Pro 5', 'Project321 G3', 'e*thirteen Sidekick GR', 'Onyx Vesper']]) {
        const t = seoDescriptionFor({ use: 'MTB', rim: 'Reserve 30|DH', hubs }); assert.ok(t.length >= 120 && t.length <= 140, t.length + ' ' + t);
    }
});

// ---------------------------------------------------------------- rules
const rule = (o = {}) => buildHubRule({ name: 'N1', thisRimProduct: '100', frontRimProduct: '100', rearRimProduct: '100', frontHubProduct: '601', rearHubProduct: '603', spokeProduct: '400', spokeColors: ['Black'], labels: { front: '15x110mm', rear: '12x148mm (Boost)' }, sizes: { front: '29"', rear: '27.5"' }, hubPriceCents: { front: 24000, rear: 51000 }, variantKey: '0A', ...o });

test('rule object: the contract fields, no hubColors list, spacing, sizes, hub prices, placeholder master variant', () => {
    const r = rule();
    assert.deepEqual(Object.keys(r).sort(), ['frontHubSpacing', 'frontWheelSize', 'freehubLine', 'hubColorsAny', 'hubPriceCents', 'masterVariantGid', 'name', 'pairedRimProductId', 'rearHubSpacing', 'rearWheelSize', 'requiredFrontHubProductId', 'requiredRearHubProductId', 'requiredSpokeProductId', 'spokeColors', 'valves'].sort());
    assert.equal(r.hubColorsAny, true); assert.equal(r.hubColors, undefined); assert.equal(r.pairedRimProductId, 'gid://shopify/Product/100');
    assert.deepEqual(r.hubPriceCents, { front: 24000, rear: 51000 }); assert.equal(r.frontHubSpacing, '15x110mm'); assert.equal(r.rearHubSpacing, '12x148mm (Boost)');
    assert.equal(rule({ frontRimProduct: '100', rearRimProduct: '101', thisRimProduct: '100' }).pairedRimProductId, 'gid://shopify/Product/101');   // two rim products: the other one
});

test('rules never overlap: different spacing, different hubs, and the 29/29 twin against the Mullet twin are all mutually exclusive', () => {
    const a = rule(), sameButSpacing = rule({ name: 'N2', labels: { front: '15x110mm', rear: '12x157mm (SuperBoost)' }, rearHubProduct: '604' });
    assert.equal(conflicts(a, sameButSpacing), false);
    const twin = rule({ name: 'T', sizes: { front: '29"', rear: '29"' } });
    assert.equal(conflicts(a, twin), false);                                                       // 27.5" rear against 29" rear
    assert.equal(conflicts(a, rule({ name: 'Dup' })), true);                                       // same hubs, spacing and sizes: conflict
    assert.equal(spacingsCompatible({ frontHubSpacing: '15x110' }, {}), true);                      // rules without spacing match any
    assert.equal(spacingsCompatible({ frontHubSpacing: '15x110' }, { frontHubSpacing: '20x110' }), false);
});

test('checkHubRules: internal clashes, an older master rule with the same hubs, same name, and unreadable legacy rules are all told apart', () => {
    const rules = [rule(), rule({ name: 'N2', labels: { front: '15x110mm', rear: '12x157mm (SuperBoost)' }, rearHubProduct: '604', variantKey: '0B' })];
    const clean = checkHubRules(rules, [{ name: 'legacy' }]);
    assert.deepEqual([clean.internal.length, clean.existing.length, clean.nameExists.length, clean.notComparable], [0, 0, 0, 1]);
    assert.equal(checkHubRules([rule(), rule({ name: 'N1b' })], []).internal.length, 1);
    assert.match(checkHubRules([rule(), rule()], []).internal[0], /both called/);
    const master = { name: 'LoamLabs Reserve 30|DH Mullet + Onyx Vesper', requiredFrontHubProductId: 'gid://shopify/Product/601', requiredRearHubProductId: 'gid://shopify/Product/603', requiredSpokeProductId: 'gid://shopify/Product/400', pairedRimProductId: 'gid://shopify/Product/100', frontWheelSize: '29"', rearWheelSize: '27.5"', hubColors: ['Black'], spokeColors: ['Black'] };
    const ex = checkHubRules([rule()], [master]);
    assert.equal(ex.existing[0].other, master.name);
    assert.equal(checkHubRules([rule()], [{ ...master, rearHubProductId: undefined, requiredRearHubProductId: 'gid://shopify/Product/9999' }]).existing.length, 0);   // a master on another rear hub (12x150) does not collide
    assert.equal(checkHubRules([rule()], [{ name: 'N1' }]).nameExists[0], 'N1');
});

test('append and remove rules: other rules stay byte-identical, only this run removes its own rules', () => {
    const old = JSON.stringify([{ name: 'old1' }, { name: 'old2', masterVariantGid: 'g2' }]);
    const added = [{ name: 'a', masterVariantGid: 'g10' }, { name: 'b', masterVariantGid: 'g11' }];
    const next = appendRules(old, added);
    assert.deepEqual(JSON.parse(next).slice(0, 2), JSON.parse(old)); assert.equal(JSON.parse(next).length, 4);
    assert.equal(appendRules(null, added), JSON.stringify(added));
    assert.equal(removeRules(next, added), old);
    assert.equal(JSON.parse(removeRules(next, [{ name: 'a', masterVariantGid: 'g10' }])).length, 3);
    assert.throws(() => appendRules('{oops', added), /not valid JSON/);
    assert.deepEqual(withRealVariants([{ name: 'x', masterVariantGid: '__NEW_VARIANT__0A' }], { '0A': '555' })[0].masterVariantGid, 'gid://shopify/ProductVariant/555');
    assert.throws(() => withRealVariants([{ name: 'x', masterVariantGid: '__NEW_VARIANT__0B' }], { '0A': '555' }), /no variant was created/);
});

// ---------------------------------------------------------------- components and recipes
test('build_components per variant: every colour as an "any" group, every freehub body "any", spokes at this variant\'s lengths as "all"', () => {
    const w = makeHubWorld(); const { f15, r148 } = hubIds(w, 'Industry Nine Hydra2');
    const fit = evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: f15, rearProduct: r148 });
    const freehubs = ['XD', 'HG', 'MS'].map((k) => ({ key: k, label: k, gid: w.fh[k].gid }));
    const spec = { rims: { front: w.rim29, rear: w.rim275 }, colours: fit.colours, freehubs, nipples: w.nip, builderSpokes: { front: w.builder, rear: w.builder }, lengths: { front: { left: w.lenVar[290].id, right: w.lenVar[292].id }, rear: { left: w.lenVar[270].id, right: w.lenVar[270].id } } };
    const c = buildComponents(spec);
    assert.deepEqual(c.components.map((x) => x.role), ['front_rim', 'rear_rim', 'front_hub', 'rear_hub', 'freehub', 'nipples', 'spokes_front', 'spokes_rear']);
    assert.equal(c.components[2].variants.length, 3); assert.equal(c.components[2].mode, 'any');
    assert.equal(c.components[4].variants.length, 3); assert.equal(c.components[4].mode, 'any');
    assert.deepEqual([c.components[6].variants.length, c.components[6].mode, c.components[7].variants.length, c.components[7].mode], [2, 'all', 1, undefined]);
    assert.ok(c.components[0].variants[0].startsWith('gid://shopify/ProductVariant/'));
    const noLengths = buildComponents({ ...spec, lengths: null });
    assert.deepEqual(noLengths.components[6].variants, [`gid://shopify/ProductVariant/${w.builder.id}`]);
});

test('build_variant_recipe follows the contract; the shared product recipe has no hubs, spacing or freehub', () => {
    const w = makeHubWorld(); const { f15, r148 } = hubIds(w, 'Industry Nine Hydra2');
    const fit = evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: f15, rearProduct: r148 });
    const r = buildVariantRecipe({ hubModel: 'Industry Nine Hydra2', labels: fit.labels, ruleName: 'R', holes: '32', defaultColour: 'Black', front: fit.front, rear: fit.rear, colours: fit.colours, freehubs: [{ key: 'XD', label: 'SRAM XD', gid: w.fh.XD.gid }] });
    assert.deepEqual(Object.keys(r), ['v', 'hubModel', 'spacing', 'brakeStyle', 'ruleName', 'rows', 'frontHub', 'rearHub', 'hubColors', 'freehubs', 'freehubVariantMap']);
    assert.equal(r.brakeStyle, '6-Bolt'); assert.equal(r.rows[0].value, 'Industry Nine Hydra2, 6-Bolt, 15x110, 32h, Black'); assert.equal(r.rows[1].value, 'Industry Nine Hydra2, 6-Bolt, 12x148, 32h, Black');
    assert.deepEqual(r.freehubs, ['SRAM XD']); assert.equal(r.freehubVariantMap['SRAM XD'], w.fh.XD.gid); assert.equal(typeof r.frontHub.productId, 'number');
    assert.ok(JSON.stringify(r).length < 2500);
    const shared = buildSharedRecipe({ ridingStyle: 'mtb', specs: { frontWheelSize: '29"', rearWheelSize: '27.5"', spokeCount: '32' }, rims: { front: '1', rear: '2' }, spokes: '3', nipples: '4', useSentence: 'MTB' });
    assert.deepEqual(Object.keys(shared.parts), ['frontRim', 'rearRim', 'frontSpokes', 'rearSpokes', 'frontNipples', 'rearNipples']);
    assert.equal(shared.specs.brakeStyle, '6-Bolt'); assert.equal(shared.specs.frontHubSpacing, undefined); assert.equal(shared.freehub, undefined);
    assert.equal(spacingValue(SPACINGS[2]), '20x110mm Boost / 12x157mm SuperBoost'); assert.equal(spacingValue(SPACINGS[3]), '20x110mm Boost / 12x157mm DH'); assert.equal(SPACINGS.length, 4);
});
