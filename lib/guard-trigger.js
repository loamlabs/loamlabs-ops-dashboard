// lib/guard-trigger.js
// The build guard started from other jobs ("piggyback"), so it runs minutes after stock may have changed instead of whenever GitHub's schedule gets to it.
// Plain CommonJS. Never throws: a guard problem must never change the result of the job it rides on.

// WATCHER SIDE ONLY (Jerry, Nov 6). 'dry' = the guard only plans, writes nothing to the store, sends no email, and the result is written to sync_logs
// (status 'guard_dry') so the timing can be checked for two days. Going live is a separate, typed approval ('GUARD TRIGGERS LIVE'): change this one word to 'live'.
const GUARD_AFTER_WATCHER = 'live';   // Jerry typed GUARD TRIGGERS LIVE (Nov 8 2026) after clean dry samples on consecutive Watcher runs
const BUDGET_MS = 240000;   // /api/sync may run 300 s; the guard (about 5 to 15 s) only starts when the Watcher used less than this

const { executeGuard } = require('./build-guard-run');
const { createGuardLock } = require('./guard-lock');
const { PHRASE } = require('./build-guard-mode');

/**
 * @param {object} p { env, supabase, fetchFn, sendEmail, startedAtMs, mode, now, run, lock }  (run / lock: test hooks)
 * @returns {Promise<{ran:boolean, line:string}>}
 */
async function guardAfterWatcher({ env, supabase, fetchFn = fetch, sendEmail = null, startedAtMs = Date.now(), mode = GUARD_AFTER_WATCHER, now = Date.now, run = executeGuard, lock = null }) {
    const t0 = now();
    try {
        if (mode !== 'dry' && mode !== 'live') return { ran: false, line: 'guard trigger is off' };
        const used = t0 - startedAtMs;
        if (used > BUDGET_MS) return await log(supabase, mode, `trigger=watcher not run: the Watcher already used ${Math.round(used / 1000)} s of its 300 s`);
        const query = mode === 'live' ? { live: '1', phrase: PHRASE, max: '10' } : {};
        const { status, body } = await run({ query, env, fetchFn, sendEmail: mode === 'live' ? sendEmail : null, trigger: 'watcher', lock: mode === 'live' ? (lock || createGuardLock(env)) : null });
        const took = Math.round((now() - t0) / 1000);
        let line;
        if (body && body.lockSkipped) line = `trigger=watcher ${mode}: skipped, ${body.lockSkipped} (${took} s)`;
        else if (status !== 200) line = `trigger=watcher ${mode}: error ${status} ${String(body && body.error || '').slice(0, 120)} (${took} s)`;
        else line = `trigger=watcher ${mode}: ${mode === 'dry' ? 'would change' : 'changed'} ${(body.changed || []).length}, skipped ${(body.skipped || []).length}, failed ${(body.failed || []).length}, masters ${body.mastersSeen}, ${took} s`;
        return await log(supabase, mode, line);
    } catch (err) {
        return await log(supabase, mode, `trigger=watcher ${mode}: error ${String(err && err.message || err).slice(0, 160)}`);
    }
}

async function log(supabase, mode, line) {
    try {
        if (supabase) await supabase.from('sync_logs').insert([{ status: mode === 'live' ? 'guard_live' : 'guard_dry', message: line }]);
    } catch (e) { /* the log row is a convenience */ }
    return { ran: true, line };
}

module.exports = { guardAfterWatcher, GUARD_AFTER_WATCHER, BUDGET_MS };
