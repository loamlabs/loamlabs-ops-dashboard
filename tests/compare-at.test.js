// Run with: npm test   (no network)
// Compare-at on a Watcher price write (lib/compare-at.js): a price drop clears the strike-through, everything else behaves as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareAtForPriceWrite: c } = require('../lib/compare-at');

test('price DROP with the old price still as compare-at: compare-at becomes the new price (no strike)', () => {
    assert.equal(c({ myPrice: '489.95', goalPrice: '399.95', myCompare: '489.95', vendorName: 'e*thirteen' }), '399.95');
    assert.equal(c({ myPrice: 310, goalPrice: 270, myCompare: 310, vendorName: 'Phil Wood' }), 270);
});
test('price drop with an older, higher compare-at is cleared too (the Watcher just lowered the price)', () => {
    assert.equal(c({ myPrice: '300.00', goalPrice: '280.00', myCompare: '350.00', vendorName: 'Project321' }), '280.00');
});
test('price RISE: unchanged behaviour (compare-at below the new price is lifted to it; above it is kept)', () => {
    assert.equal(c({ myPrice: '310', goalPrice: '350', myCompare: '310', vendorName: 'Phil Wood' }), '350');
    assert.equal(c({ myPrice: '310', goalPrice: '350', myCompare: null, vendorName: 'Phil Wood' }), '350');
    assert.equal(c({ myPrice: '310', goalPrice: '350', myCompare: '400', vendorName: 'Phil Wood' }), '400');
});
test('equal price: compare-at above the price is kept (no drop happened)', () => {
    assert.equal(c({ myPrice: '399.95', goalPrice: '399.95', myCompare: '489.95', vendorName: 'e*thirteen' }), '489.95');
});
test('no compare-at on the variant: the price is written as compare-at, as before', () => {
    assert.equal(c({ myPrice: '300', goalPrice: '280', myCompare: null, vendorName: 'OneUp' }), '280');
    assert.equal(c({ myPrice: '300', goalPrice: '280', myCompare: 0, vendorName: 'OneUp' }), '280');
});
test('Reserve, Chris King and Berd keep their compare-at on a drop (case and spacing ignored)', () => {
    for (const v of ['Reserve', 'chris king', ' Chris King ', 'Berd', 'BERD']) assert.equal(c({ myPrice: '500', goalPrice: '450', myCompare: '500', vendorName: v }), '500');
});
test('a drastic sale and a BTI-owned variant keep their compare-at', () => {
    assert.equal(c({ myPrice: '500', goalPrice: '450', myCompare: '500', vendorName: 'OneUp', isDeepSale: true }), '500');
    assert.equal(c({ myPrice: '500', goalPrice: '450', myCompare: '500', vendorName: 'OneUp', btiManaged: true }), '500');
});
