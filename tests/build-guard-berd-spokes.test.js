// Run with: npm test
// Berd spokes are not stocked by length. What the guard does with a master that lists Berd spoke variants, today and after the length variants are deleted.
// Result (documented by these tests): no guard code change is possible or needed. A deleted variant is "gone" and the guard cannot know which product it belonged to,
// so before any deletion the master's build_components must be re-pointed (data change) to the product's builder ("-") variant.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planMaster } = require('../lib/build-guard');

const raw = (spokes, mode) => JSON.stringify({ v: 1, components: [{ role: 'rim', variants: ['1'] }, { role: 'spokes', variants: spokes, ...(mode ? { mode } : {}) }] });
const mk = (spokes, mode) => ({ variantId: 'M', title: 'DT Swiss XRC 310 + Berd Talon 29" Wheelset', quantity: 3, policy: 'DENY', tracked: true, guardOff: false, guardState: null, componentsRaw: raw(spokes, mode) });
const ok = { found: true, quantity: 5, policy: 'DENY' };
const lengthVariant = { found: true, quantity: -16, policy: 'CONTINUE', label: 'Berd PolyLightX Spokes (Black / 294mm)' }; // $0, tracked, negative stock, CONTINUE
const dash = { found: true, quantity: -7, policy: 'CONTINUE', label: 'Berd PolyLightX Spokes (Black / -)' };
const sellable = { type: 'continue' };

test('today: the Berd length variants are CONTINUE, so the guard counts them as available (negative stock is fine)', () => {
  const states = new Map(Object.entries({ 1: ok, 294: lengthVariant, 291: lengthVariant, 296: lengthVariant, 297: lengthVariant }));
  assert.equal(planMaster({ master: mk(['294', '291', '296', '297'], 'all'), states, sellable }).action, 'none');
});

test('after the length variants are deleted and nothing else changed: the master is sold out ("missing") - this is why the entries must be swapped first', () => {
  const states = new Map(Object.entries({ 1: ok, 294: { found: false }, 291: { found: false }, 296: { found: false }, 297: { found: false } }));
  const p = planMaster({ master: mk(['294', '291', '296', '297'], 'all'), states, sellable });
  assert.equal(p.action, 'sell_out');
  assert.match(p.line, /294 \(missing\)/);
});

test('after the swap to the builder ("-") variant: available while that variant is CONTINUE or has stock, and deleting the length variants changes nothing', () => {
  const states = new Map(Object.entries({ 1: ok, 5000: dash }));
  assert.equal(planMaster({ master: mk(['5000']), states, sellable }).action, 'none');
  const guardClosed = { ...mk(['5000']), quantity: 0, guardState: 'sold_out_by_guard' };
  assert.equal(planMaster({ master: guardClosed, states, sellable }).action, 'restore', 'a build closed earlier because of missing variants comes back once the entry points at the "-" variant');
});

test('after the swap: a "-" variant that is DENY with no stock still closes the master (the guard keeps working for a real shortage)', () => {
  const states = new Map(Object.entries({ 1: ok, 5000: { found: true, quantity: 0, policy: 'DENY', label: 'Berd PolyLightX Spokes (Black / -)' } }));
  assert.equal(planMaster({ master: mk(['5000']), states, sellable }).action, 'sell_out');
});
