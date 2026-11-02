const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeBtiNumber, isRealNumber } = require('../lib/bti-number');

test('real Shopify number wins over the stored one', () => {
  assert.equal(mergeBtiNumber('OU3000', 'OU2999'), 'OU3000');
  assert.equal(mergeBtiNumber(' OU3000 ', null), 'OU3000');
});
test('blank Shopify number keeps a real stored number (the wipe case)', () => {
  assert.equal(mergeBtiNumber(null, 'OU3000'), 'OU3000');
  assert.equal(mergeBtiNumber('', 'OU3000'), 'OU3000');
  assert.equal(mergeBtiNumber(undefined, 'OU3000'), 'OU3000');
});
test('IGNORE in Shopify never replaces a real stored number', () => {
  assert.equal(mergeBtiNumber('IGNORE', 'OU3000'), 'OU3000');
  assert.equal(mergeBtiNumber(' ignore ', 'OU3000'), 'OU3000');
});
test('IGNORE is never stored, even when nothing else exists', () => {
  assert.equal(mergeBtiNumber('IGNORE', null), null);
  assert.equal(mergeBtiNumber('IGNORE', 'IGNORE'), null);
  assert.equal(mergeBtiNumber(null, 'IGNORE'), null);
});
test('both blank gives null', () => {
  assert.equal(mergeBtiNumber(null, null), null);
  assert.equal(mergeBtiNumber('', ''), null);
});
test('isRealNumber', () => {
  assert.equal(isRealNumber('OU3000'), true);
  for (const v of [null, undefined, '', '  ', 'IGNORE']) assert.equal(isRealNumber(v), false);
});
