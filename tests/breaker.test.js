const test = require('node:test');
const assert = require('node:assert/strict');
const { isLiveVariant, breakerTripped } = require('../lib/breaker');

test('isLiveVariant: active and sellable or in stock', () => {
  const v = (o) => ({ inventoryQuantity: 0, inventoryPolicy: 'DENY', product: { status: 'ACTIVE' }, ...o });
  assert.equal(isLiveVariant(v({ inventoryPolicy: 'CONTINUE' })), true);
  assert.equal(isLiveVariant(v({ inventoryQuantity: 3 })), true);
  assert.equal(isLiveVariant(v({})), false);                                              // unavailable (the old Sapim sizes)
  assert.equal(isLiveVariant(v({ inventoryPolicy: 'CONTINUE', product: { status: 'DRAFT' } })), false);
  assert.equal(isLiveVariant(v({ inventoryPolicy: 'CONTINUE', product: { status: 'ARCHIVED' } })), false);
  assert.equal(isLiveVariant(null), false);
  assert.equal(isLiveVariant({ inventoryPolicy: 'CONTINUE' }), true);                      // status unknown: treated as live
});

test('Oct 31 Sapim numbers: 1065 of 4711 unmatched, almost all already unavailable -> does NOT trip', () => {
  // ASSUMED split (the run log does not give it): 1040 of the 1065 were already unavailable; 25 are live without a vendor match;
  // of the 4711 checked items about 900 are live in the shop.
  assert.equal(breakerTripped({ liveTotal: 900, liveNoMatch: 25 }), false);
  // the OLD rule on the same run: all unmatched counted over all checked
  assert.equal(1065 / 4711 > 0.2, true);
});

test('a real site change still trips: most live items lose their vendor match', () => {
  assert.equal(breakerTripped({ liveTotal: 900, liveNoMatch: 400 }), true);
  assert.equal(breakerTripped({ liveTotal: 40, liveNoMatch: 12 }), true);
});

test('thresholds: needs at least 5 live unmatched AND more than 20%', () => {
  assert.equal(breakerTripped({ liveTotal: 10, liveNoMatch: 4 }), false);   // 40% but only 4 items
  assert.equal(breakerTripped({ liveTotal: 10, liveNoMatch: 5 }), true);    // 50%, 5 items
  assert.equal(breakerTripped({ liveTotal: 100, liveNoMatch: 20 }), false); // exactly 20% is not "more than"
  assert.equal(breakerTripped({ liveTotal: 100, liveNoMatch: 21 }), true);
});

test('no live items or missing stats never trip', () => {
  assert.equal(breakerTripped({ liveTotal: 0, liveNoMatch: 0 }), false);
  assert.equal(breakerTripped(undefined), false);
});
