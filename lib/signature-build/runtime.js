// lib/signature-build/runtime.js
// Real wiring for the routes: Supabase for storage, Shopify client-credentials token, Admin API 2025-01.
const { createClient } = require('@supabase/supabase-js');
const { createSupabaseDb } = require('./db');
const { createShopifyBuildStore, API_VERSION } = require('./shopify');
const { createShopifyStore } = require('../build-guard-shopify');
const { makeGql } = require('../build-guard-shopify');
const { getShopifyToken } = require('../build-guard-run');
const { handle } = require('./handler');

function realDeps() {
    return {
        db: createSupabaseDb(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)),
        makeStore: async (env) => createShopifyBuildStore(makeGql(fetch, env.SHOPIFY_SHOP_NAME, await getShopifyToken(fetch, env), API_VERSION)),
        makeGuardStore: async (env) => createShopifyStore(makeGql(fetch, env.SHOPIFY_SHOP_NAME, await getShopifyToken(fetch, env), API_VERSION)),   // read-only use (drift report)
    };
}

/** Next.js API route body, shared by the four route files. */
async function route(action, req, res) {
    try {
        const out = await handle({ action, method: req.method, headers: req.headers, body: req.body, env: process.env, deps: realDeps() });
        res.status(out.status).json(out.body);
    } catch (e) {
        res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'The tool could not start (storage settings missing).' });
    }
}

module.exports = { route };
