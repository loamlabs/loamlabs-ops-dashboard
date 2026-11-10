// lib/shopify-variant-status.js
// READ-ONLY: for Shopify variant ids, the status of their product: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'MISSING' (variant or product not found). Network injected for tests.
const { makeGql } = require('./build-guard-shopify');
const { getShopifyToken } = require('./build-guard-run');

function createStatusLookup({ gql }) {
    return async function statusLookup(variantIds) {
        const out = {}; const ids = [...new Set(variantIds.map(String))];
        for (let i = 0; i < ids.length; i += 50) {
            const chunk = ids.slice(i, i + 50);
            const d = await gql('query($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id product{status}}}}', { ids: chunk.map((v) => `gid://shopify/ProductVariant/${v}`) });
            chunk.forEach((v, k) => { const n = d.nodes[k]; out[v] = n && n.product && n.product.status ? n.product.status : 'MISSING'; });
        }
        return out;
    };
}

async function liveStatusLookup(env, fetchFn = fetch) {
    const token = await getShopifyToken(fetchFn, env);
    return createStatusLookup({ gql: makeGql(fetchFn, env.SHOPIFY_SHOP_NAME, token, '2025-01') });
}

module.exports = { createStatusLookup, liveStatusLookup };
