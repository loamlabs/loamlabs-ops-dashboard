// Run with: npm test   (no network)
// Hub-choice build: the catalogue adapter (assumed shape) and the old tool's description fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const { configsFromCatalogue } = require('../lib/signature-build/hub/catalogue');
const { planBuild } = require('../lib/signature-build/plan');
const { makeWorld, makeStore, makeDb } = require('./helpers/signature-fakes');

const cat = () => ({
    products: [
        { name: 'Reserve 30|DH Mullet', lengthsKey: 'Reserve 30|DH Mullet (29 F / 27.5 R)', frontWheelSize: '29"', rearWheelSize: '27.5"', spokeCount: '32', rims: { front: '51797703328051', rear: '51797703360819' } },
        { name: 'Reserve 30|DH', lengthsKey: 'Reserve 30|DH 29/29', frontWheelSize: '29"', rearWheelSize: '29"', spokeCount: 32, rims: { front: '51797703328051', rear: '51797703328051' } },
    ],
    spokes: { builderVariantId: '51484533031219' }, nipples: { variantId: '51476658979123' },
    hubs: [{ model: 'Industry Nine Hydra2', defaultColor: 'Black', frontProducts: { '15x110': '9789788029235', '20x110': '9789800775987' }, rearProducts: { '12x148': '9789773185331', '12x157': '9789777445171' } }],
});

test('catalogue to setup: one setup per product, same hubs, ids as text, hub order kept', () => {
    const { configs, problems } = configsFromCatalogue(cat());
    assert.deepEqual(problems, []); assert.equal(configs.length, 2);
    assert.equal(configs[0].v, 2); assert.equal(configs[0].kind, 'hub-choice'); assert.equal(configs[1].specs.spokeCount, '32');
    assert.equal(configs[0].hubs[0].lengthsName, 'Industry Nine Hydra2'); assert.equal(configs[0].hubs[0].defaultColor, 'Black'); assert.equal(configs[1].rims.rear, '51797703328051');
});

test('catalogue problems are named, not guessed', () => {
    assert.match(configsFromCatalogue(null).problems[0], /empty/);
    const bad = cat(); delete bad.spokes; bad.hubs = [];
    const r = configsFromCatalogue(bad); assert.equal(r.configs.length, 0); assert.ok(r.problems.join().includes('spokes.builderVariantId') && r.problems.join().includes('no hubs'));
    const odd = cat(); odd.products[0].rims = {};
    assert.match(configsFromCatalogue(odd).problems.join(), /rims.front/);
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
