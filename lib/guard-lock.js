// lib/guard-lock.js
// One live guard run at a time, whoever starts it (GitHub schedule, the Watcher, a hand run). Uses the existing signature_locks table (key 'guard', 3 minute TTL),
// so no new table. Returns null when there is no database in the environment (then there is no lock and the run goes ahead as it always did).
const crypto = require('crypto');
const KEY = 'guard';
const TTL_MS = 3 * 60 * 1000;

function createGuardLock(env) {
    if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
    const { createClient } = require('@supabase/supabase-js');
    const { createSupabaseDb } = require('./signature-build/db');
    const db = createSupabaseDb(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY));
    const holder = crypto.randomUUID();
    return {
        async acquire() { try { return await db.acquireLock(KEY, holder, TTL_MS); } catch (e) { return true; } },   // a broken lock table must not stop the guard
        async release() { try { await db.releaseLock(KEY, holder); } catch (e) { /* expires by itself */ } },
    };
}

module.exports = { createGuardLock, KEY, TTL_MS };
