// Run with: npm test   (no network)
// Phil Wood in the Vendor Watcher: which philwood.com variant stands for one of our variants. Page shapes are what philwood.com showed on Nov 11-12 2026.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPhilWood, readTitle, matchPhilWood } = require('../lib/watcher-philwood');

const v = (public_title, price, available) => ({ public_title, price, available, compare_at_price: null });
// Classic / standard page: hole count / color / bearing; Carbonyte costs $10 more, Black shell $20 more
const classic = [];
for (const h of ['24', '28', '32']) for (const [c, p] of [['Silver', 29000], ['Black', 31000]]) for (const [b, add] of [['Standard', 0], ['Carbonyte', 1000]]) classic.push(v(`${h} / ${c} / ${b}`, p + add, h === '32' && b === 'Standard'));
// Pro page: Carbonyte only
const pro = [v('24 / Silver / Carbonyte', 32000, true), v('24 / Black / Carbonyte', 34000, false), v('28 / Silver / Carbonyte', 32000, false)];
const opts = (count, color) => ({ 'Spoke Count': count, 'Shell Color': color, __order: ['Spoke Count', 'Shell Color'] });

test('vendor name check ignores case and spaces', () => {
    assert.equal(isPhilWood('Phil Wood'), true); assert.equal(isPhilWood(' phil wood '), true);
    assert.equal(isPhilWood('Phil Wood & Co'), false); assert.equal(isPhilWood('Project321'), false); assert.equal(isPhilWood(null), false);
});

test('the three parts of a variant title are read', () => {
    assert.deepEqual(readTitle('28 / Silver / Standard'), { holes: '28', colour: 'silver', bearing: 'standard' });
    assert.deepEqual(readTitle('36 / Black / Carbonyte'), { holes: '36', colour: 'black', bearing: 'carbonyte' });
    assert.deepEqual(readTitle('Default Title'), { holes: null, colour: null, bearing: null });
});

test('classic page: the Standard-bearing variant of that hole count and color, never the Carbonyte one', () => {
    const m = matchPhilWood(classic, opts('28h', 'Silver'));
    assert.equal(m.length, 1); assert.equal(m[0].public_title, '28 / Silver / Standard'); assert.equal(m[0].price, 29000);
    const b = matchPhilWood(classic, opts('32h', 'Black'));
    assert.equal(b.length, 1); assert.equal(b[0].public_title, '32 / Black / Standard'); assert.equal(b[0].price, 31000); assert.equal(b[0].available, true);   // black = +$20
});

test('pro page: Carbonyte is the only bearing, so it is the match', () => {
    const m = matchPhilWood(pro, opts('24h', 'Silver'));
    assert.equal(m.length, 1); assert.equal(m[0].public_title, '24 / Silver / Carbonyte'); assert.equal(m[0].price, 32000);
});

test('hole count and color must both match; a size the vendor does not sell is no match', () => {
    assert.equal(matchPhilWood(classic, opts('36h', 'Silver')).length, 0);
    assert.equal(matchPhilWood(pro, opts('32h', 'Black')).length, 0);
    assert.equal(matchPhilWood(classic, opts('28h', 'Red')).length, 0);
    assert.equal(matchPhilWood(classic, { 'Spoke Count': '28h' }).length, 0);      // no color on the rule: nothing is guessed
    assert.equal(matchPhilWood(classic, { 'Shell Color': 'Silver' }).length, 0);   // no hole count on the rule
    assert.equal(matchPhilWood(null, opts('28h', 'Silver')).length, 0);
});

test('"28", "28h" and "28 Spokes" all mean 28 holes; 20 and 48 hole sizes work', () => {
    for (const c of ['28', '28h', '28 Spokes']) assert.equal(matchPhilWood(classic, opts(c, 'Silver')).length, 1);
    assert.equal(matchPhilWood([v('20 / Silver / Standard', 29000, true)], opts('20h', 'Silver')).length, 1);
    assert.equal(matchPhilWood([v('48 / Silver / Standard', 29000, true)], opts('48h', 'Silver')).length, 1);
});
