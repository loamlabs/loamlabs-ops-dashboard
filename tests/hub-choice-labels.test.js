// Run with: npm test   (no network)
// Hub-choice stage 2 prep: the builder's exact Step 2 spacing labels (contract resolution 1), the three freehub names (resolution 2), the washer text
// (resolution 8) and the assembly table check (resolution 11).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { planHubChoice } = require('../lib/signature-build/hub/plan');
const { evaluateHubCombo, spacingLabel, numericSpacing } = require('../lib/signature-build/hub/fit');
const { ASSEMBLY, BUILDER_SPACING_LABELS, FREEHUB_LABELS, SPACINGS } = require('../lib/signature-build/hub/constants');
const { assemblyPerWheel } = require('../lib/signature-build/hub/pricing');
const { makeHubWorld, makeLengthsCsv, makeHubStore, makeDb } = require('./helpers/hub-fakes');

const run = async (mut) => {
    const w = makeHubWorld(); if (mut) mut(w);
    return { w, plan: await planHubChoice({ store: makeHubStore(w), db: makeDb(), config: w.config(), lengthsCsv: makeLengthsCsv(w) }) };
};
const productsOf = (w, model) => { const h = w.hubs.find((x) => x.model === model); return { f15: w.P[h.frontProducts['15x110']], f20: w.P[h.frontProducts['20x110']], r148: w.P[h.rearProducts['12x148']], r157: w.P[h.rearProducts['12x157']] }; };
const setLabel = (P, label) => P.variants.forEach((v) => { v.spacing = label; });

test('label numbers: any store label reduces to its axle numbers', () => {
    assert.equal(numericSpacing('12x157mm (SuperBoost)'), '12x157'); assert.equal(numericSpacing('20x110mm (Boost)'), '20x110'); assert.equal(numericSpacing('15x110mm'), '15x110');
    assert.equal(numericSpacing(null), null); assert.equal(numericSpacing('boost'), null);
    assert.deepEqual(BUILDER_SPACING_LABELS.front.slice(0, 2), ['15x110mm', '20x110mm (Boost)']); assert.ok(BUILDER_SPACING_LABELS.rear.includes('12x157mm (DH)'));
});

test('labels: the rule and the variant recipe carry the EXACT builder label the store gives, per spacing and side', async () => {
    const { plan } = await run();
    const want = { A: ['15x110mm', '12x148mm (Boost)'], B: ['15x110mm', '12x157mm (SuperBoost)'], C: ['20x110mm (Boost)', '12x157mm (SuperBoost)'] };
    for (const x of plan.matrix) assert.deepEqual([x.labels.front, x.labels.rear], want[x.spacing], x.hub + x.spacing);
    for (const r of plan.rules[0].newRules) {
        const key = r.name.slice(-3) === '148' ? 'A' : (r.frontHubSpacing === '20x110mm (Boost)' ? 'C' : 'B');
        assert.deepEqual([r.frontHubSpacing, r.rearHubSpacing], want[key], r.name);
    }
    for (const v of plan.variants) { const rec = JSON.parse(v.metafields[1].value); assert.ok(BUILDER_SPACING_LABELS.front.includes(rec.spacing.front) && BUILDER_SPACING_LABELS.rear.includes(rec.spacing.rear)); }
    assert.deepEqual(plan.product.options[0].values, ['15x110mm / 12x148mm', '15x110mm / 12x157mm', '20x110mm / 12x157mm']);   // the option text stays human and identical for every hub
});

test('labels: the recipe rows show the numbers only, the labels sit in the spacing field', async () => {
    const { plan } = await run();
    const rec = JSON.parse(plan.variants.find((v) => v.key === '0C').metafields[1].value);
    assert.equal(rec.spacing.front, '20x110mm (Boost)'); assert.equal(rec.rows[0].value, 'Industry Nine Hydra2, 6-Bolt, 20x110, 32h, Black'); assert.equal(rec.rows[1].value, 'Industry Nine Hydra2, 6-Bolt, 12x157, 32h, Black');
});

test('labels: each rule carries its OWN hub\'s label; two hubs labelling one spacing differently is reported, not guessed', async () => {
    const { w, plan } = await run((w) => { const p = productsOf(w, 'Hope Pro 5'); setLabel(p.r157, '12x157mm (DH)'); });
    assert.ok(plan.warnings.some((x) => x.code === 'SPACING_LABEL_HUBS_DIFFER' && /Spacing B/.test(x.message) && /12x157mm \(DH\)/.test(x.message) && /12x157mm \(SuperBoost\)/.test(x.message)));
    const hope = plan.rules[0].newRules.find((r) => r.name.endsWith('Hope Pro 5 15x110/12x157'));
    assert.equal(hope.rearHubSpacing, '12x157mm (DH)');
    const hydra = plan.rules[0].newRules.find((r) => r.name.endsWith('Industry Nine Hydra2 15x110/12x157'));
    assert.equal(hydra.rearHubSpacing, '12x157mm (SuperBoost)');
    assert.ok(w);
});

test('labels: a variant with no label, an unknown label, and colour variants that differ from their siblings', () => {
    const w = makeHubWorld(); const p = productsOf(w, 'Hope Pro 5');
    // no label on any usable variant: no variant can be made
    const none = JSON.parse(JSON.stringify(p.r148)); none.variants.forEach((v) => { v.spacing = null; });
    const ev = evaluateHubCombo({ spacing: SPACINGS[0], holes: '32', frontProduct: p.f15, rearProduct: none });
    assert.equal(ev.ok, false);                                                      // the title still proves it is the 12x148 product, but there is no label to write
    assert.equal(ev.reasons[0].code, 'SPACING_LABEL_MISSING');
    const sl = spacingLabel('rear', none.variants.filter((v) => /32h/.test(v.title)), none.variants.find((v) => /32h/.test(v.title)));
    assert.equal(sl.bad.code, 'SPACING_LABEL_MISSING');
    // an unknown label
    const odd = spacingLabel('rear', [{ spacing: '12x148mm Boost' }], { spacing: '12x148mm Boost' });
    assert.equal(odd.bad.code, 'SPACING_LABEL_UNKNOWN'); assert.match(odd.bad.message, /12x148mm \(Boost\)/);
    // siblings that differ: reported, default colour's label used
    const sib = spacingLabel('front', [{ spacing: '15x110mm' }, { spacing: '15x100mm' }, { spacing: null }], { spacing: '15x110mm' });
    assert.equal(sib.label, '15x110mm'); assert.deepEqual(sib.notes.map((n) => n.code).sort(), ['SPACING_LABEL_SIBLINGS_DIFFER', 'SPACING_LABEL_VARIANT_EMPTY']);
    assert.equal(sib.bad, null);
});

test('labels: plan drops a variant whose hub has no usable label or an unknown one, and says why', async () => {
    const missing = await run((w) => { const p = productsOf(w, 'Hope Pro 5'); setLabel(p.r148, null); });
    assert.ok(missing.plan.dropped.some((d) => d.hub === 'Hope Pro 5' && d.spacing === 'A' && d.code === 'SPACING_LABEL_MISSING'));
    assert.equal(missing.plan.variants.length, 11);
    const unknown = await run((w) => { const p = productsOf(w, 'Project321 G3'); setLabel(p.f20, '20x110mm Boost'); });
    assert.ok(unknown.plan.dropped.some((d) => d.hub === 'Project321 G3' && d.spacing === 'C' && d.code === 'SPACING_LABEL_UNKNOWN'));
    const sib = await run((w) => { const p = productsOf(w, 'Industry Nine Hydra2'); p.f15.variants[4].spacing = '15x110mm (Foo)'; });   // a colour variant (not the default Black) with another label
    assert.ok(sib.plan.warnings.some((x) => x.code === 'SPACING_LABEL_SIBLINGS_DIFFER'));
    assert.equal(sib.plan.variants.length, 12);
});

test('labels: a product tagged or titled for another spacing than its variants is still judged by the variants', async () => {
    // Project321 G3 Boost front 20x110: its tags say 15x110 in the real store (wrong tag), its variants say 20x110mm (Boost): the variants win
    const { plan } = await run((w) => { const p = productsOf(w, 'Project321 G3'); p.f20.tags = ['15x110', '6-Bolt', 'Centerlock']; });
    assert.equal(plan.variants.length, 12); assert.equal(plan.dropped.length, 0);
});

test('freehub names: only SRAM XD, Shimano HG and Shimano MicroSpline are offered; XD-R, HG-R and N3W never', async () => {
    const { plan } = await run((w) => {
        const h = w.hubs.find((x) => x.model === 'Project321 G3');
        [w.P[h.rearProducts['12x148']], w.P[h.rearProducts['12x157']]].forEach((P) => { P.freehub = ['XD', 'HG', 'MS', 'XD-R', 'HG-R', 'Campy N3W']; P.freehubMap = { ...P.freehubMap, 'XD-R': 'gid://shopify/ProductVariant/1', 'HG-R': 'gid://shopify/ProductVariant/2' }; });
    });
    assert.deepEqual(FREEHUB_LABELS, { XD: 'SRAM XD', HG: 'Shimano HG', MS: 'Shimano MicroSpline' });
    const v = plan.variants.find((x) => x.key === '2A'); const rec = JSON.parse(v.metafields[1].value);
    assert.deepEqual(rec.freehubs, ['SRAM XD', 'Shimano HG', 'Shimano MicroSpline']); assert.deepEqual(Object.keys(rec.freehubVariantMap), rec.freehubs);
    const comp = JSON.parse(v.metafields[0].value); assert.equal(comp.components.find((c) => c.role === 'freehub').variants.length, 3);
    assert.equal(plan.warnings.some((x) => x.code === 'FREEHUB_MAP_MISSING'), false);                 // the not-offered bodies are not a problem
});

test('freehub names: an offered body with no variant in the hub map is warned about and left out', async () => {
    const { plan } = await run((w) => { const h = w.hubs.find((x) => x.model === 'Hope Pro 5'); delete w.P[h.rearProducts['12x148']].freehubMap.MS; });
    assert.ok(plan.warnings.some((x) => x.code === 'FREEHUB_MAP_MISSING' && /Hope Pro 5 at 15x110\/12x148/.test(x.message)));
    assert.deepEqual(JSON.parse(plan.variants.find((v) => v.key === '1A').metafields[1].value).freehubs, ['SRAM XD', 'Shimano HG']);
});

test('washer: a mandatory washer is stated in the plan note and the page description; nothing priced is added', async () => {
    const { plan } = await run((w) => { w.P[100].meta.rim_washer_policy = 'Mandatory'; w.P[100].meta.nipple_washer_thickness = '1.0'; });
    assert.match(plan.notes[0], /free stock, included in the build price/);
    assert.match(plan.product.descriptionHtml, /rim washer under each nipple\. The washers are included in the build price/);
    const none = await run();
    assert.equal(none.plan.notes.length, 0); assert.doesNotMatch(none.plan.product.descriptionHtml, /washer/);
    assert.match(none.plan.product.descriptionHtml, /Laced with Sapim Race J-bend spokes in black and Sapim Brass Nipples in black/);
});

// ---------------------------------------------------------------- the copied assembly table against the theme file (resolution 11)
const THEMES = [process.env.HUB_THEME_FILE, ...['theme-dev-r16', 'theme-dev-r15', 'theme-dev-r14'].map((d) => path.join(__dirname, '..', '..', '..', 'loamlabs-system-builder', d, 'assets', 'variant-builder.js'))].filter(Boolean);
const THEME = THEMES.find((f) => fs.existsSync(f));
const readMap = (text, name) => {
    const m = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`).exec(text);
    const out = {};
    for (const x of m[1].matchAll(/'([^']+)':\s*ASSEMBLY_SERVICE_VARIANT_IDS_MAP\['(\d+\.\d\d)'\]/g)) out[x[1]] = Number(x[2]);
    return out;
};
test('the copied assembly constants equal the theme file (hub rates, rim rates, default)', { skip: !THEME && 'no theme file on this machine (set HUB_THEME_FILE)' }, () => {
    const text = fs.readFileSync(THEME, 'utf8');
    assert.deepEqual(ASSEMBLY.hub, readMap(text, 'HUB_VENDOR_TO_ASSEMBLY_VARIANT_GID_MAP'), 'hub table drifted from ' + THEME);
    assert.deepEqual(ASSEMBLY.rim, readMap(text, 'RIM_VENDOR_TO_ASSEMBLY_VARIANT_GID_MAP'), 'rim table drifted from ' + THEME);
    assert.equal(ASSEMBLY.default, Number(/DEFAULT_ASSEMBLY_SERVICE_VARIANT_GID = ASSEMBLY_SERVICE_VARIANT_IDS_MAP\['(\d+\.\d\d)'\]/.exec(text)[1]));
});

test('assembly rule as the theme states it: higher of hub and rim, else the one that exists, else the default', () => {
    assert.equal(assemblyPerWheel('Hope', 'Reserve').fee, 70); assert.equal(assemblyPerWheel('Industry Nine', 'Reserve').fee, 50);
    assert.equal(assemblyPerWheel('Onyx Racing', 'DT Swiss').fee, 80); assert.equal(assemblyPerWheel('Project321', 'DT Swiss').fee, 60);
    assert.equal(assemblyPerWheel('HOPE', 'reserve').fee, 70);                                   // vendor names are matched case-insensitively, like the theme
});
