const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SURCHARGE_URL, kitForDriver, findSurchargeCents } = require('../lib/ethirteen-surcharge');

// Saved copy of https://www.ethirteen.com/products/sidekick-freehub-kits.js (fetched 2026-11-01). No live calls in these tests.
const page = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ethirteen-sidekick-freehub-kits.json'), 'utf8'));
const soldOut = (p) => { p.available = false; p.variants.forEach(v => { v.available = false; }); return p; };

test('new page address', () => {
    assert.equal(SURCHARGE_URL, 'https://www.ethirteen.com/products/sidekick-freehub-kits');
});

test('kitForDriver maps our driver texts to the page kit names', () => {
    assert.equal(kitForDriver('xd'), 'XD');
    assert.equal(kitForDriver('hg'), 'HG');
    assert.equal(kitForDriver('ms'), 'Microspline');
    assert.equal(kitForDriver('microspline'), 'Microspline');
    assert.equal(kitForDriver('mini hg'), 'Mini HG');
    assert.equal(kitForDriver('mini-hg'), 'Mini HG');
    assert.equal(kitForDriver('7 spd'), '7 speed 9-24t DM Cassette Kit');
    assert.equal(kitForDriver('7spd'), '7 speed 9-24t DM Cassette Kit');
    assert.equal(kitForDriver('7 speed cassette'), '7 speed 9-24t DM Cassette Kit');
    assert.equal(kitForDriver('sram xd driver'), 'XD');
    assert.equal(kitForDriver('shimano hg'), 'HG');
    assert.equal(kitForDriver('none'), null);
    assert.equal(kitForDriver(''), null);
    assert.equal(kitForDriver(null), null);
});

test('prices from the saved page: standard kits $139.95, 7-speed cassette kit $269.95', () => {
    const p = page();
    for (const d of ['xd', 'hg', 'ms', 'microspline', 'mini hg']) {
        const r = findSurchargeCents(p, d);
        assert.equal(r.ok, true, d);
        assert.equal(r.cents, 13995, d);
    }
    const dh = findSurchargeCents(p, '7 spd');
    assert.equal(dh.ok, true);
    assert.equal(dh.cents, 26995);
});

test('both hub models are read; identical prices are not flagged', () => {
    const r = findSurchargeCents(page(), 'xd');
    assert.deepEqual(r.hubModels.sort(), ['Sidekick GR / Gen 1', 'Sidekick Gen 2 / Pro'].sort());
    assert.equal(r.pricesDiffer, false);
});

test('SOLD OUT: every kit sold out and the product unavailable -> price still read, still ok, no failure', () => {
    const p = soldOut(page());
    for (const d of ['xd', 'hg', 'ms', 'mini hg', '7 spd']) {
        const r = findSurchargeCents(p, d);
        assert.equal(r.ok, true, d);
        assert.ok(r.cents === 13995 || r.cents === 26995, d);
        assert.equal(r.kitAvailable, false);       // information only
    }
});

test('the result never depends on availability: same cents sold out or in stock', () => {
    for (const d of ['xd', 'hg', 'ms', 'mini hg', '7 spd']) {
        assert.equal(findSurchargeCents(soldOut(page()), d).cents, findSurchargeCents(page(), d).cents);
    }
});

test('compare-at price higher than price: the higher is used', () => {
    const p = page(); p.variants.filter(v => v.option2 === 'XD').forEach(v => { v.compare_at_price = 15995; });
    assert.equal(findSurchargeCents(p, 'xd').cents, 15995);
});

test('if the two hub models ever differ, the higher price wins and it is flagged', () => {
    const p = page(); p.variants.find(v => v.option1 === 'Sidekick Gen 2 / Pro' && v.option2 === 'HG').price = 14995;
    const r = findSurchargeCents(p, 'hg');
    assert.equal(r.cents, 14995);
    assert.equal(r.pricesDiffer, true);
});

test('never guesses: unknown driver, missing kit, empty page, unreadable price -> ok:false with a reason', () => {
    assert.equal(findSurchargeCents(page(), 'mystery').ok, false);
    assert.match(findSurchargeCents(page(), 'mystery').reason, /not a known freehub kit/);
    const noKit = page(); noKit.variants = noKit.variants.filter(v => v.option2 !== 'Mini HG');
    assert.match(findSurchargeCents(noKit, 'mini hg').reason, /not found on the surcharge page/);
    assert.match(findSurchargeCents({ variants: [] }, 'xd').reason, /no variants/);
    assert.equal(findSurchargeCents(null, 'xd').ok, false);
    const noPrice = page(); noPrice.variants.filter(v => v.option2 === 'XD').forEach(v => { v.price = 0; v.compare_at_price = null; });
    assert.match(findSurchargeCents(noPrice, 'xd').reason, /readable price/);
});

test('works from the public title when the option fields are missing', () => {
    const p = page(); p.variants.forEach(v => { delete v.option1; delete v.option2; });
    assert.equal(findSurchargeCents(p, 'microspline').cents, 13995);
});
