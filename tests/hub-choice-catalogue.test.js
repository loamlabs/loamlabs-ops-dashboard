// Run with: npm test   (no network)
// Hub-choice stage 2 prep: the catalogue adapter against the REAL catalogue shape (data/hub_choice_catalogue.json), and the old tool's description fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { configsFromCatalogue, PRODUCTS, HUB_ORDER } = require('../lib/signature-build/hub/catalogue');
const { planBuild } = require('../lib/signature-build/plan');
const { makeWorld, makeStore, makeDb } = require('./helpers/signature-fakes');

const spacing = (f, r, o = {}) => ({ exists: true, frontProduct: f, rearProduct: r, colorsBoth: ['Black'], defaultVariant: { front: '1', rear: '2' }, freehubs: ['SRAM XD'], freehubVariantMap: { 'SRAM XD': '3' }, ...o });
const hub = (model, ids, o = {}) => ({ model, hubType: 'Classic Flange', rotorMount: '6-Bolt', defaultColor: 'Black', spacings: { A: spacing(ids.f15, ids.r148), B: spacing(ids.f15, ids.r157), C: spacing(ids.f20, ids.r157) }, ...o });
const catalogue = () => ({
    generated: '2026-11-05',
    hubs: {
        hydra2: hub('Industry Nine Hydra2', { f15: '101', f20: '102', r148: '103', r157: '104' }),
        hope: hub('Hope Pro 5', { f15: '201', f20: '202', r148: '203', r157: '204' }),
        p321: hub('Project321 G3', { f15: '301', f20: '302', r148: '303', r157: '304' }),
        e13: hub('e*thirteen (Sidekick Pro front + Sidekick GR rear)', { f15: '401', f20: '402', r148: '403', r157: '404' }),
        onyx: hub('Onyx Vesper', { f15: '501', f20: '502', r148: '503', r157: '504' }, { defaultColor: 'Black (Anodized)' }),
    },
    hubProducts: { 501: { title: 'Onyx Vesper Front Hub - 6-Bolt - 15x110mm', variants: [['Antifreeze Green', '9001', 245, 200, 0, 'C', 1], ['Black (Anodized)', '9002', 245, 200, 0, 'C', 1]] } },
    rims: { reserve30dh: { product: '9804627542323', v29_32h_black: '51797703328051', v27_5_32h_black: '51797703360819' }, fr571: { product: '9848996462899', v29_32h_black: '52318441996595', v27_5_32h_black: '52318442094899' } },
    spokes: { product: '9737461760307', baseVariant_black: '51484533031219' },
    nipples: { product: '9737493905715', variant_black: '51476658979123' },
});

test('real catalogue shape to setups: the four products in contract order, five hubs in button order, ids as text', () => {
    const { configs, problems } = configsFromCatalogue(catalogue());
    assert.deepEqual(problems, []); assert.deepEqual(configs.map((c) => c.name), ['Reserve 30|DH Mullet', 'Reserve 30|DH', 'DT Swiss FR 571 Mullet', 'DT Swiss FR 571']);
    const c = configs[0];
    assert.deepEqual(c.hubs.map((h) => h.model), ['Industry Nine Hydra2', 'Hope Pro 5', 'Project321 G3', 'e*thirteen', 'Onyx Vesper']);
    assert.deepEqual(HUB_ORDER.map((h) => h[0]), ['hydra2', 'hope', 'p321', 'e13', 'onyx']);
    assert.deepEqual(c.hubs[0].frontProducts, { '15x110': '101', '20x110': '102' }); assert.deepEqual(c.hubs[0].rearProducts, { '12x148': '103', '12x157': '104' });
    assert.equal(c.hubs[3].lengthsName, 'e*thirteen Sidekick GR');
    assert.deepEqual(c.rims, { front: '51797703328051', rear: '51797703360819' }); assert.equal(c.spokes, '51484533031219'); assert.equal(c.nipples, '51476658979123');
    assert.deepEqual(configs[1].rims, { front: '51797703328051', rear: '51797703328051' }); assert.deepEqual(configs[3].rims, { front: '52318441996595', rear: '52318441996595' });
    assert.deepEqual(configs.map((x) => x.lengthsKey), ['Reserve 30|DH Mullet (29 F / 27.5 R)', 'Reserve 30|DH 29/29', 'DT Swiss FR 571 Mullet (29 F / 27.5 R)', 'DT Swiss FR 571 29/29']);
    assert.deepEqual(configs.map((x) => [x.specs.frontWheelSize, x.specs.rearWheelSize, x.specs.spokeCount]), [['29"', '27.5"', '32'], ['29"', '29"', '32'], ['29"', '27.5"', '32'], ['29"', '29"', '32']]);
    assert.equal(PRODUCTS.length, 4);
});

test('the default colour comes from the catalogue default variant, not from a name guess (Onyx is "Black (Anodized)")', () => {
    const { configs } = configsFromCatalogue(catalogue());
    assert.equal(configs[0].hubs[4].defaultColor, 'Black (Anodized)');
    const c = catalogue(); c.hubs.onyx.spacings.A.defaultVariant.front = '9001';      // the Antifreeze Green variant
    assert.equal(configsFromCatalogue(c).configs[0].hubs[4].defaultColor, 'Antifreeze Green');
    assert.equal(configs[0].hubs[0].defaultColor, 'Black');                              // no product list for it: falls back to the hub's own default
});

test('a spacing that does not exist leaves that product out; inconsistent products for the same axle are problems', () => {
    const c = catalogue(); c.hubs.hope.spacings.C = spacing(null, null, { exists: false });
    const r = configsFromCatalogue(c); assert.deepEqual(r.problems, []);
    assert.deepEqual(r.configs[0].hubs[1].frontProducts, { '15x110': '201' }); assert.deepEqual(r.configs[0].hubs[1].rearProducts, { '12x148': '203', '12x157': '204' });
    const bad = catalogue(); bad.hubs.hydra2.spacings.B.frontProduct = '999'; bad.hubs.p321.spacings.C.rearProduct = '998';
    const p = configsFromCatalogue(bad).problems.join(' | ');
    assert.match(p, /Industry Nine Hydra2: spacing A and B name different 15x110/); assert.match(p, /Project321 G3: spacing B and C name different 12x157/);
});

test('catalogue problems are named, not guessed', () => {
    assert.match(configsFromCatalogue(null).problems[0], /empty/);
    const bad = catalogue(); delete bad.spokes; delete bad.hubs.onyx;
    assert.match(configsFromCatalogue(bad).problems.join(), /spokes.baseVariant_black/);
    const noOnyx = catalogue(); delete noOnyx.hubs.onyx; assert.match(configsFromCatalogue(noOnyx).problems.join(), /no hub "onyx"/);
    const odd = catalogue(); delete odd.hubs.hope.spacings.B; assert.match(configsFromCatalogue(odd).problems.join(), /Hope Pro 5: the catalogue lacks spacing A, B or C/);
    const noRim = catalogue(); delete noRim.rims.fr571; assert.match(configsFromCatalogue(noRim).problems.join(), /DT Swiss FR 571.*rims.front/);
});

const REAL = path.join(__dirname, '..', '..', '..', 'loamlabs-system-builder', 'agent-prompts', 'data', 'hub_choice_catalogue.json');
test('the real catalogue file (when present on this machine) converts with no problems', { skip: !fs.existsSync(REAL) }, () => {
    const r = configsFromCatalogue(JSON.parse(fs.readFileSync(REAL, 'utf8')));
    assert.deepEqual(r.problems, []); assert.equal(r.configs.length, 4);
    r.configs.forEach((c) => assert.equal(c.hubs.length, 5));
    assert.equal(r.configs[0].hubs[4].defaultColor, 'Black (Anodized)');
});

test('the Berd inserts sentence in the single-build tool only appears when the hubs need inserts', async () => {
    const w = makeWorld();
    w.P[400].title = 'Berd PolyLight Spokes';                         // a Berd spoke product on the standard fake world
    w.V[w.builder('Black')].productTitle = 'Berd PolyLight Spokes';
    const plan = async (hubTags) => {
        w.P[200].tags = hubTags; w.P[300].tags = hubTags;
        return planBuild({ store: makeStore(w), db: makeDb(), recipe: w.recipe(), overrides: {} });
    };
    assert.match((await plan([])).product.descriptionHtml, /Berd Hub Inserts are needed/);
    assert.doesNotMatch((await plan(['hub_type:hook_flange'])).product.descriptionHtml, /Inserts/);
    assert.doesNotMatch((await plan(['Berd_insert_not_required'])).product.descriptionHtml, /Inserts/);
});
