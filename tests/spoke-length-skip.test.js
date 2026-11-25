// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { withoutSkippedLengths, SKIPPED_NEW_LENGTHS } = require('../lib/spoke-length-skip');

const CX_SP = '10182494191923';
const MAP = { [CX_SP]: ['275mm'] };   // the mechanism is tested with an explicit map (the shipped list is empty since Nov 25)

test('a listed length on its product is skipped (mechanism)', () => {
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['275mm'], MAP), []);
  assert.deepEqual(withoutSkippedLengths(Number(CX_SP), ['275mm'], MAP), []);          // id may arrive as a number
});

test('a real new length on the same product is still reported (mechanism)', () => {
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['275mm', '316mm'], MAP), ['316mm']);
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['316mm'], MAP), ['316mm']);
});

test('the same length on another product is still reported (mechanism)', () => {
  assert.deepEqual(withoutSkippedLengths('10180231921971', ['275mm'], MAP), ['275mm']);
  assert.deepEqual(withoutSkippedLengths('999', ['275mm', '316mm'], MAP), ['275mm', '316mm']);
});

test('matching is exact: 274mm, 276mm and "275" are not skipped; empty list is fine (mechanism)', () => {
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['274mm', '276mm', '275'], MAP), ['274mm', '276mm', '275']);
  assert.deepEqual(withoutSkippedLengths(CX_SP, [], MAP), []);
});

test('Nov 25: the shipped skip list is empty, so 275mm on CX-Ray Straight Pull is reported again (Jerry wants it added)', () => {
  assert.deepEqual(SKIPPED_NEW_LENGTHS, {});
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['275mm']), ['275mm']);
  assert.deepEqual(withoutSkippedLengths(CX_SP, ['275mm', '316mm']), ['275mm', '316mm']);
});
