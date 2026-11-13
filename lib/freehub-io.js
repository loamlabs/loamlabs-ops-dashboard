// lib/freehub-io.js
// The Shopify side of freehub-follow, with the GraphQL call INJECTED (gql(query, variables) -> { data, errors }) so tests can fake it.
//   readHubFreehubLists(gql, productId)   -> { title, productRaw, watchRaw, variants: [{ id, raw }] } | null
//   applyFreehubWrites(gql, productId, hub, plan) -> { ok, stage?, detail?, rolledBack? }
// Order of a list change: the variants first (in batches), then the product (list + the Watcher's note). If anything fails, the variants already written are put
// back to their old value (best effort) and nothing about the hub is left half-changed for long; the Watcher reports it and retries on its next run.
const BATCH = 25;   // Shopify accepts at most 25 metafields per metafieldsSet call

async function readHubFreehubLists(gql, productId) {
    let after = null, title = null, productRaw = null, watchRaw = null; const variants = [];
    for (let page = 0; page < 20; page++) {
        const d = await gql(`query($id: ID!, $after: String) { product(id: $id) { title list: metafield(namespace: "custom", key: "freehub") { value } watch: metafield(namespace: "custom", key: "freehub_watch") { value }
          variants(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id fh: metafield(namespace: "custom", key: "freehub") { value } } } } }`, { id: `gid://shopify/Product/${productId}`, after });
        const p = d && d.data && d.data.product; if (!p) return null;
        if (page === 0) { title = p.title; productRaw = p.list ? p.list.value : null; watchRaw = p.watch ? p.watch.value : null; }
        for (const n of p.variants.nodes) variants.push({ id: String(n.id).replace(/\D/g, ''), raw: n.fh ? n.fh.value : null });
        if (!p.variants.pageInfo.hasNextPage) break; after = p.variants.pageInfo.endCursor;
    }
    return { title, productRaw, watchRaw, variants };
}

const errorsOf = (d) => [...((d && d.errors) || []).map((e) => e.message || String(e)), ...(((d && d.data && d.data.metafieldsSet && d.data.metafieldsSet.userErrors) || []).map((e) => e.message))];
async function setMetafields(gql, m) {
    try { const d = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { message } } }`, { m }); const e = errorsOf(d); return { ok: e.length === 0 && !!(d && d.data), errors: e }; }
    catch (e) { return { ok: false, errors: [e.message] }; }
}
const variantOwner = (id, key, type, value) => ({ ownerId: `gid://shopify/ProductVariant/${id}`, namespace: 'custom', key, type, value });

async function applyFreehubWrites(gql, productId, hub, plan) {
    const written = [];   // variant ids already changed, to roll back
    const rollback = async () => {
        let n = 0;
        for (let i = 0; i < written.length; i += BATCH) {
            const chunk = written.slice(i, i + BATCH);
            const m = chunk.map((id) => { const old = hub.variantsWithList.find((v) => String(v.id) === String(id)); return variantOwner(id, plan.variantEntry.key, plan.variantEntry.type, old.raw); });
            const r = await setMetafields(gql, m); if (r.ok) n += chunk.length;
        }
        return n;
    };
    if (plan.variantIds.length && plan.variantEntry) {
        for (let i = 0; i < plan.variantIds.length; i += BATCH) {
            const chunk = plan.variantIds.slice(i, i + BATCH);
            const r = await setMetafields(gql, chunk.map((id) => variantOwner(id, plan.variantEntry.key, plan.variantEntry.type, plan.variantEntry.value)));
            if (!r.ok) { const back = await rollback(); return { ok: false, stage: 'variants', detail: r.errors.join('; ').slice(0, 200), rolledBack: back }; }
            written.push(...chunk);
        }
    }
    if (plan.productEntries.length) {
        const r = await setMetafields(gql, plan.productEntries.map((e) => ({ ownerId: `gid://shopify/Product/${productId}`, namespace: 'custom', key: e.key, type: e.type, value: e.value })));
        if (!r.ok) { const back = written.length ? await rollback() : 0; return { ok: false, stage: 'product', detail: r.errors.join('; ').slice(0, 200), rolledBack: back }; }
    }
    return { ok: true, variantsWritten: written.length, productEntries: plan.productEntries.map((e) => e.key) };
}

module.exports = { BATCH, readHubFreehubLists, applyFreehubWrites };
