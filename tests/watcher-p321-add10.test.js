// Run with: npm test
// Tag price-add-<dollars> (price-add-10): Project321 price = highest colour price + a fixed amount. Without the tag nothing changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/watcher-project321');

const v = (public_title, price, available = true) => ({ public_title, price, available });
// real shape (Nov 28): Black $10 (front) / $15 (rear) cheaper than every other colour; 24 only in Black on some pages
const rear = [];
for (const d of ['XDR', 'HGR', 'MicroSpline']) {
    rear.push(v(`24 / Black / ${d}`, 40750));
    for (const h of ['28', '32']) { rear.push(v(`${h} / Black / ${d}`, 40750)); for (const c of ['Maple', 'Ruby']) rear.push(v(`${h} / ${c} / ${d}`, 42250)); }
}
const front = [];
for (const h of ['24', '28']) for (const c of ['Black', 'Maple', 'Navy']) front.push(v(`${c} / ${h}`, c === 'Black' ? 19250 : 20250));
const read = (vars, opts, tags) => P.readProject321({ candidates: P.matchColourHoles(vars, opts), variants: vars, rule: { tags, option_values: opts } });
const R32 = { 'Spoke Count': '32h', Color: 'Black' };

test('priceAddCents reads price-add-<dollars> and nothing else', () => {
    assert.equal(P.priceAddCents(['price-add-10']), 1000);
    assert.equal(P.priceAddCents(['price-max-color', 'polite']), 0);
    assert.equal(P.priceAddCents([]), 0); assert.equal(P.priceAddCents(null), 0); assert.equal(P.priceAddCents(undefined), 0);
    assert.equal(P.priceAddCents(['price-add-5']), 500);
    assert.equal(P.priceAddCents(['price-add-5', 'price-add-10']), 1000, 'several tags: the largest, never added twice');
    for (const bad of ['price-add-', 'price-add-10x', 'price-adds-10', 'price-add--10', 'price-add-1000', 'PRICE-ADD-10', 'price-add-1.5']) assert.equal(P.priceAddCents([bad]), 0, bad);
});

test('highest colour + $10: rear $422.50 -> $432.50, front $202.50 -> $212.50 (Black is priced like the other colours, then +$10)', () => {
    assert.equal(read(rear, R32, ['price-max-color']).price, 42250);                        // today
    assert.equal(read(rear, R32, ['price-max-color', 'price-add-10']).price, 43250);
    assert.equal(read(front, { 'Spoke Count': '28h', Color: 'Black' }, ['price-max-color', 'price-add-10']).price, 21250);
    assert.equal(read(front, { 'Spoke Count': '28h', Color: 'Maple' }, ['price-max-color', 'price-add-10']).price, 21250, 'every colour ends at the same price');
});

test('24h Black (the only colour at 24) also gets highest colour + $10, not its own cheaper price + $10', () => {
    assert.equal(read(rear, { 'Spoke Count': '24h', Color: 'Black' }, ['price-max-color', 'price-add-10']).price, 43250);
});

test('without the tag nothing changes, with or without price-max-color', () => {
    assert.equal(read(rear, R32, ['price-max-color']).price, 42250);
    assert.equal(read(rear, R32, []).price, 40750);
    assert.equal(read(rear, R32, undefined).price, 40750);
    assert.equal(read(front, { 'Spoke Count': '24h', Color: 'Black' }, ['polite']).price, 19250);
});

test('the tag adds to the page price only: availability, pre-order and hold-stock are untouched, and an unread price (0) stays 0', () => {
    const a = read(rear, R32, ['price-max-color']), b = read(rear, R32, ['price-max-color', 'price-add-10']);
    assert.deepEqual({ ...b, price: 0 }, { ...a, price: 0 });
    const zero = [v('32 / Black / XDR', 0)];
    assert.equal(read(zero, R32, ['price-add-10']).price, 0);
    const pre = [v('32 (Pre-Order: December) / Black / XDR', 40750, false)];
    const p = read(pre, R32, ['price-add-10']);
    assert.equal(p.price, 41750); assert.equal(p.preorder, true); assert.equal(p.holdStock, true);
});

test('a rule that carries the tag but whose page has a compare-at price: the highest of price and compare-at is used, then +$10', () => {
    const c = [{ public_title: '32 / Black / XDR', price: 40750, compare_at_price: 45000, available: true }];
    assert.equal(read(c, R32, ['price-add-10']).price, 46000);
});
