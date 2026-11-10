// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { priceDecision, priceLines, MAX_AUTO_PRICE_PCT, PRICE_CAP, createFlipLimiter } = require('../lib/watcher-safety');

const rule = (tags, last_price) => ({ tags, last_price });
const base = { myPrice: '1000.00', goalPrice: '1050.00', vendorCents: 105000 };

test('no tag: today\'s approval path, whatever the numbers', () => {
  assert.equal(priceDecision({ rule: rule([], 105000), ...base }), 'ask');
});

test('tag + same vendor price on the previous run + small change: auto', () => {
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], 105000), ...base }), 'auto');
});

test('tag but the vendor price is new since the previous run: wait one run (no approval, no write)', () => {
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], 100000), ...base }), 'wait');
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], null), ...base }), 'wait');
});

test('baseline mode: proposal only, even when everything else would be auto', () => {
  assert.equal(priceDecision({ rule: rule(['auto-approve-price', 'baseline'], 105000), ...base }), 'baseline');
});

test('change above 15% asks for approval; exactly 15% is still auto', () => {
  assert.equal(MAX_AUTO_PRICE_PCT, 0.15);
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], 120000), myPrice: '1000.00', goalPrice: '1200.00', vendorCents: 120000 }), 'ask');
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], 115000), myPrice: '1000.00', goalPrice: '1150.00', vendorCents: 115000 }), 'auto');
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], 80000), myPrice: '1000.00', goalPrice: '800.00', vendorCents: 80000 }), 'ask');   // a big drop asks too
});

test('a bad parse never writes: zero or missing prices fall back to approval', () => {
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], 0), myPrice: '1000.00', goalPrice: '0.00', vendorCents: 0 }), 'ask');
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], 5000), myPrice: '0.00', goalPrice: '50.00', vendorCents: 5000 }), 'ask');
  assert.equal(priceDecision({ rule: rule(['auto-approve-price'], 5000), myPrice: 'NaN', goalPrice: '50.00', vendorCents: 5000 }), 'ask');
});

test('price cap: 40 per vendor per run, the rest are held and counted', () => {
  const l = createFlipLimiter(PRICE_CAP);
  let ok = 0; for (let i = 0; i < 45; i++) if (l.tryFlip('e*thirteen')) ok++;
  assert.equal(ok, 40); assert.equal(l.held['e*thirteen'], 5);
  assert.equal(l.tryFlip('Other'), true);   // other vendors have their own count
});

test('priceLines: one line per product', () => {
  const lines = priceLines([{ product: 'SYLVAN Wheels', from: 1000, to: 1050 }, { product: 'SYLVAN Wheels', from: 1010, to: 1060 }, { product: 'Hub', from: 80, to: 85 }], 'repriced');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'SYLVAN Wheels: 2 variants repriced (for example $1000.00 to $1050.00)');
  assert.equal(lines[1], 'Hub: 1 variant repriced (for example $80.00 to $85.00)');
});
