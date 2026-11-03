// Run with: npm test   (fake Shopify + in-memory database, no network, nothing real is touched)
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, makeStore, makeDb, sha, I } = require('./helpers/signature-fakes');
const { validateRecipe, encodeFragment, decodeFragment } = require('../lib/signature-build/recipe');
const { proposeName, derive } = require('../lib/signature-build/naming');
const { computePricing } = require('../lib/signature-build/pricing');
const { checkRule, appendRule, removeRule, parseRules } = require('../lib/signature-build/rules');
const { planBuild } = require('../lib/signature-build/plan');
const { createBuild, undoRun } = require('../lib/signature-build/execute');
const { checkAccess } = require('../lib/signature-build/auth');
const { handle } = require('../lib/signature-build/handler');

const codes = (list) => list.map((x) => x.code);
const setup = (over, storeOpts) => { const world = makeWorld(over); const store = makeStore(world, storeOpts); const db = makeDb(); return { world, store, db, recipe: world.recipe() }; };
const planOf = (s, overrides = {}, recipe) => planBuild({ store: s.store, db: s.db, recipe: recipe || s.recipe, overrides });
const make = async (s, overrides = {}, price = 2100.75) => { const plan = await planOf(s, overrides); return createBuild({ store: s.store, db: s.db, planId: plan.planId, planHash: plan.planHash, price }); };

// ---------- recipe / naming / pricing / rules ----------
test('recipe: fragment round-trips and validation catches the usual mistakes', () => {
  const { recipe } = setup();
  assert.deepEqual(decodeFragment('#r=' + encodeFragment(recipe)), recipe);
  assert.equal(validateRecipe(recipe).ok, true);
  const bad = { ...recipe, ridingStyle: 'gravel', specs: { ...recipe.specs, rearHubSpacing: '12x148mm' }, parts: { ...recipe.parts, frontRim: 12 } };
  const r = validateRecipe(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /ridingStyle/.test(e)) && r.errors.some((e) => /mm/.test(e)) && r.errors.some((e) => /frontRim/.test(e)));
  assert.equal(validateRecipe(null).ok, false);
});

test('naming: proposes the short name, builds title/handle/rule name, blocks the forbidden brand', () => {
  const p = proposeName({ frontRimTitle: 'Reserve 30|XC SL Carbon Rim', rearRimTitle: 'Reserve 30|XC SL Carbon Rim', frontHubTitle: 'DT Swiss 240 SP Front Hub - Centerlock - 15x110mm', spokeTitle: 'Sapim Laser Spokes - Straight Pull' });
  assert.equal(p.name, 'Reserve 30|XC SL + DT Swiss 240 SP');
  const d = derive(p.name);
  assert.equal(d.title, 'LoamLabs Reserve 30|XC SL + DT Swiss 240 SP Wheelset | Custom-built MTB/Gravel Wheels');
  assert.equal(d.handle, 'loamlabs-reserve-30-xc-sl-dt-swiss-240-sp-wheelset');
  assert.equal(d.ruleName, 'LoamLabs Reserve 30|XC SL + DT Swiss 240 SP');
  assert.equal(d.seoTitle, 'Reserve 30|XC SL + DT Swiss 240 SP Wheelset | LoamLabs');
  assert.ok(proposeName({ frontRimTitle: 'A Carbon Rim', rearRimTitle: 'B Carbon Rim', frontHubTitle: 'H Front Hub', spokeTitle: 'Berd PolyLight' }).name.endsWith('H Berd'));
  assert.equal(derive('We Are One Union + X').forbidden, true);
});

test('pricing: parts sum, floor, margin; missing costs are flagged; overrides are used', () => {
  const parts = [{ id: 'a', price: 100, cost: 50 }, { id: 'b', price: 200, cost: null }, { id: 'c', price: 0, cost: null }];
  const p = computePricing({ parts, price: 500, displayedTotal: 480, costOverrides: {} });
  assert.equal(p.partsSum, 300); assert.equal(p.costMissing, 1); assert.equal(p.incomplete, true); assert.equal(p.suggestedPrice, 480);
  const q = computePricing({ parts, price: 500, costOverrides: { b: 120 } });
  assert.equal(q.incomplete, false); assert.equal(q.partsCost, 170);
  assert.equal(q.floor, Math.round(((170 + 60 + 35) / 0.97) * 100) / 100);
  assert.equal(q.fees, 15); assert.equal(q.marginBeforeLabour, Math.round((500 - 170 - 35 - 15) * 100) / 100); assert.equal(q.marginAfterLabour, q.marginBeforeLabour - 60);
  assert.equal(computePricing({ parts, price: 100 }).belowFloor, true);
});

test('rules: conflict logic (same triple, colours, sizes), name clash, append never replaces, remove keeps the others', () => {
  const base = { name: 'N', pairedRimProductId: 'p1', requiredFrontHubProductId: 'f', requiredRearHubProductId: 'r', requiredSpokeProductId: 's', hubColors: ['Black'], spokeColors: ['Black'] };
  const e = { ...base, name: 'E' };
  assert.deepEqual(checkRule(base, [e]).conflicting, ['E']);
  assert.deepEqual(checkRule({ ...base, hubColors: ['Blue'] }, [e]).conflicting, []);
  assert.deepEqual(checkRule({ ...base, hubColors: [] }, [e]).conflicting, ['E']);                         // empty = every colour
  assert.deepEqual(checkRule({ ...base, frontWheelSize: '29"' }, [{ ...e, frontWheelSize: '27.5"' }]).conflicting, []);
  assert.deepEqual(checkRule({ ...base, frontWheelSize: '29"' }, [e]).conflicting, ['E']);                  // unset size matches anything
  assert.equal(checkRule(base, [{ ...e, name: 'N' }]).nameExists, true);
  assert.equal(checkRule(base, [{ name: 'old' }]).notComparable, 1);
  const raw = JSON.stringify([e, { name: 'old' }]);
  const next = appendRule(raw, { ...base, masterVariantGid: 'm' });
  assert.deepEqual(parseRules(next).rules.slice(0, 2), JSON.parse(raw));
  assert.equal(parseRules(next).rules.length, 3);
  assert.deepEqual(parseRules(removeRule(next, 'N', 'm')).rules, JSON.parse(raw));
  assert.equal(parseRules('{"a":1}').ok, false); assert.equal(parseRules('nope').ok, false); assert.deepEqual(parseRules(null).rules, []);
});

// ---------- plan (dry run) ----------
test('plan: happy path shows every write, is DRAFT, and writes nothing to the store', async () => {
  const s = setup();
  const plan = await planOf(s);
  assert.equal(plan.ok, true); assert.deepEqual(plan.blockers, []);
  assert.equal(plan.status, 'DRAFT');
  assert.equal(plan.product.status, 'DRAFT'); assert.deepEqual(plan.product.tags, ['loamlabs-build']); assert.equal(plan.product.templateSuffix, 'loamlabs-build');
  assert.equal(plan.product.vendor, 'LoamLabs'); assert.equal(plan.product.productType, 'LoamLabs Preconfigured Wheelset');
  assert.equal(plan.name, 'Reserve 30|HD + Onyx Vesper');
  assert.equal(plan.product.title, 'LoamLabs Reserve 30|HD + Onyx Vesper Wheelset | Custom-built MTB/Gravel Wheels');
  const mf = Object.fromEntries(plan.product.metafields.map((m) => [m.key, m]));
  assert.equal(mf.hidden.value, '1'); assert.equal(mf.hidden.namespace, 'seo');
  assert.deepEqual(JSON.parse(mf.build_recipe.value).parts, s.recipe.parts);
  assert.deepEqual(JSON.parse(mf.freehub.value), ['XD', 'HG']);                              // Campy has no map entry: dropped
  assert.ok(plan.warnings.some((w) => w.code === 'FREEHUB_MAP_MISSING'));
  const comps = JSON.parse(plan.variant.metafields[0].value);
  assert.deepEqual(comps.components.map((c) => c.role), ['front_rim', 'rear_rim', 'front_hub', 'rear_hub', 'freehub', 'nipples', 'spokes_front', 'spokes_rear']);
  const sf = comps.components.find((c) => c.role === 'spokes_front');
  assert.equal(sf.mode, 'all'); assert.equal(sf.variants.length, 2);                          // 296 + 298 both needed
  assert.equal(plan.variant.metafields.some((m) => m.key.startsWith('build_guard')), false);
  assert.equal(plan.rules.length, 1); assert.equal(plan.rules[0].existingCount, 1);
  assert.equal(plan.rules[0].newRule.valves, 'extra'); assert.equal(plan.rules[0].newRule.freehubLine, true);
  assert.equal(plan.rules[0].newRule.pairedRimProductId, 'gid://shopify/Product/100');          // both rims the same product: its own gid
  assert.equal(s.store.writes.length, 0);                                                      // dry run: no store writes
  assert.equal(Object.keys(s.db.runs).length, 0);
});

test('plan: colours. Hubs keep only colours at the same price; spokes only colours that exist and are in stock at every length', async () => {
  const s = setup();
  const plan = await planOf(s);
  assert.deepEqual(plan.colours.hub.offered.sort(), ['Black', 'Blue']);
  assert.ok(plan.colours.hub.excluded.some((c) => c.name === 'Gold'));
  assert.deepEqual(plan.colours.spoke.offered, ['Black']);
  const why = Object.fromEntries(plan.colours.spoke.excluded.map((c) => [c.name, c.reason]));
  assert.match(why.Silver, /out of stock at 298/); assert.match(why.Red, /no 298 mm length/);
  assert.ok(plan.colours.spoke.note);
  const r = plan.rules[0].newRule;
  assert.deepEqual(r.hubColors.sort(), ['Black', 'Blue']); assert.deepEqual(r.spokeColors, ['Black']);
  // hub groups list every offered colour as alternatives
  const comps = JSON.parse(plan.variant.metafields[0].value).components;
  assert.equal(comps.find((c) => c.role === 'front_hub').variants.length, 2); assert.equal(comps.find((c) => c.role === 'front_hub').mode, 'any');
  // unticking a colour and asking for one that is not allowed
  const less = await planOf(s, { hubColors: ['Black'] });
  assert.deepEqual(less.rules[0].newRule.hubColors, ['Black']);
  const bad = await planOf(s, { hubColors: ['Gold'] });
  assert.ok(codes(bad.blockers).includes('COLOUR_NOT_ALLOWED'));
});

test('plan: a spoke colour back in stock appears in the list', async () => {
  const s = setup();
  s.world.V[Object.values(s.world.V).find((v) => v.title === 'Silver / 298mm').id].qty = 3;
  assert.deepEqual((await planOf(s)).colours.spoke.offered.sort(), ['Black', 'Silver']);
});

test('plan: blockers (missing part, missing spoke length, missing freehub map, bad recipe)', async () => {
  const s = setup();
  const missing = await planOf(s, {}, s.world.recipe({ parts: { ...s.recipe.parts, frontHub: '999999999' } }));
  assert.equal(missing.ok, false); assert.ok(codes(missing.blockers).includes('PART_NOT_FOUND'));
  const len = await planOf(s, {}, s.world.recipe({ spokeLengths: { front: { left: 296, right: 301 }, rear: { left: 296, right: 298 } } }));
  assert.ok(codes(len.blockers).includes('SPOKE_LENGTH_NOT_FOUND'));
  const fh = await planOf(s, {}, s.world.recipe({ freehub: 'Campy' }));
  assert.ok(codes(fh.blockers).includes('FREEHUB_MAP_MISSING'));
  const bad = await planOf(s, {}, { v: 1 });
  assert.equal(bad.blockers[0].code, 'RECIPE_INVALID'); assert.match(bad.blockers[0].message, /incomplete or malformed/);
  assert.equal(s.store.writes.length, 0);
});

test('plan: rule conflict is a blocker; wheel sizes are added automatically when that separates the rules', async () => {
  const w = makeWorld();
  const triple = { pairedRimProductId: 'gid://shopify/Product/100', requiredFrontHubProductId: 'gid://shopify/Product/200', requiredRearHubProductId: 'gid://shopify/Product/300', requiredSpokeProductId: 'gid://shopify/Product/400', hubColors: ['Black'], spokeColors: ['Black'] };
  // existing rule for the same triple, no sizes: conflicts, and adding sizes does not help
  let s = setup({ rimRules: JSON.stringify([{ name: 'LoamLabs Other', ...triple }]) });
  let plan = await planOf(s);
  assert.ok(codes(plan.blockers).includes('RULE_CONFLICT')); assert.match(plan.blockers.find((b) => b.code === 'RULE_CONFLICT').message, /LoamLabs Other/);
  // existing rule has a different wheel size: adding ours separates them
  s = setup({ rimRules: JSON.stringify([{ name: 'LoamLabs Mullet', ...triple, frontWheelSize: '29"', rearWheelSize: '27.5"' }]) });
  plan = await planOf(s);
  assert.deepEqual(plan.blockers, []); assert.ok(plan.warnings.some((x) => x.code === 'WHEEL_SIZES_ADDED'));
  assert.equal(plan.rules[0].newRule.rearWheelSize, '29"');
  // same name
  s = setup({ rimRules: JSON.stringify([{ name: 'LoamLabs Reserve 30|HD + Onyx Vesper' }]) });
  assert.ok(codes((await planOf(s)).blockers).includes('RULE_NAME_EXISTS'));
  // unreadable rules
  s = setup({ rimRules: 'not json' });
  assert.ok(codes((await planOf(s)).blockers).includes('RIM_RULES_UNREADABLE'));
  // legacy rules are reported as not comparable, not silently passed
  assert.ok((await planOf(setup())).warnings.some((x) => x.code === 'LEGACY_RULES_NOT_COMPARABLE'));
  assert.ok(w);
});

test('plan: mullet gets one rule per rim product, pointing at each other', async () => {
  const s = setup();
  const r = s.world.recipe({ parts: { ...s.recipe.parts, rearRim: I(1011) }, specs: { ...s.recipe.specs, rearWheelSize: '27.5"' } });
  const plan = await planOf(s, {}, r);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.rules.length, 2);
  const byRim = Object.fromEntries(plan.rules.map((x) => [x.rimProductGid, x.newRule]));
  assert.equal(byRim['gid://shopify/Product/100'].pairedRimProductId, 'gid://shopify/Product/101');
  assert.equal(byRim['gid://shopify/Product/101'].pairedRimProductId, 'gid://shopify/Product/100');
  assert.ok(plan.warnings.some((x) => x.code === 'NAME_CHECK'));
  assert.ok(plan.warnings.some((x) => x.code === 'COST_MISSING'));
});

test('plan: duplicate protection by fingerprint, by existing master recipe and by handle', async () => {
  let s = setup();
  const first = await make(s);
  assert.equal(first.ok, true);
  const again = await planOf(s);
  assert.ok(codes(again.blockers).includes('DUPLICATE_BUILD'));
  s = setup({}, { masters: [{ productGid: 'g', handle: 'x', title: 'Existing', recipeRaw: JSON.stringify({ parts: setup().recipe.parts }) }] });
  assert.ok(codes((await planOf(s)).blockers).includes('DUPLICATE_BUILD'));
  s = setup({}, { masters: [{ productGid: 'g', handle: 'loamlabs-reserve-30-hd-onyx-vesper-wheelset', title: 'Same handle', recipeRaw: '{}' }] });
  assert.ok(codes((await planOf(s)).blockers).includes('DUPLICATE_BUILD'));
});

test('plan: name edits flow through; forbidden brand blocks; price override gives margin', async () => {
  const s = setup();
  const plan = await planOf(s, { name: 'Reserve 30|HD + Onyx Vesper Trail', price: 2000 });
  assert.match(plan.product.title, /Vesper Trail Wheelset/); assert.equal(plan.product.handle, 'loamlabs-reserve-30-hd-onyx-vesper-trail-wheelset');
  assert.equal(plan.rules[0].newRule.name, 'LoamLabs Reserve 30|HD + Onyx Vesper Trail');
  assert.equal(plan.margin.price, 2000); assert.equal(plan.suggestedPrice, 2100.75);
  assert.ok(codes((await planOf(s, { name: 'WAO Union + X' })).blockers).includes('NAME_FORBIDDEN'));
});

// ---------- create ----------
test('create: writes a DRAFT master and appends the rule; old rules identical; no guard state, no publish; locks released', async () => {
  const s = setup();
  const before = s.world.P[100].rulesRaw;
  const out = await make(s, {}, 2100.75);
  assert.equal(out.ok, true); assert.equal(out.verified, true);
  const prod = s.store.created[out.productId];
  assert.equal(prod.status, 'DRAFT'); assert.equal(prod.price, '2100.75'); assert.equal(prod.policy, 'CONTINUE'); assert.equal(prod.tracked, true);
  assert.equal(prod.variantMetafields['custom.build_guard_state'], undefined);
  assert.equal(s.store.writes.some((w) => /publish|ACTIVE|guard/i.test(w)), false);
  const rules = parseRules(s.world.P[100].rulesRaw).rules;
  assert.equal(rules.length, 2); assert.deepEqual(rules[0], JSON.parse(before)[0]);
  assert.equal(rules[1].masterVariantGid, out.variantId); assert.equal(rules[1].name, 'LoamLabs Reserve 30|HD + Onyx Vesper');
  assert.deepEqual(out.rims, [{ id: 'gid://shopify/Product/100', title: 'Reserve 30|HD Carbon Rim', before: 1, after: 2 }]);
  assert.equal(s.db.runs[out.runId].status, 'created'); assert.equal(s.db.runs[out.runId].record.rims[0].oldSha, sha(before));
  assert.deepEqual(s.db.locks, {});
  assert.deepEqual(s.store.writes.filter((w) => w.startsWith('rules')), ['rules:100']);
});

test('create: mullet appends one rule to each rim product, only after the master is verified', async () => {
  const s = setup();
  const r = s.world.recipe({ parts: { ...s.recipe.parts, rearRim: I(1011) }, specs: { ...s.recipe.specs, rearWheelSize: '27.5"' } });
  const plan = await planOf(s, {}, r);
  const out = await createBuild({ store: s.store, db: s.db, planId: plan.planId, planHash: plan.planHash, price: 2200 });
  assert.equal(out.rims.length, 2);
  assert.ok(s.store.writes.indexOf('productCreate:DRAFT') < s.store.writes.indexOf('rules:100'));
  assert.equal(parseRules(s.world.P[101].rulesRaw).rules.length, 1);
});

test('create: refuses without price, below the floor, with a wrong hash, an expired or blocked plan', async () => {
  const s = setup();
  const plan = await planOf(s);
  const go = (o) => createBuild({ store: s.store, db: s.db, planId: plan.planId, planHash: plan.planHash, price: 2100, ...o });
  await assert.rejects(go({ price: undefined }), (e) => e.code === 'PRICE_REQUIRED');
  await assert.rejects(go({ price: 1 }), (e) => e.code === 'BELOW_FLOOR');
  await assert.rejects(go({ planHash: 'x' }), (e) => e.code === 'PLAN_EXPIRED');
  await assert.rejects(go({ now: Date.now() + 31 * 60 * 1000 }), (e) => e.code === 'PLAN_EXPIRED');
  await assert.rejects(createBuild({ store: s.store, db: s.db, planId: 'nope', planHash: 'x', price: 1 }), (e) => e.code === 'PLAN_EXPIRED');
  assert.equal(s.store.writes.length, 0);
  const ok = await go({ price: 1, belowFloorOk: true });                                         // below floor only with the tick
  assert.equal(ok.ok, true);
  const s2 = setup({ rimRules: 'not json' });
  const blocked = await planOf(s2);
  await assert.rejects(createBuild({ store: s2.store, db: s2.db, planId: blocked.planId, planHash: blocked.planHash, price: 2100 }), (e) => e.code === 'RIM_RULES_UNREADABLE');
});

test('create: a second create of the same build is refused; a rim changed since the preview is refused', async () => {
  const s = setup();
  const p1 = await planOf(s), p2 = await planOf(s);
  await createBuild({ store: s.store, db: s.db, planId: p1.planId, planHash: p1.planHash, price: 2100 });
  await assert.rejects(createBuild({ store: s.store, db: s.db, planId: p2.planId, planHash: p2.planHash, price: 2100 }), (e) => e.code === 'DUPLICATE_BUILD');
  const s2 = setup();
  const p = await planOf(s2);
  s2.world.P[100].rulesRaw = JSON.stringify([{ name: 'someone else edited' }]);
  await assert.rejects(createBuild({ store: s2.store, db: s2.db, planId: p.planId, planHash: p.planHash, price: 2100 }), (e) => e.code === 'PLAN_EXPIRED' && /changed since the preview/.test(e.message));
  assert.equal(s2.store.writes.length, 0);
});

test('create: a held lock on the rim gives RIM_LOCKED and writes nothing', async () => {
  const s = setup();
  const plan = await planOf(s);
  await s.db.acquireLock('rim:gid://shopify/Product/100', 'someone', 60000);
  await assert.rejects(createBuild({ store: s.store, db: s.db, planId: plan.planId, planHash: plan.planHash, price: 2100 }), (e) => e.code === 'RIM_LOCKED' && e.status === 423);
  assert.equal(s.store.writes.length, 0);
  assert.equal(Object.keys(s.db.locks).length, 1);   // only the other holder's lock remains; ours were released
});

test('create: a failure after the draft exists deletes the draft and restores every rim (mullet, second rim fails)', async () => {
  const s = setup({}, { failAt: 'setRules:101' });
  const r = s.world.recipe({ parts: { ...s.recipe.parts, rearRim: I(1011) }, specs: { ...s.recipe.specs, rearWheelSize: '27.5"' } });
  const before1 = s.world.P[100].rulesRaw, before2 = s.world.P[101].rulesRaw;
  const plan = await planOf(s, {}, r);
  await assert.rejects(createBuild({ store: s.store, db: s.db, planId: plan.planId, planHash: plan.planHash, price: 2200 }), (e) => e.code === 'SHOPIFY_ERROR' && /Nothing was left behind/.test(e.message));
  assert.equal(s.world.P[100].rulesRaw, before1); assert.equal(s.world.P[101].rulesRaw, before2);   // byte-identical
  assert.deepEqual(s.store.created, {});
  assert.deepEqual(Object.values(s.db.runs).map((x) => x.status), ['failed']);
  assert.deepEqual(s.db.locks, {});
});

test('create: failure at each earlier step also leaves nothing behind', async () => {
  for (const failAt of ['createDraft', 'updateVariant']) {
    const s = setup({}, { failAt });
    const plan = await planOf(s);
    await assert.rejects(createBuild({ store: s.store, db: s.db, planId: plan.planId, planHash: plan.planHash, price: 2100 }), (e) => e.code === 'SHOPIFY_ERROR');
    assert.deepEqual(s.store.created, {}); assert.equal(parseRules(s.world.P[100].rulesRaw).rules.length, 1);
  }
  const s = setup({}, { readBackStatus: 'ACTIVE' });                                            // read-back catches a product that is not DRAFT
  const plan = await planOf(s);
  await assert.rejects(createBuild({ store: s.store, db: s.db, planId: plan.planId, planHash: plan.planHash, price: 2100 }), (e) => e.code === 'SHOPIFY_ERROR' && /status is ACTIVE/.test(e.message));
  assert.deepEqual(s.store.created, {});
});

test('create: if the clean-up itself fails the answer is ROLLBACK_INCOMPLETE with the run id', async () => {
  const s = setup({}, { failAt: 'deleteProduct' });
  s.store.updateVariant = async () => { throw new Error('boom'); };
  const plan = await planOf(s);
  await assert.rejects(createBuild({ store: s.store, db: s.db, planId: plan.planId, planHash: plan.planHash, price: 2100 }), (e) => e.code === 'ROLLBACK_INCOMPLETE' && !!e.extra.runId);
  assert.deepEqual(Object.values(s.db.runs).map((x) => x.status), ['failed_incomplete']);
});

// ---------- undo ----------
test('undo: restores the rim byte-identically and deletes the draft; the build can be created again', async () => {
  const s = setup();
  const before = s.world.P[100].rulesRaw;
  const out = await make(s);
  await assert.rejects(undoRun({ store: s.store, db: s.db, runId: out.runId, confirm: 'yes' }), (e) => e.code === 'CONFIRM_REQUIRED');
  const u = await undoRun({ store: s.store, db: s.db, runId: out.runId, confirm: `UNDO ${out.runId}` });
  assert.equal(u.ok, true); assert.equal(u.deletedProductId, out.productId);
  assert.equal(s.world.P[100].rulesRaw, before); assert.deepEqual(s.store.created, {});
  assert.equal(s.db.runs[out.runId].status, 'undone');
  await assert.rejects(undoRun({ store: s.store, db: s.db, runId: out.runId, confirm: `UNDO ${out.runId}` }), (e) => e.code === 'UNDO_REFUSED');
  assert.deepEqual((await planOf(s)).blockers, []);
});

test('undo: a rim that had no rules gets the metafield deleted; an Active product is refused', async () => {
  const s = setup({ rimRules: null });
  const out = await make(s);
  s.store.created[out.productId].status = 'ACTIVE';
  await assert.rejects(undoRun({ store: s.store, db: s.db, runId: out.runId, confirm: `UNDO ${out.runId}` }), (e) => e.code === 'UNDO_REFUSED' && /Draft/.test(e.message));
  s.store.created[out.productId].status = 'DRAFT';
  await undoRun({ store: s.store, db: s.db, runId: out.runId, confirm: `UNDO ${out.runId}` });
  assert.equal(s.world.P[100].rulesRaw, null);
});

test('undo: when someone edited the rim since, only this run\'s rule is removed', async () => {
  const s = setup();
  const out = await make(s);
  const rules = parseRules(s.world.P[100].rulesRaw).rules;
  s.world.P[100].rulesRaw = JSON.stringify([...rules, { name: 'added later by a person' }]);
  const u = await undoRun({ store: s.store, db: s.db, runId: out.runId, confirm: `UNDO ${out.runId}` });
  assert.match(u.restoredRims[0], /only this run's rule was removed/);
  assert.deepEqual(parseRules(s.world.P[100].rulesRaw).rules.map((r) => r.name), ['legacy rule', 'added later by a person']);
});

test('undo: a rim that cannot be restored keeps the product (nothing is deleted)', async () => {
  const s = setup();
  const out = await make(s);
  const orig = s.store.setRules; s.store.setRules = async () => { throw new Error('nope'); };
  await assert.rejects(undoRun({ store: s.store, db: s.db, runId: out.runId, confirm: `UNDO ${out.runId}` }), (e) => e.code === 'ROLLBACK_INCOMPLETE');
  s.store.setRules = orig;
  assert.ok(s.store.created[out.productId]);
});

// ---------- auth + handler ----------
const ENV = { SIGNATURE_TOOL_KEY: 'tool-key', DASHBOARD_PASSWORD: 'dash-pass' };
const H = (o = {}) => ({ 'x-dashboard-auth': 'dash-pass', 'x-signature-tool-key': 'tool-key', 'x-forwarded-for': '1.2.3.4', ...o });

test('auth: needs BOTH secrets; refuses when the tool key is not configured; locks out after 5 wrong tries', async () => {
  const db = makeDb();
  await assert.rejects(checkAccess({ headers: H(), env: { DASHBOARD_PASSWORD: 'dash-pass' }, db }), (e) => e.code === 'NOT_CONFIGURED' && e.status === 503);
  await checkAccess({ headers: H(), env: ENV, db });
  await assert.rejects(checkAccess({ headers: H({ 'x-signature-tool-key': undefined }), env: ENV, db }), (e) => e.code === 'UNAUTHORIZED');   // dashboard password alone is not enough
  await assert.rejects(checkAccess({ headers: H({ 'x-dashboard-auth': 'wrong' }), env: ENV, db }), (e) => e.code === 'UNAUTHORIZED');
  await assert.rejects(checkAccess({ headers: H({ 'x-dashboard-auth': '', 'x-signature-tool-key': '' }), env: { SIGNATURE_TOOL_KEY: '', DASHBOARD_PASSWORD: '' }, db }), (e) => e.code === 'NOT_CONFIGURED');
  for (let i = 0; i < 3; i++) await assert.rejects(checkAccess({ headers: H({ 'x-dashboard-auth': 'wrong' }), env: ENV, db }));
  await assert.rejects(checkAccess({ headers: H(), env: ENV, db }), (e) => e.code === 'LOCKED_OUT' && e.status === 429);                // even the right secrets are refused while locked
  await checkAccess({ headers: H({ 'x-forwarded-for': '9.9.9.9' }), env: ENV, db });                                                    // another address is unaffected
  await checkAccess({ headers: H(), env: ENV, db, now: Date.now() + 16 * 60 * 1000 });                                                  // lock ends after 15 minutes
});

test('handler: plan -> create -> runs -> undo through the route logic; wrong method and wrong secrets are refused', async () => {
  const s = setup();
  const deps = { db: s.db, makeStore: async () => s.store };
  const call = (action, method, body, headers) => handle({ action, method, headers: headers || H(), body, env: ENV, deps });
  assert.equal((await call('plan', 'GET', {})).status, 405);
  assert.equal((await call('plan', 'POST', {}, H({ 'x-signature-tool-key': 'x' }))).status, 401);
  const plan = await call('plan', 'POST', { recipe: s.recipe, overrides: {} });
  assert.equal(plan.status, 200); assert.equal(plan.body.ok, true);
  const noPrice = await call('create', 'POST', { planId: plan.body.planId, planHash: plan.body.planHash });
  assert.equal(noPrice.status, 400); assert.equal(noPrice.body.code, 'PRICE_REQUIRED'); assert.equal(noPrice.body.ok, false);
  const created = await call('create', 'POST', { planId: plan.body.planId, planHash: plan.body.planHash, price: 2100 });
  assert.equal(created.status, 200); assert.equal(created.body.verified, true);
  const runs = await call('runs', 'GET');
  assert.equal(runs.body.runs.length, 1);
  const undo = await call('undo', 'POST', { runId: created.body.runId, confirm: `UNDO ${created.body.runId}` });
  assert.equal(undo.status, 200);
  assert.equal((await call('create', 'POST', {})).body.code, 'PLAN_EXPIRED');
});

// ---------- Shopify adapter (fake gql): what it actually sends ----------
test('adapter: creates DRAFT only, never publishes, never writes guard state, never touches inventory; digest guards the rim write', async () => {
  const { createShopifyBuildStore } = require('../lib/signature-build/shopify');
  const sent = [];
  const gql = async (query, vars) => {
    sent.push({ query, vars });
    if (query.includes('productCreate')) return { productCreate: { product: { id: 'gid://shopify/Product/1', variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/2' } }] } }, userErrors: [] } };
    if (query.includes('productVariantsBulkUpdate')) return { productVariantsBulkUpdate: { userErrors: [] } };
    if (query.includes('metafieldsSet')) return { metafieldsSet: { userErrors: vars.m[0].compareDigest === 'stale' ? [{ message: 'digest mismatch' }] : [] } };
    if (query.includes('metafieldsDelete')) return { metafieldsDelete: { userErrors: [] } };
    if (query.includes('productDelete')) return { productDelete: { deletedProductId: vars.input.id, userErrors: [] } };
    if (query.includes('status')) return { product: { status: 'DRAFT' } };
    throw new Error('unexpected query ' + query.slice(0, 40));
  };
  const store = createShopifyBuildStore(gql);
  const plan = await planOf(setup());
  const made = await store.createDraft(plan.product);
  await store.updateVariant(made.productGid, made.variantGid, { price: '2100.00', policy: 'CONTINUE', tracked: true, metafields: plan.variant.metafields });
  await store.setRules('gid://shopify/Product/100', '[]', 'fresh');
  await assert.rejects(store.setRules('gid://shopify/Product/100', '[]', 'stale'), /digest mismatch/);
  await store.deleteRules('gid://shopify/Product/100');
  await store.deleteProduct(made.productGid);
  assert.equal(await store.getProductStatus('gid://shopify/Product/1'), 'DRAFT');
  const create = sent.find((x) => x.query.includes('productCreate'));
  assert.equal(create.vars.product.status, 'DRAFT'); assert.deepEqual(create.vars.product.tags, ['loamlabs-build']);
  const mutations = sent.filter((x) => /mutation/.test(x.query)).map((x) => x.query).join('\n');
  assert.doesNotMatch(mutations, /publishable|inventorySet|inventoryActivate|collectionAdd|productUpdate|productChangeStatus/i);
  assert.doesNotMatch(JSON.stringify(sent.map((x) => x.vars)), /build_guard_state|build_guard_off/);
  assert.equal(sent.find((x) => x.query.includes('productVariantsBulkUpdate')).vars.variants[0].compareAtPrice, null);
});
