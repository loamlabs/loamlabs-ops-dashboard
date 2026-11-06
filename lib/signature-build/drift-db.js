// lib/signature-build/drift-db.js
// Storage for the price drift basis (table in SIGNATURE_PRICE_BASIS.sql). The guard run uses createDriftAdapter(env); the dashboard routes use
// the same functions through the tool's database object. The table holds prices only (no customer data). Nothing here writes to Shopify.
const BASIS_TABLE = 'signature_price_basis';

function basisMethods(client) {
    const fail = (error) => { if (error) throw new Error(error.message); };
    return {
        async readBasis(variantIds) {
            const map = new Map();
            for (let i = 0; i < variantIds.length; i += 100) {
                const { data, error } = await client.from(BASIS_TABLE).select('*').in('variant_id', variantIds.slice(i, i + 100));
                fail(error);
                (data || []).forEach((r) => map.set(String(r.variant_id), r));
            }
            return map;
        },
        async saveBasis(rows) {
            for (let i = 0; i < rows.length; i += 200) {
                const { error } = await client.from(BASIS_TABLE).upsert(rows.slice(i, i + 200), { onConflict: 'variant_id' });
                fail(error);
            }
        },
        async listBasis() {
            const { data, error } = await client.from(BASIS_TABLE).select('variant_id,title,master_price,taken_at,reported_sig').limit(1000);
            fail(error);
            return data || [];
        },
    };
}

/** For the guard run (GitHub Actions or the endpoint): its own Supabase client from the environment. */
function createDriftAdapter(env) {
    const { createClient } = require('@supabase/supabase-js');
    return basisMethods(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY));
}

module.exports = { basisMethods, createDriftAdapter, BASIS_TABLE };
