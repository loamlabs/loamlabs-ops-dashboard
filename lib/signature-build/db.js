// lib/signature-build/db.js
// Supabase-backed storage for plans, runs, locks and failed logins (tables in SIGNATURE_TOOL_TABLES.sql). The tests use an in-memory twin.
function createSupabaseDb(client) {
    const fail = (error) => { if (error) throw new Error(error.message); };
    return {
        async savePlan({ planId, planHash, plan, expiresAt }) {
            const { error } = await client.from('signature_plans').insert({ plan_id: planId, plan_hash: planHash, plan, expires_at: expiresAt });
            fail(error);
        },
        async getPlan(planId) {
            const { data, error } = await client.from('signature_plans').select('*').eq('plan_id', planId).maybeSingle();
            fail(error);
            return data;
        },
        async createRun({ runId, fingerprint, status, name, record }) {
            const { error } = await client.from('signature_runs').insert({ run_id: runId, fingerprint, status, name, record });
            if (error && /duplicate|unique/i.test(error.message)) throw new Error('duplicate build');
            fail(error);
        },
        async updateRun(runId, patch) {
            const { error } = await client.from('signature_runs').update({ ...patch, updated_at: new Date().toISOString() }).eq('run_id', runId);
            fail(error);
        },
        async getRun(runId) {
            const { data, error } = await client.from('signature_runs').select('*').eq('run_id', runId).maybeSingle();
            fail(error);
            return data;
        },
        async listRuns(limit = 50) {
            const { data, error } = await client.from('signature_runs').select('run_id,status,name,product_gid,variant_gid,created_at,updated_at').order('created_at', { ascending: false }).limit(limit);
            fail(error);
            return data || [];
        },
        async findActiveRunByFingerprint(fp) {
            const { data, error } = await client.from('signature_runs').select('run_id,status').eq('fingerprint', fp).in('status', ['creating', 'created']).limit(1);
            fail(error);
            return data && data[0] ? data[0] : null;
        },
        async acquireLock(key, holder, ttlMs) {
            await client.from('signature_locks').delete().eq('lock_key', key).lt('expires_at', new Date().toISOString());
            const { error } = await client.from('signature_locks').insert({ lock_key: key, holder, expires_at: new Date(Date.now() + ttlMs).toISOString() });
            if (!error) return true;
            if (/duplicate|unique/i.test(error.message)) return false;
            throw new Error(error.message);
        },
        async releaseLock(key, holder) {
            const { error } = await client.from('signature_locks').delete().eq('lock_key', key).eq('holder', holder);
            fail(error);
        },
        async recordFailure(key, at) {
            const { error } = await client.from('signature_auth_failures').insert({ client_key: key, at: new Date(at).toISOString() });
            fail(error);
        },
        async countFailures(key, sinceMs) {
            const { count, error } = await client.from('signature_auth_failures').select('id', { count: 'exact', head: true }).eq('client_key', key).gte('at', new Date(sinceMs).toISOString());
            fail(error);
            return count || 0;
        },
    };
}

module.exports = { createSupabaseDb };
