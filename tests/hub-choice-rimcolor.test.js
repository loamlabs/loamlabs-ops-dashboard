// Run with: npm test   (fake Shopify and fake database, no network)
// Contract item 16: a rim with two or more orderable colors adds the third option "Rim color"; a rim with one color changes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planHubChoice } = require('../lib/signature-build/hub/plan');
const { createBuild, undoRun } = require('../lib/signature-build/execute');
const { conflicts } = require('../lib/signature-build/rules');
const { makeHubWorld, makeLengthsCsv, makeHubStore, makeDb } = require('./helpers/hub-fakes');

/** Adds Silver 29" and 27.5" 32h variants to the fake rim product (id 100), like the real FR 571 rim. */
const addSilver = (w, o = {}) => {
    const mk = (id, size, erd, extra) => {
        const base = size === '29"' ? w.rim29 : w.rim275;
        const v = { ...base, id: String(8900000 + id), gid: `gid://shopify/ProductVariant/${8900000 + id}`, title: `${size} / 32h / Silver`, price: o.price ?? base.price,
            selectedOptions: [{ name: 'Size', value: size }, { name: 'Spoke Count', value: '32h' }, { name: 'Color', value: 'Silver' }], erd, ...extra };
        w.V[v.id] = v; w.P[100].variants.push(v); return v;
    };
    const s29 = mk(1, '29"', o.erd29 ?? 599, o.s29 || {}), s275 = mk(2, '27.5"', o.erd275 ?? 558, o.s275 || {});
    return { s29, s275 };
};
const run = async (mut, { cfg } = {}) => {
    const w = makeHubWorld(); const silver = mut ? mut(w) : null;
    const store = makeHubStore(w), db = makeDb();
    const plan = await planHubChoice({ store, db, config: cfg ? cfg(w) : w.config(), lengthsCsv: makeLengthsCsv(w) });
    return { w, store, db, plan, silver };
};

test('one rim color: no third option, no rimColor anywhere, keys and names as before', async () => {
    const { plan } = await run();
    assert.equal(plan.product.options.length, 2); assert.equal(plan.variants.length, 12);
    assert.ok(plan.variants.every((v) => v.optionValues.length === 2));
    assert.ok(!JSON.stringify(plan).includes('rimColor')); assert.ok(!JSON.stringify(plan).includes('Rim color'));
    assert.ok(plan.matrix.every((m) => !('rimColor' in m))); assert.equal(plan.variants[0].key, '0A');
});

test('two orderable colors: third option Rim color (Black, Silver), 24 variants, rules and recipes carry rimColor, names unique, no rule conflicts', async () => {
    const { plan } = await run((w) => addSilver(w));
    assert.equal(plan.ok, true, JSON.stringify(plan.blockers));
    assert.deepEqual(plan.product.options.map((o) => o.name), ['Axle spacing', 'Hub model', 'Rim color']);
    assert.deepEqual(plan.product.options[2].values, ['Black', 'Silver']);
    assert.equal(plan.variants.length, 24); assert.ok(plan.variants.every((v) => v.optionValues.length === 3));
    assert.equal(new Set(plan.variants.map((v) => v.optionValues.join('|'))).size, 24);
    const rules = plan.rules[0].newRules; assert.equal(rules.length, 24); assert.equal(new Set(rules.map((r) => r.name)).size, 24);
    assert.ok(rules.every((r) => r.rimColor === 'Black' || r.rimColor === 'Silver'));
    assert.ok(rules.find((r) => /Hope Pro 5 15x110\/12x148 Silver$/.test(r.name)));
    const a = rules.find((r) => r.rimColor === 'Black'), b = { ...a, rimColor: 'Silver' };
    assert.equal(conflicts(a, b), false);                                  // different rim colors never match the same build
    assert.equal(conflicts(a, { ...a }), true); assert.equal(conflicts(a, { ...a, rimColor: undefined }), true);   // a rule without rimColor still matches any color
    const rec = JSON.parse(plan.variants.find((v) => v.optionValues[2] === 'Silver').metafields[1].value);
    assert.equal(rec.rimColor, 'Silver'); assert.ok(/^gid:/.test(rec.rimVariants.front) && /^gid:/.test(rec.rimVariants.rear));
    assert.ok(plan.matrix.every((m) => m.rimColor));
});

test('each variant carries its own rim variant ids in build_components; the price uses that color\'s rim prices', async () => {
    const { plan, silver, w } = await run((w) => addSilver(w, { price: 700 }));
    const pick = (color) => plan.variants.find((v) => v.optionValues[1] === 'Hope Pro 5' && v.optionValues[2] === color && /12x148/.test(v.optionValues[0]));
    const comp = (v) => JSON.parse(v.metafields[0].value).components;
    const black = comp(pick('Black')), sil = comp(pick('Silver'));
    assert.deepEqual(black.find((c) => c.role === 'front_rim').variants, [w.rim29.gid]); assert.deepEqual(black.find((c) => c.role === 'rear_rim').variants, [w.rim275.gid]);
    assert.deepEqual(sil.find((c) => c.role === 'front_rim').variants, [silver.s29.gid]); assert.deepEqual(sil.find((c) => c.role === 'rear_rim').variants, [silver.s275.gid]);
    const pb = Number(pick('Black').price), ps = Number(pick('Silver').price);
    assert.ok(Math.abs((ps - pb) - 2 * (700 - 649) * 0.9) < 0.02, `silver ${ps} black ${pb}`);   // two rims, 10% off
    const rec = JSON.parse(pick('Silver').metafields[1].value); assert.equal(rec.rimVariants.front, silver.s29.gid);
});

test('same price and cost: Black and Silver variants are priced the same; spoke lengths are the Black rows (same ERD)', async () => {
    const { plan } = await run((w) => addSilver(w));
    assert.equal(plan.dropped.length, 0);
    const a = plan.variants.find((v) => v.optionValues[1] === 'Industry Nine Hydra2' && v.optionValues[2] === 'Black' && /12x157mm SuperBoost$/.test(v.optionValues[0]));
    const b = plan.variants.find((v) => v.optionValues[1] === 'Industry Nine Hydra2' && v.optionValues[2] === 'Silver' && /12x157mm SuperBoost$/.test(v.optionValues[0]));
    assert.equal(a.price, b.price);
    const sp = (v) => JSON.stringify(JSON.parse(v.metafields[0].value).components.filter((c) => /spokes/.test(c.role)));
    assert.equal(sp(a), sp(b));
});

test('a color sold out today is kept (the guard switches it off); the other color stays; a warning names it', async () => {
    const { plan } = await run((w) => { const s = addSilver(w, { s275: { policy: 'CONTINUE', qty: 1 } }); w.rim275.policy = 'DENY'; w.rim275.qty = 0; return s; });
    assert.equal(plan.variants.length, 24);
    assert.ok(plan.warnings.some((x) => x.code === 'RIM_COLOUR_OUT_OF_STOCK_TODAY' && /Black/.test(x.message)));
    assert.ok(!plan.warnings.some((x) => x.code === 'RIM_OUT_OF_STOCK_TODAY'));
});

test('only one color orderable: no third option, behaves as a one-color rim', async () => {
    const { plan } = await run((w) => addSilver(w, { s29: { policy: 'DENY', qty: 0 }, s275: { policy: 'DENY', qty: 0 } }));
    assert.equal(plan.product.options.length, 2); assert.equal(plan.variants.length, 12); assert.ok(!JSON.stringify(plan).includes('rimColor'));
});

test('a color with a different ERD is left out with a warning (spoke lengths would not fit)', async () => {
    const { plan } = await run((w) => addSilver(w, { erd29: 601 }));
    assert.equal(plan.product.options.length, 2); assert.equal(plan.variants.length, 12);
    assert.ok(plan.warnings.some((x) => x.code === 'RIM_COLOUR_LEFT_OUT' && /Silver/.test(x.message)));
});

test('create, read-back and undo work with the third option; undo restores the rim rules byte for byte', async () => {
    const ctx = await run((w) => addSilver(w)); const before = ctx.w.P[100].rulesRaw;
    const r = await createBuild({ store: ctx.store, db: ctx.db, planId: ctx.plan.planId, planHash: ctx.plan.planHash, belowFloorOk: true });
    assert.equal(r.ok, true); assert.equal(r.variantCount, 24); assert.equal(r.verified, true);
    const created = Object.values(ctx.store.created)[0];
    assert.deepEqual(created.options.map((o) => o.name), ['Axle spacing', 'Hub model', 'Rim color']);
    assert.equal(created.variants.length, 24); assert.ok(created.variants.every((v) => v.options.length === 3));
    const u = await undoRun({ store: ctx.store, db: ctx.db, runId: r.runId, confirm: `UNDO ${r.runId}` });
    assert.equal(u.ok, true); assert.equal(ctx.w.P[100].rulesRaw, before); assert.equal(Object.keys(ctx.store.created).length, 0);
});

// ---------------------------------------------------------------- item 17: nipple condition, rule order, page data
test('17a every rule carries requiredNipplesProductId (the nipple PRODUCT), Reserve and FR alike', async () => {
    for (const mut of [null, (w) => addSilver(w)]) {
        const { plan, w } = await run(mut);
        const want = String(w.nip.productGid.split('/').pop());
        const rules = plan.rules[0].newRules;
        assert.ok(rules.length >= 12); assert.ok(rules.every((r) => r.requiredNipplesProductId === want), 'every rule has the field');
        assert.equal(typeof rules[0].requiredNipplesProductId, 'string');
    }
});

test('17b on the rim each Black rule is immediately followed by its Silver twin; rimColor is exactly Black / Silver; names end with the color', async () => {
    const { plan } = await run((w) => addSilver(w));
    const rules = plan.rules[0].newRules;
    for (let i = 0; i < rules.length; i += 2) {
        assert.equal(rules[i].rimColor, 'Black'); assert.equal(rules[i + 1].rimColor, 'Silver');
        assert.ok(rules[i].name.endsWith(' Black') && rules[i + 1].name.endsWith(' Silver'));
        assert.equal(rules[i].name.replace(/ Black$/, ''), rules[i + 1].name.replace(/ Silver$/, ''));           // twins: same hub and spacing
        assert.equal(rules[i].requiredFrontHubProductId, rules[i + 1].requiredFrontHubProductId);
    }
    assert.deepEqual([...new Set(rules.map((r) => r.rimColor))], ['Black', 'Silver']);
});

test('17c shared spec_table (rims, spokes, nipples, rotor mount) and per-variant spoke length rows; Reserve stays two options and 12 variants (fake world)', async () => {
    const { plan } = await run();
    const shared = JSON.parse(plan.product.metafields.find((m) => m.key === 'build_recipe').value);
    assert.deepEqual(shared.spec_table.map((r) => r[0]), ['Front Rim', 'Rear Rim', 'Spokes', 'Nipples', 'Rotor mount']);
    assert.equal(shared.spec_table[0][1], 'Reserve 30|DH Carbon Rim, 29", 32h, Black'); assert.equal(shared.spec_table[1][1], 'Reserve 30|DH Carbon Rim, 27.5", 32h, Black');
    assert.equal(shared.spec_table[2][1], 'Sapim Race J-bend, Black'); assert.equal(shared.spec_table[3][1], 'Sapim Brass Nipples, Black'); assert.equal(shared.spec_table[4][1], '6-Bolt');
    const rec = JSON.parse(plan.variants[0].metafields[1].value);
    assert.deepEqual(rec.rows.map((r) => r.label), ['Front Hub', 'Rear Hub', 'Front Spoke Length', 'Rear Spoke Length']);
    assert.match(rec.rows[2].value, /^\d{3} mm( left \/ \d{3} mm right)?$/);
    assert.equal(plan.product.options.length, 2); assert.equal(plan.variants.length, 12);
});

test('17c with two rim colors the shared table names no rim color (the page adds "Rim color" from the variant) and each variant has its own lengths', async () => {
    const { plan } = await run((w) => addSilver(w));
    const shared = JSON.parse(plan.product.metafields.find((m) => m.key === 'build_recipe').value);
    assert.equal(shared.spec_table[0][1], 'Reserve 30|DH Carbon Rim, 29", 32h'); assert.ok(!/Black|Silver/.test(JSON.stringify(shared.spec_table.slice(0, 2))));
    const s = JSON.parse(plan.variants.find((v) => v.optionValues[2] === 'Silver').metafields[1].value);
    assert.equal(s.rows.length, 4);
});

test('no length table: no spoke length rows (nothing invented)', async () => {
    const w = makeHubWorld();
    const plan = await planHubChoice({ store: makeHubStore(w), db: makeDb(), config: w.config() });
    const rec = JSON.parse(plan.variants[0].metafields[1].value);
    assert.deepEqual(rec.rows.map((r) => r.label), ['Front Hub', 'Rear Hub']);
});
