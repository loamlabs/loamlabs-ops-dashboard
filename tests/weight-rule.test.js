const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { weightMissing } = require('../lib/weight-rule');

// the rule the button used before (copied from the old code) to prove nothing changes for anything that is not a spoke
const oldMissing = (productWeight, variantWeights) => { const hasProductWeight = !!productWeight; let all = variantWeights.length > 0; for (const w of variantWeights) { if (!w) { all = false; break; } } return !hasProductWeight && !all; };

test('a spoke with the base weight and no other weight passes (this is the case after the Nov 17 clearing: 16 products)', () => {
  assert.equal(weightMissing({ tags: ['component:spoke'], productWeight: undefined, spokeBase: '5.95', variantWeights: [undefined, undefined] }), false);
});
test('a spoke with nothing anywhere is still reported; a base weight on a non-spoke product does not count', () => {
  assert.equal(weightMissing({ tags: ['component:spoke'], variantWeights: [undefined] }), true);
  assert.equal(weightMissing({ tags: ['component:hub'], spokeBase: '5.95', variantWeights: [undefined] }), true);
  assert.equal(weightMissing({ tags: ['component:rim'], spokeBase: '5.95', variantWeights: [] }), true);
});
test('every other way to pass still passes: a product weight, or a weight on every variant (and a single missing variant weight still fails)', () => {
  assert.equal(weightMissing({ tags: ['component:hub'], productWeight: '315', variantWeights: [undefined] }), false);
  assert.equal(weightMissing({ tags: ['component:hub'], variantWeights: ['300', '310'] }), false);
  assert.equal(weightMissing({ tags: ['component:hub'], variantWeights: ['300', undefined] }), true);
  assert.equal(weightMissing({ tags: ['component:hub'], variantWeights: [] }), true);
});
test('for hubs and rims the new rule gives exactly the old answer in every combination (nothing else changes)', () => {
  const vals = [undefined, '', '0', '250']; for (const tag of ['component:hub', 'component:rim']) for (const pw of vals) for (const vw of [[], [undefined], ['250'], ['250', undefined], ['250', '300'], ['0', '250']]) assert.equal(weightMissing({ tags: [tag], productWeight: pw, spokeBase: '5.95', variantWeights: vw }), oldMissing(pw, vw), tag + ' ' + pw + ' ' + JSON.stringify(vw));
});
test('the handler asks for spoke_base_weight_g on the product and uses the helper instead of the old inline rule', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'pages', 'api', 'run-daily-tasks.js'), 'utf8');
  assert.match(src, /spokeBase: metafield\(namespace: "custom", key: "spoke_base_weight_g"\)/); assert.match(src, /require\('\.\.\/\.\.\/lib\/weight-rule'\)/); assert.match(src, /weightMissing\(\{ tags: product\.tags/);
  assert.ok(!/const hasProductWeight = !!productMetafields\.weight_g/.test(src));
});
