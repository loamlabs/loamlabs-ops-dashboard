// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFailureTracker, MAX_LINES } = require('../lib/vendor-page-failures');

test('no failures: no lines', () => {
  assert.deepEqual(createFailureTracker().lines(), []);
});

test('one dead page shared by many rules: one line with the right count', () => {
  const t = createFailureTracker();
  const url = 'https://velonixcyclesupply.com/products/cx-ray-straight-pull-spokes.js';
  t.fail(url, 'Fetch failed (404)');
  for (let i = 0; i < 727; i++) t.skip(url);
  const l = t.lines();
  assert.equal(l.length, 1);
  assert.equal(l[0].title, 'Vendor page not read: velonixcyclesupply.com/products/cx-ray-straight-pull-spokes');
  assert.match(l[0].reason, /Fetch failed \(404\)\. 728 rules not checked/);
});

test('singular wording and biggest page first', () => {
  const t = createFailureTracker();
  t.fail('https://a.example/p1.js', 'Fetch failed (404)');
  t.fail('https://b.example/p2.js', 'Fetch failed (404)'); t.skip('https://b.example/p2.js'); t.skip('https://b.example/p2.js');
  const l = t.lines();
  assert.match(l[0].title, /b\.example/); assert.match(l[0].reason, /3 rules not checked/);
  assert.match(l[1].reason, /1 rule not checked/);
});

test('email lines are capped', () => {
  const t = createFailureTracker();
  for (let i = 0; i < MAX_LINES + 5; i++) t.fail(`https://v${i}.example/x.js`, 'Fetch failed (404)');
  const l = t.lines();
  assert.equal(l.length, MAX_LINES + 1);
  assert.match(l[MAX_LINES].title, /5 more/);
});
