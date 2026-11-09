// Run with: npm test   (no network)
// The build guard started after the Vendor Watcher (dry run for now), and the one-live-run-at-a-time lock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { executeGuard } = require('../lib/build-guard-run');
const { guardAfterWatcher, GUARD_AFTER_WATCHER, BUDGET_MS } = require('../lib/guard-trigger');

const fakeFetch = async () => ({ json: async () => ({ access_token: 'x' }) });
const env = { SHOPIFY_SHOP_NAME: 'shop' };
const result = (over = {}) => ({ changed: [], skipped: [], failed: [], emailLines: [], driftLines: [], driftRows: [], mastersSeen: 100, ...over });
const fakeLock = (taken = false) => { const log = []; return { log, async acquire() { log.push('acquire'); return !taken; }, async release() { log.push('release'); } }; };
const LIVE = { live: '1', phrase: 'RUN BUILD GUARD LIVE' };

test('the Watcher-side trigger is LIVE (Jerry, Nov 8): the one word that is flipped', () => {
    assert.equal(GUARD_AFTER_WATCHER, 'live');
});

test('live run: takes the lock, runs, sends the email with the trigger in the subject, releases the lock', async () => {
    const lock = fakeLock(); let called = 0; const mails = [];
    const r = await executeGuard({ query: LIVE, env, fetchFn: fakeFetch, trigger: 'watcher', lock, runGuard: async () => { called++; return result({ changed: [{ variantId: '1' }], emailLines: ['a line'] }); }, sendEmail: async (s, l) => mails.push([s, l]) });
    assert.equal(r.status, 200); assert.equal(called, 1); assert.deepEqual(lock.log, ['acquire', 'release']); assert.equal(r.body.trigger, 'watcher'); assert.equal(r.body.mode, 'live');
    assert.match(mails[0][0], /1 build changed \(started by watcher\)/);
});

test('a second live run while one is running: stops at once, writes nothing, sends nothing, does not release the other run\'s lock', async () => {
    const lock = fakeLock(true); let called = 0; const mails = [];
    const r = await executeGuard({ query: LIVE, env, fetchFn: fakeFetch, trigger: 'github', lock, runGuard: async () => { called++; return result(); }, sendEmail: async () => mails.push(1) });
    assert.equal(r.status, 200); assert.equal(called, 0); assert.equal(mails.length, 0); assert.match(r.body.lockSkipped, /in progress/); assert.deepEqual(lock.log, ['acquire']);
});

test('the lock is released even when the guard throws; a dry run needs no lock', async () => {
    const lock = fakeLock();
    const r = await executeGuard({ query: LIVE, env, fetchFn: fakeFetch, lock, runGuard: async () => { throw new Error('boom'); } });
    assert.equal(r.status, 500); assert.deepEqual(lock.log, ['acquire', 'release']);
    const lock2 = fakeLock(true);
    const d = await executeGuard({ query: {}, env, fetchFn: fakeFetch, lock: lock2, runGuard: async () => result() });
    assert.equal(d.body.mode, 'dry-run'); assert.deepEqual(lock2.log, []);
});

test('no lock available (no database in the environment): live run goes ahead as before', async () => {
    const r = await executeGuard({ query: LIVE, env, fetchFn: fakeFetch, lock: null, runGuard: async () => result() });
    assert.equal(r.status, 200); assert.equal(r.body.lockSkipped, undefined);
});

test('after the Watcher, dry: plans only (no live parameters, no email, no lock), logs one guard_dry row with the count and timing', async () => {
    const rows = []; const supabase = { from: (t) => ({ insert: async (r) => rows.push([t, r[0]]) }) }; let seen = null;
    const out = await guardAfterWatcher({ env, supabase, startedAtMs: Date.now() - 1000, mode: 'dry', run: async (a) => { seen = a; return { status: 200, body: result({ changed: [1, 2, 3], mastersSeen: 100 }) }; } });
    assert.deepEqual(seen.query, {}); assert.equal(seen.sendEmail, null); assert.equal(seen.lock, null); assert.equal(seen.trigger, 'watcher');
    assert.equal(rows.length, 1); assert.equal(rows[0][0], 'sync_logs'); assert.equal(rows[0][1].status, 'guard_dry'); assert.match(rows[0][1].message, /trigger=watcher dry: would change 3, skipped 0, failed 0, masters 100, \d+ s/);
    assert.equal(out.ran, true);
});

test('after the Watcher, live (a later approval): live parameters, the email function and a lock are passed', async () => {
    const mailer = async () => {}; const lock = fakeLock(); let seen = null; const rows = [];
    await guardAfterWatcher({ env, supabase: { from: () => ({ insert: async (r) => rows.push(r[0]) }) }, sendEmail: mailer, mode: 'live', lock, run: async (a) => { seen = a; return { status: 200, body: result() }; } });
    assert.deepEqual(seen.query, { live: '1', phrase: 'RUN BUILD GUARD LIVE', max: '10' }); assert.equal(seen.sendEmail, mailer); assert.equal(seen.lock, lock); assert.equal(rows[0].status, 'guard_live');
});

test('it never throws and never blocks the Watcher: a failing guard, a failing log table, a Watcher that used too much time, trigger off', async () => {
    const bad = { from: () => ({ insert: async () => { throw new Error('db down'); } }) };
    const a = await guardAfterWatcher({ env, supabase: bad, mode: 'dry', run: async () => { throw new Error('guard down'); } });
    assert.match(a.line, /error guard down/);
    let called = 0;
    const b = await guardAfterWatcher({ env, supabase: null, startedAtMs: Date.now() - (BUDGET_MS + 5000), mode: 'dry', run: async () => { called++; return { status: 200, body: result() }; } });
    assert.equal(called, 0); assert.match(b.line, /not run: the Watcher already used/);
    const c = await guardAfterWatcher({ env, supabase: null, mode: 'off', run: async () => { called++; } });
    assert.equal(c.ran, false); assert.equal(called, 0);
    const d = await guardAfterWatcher({ env, supabase: null, mode: 'dry', run: async () => ({ status: 200, body: { lockSkipped: 'another guard run is in progress' } }) });
    assert.match(d.line, /skipped, another guard run is in progress/);
});
