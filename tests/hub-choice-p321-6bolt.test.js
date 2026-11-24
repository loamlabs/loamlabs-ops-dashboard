// Run with: npm test   (no network)
// Project321 hub-choice data after Agent C's 6-Bolt switch (2026-11-24): the committed catalogue, setups and spoke length table name the 6-Bolt products; the retired 6-Lock products can never come back.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { configsFromCatalogue, HUB_ORDER } = require('../lib/signature-build/hub/catalogue');
const { validateHubConfig, planHubChoice } = require('../lib/signature-build/hub/plan');
const { RETIRED_HUB_PRODUCTS } = require('../lib/signature-build/hub/constants');
const { buildVariantRecipe } = require('../lib/signature-build/hub/components');
const { missingHubFields } = require('../lib/signature-build/hub/fit');
const { importLengths } = require('../lib/signature-build/hub/lengths');

const DATA = path.join(__dirname, '..', 'data', 'hub-choice');
const read = (f) => fs.readFileSync(path.join(DATA, f), 'utf8');
const catalogue = () => JSON.parse(read('hub_choice_catalogue.json'));
const FRONT = '15472281977139', REAR = '15472230334771';
const OLD_IDS = Object.keys(RETIRED_HUB_PRODUCTS);
const withoutNote = (c) => { const { note, ...rest } = c; return JSON.stringify(rest); };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

test('the committed catalogue names the two 6-Bolt Project321 products (front 15x110 and 20x110 on one product, rear 12x148 and 12x157 on one product) and 10 colours', () => {
    const c = catalogue(); const sp = c.hubs.p321.spacings;
    for (const k of ['A', 'B', 'C']) { assert.equal(sp[k].frontProduct, FRONT); assert.equal(sp[k].rearProduct, REAR); assert.equal(sp[k].colorsBoth.length, 10); assert.ok(!sp[k].colorsBoth.includes('Navy') && !sp[k].colorsBoth.includes('MTN Dew')); }
    assert.notEqual(sp.A.defaultVariant.front, sp.C.defaultVariant.front);   // 15x110 and 20x110 are different variants of the same front product
    assert.equal(c.hubProducts[FRONT].title, 'Project321 G3 Front Hub - 6-Bolt'); assert.equal(c.hubProducts[REAR].title, 'Project321 G3 Rear Hub - 6-Bolt');
    assert.ok(!JSON.stringify(c).match(/"(price|cost|qty)"/) && c.hubProducts[FRONT].variants.every((v) => v.length === 3));   // ids only: price, cost and stock are read live, never kept in this file
    assert.equal(c.hubProducts[FRONT].variants.length, 20); assert.equal(c.hubProducts[REAR].variants.length, 20);   // 10 colours x 2 spacings at 32h
});

test('no retired 6-Lock product id anywhere in the committed catalogue, setups or spoke length table', () => {
    const setups = fs.readdirSync(DATA).filter((f) => /^setup_/.test(f)); assert.equal(setups.length, 4);
    const files = { catalogue: withoutNote(catalogue()), csv: read('hub_choice_spoke_lengths.csv'), ...Object.fromEntries(setups.map((f) => [f, read(f)])) };
    for (const [name, text] of Object.entries(files)) { for (const id of OLD_IDS) assert.ok(!text.includes(id), `${name} still names retired product ${id}`); assert.ok(!/6-Lock/.test(text), `${name} still says 6-Lock`); }
});

test('the committed setups are exactly what the adapter makes from the committed catalogue, and Project321 reads "Project321 G3 6-Bolt" with the old name kept for the length table and the recipe rows', () => {
    const { configs, problems } = configsFromCatalogue(catalogue()); assert.deepEqual(problems, []); assert.equal(configs.length, 4);
    for (const c of configs) assert.equal(JSON.stringify(JSON.parse(read(`setup_${slug(c.name)}.json`))), JSON.stringify(c), c.name);
    const p = configs[0].hubs.find((h) => h.model === 'Project321 G3 6-Bolt'); assert.ok(p);
    assert.equal(p.lengthsName, 'Project321 G3'); assert.equal(p.rowModel, 'Project321 G3');
    assert.deepEqual(p.frontProducts, { '15x110': FRONT, '20x110': FRONT }); assert.deepEqual(p.rearProducts, { '12x148': REAR, '12x157': REAR });
    assert.deepEqual(HUB_ORDER.find((h) => h[0] === 'p321'), ['p321', 'Project321 G3 6-Bolt', 'Project321 G3', 'Project321 G3']);
    configs.forEach((c) => assert.deepEqual(validateHubConfig(c), []));
});

test('a recipe for the 6-Bolt hub: hubModel and rule name say "Project321 G3 6-Bolt", the readable rows say "Project321 G3, 6-Bolt, ..." (no "6-Bolt, 6-Bolt")', () => {
    const base = { holes: '32', defaultColour: 'Black', ruleName: 'LoamLabs Reserve 30|DH + Project321 G3 6-Bolt 15x110/12x148', spacing: { key: 'A' }, labels: { front: '15x110mm', rear: '12x148mm (Boost)' }, front: { product: { gid: FRONT }, default: { id: '1' } }, rear: { product: { gid: REAR }, default: { id: '2' } }, colours: [{ name: 'Black' }], freehubs: [] };
    const r = buildVariantRecipe({ ...base, hubModel: 'Project321 G3 6-Bolt', rowModel: 'Project321 G3' });
    assert.equal(r.hubModel, 'Project321 G3 6-Bolt'); assert.equal(r.ruleName, base.ruleName);
    assert.equal(r.rows[0].value, 'Project321 G3, 6-Bolt, 15x110, 32h, Black'); assert.equal(r.rows[1].value, 'Project321 G3, 6-Bolt, 12x148, 32h, Black');
    const other = buildVariantRecipe({ ...base, hubModel: 'Hope Pro 5' });   // a hub without rowModel keeps its model name in the rows
    assert.equal(other.rows[0].value, 'Hope Pro 5, 6-Bolt, 15x110, 32h, Black');
});

test('a rebuild cannot bring the retired hubs back: a setup naming one is invalid, a catalogue naming one is a problem, and the plan stops with RECIPE_INVALID', async () => {
    const { configs } = configsFromCatalogue(catalogue());
    assert.deepEqual([...OLD_IDS].sort(), ['9082183516467', '9747941032243', '9747994968371', '9783115383091']);
    for (const id of OLD_IDS) {
        const bad = JSON.parse(JSON.stringify(configs[0])); bad.hubs.find((h) => h.model === 'Project321 G3 6-Bolt').frontProducts['15x110'] = id;
        assert.ok(validateHubConfig(bad).some((m) => m.includes(id) && /retired/.test(m)), 'setup ' + id);
        const plan = await planHubChoice({ store: { getVariants: async () => new Map() }, db: null, config: bad });
        assert.equal(plan.ok, false); assert.ok(plan.blockers.some((b) => b.code === 'RECIPE_INVALID' && b.message.includes(id)));
        const cat = catalogue(); cat.hubs.p321.spacings.A.rearProduct = id; cat.hubs.p321.spacings.B.rearProduct = id;
        assert.ok(configsFromCatalogue(cat).problems.some((m) => m.includes(id) && /retired/.test(m)), 'catalogue ' + id);
    }
});

test('hub numbers are read variant first: a product with no product-level numbers is complete when every variant carries them; one variant without a number lists it; the product-level number is the fallback', () => {
    const geo = { hub_flange_diameter_left: '58', hub_flange_diameter_right: '58', hub_flange_offset_left: '27', hub_flange_offset_right: '32', hub_spoke_hole_diameter: '2.6' };
    assert.deepEqual(missingHubFields({ meta: {}, variants: [{ geo }, { geo }] }), []);
    assert.deepEqual(missingHubFields({ meta: {}, variants: [{ geo }, { geo: { ...geo, hub_flange_offset_right: null } }] }), ['hub_flange_offset_right']);
    assert.deepEqual(missingHubFields({ meta: { ...geo }, variants: [{}] }), []);
    assert.equal(missingHubFields({ meta: {}, variants: [] }).length, 5);
});

test('the spoke length table: Project321 rows point at the 6-Bolt hub variants, the DH front rows have the lengths of the new 15x110 front, and the table imports without problems', () => {
    const csv = read('hub_choice_spoke_lengths.csv'); const imp = importLengths(csv); assert.deepEqual(imp.problems, []);
    const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/); const rows = lines.filter((l) => /,"Project321 G3",/.test(l)); assert.equal(rows.length, 24);
    for (const l of rows) assert.ok(/\| Project321 G3 (Front|Rear) Hub - 6-Bolt \|/.test(l), l.slice(0, 160));
    const dh = rows.filter((l) => /^"Reserve 30\|DH/.test(l) && /,"front",/.test(l) && /,"[AB]",/.test(l)); assert.equal(dh.length, 4);
    for (const l of dh) assert.ok(/"292","290","292","290"/.test(l), 'front lengths 292 left / 290 right: ' + l.slice(0, 260));
});
