const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRearVariant, kitOfTitle } = require('../lib/ethirteen-wheel');
const pages = require('./fixtures/ethirteen-wheel-pages.json');

const pick = (page, want) => pickRearVariant(pages[page], { size: '29', axle: '148', superboost: false, driver: 'xd', ...want });
const dollars = (r) => r.price / 100;

test('complete-wheel listing: the rule freehub variant is taken, kit is included (no separate surcharge)', () => {
  const r = pick('alloy', {});
  assert.equal(r.ok, true);
  assert.equal(r.kitIncluded, true);
  assert.equal(dollars(r), 575.97);                       // compare-at of 29 / 148 / XD = what Shopify shows today
});
test('Superboost and 27.5 are picked by size and spacing', () => {
  assert.equal(dollars(pick('alloy', { size: '27.5', axle: '157', superboost: true, driver: 'xd' })), 585.97);
  assert.equal(dollars(pick('carbon', {})), 1065.97);
  assert.equal(dollars(pick('enduro', {})), 1145.97);
});
test('downhill: Mini HG and 7spd are different prices, never the highest of both', () => {
  assert.equal(dollars(pick('downhill', { driver: 'mini hg' })), 1295.97);
  assert.equal(dollars(pick('downhill', { driver: '7spd integrated cassette' })), 1400.97);
});
test('freehub names in the rule map to the vendor names (MS = Microspline, HG)', () => {
  assert.equal(pick('carbon', { driver: 'ms' }).ok, true);
  assert.equal(pick('carbon', { driver: 'hg' }).ok, true);
  assert.equal(kitOfTitle('29" / 148x12mm Boost / Microspline'), 'Microspline');
});
test('availability follows the exact variant (sold-out 27.5 Boost, in-stock Superboost)', () => {
  assert.equal(pick('alloy', { size: '27.5' }).variant.available, false);
  assert.equal(pick('alloy', { size: '27.5', axle: '157', superboost: true }).variant.available, true);
});
test('older listing (word "rear", no freehub in title): highest match, kit price still to be added by the caller', () => {
  const r = pick('legacy', {});
  assert.equal(r.ok, true);
  assert.equal(r.kitIncluded, false);
  assert.equal(dollars(r), 575.97);
});
test('rear wheel not found is a problem, never a $0 price', () => {
  assert.equal(pickRearVariant([], { size: '29', axle: '148', superboost: false, driver: 'xd' }).ok, false);
  assert.equal(pickRearVariant(pages.alloy, { size: '26', axle: '148', superboost: false, driver: 'xd' }).ok, false);
  assert.equal(pickRearVariant(pages.alloy, { size: '29', axle: '110', superboost: false, driver: 'xd' }).ok, false);
});
test('unknown freehub on a complete-wheel listing is a problem, not a guess', () => {
  assert.equal(pick('carbon', { driver: 'banana' }).ok, false);
  assert.equal(pick('alloy', { driver: 'mini hg' }).ok, false);     // the alloy wheel has no Mini HG
  assert.equal(pick('carbon', { driver: null }).ok, false);
});
test('a variant without a readable price is a problem', () => {
  const broken = [{ public_title: '29" / 148x12mm Boost / XD', price: 0, compare_at_price: 0, available: true }];
  assert.equal(pickRearVariant(broken, { size: '29', axle: '148', superboost: false, driver: 'xd' }).ok, false);
});
