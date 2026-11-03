// lib/signature-build/handler.js
// One entry point for the four routes: auth first, then the action. Returns { status, body }; never throws.
// deps = { db, makeStore(env) -> store }  (injected so tests use fakes)
const { ToolError } = require('./util');
const { checkAccess } = require('./auth');
const { planBuild } = require('./plan');
const { createBuild, undoRun } = require('./execute');

/** @param {object} p { action: 'plan'|'create'|'undo'|'runs', method, headers, body, env, deps, now? } */
async function handle({ action, method, headers, body, env, deps, now = Date.now() }) {
    try {
        const wantGet = action === 'runs';
        if ((wantGet && method !== 'GET') || (!wantGet && method !== 'POST')) throw new ToolError('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
        await checkAccess({ headers, env, db: deps.db, now });
        const b = body || {};
        if (action === 'runs') return { status: 200, body: { ok: true, runs: await deps.db.listRuns() } };
        const store = await deps.makeStore(env);
        if (action === 'plan') {
            const plan = await planBuild({ store, db: deps.db, recipe: b.recipe, overrides: b.overrides || {}, now });
            return { status: 200, body: plan };
        }
        if (action === 'create') {
            if (!b.planId || !b.planHash) throw new ToolError('PLAN_EXPIRED', 'The plan is older than 30 minutes or changed. Run the preview again.', 410);
            return { status: 200, body: await createBuild({ store, db: deps.db, planId: b.planId, planHash: b.planHash, price: b.price, belowFloorOk: b.belowFloorOk === true, now }) };
        }
        if (action === 'undo') return { status: 200, body: await undoRun({ store, db: deps.db, runId: b.runId, confirm: b.confirm }) };
        throw new ToolError('NOT_FOUND', 'Unknown action.', 404);
    } catch (err) {
        if (err instanceof ToolError) return { status: err.status, body: { ok: false, code: err.code, message: err.message, ...err.extra } };
        return { status: 500, body: { ok: false, code: 'SERVER_ERROR', message: String(err.message || err).slice(0, 300) } };
    }
}

module.exports = { handle };
