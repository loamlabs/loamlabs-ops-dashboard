// Run with: npm test
// Per-spoke pricing (spoke variants with Length "Each", price per spoke x the wheel's count) and the half assembly fee for hook flange hubs.
// Everything for the OLD model (flat "-" variant, one price per wheel) must price exactly as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { assemblyPerWheel, variantPrice, discountedUnit, perSpokeWheel } = require('../lib/signature-build/hub/pricing');
const { ASSEMBLY, HOOK_FLANGE_FEE } = require('../lib/signature-build/hub/constants');
const { planHubChoice } = require('../lib/signature-build/hub/plan');
const { planBuild } = require('../lib/signature-build/plan');
const { makeHubWorld, makeLengthsCsv, makeHubStore, makeDb } = require('./helpers/hub-fakes');
const sig = require('./helpers/signature-fakes');

const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- the per-unit 10% (Shopify floors the discount of one unit)
test('discount per unit: floor of the 10% in cents (real orders: 319.99 -> 288.00, 64.99 -> 58.50; a per-spoke 1.72 -> 1.55)', () => {
    assert.equal(discountedUnit(319.99), 288);
    assert.equal(discountedUnit(64.99), 58.5);
    assert.equal(discountedUnit(1.72), 1.55);
    assert.equal(discountedUnit(10), 9);
    assert.equal(discountedUnit(0.09), 0.09);              // 10% of 9 cents is 0.9 cent: floors to 0
    assert.deepEqual(perSpokeWheel(1.72, 28), { list: 48.16, discounted: 43.4 });
});

// ---------------------------------------------------------------- old products price exactly as before
test('old model: variantPrice without perSpoke / hookFlange is the old formula, to the cent', () => {
    const p = { frontRim: 649, rearRim: 649, frontHub: 240, rearHub: 510, spokes: 54.99, nipples: 19.99, hubVendor: 'Industry Nine', rimVendor: 'Reserve', override: null };
    const old = round2(round2(649 + 649 + 240 + 510 + 2 * 54.99 + 2 * 19.99 + 2 * 50) * 0.9);
    const r = variantPrice(p);
    assert.equal(r.builderPrice, old); assert.equal(r.price, old); assert.equal(r.assembly.perWheel, 50);
    assert.equal(r.perSpoke, undefined);
    assert.equal(variantPrice({ ...p, hookFlange: false }).builderPrice, old);
    assert.equal(variantPrice({ ...p, override: 2000 }).price, 2000);
});

// ---------------------------------------------------------------- per-spoke price x count
test('per-spoke: spokes = price x each wheel\'s count, discounted per unit; the rest as before', () => {
    const p = { frontRim: 649, rearRim: 649, frontHub: 240, rearHub: 510, spokes: 1.72, nipples: 19.99, hubVendor: 'Industry Nine', rimVendor: 'Reserve', override: null };
    const r = variantPrice({ ...p, perSpoke: { price: 1.72, frontCount: 32, rearCount: 32 } });
    const rest = round2(649 + 649 + 240 + 510 + 2 * 19.99 + 2 * 50);
    assert.equal(r.listTotal, round2(rest + 2 * 32 * 1.72));
    assert.equal(r.builderPrice, round2(round2(rest * 0.9) + 2 * round2(32 * 1.55)));
    assert.equal(r.builderPrice, 2068.38);
    assert.deepEqual(r.perSpoke.front, { list: 55.04, discounted: 49.6 });
    // different counts front and rear
    const r2 = variantPrice({ ...p, perSpoke: { price: 1.72, frontCount: 24, rearCount: 28 } });
    assert.equal(r2.perSpoke.front.discounted + r2.perSpoke.rear.discounted, round2(24 * 1.55 + 28 * 1.55));
    // a zero or missing per-spoke price falls back to the old per-wheel price
    assert.equal(variantPrice({ ...p, spokes: 54.99, perSpoke: { price: 0, frontCount: 32, rearCount: 32 } }).builderPrice, variantPrice({ ...p, spokes: 54.99 }).builderPrice);
});

// ---------------------------------------------------------------- hook flange: half the fee, rounded up to an existing variant
test('hook flange table: every fee that exists maps to the agreed half', () => {
    assert.deepEqual(HOOK_FLANGE_FEE, { 120: 60, 100: 50, 90: 50, 80: 40, 70: 40, 60: 30, 50: 30, 40: 20, 30: 20, 20: 20 });
    for (const [fee, half] of Object.entries(HOOK_FLANGE_FEE)) assert.ok(half >= Number(fee) / 2 && half <= Number(fee) / 2 + 10, `${fee} -> ${half}`);
});

test('hook flange: Onyx / ERASE $80 -> $40, Hope / Tairin $70 -> $40, Berd with Reserve $50 -> $30, We Are One $40 -> $20, other rims $60 -> $30; same hub without hook flange unchanged', () => {
    const hf = (hub, rim) => assemblyPerWheel(hub, rim, ASSEMBLY, { hookFlange: true });
    const plain = (hub, rim) => assemblyPerWheel(hub, rim, ASSEMBLY);
    assert.equal(plain('Onyx Racing', 'Reserve').fee, 80); assert.equal(hf('Onyx Racing', 'Reserve').fee, 40);
    assert.equal(hf('ERASE Components', 'DT Swiss').fee, 40);
    assert.equal(plain('Hope', 'Reserve').fee, 70); assert.equal(hf('Hope', 'Reserve').fee, 40);
    assert.equal(hf('Tairin', 'Reserve').fee, 40);
    assert.equal(plain('Berd', 'Reserve').fee, 50); assert.equal(hf('Berd', 'Reserve').fee, 30);
    assert.equal(plain('Berd', 'We Are One').fee, 40); assert.equal(hf('Berd', 'We Are One').fee, 20);
    assert.equal(plain('Berd', 'DT Swiss').fee, 60); assert.equal(hf('Berd', 'DT Swiss').fee, 30);
    assert.equal(hf('Berd', 'NOBL').fee, 40);                       // NOBL $80 -> $40
    assert.match(hf('Berd', 'DT Swiss').rule, /hook flange hub: half the fee rounded up to the next variant \(\$60 -> \$30\)/);
    assert.equal(plain('Berd', 'DT Swiss').rule.includes('hook flange'), false);
});

test('hook flange: a customer\'s own hub (or own rim) is never reduced', () => {
    const hf = (hub, rim) => assemblyPerWheel(hub, rim, ASSEMBLY, { hookFlange: true });
    assert.equal(hf('Your Own Component', 'Reserve').fee, 120);
    assert.equal(hf('Berd', 'Your Own Component').fee, 120);
    assert.equal(hf('Your Own Component', 'Your Own Component').fee, 120);
});

test('hook flange: the master price drops by 2 x the fee difference, less the 10%: the Berd Talon master (-$54.00)', () => {
    // DT Swiss XRC 310 + Berd Talon 29": rims 2 x 656.27, hubs 149.00 + 399.00, nipples 2 x 20.00, spokes 2 x 429.99; fee $60 per wheel today
    const p = { frontRim: 656.27, rearRim: 656.27, frontHub: 149, rearHub: 399, spokes: 429.99, nipples: 20, hubVendor: 'Berd', rimVendor: 'DT Swiss', override: null };
    const today = variantPrice(p), half = variantPrice({ ...p, hookFlange: true });
    assert.equal(today.assembly.perWheel, 60); assert.equal(half.assembly.perWheel, 30);
    assert.equal(round2(today.listTotal - half.listTotal), 60);
    assert.equal(round2(today.builderPrice - half.builderPrice), 54);
});

// ---------------------------------------------------------------- hub-choice plan, per-spoke and hook flange
const hubPlan = async (mutate) => {
    const w = makeHubWorld();
    if (mutate) mutate(w);
    return planHubChoice({ store: makeHubStore(w, {}), db: makeDb(), config: w.config(), lengthsCsv: makeLengthsCsv(w) });
};
const asEach = (w) => { w.builder.title = 'Black / Each'; w.builder.price = 1.72; w.builder.cost = 0.6; w.builder.selectedOptions = [{ name: 'Color', value: 'Black' }, { name: 'Length', value: 'Each' }]; };

test('hub-choice plan: old "-" spoke variant prices exactly as before; a per-spoke variant prices spokes x the wheel count and says so', async () => {
    const old = await hubPlan();
    assert.equal(old.ok, true); assert.equal(Number(old.variants[0].price), 2068.16);
    assert.equal(old.notes.some((n) => /priced per spoke/.test(n)), false);
    const each = await hubPlan(asEach);
    assert.equal(each.ok, true, JSON.stringify(each.blockers));
    assert.equal(Number(each.variants[0].price), 2068.38);
    assert.ok(each.notes.some((n) => /priced per spoke \(\$1\.72 each\).*32 spokes/.test(n)));
    // the cost / margin side counts the same spokes: parts cost includes 2 x 32 spokes at the per-spoke cost
    assert.equal(Number(each.matrix[0].price), 2068.38);
});

test('hub-choice plan: hook flange hubs get the half fee; classic hubs in the same world do not', async () => {
    const classic = await hubPlan();
    const hook = await hubPlan((w) => {
        for (const P of Object.values(w.P)) if (/Hope Pro 5/.test(P.title)) { P.meta.hub_type = 'Hook Flange'; P.tags = ['hub_type:hook_flange']; }
    });
    const find = (plan, model) => plan.matrix.find((m) => m.hub === model && m.spacing === 'A');
    // Hope ($70) with a Reserve rim ($50) is $70 per wheel today; hook flange halves it to $40: 2 x $30 less, less the 10%
    const c = find(classic, 'Hope Pro 5'), h = find(hook, 'Hope Pro 5');
    assert.equal(hook.ok, true, JSON.stringify(hook.blockers));
    assert.ok(c && h, 'the Hope cell exists in both plans');
    assert.equal(round2(Number(c.price) - Number(h.price)), 54);
    assert.equal(find(classic, 'Industry Nine Hydra2').price, find(hook, 'Industry Nine Hydra2').price);
});

// ---------------------------------------------------------------- single Signature master plan
test('Signature plan: a per-spoke build counts price x the rim hole count in the parts sum and cost; an old build is unchanged', async () => {
    const make = (each) => {
        const world = sig.makeWorld();
        const recipe = world.recipe();               // the recipe names the spoke variant by id: take it before the title changes
        delete recipe.spokeLengths;
        if (each) {
            const sp = world.P[400].variants.find((v) => v.title === 'Black / -');
            sp.title = 'Black / Each'; sp.price = 1.72; sp.cost = 0.6; sp.selectedOptions = sp.selectedOptions.map((o) => (o.name === 'Length' ? { ...o, value: 'Each' } : o));
        }
        return { store: sig.makeStore(world, {}), db: sig.makeDb(), recipe };
    };
    const old = make(false), per = make(true);
    const oldPlan = await planBuild({ store: old.store, db: old.db, recipe: old.recipe, overrides: {} });
    const perPlan = await planBuild({ store: per.store, db: per.db, recipe: per.recipe, overrides: {} });
    assert.deepEqual(oldPlan.blockers, []); assert.deepEqual(perPlan.blockers, []);
    const line = (plan, role) => plan.parts.find((l) => l.role === role);
    assert.equal(line(oldPlan, 'frontSpokes').price, 54.99);               // old: one flat price per wheel, unchanged
    assert.equal(line(oldPlan, 'frontSpokes').label.includes(' x '), false);
    assert.equal(line(perPlan, 'frontSpokes').price, round2(1.72 * 28));   // the world's rims are 28h
    assert.equal(line(perPlan, 'rearSpokes').price, round2(1.72 * 28));
    assert.equal(line(perPlan, 'frontSpokes').cost, round2(0.6 * 28));
    assert.ok(line(perPlan, 'frontSpokes').label.endsWith(' x 28'));
    assert.equal(perPlan.partsSum, round2(oldPlan.partsSum - 2 * 54.99 + 2 * round2(1.72 * 28)));
    assert.equal(perPlan.colours.spoke.offered.includes('Black'), true);
});
