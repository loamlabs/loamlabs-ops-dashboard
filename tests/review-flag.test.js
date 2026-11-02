// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideReviewFlag } = require('../lib/review-flag');

const d = (o) => decideReviewFlag({ needsPriceUpdate: false, requiresReviewForStock: false, forceApprove: false, flagged: false, ...o });

test('a pending price change or vendor-OOS switch is held for approval', () => {
  assert.equal(d({ needsPriceUpdate: true }), 'hold');
  assert.equal(d({ requiresReviewForStock: true, flagged: true }), 'hold');
  assert.equal(d({ needsPriceUpdate: true, requiresReviewForStock: true }), 'hold');
});

test('approval wins over everything and clears the flag', () => {
  assert.equal(d({ needsPriceUpdate: true, forceApprove: true }), 'approve');
  assert.equal(d({ forceApprove: true, flagged: true }), 'approve');
});

test('stale flag with nothing pending is cleared (vendor in stock or not: the function no longer looks at stock)', () => {
  assert.equal(d({ flagged: true }), 'clear');
});

test('no flag and nothing pending: keep', () => {
  assert.equal(d({}), 'keep');
});
