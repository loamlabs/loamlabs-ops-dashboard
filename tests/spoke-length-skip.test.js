// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { withoutSkippedLengths, SKIPPED_NEW_LENGTHS } = require('../lib/spoke-length-skip');

const CX_SP = '10182494191923';

test('275mm on the CX-Ray Straight Pull product is skipped', () => {
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['275mm']), []);
  assert.deepEqual(withoutSkippedLengths(Number(CX_SP), ['275mm']), []);          // id may arrive as a number
});

test('a real new length on the same product is still reported (316mm, 275mm alongside it)', () => {
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['275mm', '316mm']), ['316mm']);
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['316mm']), ['316mm']);
});

test('the same length on another product is still reported', () => {
  assert.deepEqual(withoutSkippedLengths('10180231921971', ['275mm']), ['275mm']);   // CX-Ray J-Bend
  assert.deepEqual(withoutSkippedLengths('999', ['275mm', '316mm']), ['275mm', '316mm']);
});

test('matching is exact: 274mm, 276mm and "275" are not skipped; empty list is fine', () => {
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['274mm', '276mm', '275']), ['274mm', '276mm', '275']);
  assert.deepEqual(withoutSkippedLengths(CX_SP, []), []);
});

test('the shipped skip list contains exactly one entry', () => {
  assert.deepEqual(SKIPPED_NEW_LENGTHS, { [CX_SP]: ['275mm'] });
});
