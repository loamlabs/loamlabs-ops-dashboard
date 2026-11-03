// lib/build-guard-run.js
// One entry point for the guard, shared by /api/build-guard and run-build-guard-locally.js (plain CommonJS, so it runs under plain node too).
const { runBuildGuard } = require('./build-guard');
const { createShopifyStore, makeGql } = require('./build-guard-shopify');
const { parseGuardRequest } = require('./build-guard-mode');

async function getShopifyToken(fetchFn, env) {
    const response = await fetchFn(`https://${env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' }),
    });
    const data = await response.json();
    if (!data.access_token) throw new Error('could not get a Shopify token');
    return data.access_token;
}

/**
 * @param {object} p { query, env, fetchFn, sendEmail(subject, lines) }
 * @returns {Promise<{status:number, body:object}>}
 */
async function executeGuard({ query, env, fetchFn = fetch, sendEmail = null }) {
    const mode = parseGuardRequest(query);
    if (!mode.ok) return { status: 400, body: { error: mode.error } };
    try {
        const token = await getShopifyToken(fetchFn, env);
        const store = createShopifyStore(makeGql(fetchFn, env.SHOPIFY_SHOP_NAME, token), { onlyVariantId: mode.only });
        const result = await runBuildGuard(store, { sellable: { type: 'continue' }, dryRun: mode.dry, maxWrites: mode.max });
        if (!mode.dry && result.emailLines.length > 0 && sendEmail) {
            await sendEmail(`Build guard: ${result.changed.length} build${result.changed.length === 1 ? '' : 's'} changed`, result.emailLines);
        }
        return { status: 200, body: { mode: mode.dry ? 'dry-run' : 'live', ...result } };
    } catch (err) {
        return { status: 500, body: { error: err.message } };
    }
}

module.exports = { executeGuard, getShopifyToken };
