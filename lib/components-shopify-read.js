// lib/components-shopify-read.js
// READ-ONLY Shopify reads for the component library reports (products by component tag, variant statuses, ERD and weight of linked variants).
async function productsByTag(gql, tag) {
    const out = []; let c = null;
    for (;;) {
        const d = await gql('query($c:String,$q:String){products(first:50,after:$c,query:$q){pageInfo{hasNextPage endCursor} edges{node{id title status vendor variants(first:100){edges{node{id}}}}}}}', { c, q: `tag:'${tag}'` });
        out.push(...d.products.edges.map((e) => ({ id: e.node.id.split('/').pop(), title: e.node.title, status: e.node.status, vendor: e.node.vendor, variantIds: e.node.variants.edges.map((v) => v.node.id.split('/').pop()) })));
        if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor;
    }
    return out;
}
/** {variantId: {status, erd, weight}} for linked rows */
async function variantFacts(gql, variantIds) {
    const out = {}; const ids = [...new Set(variantIds.map(String))];
    for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const d = await gql('query($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id product{status} erd:metafield(namespace:"custom",key:"rim_erd"){value} wt:metafield(namespace:"custom",key:"weight_g"){value}}}}', { ids: chunk.map((v) => `gid://shopify/ProductVariant/${v}`) });
        chunk.forEach((v, k) => { const n = d.nodes[k]; out[v] = n && n.product ? { status: n.product.status, erd: n.erd ? Number(n.erd.value) : null, weight: n.wt ? Number(n.wt.value) : null } : { status: 'MISSING', erd: null, weight: null }; });
    }
    return out;
}
module.exports = { productsByTag, variantFacts };
