const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/watcher-project321');

const v = (public_title, price) => ({ public_title, price, available: true });
const rule = (opts, tags = ['price-max-color']) => ({ tags, option_values: opts });
// real shape (read Nov 26): 24-hole in Black only; Black $407.50, every other colour $422.50; 3 drivers per colour and hole count
const rear = [];
for (const d of ['XDR', 'HGR', 'MicroSpline']) {
    rear.push(v(`24 / Black / ${d}`, 40750));
    for (const h of ['28', '32']) { rear.push(v(`${h} / Black / ${d}`, 40750)); for (const c of ['Maple', 'Ruby', 'Flat Earth']) rear.push(v(`${h} / ${c} / ${d}`, 42250)); }
}
const read = (vars, opts, tags) => P.readProject321({ candidates: P.matchColourHoles(vars, opts), variants: vars, rule: rule(opts, tags) });

test('24h Black (the only colour at 24) is priced like 28h and 32h Black, not at its own cheaper price', () => {
    assert.equal(read(rear, { 'Spoke Count': '24h', Color: 'Black' }).price, 42250);
});

test('28h and 32h Black are unchanged (still the highest colour price at that hole count)', () => {
    assert.equal(read(rear, { 'Spoke Count': '28h', Color: 'Black' }).price, 42250);
    assert.equal(read(rear, { 'Spoke Count': '32h', Color: 'Black' }).price, 42250);
});

test('without the price-max-color tag the colour keeps its own price, also at 24h', () => {
    assert.equal(read(rear, { 'Spoke Count': '24h', Color: 'Black' }, []).price, 40750);
});

test('a hole count that offers every colour uses its own prices (12x100 front style: 24 and 28 in all colours)', () => {
    const front = [];
    for (const h of ['24', '28']) { front.push(v(`Black / ${h}`, 19250)); for (const c of ['Maple', 'Cobalt']) front.push(v(`${c} / ${h}`, 20250)); }
    assert.equal(read(front, { 'Spoke Count': '24h', Color: 'Black' }).price, 20250);
    // a cheaper hole count with the full colour set is NOT raised to a dearer one
    const uneven = [v('Black / 24', 19250), v('Maple / 24', 19250), v('Black / 28', 20250), v('Maple / 28', 20250)];
    assert.equal(read(uneven, { 'Spoke Count': '24h', Color: 'Black' }).price, 19250);
});

test('a page with one colour only keeps its own price; unknown hole count returns the old fallback', () => {
    const one = [v('24 / Black', 30000), v('28 / Black', 31000)];
    assert.equal(read(one, { 'Spoke Count': '24h', Color: 'Black' }).price, 30000);
    assert.equal(P.maxColourPrice(one, '99'), 0);
});
