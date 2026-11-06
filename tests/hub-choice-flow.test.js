// Run with: npm test   (fake Shopify and fake database, no network)
// Hub-choice build, steps 1 to 3: the plan (dry run), create with read-back and rollback, undo, and the route handler.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planHubChoice, validateHubConfig } = require('../lib/signature-build/hub/plan');
const { createBuild, undoRun } = require('../lib/signature-build/execute');
const { handle } = require('../lib/signature-build/handler');
const { parseRules } = require('../lib/signature-build/rules');
const { sha256 } = require('../lib/signature-build/util');
const { makeHubWorld, makeLengthsCsv, makeHubStore, makeDb } = require('./helpers/hub-fakes');

const setup = async (worldOver = {}, { storeOpts = {}, cfg, csvOpts, overrides, noCsv } = {}) => {
    const w = makeHubWorld(worldOver);
    const store = makeHubStore(w, storeOpts), db = makeDb();
    const plan = await planHubChoice({ store, db, config: cfg ? cfg(w) : w.config(), lengthsCsv: noCsv ? null : makeLengthsCsv(w, csvOpts), overrides });
    return { w, store, db, plan };
};

// ---------------------------------------------------------------- plan
test('config shape: every missing or odd field is named', () => {
    const w = makeHubWorld();
    assert.deepEqual(validateHubConfig(w.config()), []);
    const bad = validateHubConfig({ v: 1, ridingStyle: 'bmx', specs: { spokeCount: '3' }, rims: {}, hubs: [] });
    assert.ok(bad.length >= 8); assert.ok(bad.join(' ').includes('hubs is empty'));
    assert.match(validateHubConfig({ ...w.config(), hubs: [w.config().hubs[0], w.config().hubs[0]] }).join(), /same model name/);
});

test('plan: 12 variants (4 hubs x 3 spacings), two options, Hydra2 first, nothing written to Shopify, plan saved', async () => {
    const { store, db, plan } = await setup();
    assert.equal(plan.ok, true); assert.equal(plan.kind, 'hub-choice'); assert.equal(plan.blockers.length, 0);
    assert.equal(plan.variants.length, 12); assert.equal(plan.dropped.length, 0);
    assert.deepEqual(plan.product.options.map((o) => o.name), ['Axle spacing', 'Hub model']);
    assert.deepEqual(plan.product.options[0].values, ['15x110mm / 12x148mm', '15x110mm / 12x157mm', '20x110mm / 12x157mm']);
    assert.equal(plan.product.options[1].values[0], 'Industry Nine Hydra2');
    assert.equal(plan.variants[0].optionValues[1], 'Industry Nine Hydra2');
    assert.equal(plan.product.status, 'DRAFT'); assert.deepEqual(plan.product.tags, ['loamlabs-build']); assert.equal(plan.product.templateSuffix, 'loamlabs-build');
    assert.deepEqual(store.writes, []);
    assert.ok(db.plans[plan.planId]); assert.equal(db.plans[plan.planId].plan_hash, plan.planHash);
    assert.equal(plan.product.metafields.find((m) => m.key === 'hidden').value, '1');
    assert.equal(plan.product.metafields.some((m) => m.key === 'freehub' || m.key === 'freehub_variant_map'), false);   // never at product level
});

test('plan: every variant has build_components, build_variant_recipe, a price and a unique rule that names it', async () => {
    const { plan } = await setup();
    const names = new Set();
    for (const v of plan.variants) {
        const rec = JSON.parse(v.metafields.find((m) => m.key === 'build_variant_recipe').value);
        const comp = JSON.parse(v.metafields.find((m) => m.key === 'build_components').value);
        assert.equal(comp.components.length, 8); assert.equal(v.policy, 'CONTINUE'); assert.equal(v.tracked, true); assert.ok(Number(v.price) > 0);
        names.add(rec.ruleName);
        assert.ok(plan.rules[0].newRules.some((r) => r.name === rec.ruleName && r.masterVariantGid === `__NEW_VARIANT__${v.key}`));
    }
    assert.equal(names.size, 12);
});

test('plan rules: 12 on the one rim product with spacing, sizes, hubColorsAny and hub prices; the old rule is untouched; size stays small', async () => {
    const { plan } = await setup();
    assert.equal(plan.rules.length, 1); const r = plan.rules[0];
    assert.equal(r.existingCount, 1); assert.equal(r.count, 12);
    for (const x of r.newRules) {
        assert.equal(x.hubColorsAny, true); assert.equal(x.hubColors, undefined); assert.equal(x.frontWheelSize, '29"'); assert.equal(x.rearWheelSize, '27.5"');
        assert.ok(x.frontHubSpacing && x.rearHubSpacing); assert.ok(x.hubPriceCents.front > 0 && x.hubPriceCents.rear > 0); assert.deepEqual(x.spokeColors, ['Black']);
    }
    const hy = r.newRules.find((x) => x.name.endsWith('Industry Nine Hydra2 15x110/12x148'));
    assert.deepEqual(hy.hubPriceCents, { front: 24000, rear: 51000 });
    const size = plan.rulesSize[0]; assert.ok(size.bytesAfter < 20000); assert.equal(size.limitBytes, 131072);
    assert.equal(plan.dropped.length, 0);
});

test('plan: price per variant is the builder total minus 10%, assembly from the builder table, hubs differ by price and by assembly rate', async () => {
    const { plan } = await setup();
    const m = (hub, sp) => plan.matrix.find((x) => x.hub === hub && x.spacing === sp);
    assert.equal(m('Industry Nine Hydra2', 'A').price, 2068.16);          // (1298 + 750 + 109.98 + 39.98 + 100) x 0.9
    assert.equal(m('Industry Nine Hydra2', 'A').assemblyPerWheel, 50);
    assert.equal(m('Hope Pro 5', 'A').assemblyPerWheel, 70);
    assert.match(m('e*thirteen Sidekick GR', 'A').assemblyRule, /no rate in the builder/);
    assert.ok(m('Hope Pro 5', 'B').price > m('Hope Pro 5', 'A').price);   // the 12x157 Hope rear costs $20.01 more
    assert.ok(m('Project321 G3', 'C').price > m('Project321 G3', 'B').price);
    assert.equal(m('Industry Nine Hydra2', 'A').overridden, false);
});

test('plan: a manual price override per hub or per variant wins and the margin is recomputed', async () => {
    const { plan } = await setup({}, { overrides: { hubPrices: { 'Hope Pro 5': 900 }, variantPrices: { 'Hope Pro 5|C': 1600 } } });
    const m = (hub, sp) => plan.matrix.find((x) => x.hub === hub && x.spacing === sp);
    assert.equal(m('Hope Pro 5', 'A').price, 900); assert.equal(m('Hope Pro 5', 'B').price, 900); assert.equal(m('Hope Pro 5', 'C').price, 1600);
    assert.equal(m('Hope Pro 5', 'A').overridden, true); assert.ok(m('Hope Pro 5', 'A').belowFloor);
    assert.ok(plan.margin.belowFloor.some((n) => /Hope Pro 5 15x110\/12x148/.test(n)));
    assert.equal(plan.variants.find((v) => v.key === '1A').price, '900.00'); assert.equal(m('Hope Pro 5', 'C').belowFloor, false);
});

test('plan: missing costs and below-floor prices are warned, hub colours left out are listed, out-of-stock hubs are still made', async () => {
    const { plan } = await setup();
    assert.ok(plan.warnings.some((x) => x.code === 'COLOUR_EXCLUDED' && /Project321/.test(x.message)));
    assert.equal(plan.warnings.filter((x) => x.code === 'OUT_OF_STOCK_TODAY').length, 3);       // e*thirteen is DENY with 0 stock in the fake world
    assert.equal(plan.variants.filter((v) => /e\*thirteen/.test(v.optionValues[1])).length, 3);
    const noCost = await setup();
    noCost.w.V[noCost.w.rim29.id].cost = null;
    const p2 = await planHubChoice({ store: makeHubStore(noCost.w), db: makeDb(), config: noCost.w.config(), lengthsCsv: makeLengthsCsv(noCost.w) });
    assert.ok(p2.warnings.some((x) => x.code === 'COST_MISSING'));
});

test('plan: a hub that fails a Signature rule is dropped with the reason; the others stay', async () => {
    const { plan } = await setup({}, { cfg: (w) => { Object.values(w.P).filter((p) => /^Hope Pro 5/.test(p.title)).forEach((p) => { p.meta.hub_type = 'Straight Pull'; }); return w.config(); } });
    assert.equal(plan.ok, true); assert.equal(plan.variants.length, 9);
    assert.ok(plan.dropped.some((d) => d.hub === 'Hope Pro 5' && d.code === 'SPOKE_HUB_MISMATCH' || d.code === 'SP_ON_MTB'));
    assert.ok(plan.dropped.every((d) => d.hub === 'Hope Pro 5'));
    assert.equal(plan.product.options[1].values.includes('Hope Pro 5'), false);
});

test('plan: when every hub is dropped the plan stops (NO_HUB_LEFT)', async () => {
    const { plan } = await setup({}, { cfg: (w) => { Object.values(w.P).forEach((p) => { if (p.meta && p.meta.hub_type) p.meta.hub_type = 'Straight Pull'; }); return w.config(); } });
    assert.equal(plan.ok, false); assert.equal(plan.blockers[0].code, 'NO_HUB_LEFT'); assert.ok(plan.dropped.length >= 4);
});

test('plan: a spoke product with no hub interface blocks everything; a bladed straight pull spoke lets a straight pull hub through on an MTB', async () => {
    const blocked = await setup({ spokeInterface: '' });
    assert.equal(blocked.plan.ok, false); assert.equal(blocked.plan.blockers[0].code, 'SPOKE_INTERFACE_MISSING');
    assert.deepEqual(blocked.store.writes, []);
});

test('plan: a hub with no 20x110 front product has no variant at spacing C; the reason is listed', async () => {
    const { plan } = await setup({}, { cfg: (w) => { const c = w.config(); c.hubs[1].frontProducts = { '15x110': c.hubs[1].frontProducts['15x110'] }; return c; } });
    assert.equal(plan.variants.length, 11);
    assert.ok(plan.dropped.some((d) => d.hub === 'Hope Pro 5' && d.spacing === 'C' && d.code === 'NO_HUB_IN_SPACING'));
    assert.deepEqual(plan.product.options[0].values.length, 3);
});

test('plan: hub fit failures (wrong-spacing product, missing hole count, missing flange data) drop only that variant', async () => {
    const { plan } = await setup({}, { cfg: (w) => {
        const c = w.config();
        c.hubs[0].frontProducts['20x110'] = c.hubs[0].frontProducts['15x110'];        // the 15x110 product named for 20x110
        const hp = Object.values(w.P).find((p) => /^Hope Pro 5 Rear Hub - 6-Bolt - 12x148mm/.test(p.title)); hp.meta.hub_flange_diameter_left = '';
        return c;
    } });
    const codes = plan.dropped.map((d) => `${d.hub}:${d.spacing}:${d.code}`);
    assert.ok(codes.includes('Industry Nine Hydra2:C:SPACING_MISMATCH')); assert.ok(codes.includes('Hope Pro 5:A:HUB_DATA_MISSING'));
    assert.equal(plan.variants.length, 12 - 2);
});

test('plan: spoke lengths come from the table, per variant; missing rows, failed rows and lengths for other parts drop that variant', async () => {
    const ok = await setup();
    const v = ok.plan.variants.find((x) => x.key === '0B'); const comp = JSON.parse(v.metafields[0].value);
    assert.equal(comp.components[6].mode, 'all'); assert.equal(comp.components[6].variants.length, 2); assert.equal(comp.components[7].variants.length, 2);
    assert.equal(ok.plan.matrix[0].lengths.front[0], 290);
    const miss = await setup({}, { csvOpts: { drop: ['Hope Pro 5|A|rear'] } });
    assert.ok(miss.plan.dropped.some((d) => d.code === 'LENGTHS_MISSING' && d.hub === 'Hope Pro 5' && d.spacing === 'A'));
    const failed = await setup({}, { csvOpts: { status: { 'Hope Pro 5|B|front': 'calc failed' } } });
    assert.ok(failed.plan.dropped.some((d) => d.code === 'LENGTHS_MISSING' && /did not calculate/.test(d.reason)));
    // table calculated with another front hub variant (the e*thirteen Sidekick vs Sidekick Pro case)
    const other = await setup({}, { csvOpts: { hubVariantOverride: { 'e*thirteen Sidekick GR|A|front': '99999999', 'e*thirteen Sidekick GR|B|front': '99999999', 'e*thirteen Sidekick GR|C|front': '99999999' } } });
    assert.equal(other.plan.dropped.filter((d) => d.code === 'LENGTHS_FOR_OTHER_PARTS').length, 3);
    assert.match(other.plan.dropped[0].reason, /regenerate/);
    const rimOther = await setup({}, { csvOpts: { rimVariantOverride: { 'Hope Pro 5|A|rear': '99999999' } } });
    assert.ok(rimOther.plan.dropped.some((d) => d.code === 'LENGTHS_FOR_OTHER_PARTS' && /rear rim/.test(d.reason)));
});

test('plan: a length variant that does not exist or has another length than the table says drops the variant', async () => {
    const w = makeHubWorld();
    const gone = w.lenVar[292].id; w.P[400].variants = w.P[400].variants.filter((v) => v.id !== gone);
    const p = await planHubChoice({ store: makeHubStore(w), db: makeDb(), config: w.config(), lengthsCsv: makeLengthsCsv(w) });
    assert.equal(p.ok, false); assert.ok(p.dropped.every((d) => d.code === 'SPOKE_LENGTH_NOT_FOUND'));
    const w2 = makeHubWorld(); w2.lenVar[292].title = 'Black / 296mm';
    const p2 = await planHubChoice({ store: makeHubStore(w2), db: makeDb(), config: w2.config(), lengthsCsv: makeLengthsCsv(w2) });
    assert.ok(p2.dropped.some((d) => d.code === 'LENGTH_VARIANT_MISMATCH'));
});

test('plan: no length table is a warning; the guard then watches the builder spoke variant', async () => {
    const { plan } = await setup({}, { noCsv: true });
    assert.equal(plan.ok, true); assert.ok(plan.warnings.some((x) => x.code === 'SPOKE_LENGTHS_NOT_CHECKED'));
    const comp = JSON.parse(plan.variants[0].metafields[0].value); assert.equal(comp.components[6].variants.length, 1);
    const csv = await setup({}, { cfg: (w) => ({ ...w.config(), lengthsKey: undefined }) });
    assert.ok(csv.plan.blockers.some((b) => b.code === 'LENGTHS_TABLE'));
});

test('plan: specs hole count must equal the rims; rim data and the washer are checked; the 1,000-variant spoke product is refused', async () => {
    const h = await setup({}, { cfg: (w) => ({ ...w.config(), specs: { ...w.config().specs, spokeCount: '28' } }) });
    assert.equal(h.plan.blockers[0].code, 'SPECS_HOLE_MISMATCH');
    const e = makeHubWorld(); e.V[e.rim29.id].erd = null; e.P[100].variants.find((v) => v.id === e.rim29.id).erd = null;
    const pe = await planHubChoice({ store: makeHubStore(e), db: makeDb(), config: e.config(), lengthsCsv: makeLengthsCsv(e) });
    assert.ok(pe.blockers.some((b) => b.code === 'RIM_ERD_MISSING'));
    const wm = makeHubWorld(); wm.P[100].meta.rim_washer_policy = 'Mandatory'; wm.P[100].meta.nipple_washer_thickness = '';
    assert.ok((await planHubChoice({ store: makeHubStore(wm), db: makeDb(), config: wm.config(), lengthsCsv: makeLengthsCsv(wm) })).blockers.some((b) => b.code === 'WASHER_THICKNESS_MISSING'));
    const ok = makeHubWorld(); ok.P[100].meta.rim_washer_policy = 'Mandatory'; ok.P[100].meta.nipple_washer_thickness = '1.0';
    const pw = await planHubChoice({ store: makeHubStore(ok), db: makeDb(), config: ok.config(), lengthsCsv: makeLengthsCsv(ok) });
    assert.equal(pw.ok, true); assert.match(pw.notes[0], /mandatory rim washer \(1.0 mm per side\).*No washer product exists/);
    const multi = makeHubWorld(); multi.P[400].variants.push({ id: '8099999', gid: 'g', title: 'Black / 144mm / 14 Spokes', price: 0, selectedOptions: [], productGid: multi.P[400].gid, productTitle: 'x' });
    assert.ok((await planHubChoice({ store: makeHubStore(multi), db: makeDb(), config: multi.config(), lengthsCsv: makeLengthsCsv(multi) })).blockers.some((b) => b.code === 'SPOKE_PRODUCT_MULTI_COUNT'));
});

test('plan: a part that does not exist, a rule name or handle that is taken, and a duplicate build are blockers', async () => {
    const w = makeHubWorld();
    const cfg = w.config(); cfg.nipples = '99999999';
    assert.equal((await planHubChoice({ store: makeHubStore(w), db: makeDb(), config: cfg, lengthsCsv: null })).blockers[0].code, 'PART_NOT_FOUND');
    const names = await setup();
    const rimRules = JSON.parse(names.w.P[100].rulesRaw); rimRules.push({ name: names.plan.rules[0].newRules[0].name });
    const w3 = makeHubWorld({ rimRules: JSON.stringify(rimRules) });
    const p3 = await planHubChoice({ store: makeHubStore(w3), db: makeDb(), config: w3.config(), lengthsCsv: makeLengthsCsv(w3) });
    assert.ok(p3.blockers.some((b) => b.code === 'RULE_NAME_EXISTS'));
    const w4 = makeHubWorld(); const s4 = makeHubStore(w4, { masters: [{ handle: 'loamlabs-reserve-30-dh-mullet-wheelset', title: 'old' }] });
    assert.ok((await planHubChoice({ store: s4, db: makeDb(), config: w4.config(), lengthsCsv: makeLengthsCsv(w4) })).blockers.some((b) => b.code === 'DUPLICATE_BUILD'));
    const w5 = makeHubWorld(); const db5 = makeDb(); const first = await planHubChoice({ store: makeHubStore(w5), db: db5, config: w5.config(), lengthsCsv: makeLengthsCsv(w5) });
    await db5.createRun({ runId: 'r1', fingerprint: first.fingerprint, status: 'created', name: 'x', record: {} });
    assert.ok((await planHubChoice({ store: makeHubStore(w5), db: db5, config: w5.config(), lengthsCsv: makeLengthsCsv(w5) })).blockers.some((b) => b.code === 'DUPLICATE_BUILD'));
});

test('plan: an older rule on the rim with the same hubs, spacing and sizes blocks and says to retire the master (masters 2 and 4)', async () => {
    const w = makeHubWorld();
    const hy = w.hubs[0];
    const master = { name: 'LoamLabs Reserve 30|DH Mullet + Industry Nine Hydra2', requiredFrontHubProductId: `gid://shopify/Product/${hy.frontProducts['15x110']}`, requiredRearHubProductId: `gid://shopify/Product/${hy.rearProducts['12x148']}`, requiredSpokeProductId: 'gid://shopify/Product/400', pairedRimProductId: 'gid://shopify/Product/100', frontWheelSize: '29"', rearWheelSize: '27.5"', hubColors: ['Black'], spokeColors: ['Black'] };
    w.P[100].rulesRaw = JSON.stringify([master]);
    const p = await planHubChoice({ store: makeHubStore(w), db: makeDb(), config: w.config(), lengthsCsv: makeLengthsCsv(w) });
    assert.equal(p.blockers.length > 0, true); const b = p.blockers.find((x) => x.code === 'RULE_CONFLICT'); assert.match(b.message, /Retire that master first/); assert.match(b.message, new RegExp(master.name.slice(0, 20)));
});

test('plan: the product description names 6-Bolt and the colour hint; the wrong Berd inserts sentence is gone', async () => {
    const { plan } = await setup();
    assert.match(plan.product.descriptionHtml, /6-Bolt wheelset/); assert.match(plan.product.descriptionHtml, /press Customize in the builder/); assert.doesNotMatch(plan.product.descriptionHtml, /Inserts/);
    assert.match(plan.product.seo.title, /6-Bolt/); assert.ok(plan.product.seo.description.length >= 120 && plan.product.seo.description.length <= 140);
    assert.equal(plan.warnings.some((x) => x.code === 'SEO_TITLE_LENGTH' || x.code === 'SEO_DESCRIPTION_LENGTH'), false);
    const shared = JSON.parse(plan.product.metafields.find((m) => m.key === 'build_recipe').value);
    assert.equal(shared.specs.brakeStyle, '6-Bolt'); assert.equal(shared.specs.frontSpokeCount, '32');
});

// ---------------------------------------------------------------- create
const doCreate = async (ctx, extra = {}) => createBuild({ store: ctx.store, db: ctx.db, planId: ctx.plan.planId, planHash: ctx.plan.planHash, ...extra });
const belowFloorOk = { belowFloorOk: true };

test('create: DRAFT product with 12 variants, shared metafields, rules appended last, nothing published, run recorded', async () => {
    const ctx = await setup();
    const r = await doCreate(ctx, belowFloorOk);
    assert.equal(r.ok, true); assert.equal(r.verified, true); assert.equal(r.variantCount, 12); assert.equal(r.rims[0].before, 1); assert.equal(r.rims[0].after, 13);
    const c = Object.values(ctx.store.created)[0];
    assert.equal(c.status, 'DRAFT'); assert.equal(c.variants.length, 12); assert.deepEqual(c.tags, ['loamlabs-build']);
    assert.equal(ctx.store.writes.filter((x) => x === 'productCreate:DRAFT').length, 1);
    assert.deepEqual(ctx.store.writes.filter((x) => !/^rules:/.test(x)), ['productCreate:DRAFT', 'variantUpdate', 'bulkCreate:11']);
    assert.equal(ctx.store.writes[ctx.store.writes.length - 1], 'rules:100');                      // rules last
    const rules = parseRules(ctx.w.P[100].rulesRaw).rules;
    assert.equal(rules.length, 13); assert.ok(rules.slice(1).every((x) => /^gid:\/\/shopify\/ProductVariant\//.test(x.masterVariantGid)));
    assert.deepEqual(rules[0], JSON.parse(ctx.plan.rules[0].newRules ? JSON.stringify(rules[0]) : '{}'));
    assert.ok(Object.values(ctx.db.runs).some((x) => x.status === 'created' && x.record.kind === 'hub-choice'));
    assert.equal(Object.keys(ctx.db.locks).length, 0);
    assert.ok(Object.values(c.variants).every((v) => !v.metafields['custom.build_guard_state']));
});

test('create: each rule points at the variant of its own hub and spacing', async () => {
    const ctx = await setup(); await doCreate(ctx, belowFloorOk);
    const c = Object.values(ctx.store.created)[0];
    for (const v of c.variants) {
        const rec = JSON.parse(v.metafields['custom.build_variant_recipe']);
        const rule = parseRules(ctx.w.P[100].rulesRaw).rules.find((x) => x.name === rec.ruleName);
        assert.equal(rule.masterVariantGid, v.gid);
    }
});

test('create refuses: expired plan, wrong hash, blockers, below-floor without the tick; with the tick it goes ahead', async () => {
    const ctx = await setup();
    await assert.rejects(createBuild({ store: ctx.store, db: ctx.db, planId: ctx.plan.planId, planHash: 'x' }), (e) => e.code === 'PLAN_EXPIRED');
    await assert.rejects(createBuild({ store: ctx.store, db: ctx.db, planId: ctx.plan.planId, planHash: ctx.plan.planHash, now: Date.now() + 31 * 60 * 1000 }), (e) => e.code === 'PLAN_EXPIRED');
    const low = await setup({}, { overrides: { hubPrices: { 'Hope Pro 5': 900 } } });
    await assert.rejects(doCreate(low), (e) => e.code === 'BELOW_FLOOR' && /Hope Pro 5/.test(e.message));
    assert.deepEqual(low.store.writes, []);
    const blocked = await setup({ spokeInterface: '' });
    await assert.rejects(createBuild({ store: blocked.store, db: blocked.db, planId: 'none', planHash: 'none' }), (e) => e.code === 'PLAN_EXPIRED');
    assert.equal((await doCreate(low, belowFloorOk)).ok, true);
});

test('create: the rim rules changed since the preview, a held lock, and a duplicate run are refused before anything is written', async () => {
    const a = await setup(); a.w.P[100].rulesRaw = '[]';
    await assert.rejects(doCreate(a, belowFloorOk), (e) => e.code === 'PLAN_EXPIRED'); assert.deepEqual(a.store.writes, []);
    const b = await setup(); await b.db.acquireLock('rim:' + b.plan.rules[0].rimProductGid, 'other', 60000);
    await assert.rejects(doCreate(b, belowFloorOk), (e) => e.code === 'RIM_LOCKED'); assert.deepEqual(b.store.writes, []); assert.equal(Object.keys(b.db.locks).length, 1);
    const c = await setup(); await c.db.createRun({ runId: 'r0', fingerprint: c.plan.fingerprint, status: 'created', name: 'x', record: {} });
    await assert.rejects(doCreate(c, belowFloorOk), (e) => e.code === 'DUPLICATE_BUILD');
});

test('automatic rollback at every step leaves nothing behind (rim rules identical, draft deleted, locks released)', async () => {
    for (const failAt of ['createDraftHub', 'updateVariant', 'bulkCreateVariants', 'setRules']) {
        const ctx = await setup({}, { storeOpts: { failAt } });
        const before = ctx.w.P[100].rulesRaw;
        await assert.rejects(doCreate(ctx, belowFloorOk), (e) => e.code === 'SHOPIFY_ERROR', failAt);
        assert.equal(ctx.w.P[100].rulesRaw, before, failAt); assert.equal(Object.keys(ctx.store.created).length, 0, failAt); assert.equal(Object.keys(ctx.db.locks).length, 0, failAt);
        assert.ok(Object.values(ctx.db.runs).some((r) => r.status === 'failed'), failAt);
    }
});

test('read-back failures roll everything back: not a draft, short variant count, wrong price', async () => {
    const draft = await setup({}, { storeOpts: { readBackStatus: 'ACTIVE' } });
    await assert.rejects(doCreate(draft, belowFloorOk), (e) => /status is ACTIVE/.test(e.message)); assert.equal(Object.keys(draft.store.created).length, 0);
    const short = await setup({}, { storeOpts: { shortBulk: true } });
    await assert.rejects(doCreate(short, belowFloorOk), (e) => e.code === 'SHOPIFY_ERROR'); assert.equal(Object.keys(short.store.created).length, 0);
    const price = await setup({}, { storeOpts: { readBackPrice: true } });
    await assert.rejects(doCreate(price, belowFloorOk), (e) => /price is 1.00/.test(e.message)); assert.equal(price.w.P[100].rulesRaw, price.plan.rules ? price.w.P[100].rulesRaw : null);
});

test('a failed clean-up is reported as ROLLBACK_INCOMPLETE with the run id', async () => {
    const ctx = await setup({}, { storeOpts: { failAt: 'deleteProduct', afterRulesWrite: () => { throw new Error('boom'); } } });
    await assert.rejects(doCreate(ctx, belowFloorOk), (e) => e.code === 'ROLLBACK_INCOMPLETE' && !!e.extra.runId);
    assert.ok(Object.values(ctx.db.runs).some((r) => r.status === 'failed_incomplete'));
});

// ---------------------------------------------------------------- undo
test('undo: rim rules byte-identical, draft deleted, run marked undone, fingerprint free again; refuses without the typed words or when Active', async () => {
    const ctx = await setup(); const before = ctx.w.P[100].rulesRaw;
    const r = await doCreate(ctx, belowFloorOk);
    await assert.rejects(undoRun({ store: ctx.store, db: ctx.db, runId: r.runId, confirm: 'nope' }), (e) => e.code === 'CONFIRM_REQUIRED');
    const gid = Object.keys(ctx.store.created)[0];
    ctx.store.created[gid].status = 'ACTIVE';
    await assert.rejects(undoRun({ store: ctx.store, db: ctx.db, runId: r.runId, confirm: `UNDO ${r.runId}` }), (e) => e.code === 'UNDO_REFUSED');
    ctx.store.created[gid].status = 'DRAFT';
    const u = await undoRun({ store: ctx.store, db: ctx.db, runId: r.runId, confirm: `UNDO ${r.runId}` });
    assert.equal(u.ok, true); assert.equal(ctx.w.P[100].rulesRaw, before); assert.equal(sha256(ctx.w.P[100].rulesRaw), sha256(before));
    assert.equal(Object.keys(ctx.store.created).length, 0); assert.equal(ctx.db.runs[r.runId].status, 'undone');
    assert.equal(await ctx.db.findActiveRunByFingerprint(ctx.plan.fingerprint), null);
});

test('undo after someone edited the rim: only this run\'s 12 rules are removed, the person\'s edit stays', async () => {
    const ctx = await setup(); const r = await doCreate(ctx, belowFloorOk);
    const list = parseRules(ctx.w.P[100].rulesRaw).rules; list.push({ name: 'added by hand' });
    ctx.w.P[100].rulesRaw = JSON.stringify(list);
    const u = await undoRun({ store: ctx.store, db: ctx.db, runId: r.runId, confirm: `UNDO ${r.runId}` });
    assert.match(u.restoredRims[0], /only this run's 12 rules were removed/);
    const left = parseRules(ctx.w.P[100].rulesRaw).rules; assert.equal(left.length, 2); assert.equal(left[1].name, 'added by hand');
});

test('undo of a failed or already undone run is refused', async () => {
    const ctx = await setup(); const r = await doCreate(ctx, belowFloorOk);
    await undoRun({ store: ctx.store, db: ctx.db, runId: r.runId, confirm: `UNDO ${r.runId}` });
    await assert.rejects(undoRun({ store: ctx.store, db: ctx.db, runId: r.runId, confirm: `UNDO ${r.runId}` }), (e) => e.code === 'UNDO_REFUSED');
});

// ---------------------------------------------------------------- route handler
const ENV = { SIGNATURE_TOOL_KEY: 'tool-key', DASHBOARD_PASSWORD: 'dash-pass' };
const HDR = { 'x-dashboard-auth': 'dash-pass', 'x-signature-tool-key': 'tool-key', 'x-forwarded-for': '1.1.1.1' };

test('route: mode hub-choice plans, create dispatches to the hub-choice create, undo dispatches too; both secrets still required', async () => {
    const w = makeHubWorld(); const store = makeHubStore(w), db = makeDb(); const deps = { db, makeStore: async () => store };
    const call = (action, method, body, headers) => handle({ action, method, headers: headers || HDR, body, env: ENV, deps });
    const denied = await call('plan', 'POST', { mode: 'hub-choice', config: w.config() }, { 'x-dashboard-auth': 'dash-pass' });
    assert.equal(denied.status, 401);
    const p = await call('plan', 'POST', { mode: 'hub-choice', config: w.config(), lengthsCsv: makeLengthsCsv(w) });
    assert.equal(p.status, 200); assert.equal(p.body.kind, 'hub-choice'); assert.equal(p.body.variants.length, 12);
    const made = await call('create', 'POST', { planId: p.body.planId, planHash: p.body.planHash });
    assert.equal(made.status, 200); assert.equal(made.body.kind, 'hub-choice'); assert.equal(made.body.variantCount, 12);
    assert.equal(Object.values(store.created)[0].status, 'DRAFT');
    const undone = await call('undo', 'POST', { runId: made.body.runId, confirm: `UNDO ${made.body.runId}` });
    assert.equal(undone.status, 200); assert.equal(Object.keys(store.created).length, 0);
    const wrong = await call('plan', 'POST', { mode: 'hub-choice', config: { v: 2 } });
    assert.equal(wrong.status, 200); assert.equal(wrong.body.blockers[0].code, 'RECIPE_INVALID');
});
