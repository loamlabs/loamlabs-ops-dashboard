// Run with: npm test  (vendor titles copied from the live e*thirteen Quick Fill page, Nov 11 2026)
const test = require('node:test');
const assert = require('node:assert/strict');
const { valveMatches } = require('../lib/ethirteen-valve');

const SMALL = 'Fits Grappler/Sylvan/Optimus/LG1/TRS/alloy XCX rims', LARGE = 'Fits Piedmont/XCXr rims';
const page = [
  ['Intergalactic PVD', '12.5-24mm', SMALL], ['Intergalactic PVD', '23-31mm', LARGE], ['Eggplant', '12.5-24mm', SMALL], ['Eggplant', '23-31mm', LARGE],
  ['Naranja', '12.5-24mm', SMALL], ['Naranja', '23-31mm', LARGE], ['Bronze', '12.5-24mm', SMALL], ['Bronze', '23-31mm', LARGE],
  ['Sterling Silver', '12.5-24mm', SMALL], ['Sterling Silver', '23-31mm', LARGE], ['Black', '12.5-24mm', SMALL], ['Black', '23-31mm', LARGE],
  ['Bosch Speed Sensor Compatible (Black Only)', '12.5-24mm', 'Fits Bosch Smart System on Grappler/Sylvan/LG1/TRS alloy rims'],
  ['Bosch Speed Sensor Compatible (Black Only)', '23-31mm', 'Fits Bosch Smart System on Grappler/Sylvan/LG1/TRS carbon rims'],
].map((p) => p.join(' / '));

const ours = [];
for (const Color of ['Black', 'Bronze', 'Eggplant', 'Intergalactic', 'Naranja', 'Sterling Silver']) for (const Length of ['16-24mm', '23-31mm']) ours.push({ Color, Length });

test('each of our 12 valve variants matches exactly one vendor variant, and the Bosch ones are never used', () => {
  assert.equal(ours.length, 12);
  for (const o of ours) {
    const hits = page.filter((t) => valveMatches(t, o));
    assert.equal(hits.length, 1, `${o.Color} ${o.Length} matched ${hits.length}`);
    assert.ok(!hits[0].toLowerCase().includes('bosch'));
  }
});

test('length mapping: our 16-24mm is their 12.5-24mm, 23-31mm is the same', () => {
  assert.equal(valveMatches('Eggplant / 12.5-24mm / ' + SMALL, { Color: 'Eggplant', Length: '16-24mm' }), true);
  assert.equal(valveMatches('Eggplant / 23-31mm / ' + LARGE, { Color: 'Eggplant', Length: '16-24mm' }), false);
  assert.equal(valveMatches('Eggplant / 23-31mm / ' + LARGE, { Color: 'Eggplant', Length: '23-31mm' }), true);
});

test('Black does not match the Bosch "Black Only" variants; Intergalactic matches "Intergalactic PVD"; missing options match nothing', () => {
  assert.equal(valveMatches('Bosch Speed Sensor Compatible (Black Only) / 12.5-24mm / x', { Color: 'Black', Length: '16-24mm' }), false);
  assert.equal(valveMatches('Intergalactic PVD / 12.5-24mm / x', { Color: 'Intergalactic', Length: '16-24mm' }), true);
  assert.equal(valveMatches('Black / 12.5-24mm / x', {}), false);
  assert.equal(valveMatches('', { Color: 'Black', Length: '16-24mm' }), false);
});
