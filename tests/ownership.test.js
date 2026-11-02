// Run with: npm test   (node --test, no extra dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideOwner, isRealNumber, parseFlag, isOneOwnerVendor, ONE_OWNER_VENDORS } = require('../lib/ownership');

const base = { vendorAllowed: true, autoUpdate: true, vendorInStock: true, currentFlag: false, shopifyNumber: 'BTI123', storedNumber: 'BTI123' };
const d = (over) => decideOwner({ ...base, ...over });

test('isRealNumber: blank, null and IGNORE are not real', () => {
  assert.equal(isRealNumber('BTI123'), true);
  assert.equal(isRealNumber(' BTI123 '), true);
  for (const v of [null, undefined, '', '   ', 'IGNORE', 'ignore', ' Ignore ']) assert.equal(isRealNumber(v), false, String(v));
});

test('parseFlag handles Shopify string and boolean values', () => {
  assert.equal(parseFlag('true'), true);
  assert.equal(parseFlag('false'), false);
  assert.equal(parseFlag(true), true);
  assert.equal(parseFlag(false), false);
  assert.equal(parseFlag(null), null);
  assert.equal(parseFlag(undefined), null);
  assert.equal(parseFlag(''), null);
});

test('vendor in stock + flag false: Watcher owns, no write', () => {
  const r = d({});
  assert.equal(r.managed, true);
  assert.equal(r.desiredFlag, false);
  assert.equal(r.writeFlag, false);
});

test('vendor in stock + flag true: flag is cleared (Watcher takes it back)', () => {
  const r = d({ currentFlag: true });
  assert.equal(r.desiredFlag, false);
  assert.equal(r.writeFlag, true);
});

test('vendor out of stock + flag false + real number: BTI takes over', () => {
  const r = d({ vendorInStock: false, currentFlag: false });
  assert.equal(r.desiredFlag, true);
  assert.equal(r.writeFlag, true);
});

test('vendor out of stock + flag already true: no write', () => {
  const r = d({ vendorInStock: false, currentFlag: true });
  assert.equal(r.desiredFlag, true);
  assert.equal(r.writeFlag, false);
});

test('missing flag counts as false', () => {
  assert.equal(d({ currentFlag: null }).writeFlag, false);                       // in stock, missing = false: nothing to write
  assert.equal(d({ currentFlag: null, vendorInStock: false }).writeFlag, true);   // out of stock: must write true
});

test('flag arrives as the string "true" from Shopify', () => {
  assert.equal(d({ currentFlag: 'true', vendorInStock: false }).writeFlag, false);
  assert.equal(d({ currentFlag: 'true', vendorInStock: true }).writeFlag, true);
});

test('vendor data unavailable (null): owner is left unchanged, never treated as out of stock', () => {
  for (const flag of [true, false, null]) {
    const r = d({ vendorInStock: null, currentFlag: flag });
    assert.equal(r.writeFlag, false);
    assert.equal(r.desiredFlag, null);
  }
  assert.equal(d({ vendorInStock: undefined }).writeFlag, false);
});

test('pending price approval is not an input: extra needsReview fields change nothing', () => {
  const plain = d({ vendorInStock: false });
  const withReview = d({ vendorInStock: false, needsReview: true, reviewReason: 'Price Change $115.82 -> $99.99' });
  assert.deepEqual(withReview, plain);
  assert.equal(withReview.writeFlag, true);
});

test('vendor not on the allowlist: not managed, nothing written', () => {
  const r = d({ vendorAllowed: false, vendorInStock: false });
  assert.equal(r.managed, false);
  assert.equal(r.writeFlag, false);
  assert.equal(r.restoreNumber, null);
});

test('auto_update off: not managed', () => {
  const r = d({ autoUpdate: false, vendorInStock: false });
  assert.equal(r.managed, false);
  assert.equal(r.writeFlag, false);
});

test('IGNORE in Shopify + real stored number: restore the stored number, owner decided as usual', () => {
  const r = d({ shopifyNumber: 'IGNORE', storedNumber: 'BTI999', vendorInStock: false });
  assert.equal(r.restoreNumber, 'BTI999');
  assert.equal(r.realNumber, 'BTI999');
  assert.equal(r.unlinked, false);
  assert.equal(r.desiredFlag, true);
});

test('blank Shopify number + real stored number: restore', () => {
  const r = d({ shopifyNumber: null, storedNumber: 'BTI999' });
  assert.equal(r.restoreNumber, 'BTI999');
  assert.equal(d({ shopifyNumber: '', storedNumber: 'BTI999' }).restoreNumber, 'BTI999');
});

test('IGNORE is never counted as a real number, even in the stored copy', () => {
  const r = d({ shopifyNumber: null, storedNumber: 'IGNORE' });
  assert.equal(r.restoreNumber, null);
  assert.equal(r.realNumber, null);
  assert.equal(r.unlinked, true);
});

test('both numbers blank: unlinked, Watcher owns, nothing restored', () => {
  const r = d({ shopifyNumber: null, storedNumber: null, vendorInStock: false });
  assert.equal(r.unlinked, true);
  assert.equal(r.restoreNumber, null);
  assert.equal(r.desiredFlag, false);   // BTI can not own a variant without a number, even when the vendor is out of stock
  assert.equal(r.writeFlag, false);
});

test('unlinked variant with a leftover BTI flag: the flag is cleared', () => {
  const r = d({ shopifyNumber: null, storedNumber: null, currentFlag: true });
  assert.equal(r.unlinked, true);
  assert.equal(r.writeFlag, true);
  assert.equal(r.desiredFlag, false);
});

test('both numbers real and different: report mismatch, never overwrite', () => {
  const r = d({ shopifyNumber: 'BTI111', storedNumber: 'BTI222' });
  assert.equal(r.numberMismatch, true);
  assert.equal(r.restoreNumber, null);
  assert.equal(r.realNumber, 'BTI111');
});

test('both numbers real and equal: no mismatch, no restore', () => {
  const r = d({});
  assert.equal(r.numberMismatch, false);
  assert.equal(r.restoreNumber, null);
});

test('the Red 28h hub case: flag false, Shopify number blank, stored number real, vendor in stock', () => {
  const r = d({ currentFlag: false, shopifyNumber: null, storedNumber: 'BTI777', vendorInStock: true });
  assert.equal(r.restoreNumber, 'BTI777');
  assert.equal(r.writeFlag, false);      // already false, correct for in-stock
  assert.equal(r.desiredFlag, false);
});

test('no input at all does not throw and manages nothing', () => {
  const r = decideOwner();
  assert.equal(r.managed, false);
  assert.equal(r.writeFlag, false);
});

test('allowlist: OneUp only (any case/spacing); e*thirteen and others are not on it', () => {
  assert.deepEqual(ONE_OWNER_VENDORS, ['OneUp']);
  for (const v of ['OneUp', 'oneup', ' ONEUP ']) assert.equal(isOneOwnerVendor(v), true, v);
  for (const v of ['e*thirteen', 'e*thirteen components', 'DT Swiss', 'OneUp Components', '', null, undefined]) assert.equal(isOneOwnerVendor(v), false, String(v));
});
test('no decision ever asks for IGNORE: the only numbers it can restore are real stored ones', () => {
  for (const stored of ['IGNORE', '', null, 'ignore']) assert.equal(d({ shopifyNumber: '', storedNumber: stored }).restoreNumber, null);
  assert.equal(d({ shopifyNumber: 'IGNORE', storedNumber: 'OU3000' }).restoreNumber, 'OU3000');
  assert.equal(d({ shopifyNumber: 'OU3004', storedNumber: 'OU3000' }).restoreNumber, null);
});
