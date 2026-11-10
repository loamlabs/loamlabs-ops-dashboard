// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { familyConflict } = require('../lib/ethirteen-rim');

test('a DH rule does not read an EN or GR variant (the capital letters in the title no longer hide the check)', () => {
  const t = 'e*thirteen Grappler Flux DH Carbon Rim (27.5" / 28h / Black)';
  assert.equal(familyConflict(t, '27.5" / 28h / GR'), true);
  assert.equal(familyConflict(t, '27.5" / 32h / EN'), true);
  assert.equal(familyConflict(t, '29" / 28h / DH'), false);
});

test('EN and GR rules likewise', () => {
  assert.equal(familyConflict('e*thirteen Grappler Flux EN Carbon Rim (29" / 32h / Black)', '29" / 32h / DH'), true);
  assert.equal(familyConflict('e*thirteen Grappler Flux EN Carbon Rim (29" / 32h / Black)', '29" / 32h / EN'), false);
  assert.equal(familyConflict('e*thirteen Grappler Flux GR Carbon Rim (27.5" / 32h / Black)', '27.5" / 32h / EN'), true);
  assert.equal(familyConflict('e*thirteen Grappler Flux GR Carbon Rim (27.5" / 32h / Black)', '27.5" / 32h / GR'), false);
});

test('rims without a family word, and pages without family words, are unaffected (new Flux Pro rims, Piedmont)', () => {
  assert.equal(familyConflict('e*thirteen Flux Pro 54 All Mountain Carbon Rim (29" / 28h / Black)', '29" / 28h'), false);
  assert.equal(familyConflict('e*thirteen Flux Pro 66 GR Carbon Rim (29" / 28h / Black)', '29" / 28h'), false);   // GR in the title, but the page names no other family
  assert.equal(familyConflict('e*thirteen Piedmont Race Gravel Carbon Rim (700c / 28h / Black)', '700c / 28h'), false);
});
