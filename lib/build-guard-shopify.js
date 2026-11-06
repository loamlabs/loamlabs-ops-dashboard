// lib/build-guard-shopify.js
// Shopify Admin GraphQL store for lib/build-guard.js. All requests go through the injected gql(query, variables) -> data function, so tests can fake it.
// Masters: variants that have the variant metafield custom.build_components, on products tagged "loamlabs-build" (ACTIVE or DRAFT; archived are ignored).
// Writes (only ever on masters): productVariantsBulkUpdate (policy + inventory tracking), inventorySetQuantities (quantity 0 when closing),
// metafieldsSet (custom.build_guard_state). Nothing else is written.
// Hub-choice build: a product may hold more than 100 guarded variants (the variants are paged, nothing is silently dropped), and writes are
// batched per product (one bulk update, one quantity call, one metafield call per product instead of three calls per variant).

const MASTER_TAG = 'loamlabs-build';
const NS = 'custom';

const VARIANT_FIELDS = `
        id title price inventoryPolicy inventoryQuantity
        inventoryItem { id tracked }
        components: metafield(namespace: "${NS}", key: "build_components") { value }
        state: metafield(namespace: "${NS}", key: "build_guard_state") { value }
        off: metafield(namespace: "${NS}", key: "build_guard_off") { value }`;

const MASTERS_QUERY = `query($cursor: String, $q: String!) {
  products(first: 25, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id title status
      variants(first: 100) { pageInfo { hasNextPage endCursor } edges { node {${VARIANT_FIELDS}
      } } }
    } }
  }
}`;

// More than 100 variants on one product: the rest are read here, 100 at a time, so no variant is left unguarded.
const VARIANTS_PAGE_QUERY = `query($id: ID!, $cursor: String) {
  product(id: $id) {
    variants(first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } edges { node {${VARIANT_FIELDS}
    } } }
  }
}`;

// Locations are read only when a quantity really has to be written (needs the read_inventory scope, which the dashboard app may not have).
const LEVELS_QUERY = `query($id: ID!) { inventoryItem(id: $id) { inventoryLevels(first: 10) { edges { node { location { id } } } } } }`;

const COMPONENTS_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) { ... on ProductVariant { id title price inventoryQuantity inventoryPolicy inventoryItem { unitCost { amount } } product { title } } }
}`;

const BULK_UPDATE = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
}`;

const SET_QTY = `mutation($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) { userErrors { field message } }
}`;

const SET_META = `mutation($m: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $m) { userErrors { field message } }
}`;

const num = (gid) => String(gid || '').split('/').pop();
const META_CHUNK = 25;   // metafieldsSet takes at most 25 per call

function createShopifyStore(gql, { statuses = ['ACTIVE', 'DRAFT'], onlyVariantId = null } = {}) {
    const must = (data, key) => {
        const errs = (data && data[key] && data[key].userErrors) || [];
        if (errs.length) throw new Error(`${key}: ${errs.map((e) => e.message).join('; ').slice(0, 200)}`);
    };

    const toMaster = (p, v) => ({
        variantId: num(v.id),
        gid: v.id,
        productId: p.id,
        productTitle: p.title,
        productStatus: p.status,
        title: v.title && v.title !== 'Default Title' ? `${p.title} (${v.title})` : p.title,
        quantity: v.inventoryQuantity,
        policy: v.inventoryPolicy,
        price: v.price === undefined || v.price === null ? null : Number(v.price),
        tracked: v.inventoryItem ? v.inventoryItem.tracked : null,
        inventoryItemId: v.inventoryItem ? v.inventoryItem.id : null,
        guardOff: !!(v.off && String(v.off.value).toLowerCase() === 'true'),
        guardState: v.state && v.state.value ? v.state.value : null,
        componentsRaw: v.components.value,
    });

    return {
        async listMasters() {
            const masters = [];
            let cursor = null;
            for (;;) {
                const data = await gql(MASTERS_QUERY, { cursor, q: `tag:${MASTER_TAG}` });
                const conn = data.products;
                for (const { node: p } of conn.edges) {
                    if (!statuses.includes(p.status)) continue;
                    let edges = p.variants.edges;
                    let info = p.variants.pageInfo;
                    while (info && info.hasNextPage) {                       // page the variants past the first 100
                        const more = await gql(VARIANTS_PAGE_QUERY, { id: p.id, cursor: info.endCursor });
                        edges = edges.concat(more.product.variants.edges);
                        info = more.product.variants.pageInfo;
                    }
                    for (const { node: v } of edges) {
                        if (!v.components || v.components.value == null || String(v.components.value).trim() === '') continue;   // not a guarded build
                        if (onlyVariantId && num(v.id) !== String(onlyVariantId)) continue;
                        masters.push(toMaster(p, v));
                    }
                }
                if (!conn.pageInfo.hasNextPage) break;
                cursor = conn.pageInfo.endCursor;
            }
            return masters;
        },

        async readComponents(ids) {
            const states = new Map();
            for (let i = 0; i < ids.length; i += 100) {
                const chunk = ids.slice(i, i + 100);
                const data = await gql(COMPONENTS_QUERY, { ids: chunk.map((id) => `gid://shopify/ProductVariant/${id}`) });
                data.nodes.forEach((n, k) => {
                    const id = chunk[k];
                    if (!n) states.set(id, { found: false });
                    else {
                        const st = { found: true, quantity: n.inventoryQuantity, policy: n.inventoryPolicy, label: `${n.product.title} (${n.title})` };
                        if (n.price !== undefined && n.price !== null) st.price = Number(n.price);
                        if (n.inventoryItem && n.inventoryItem.unitCost) st.cost = Number(n.inventoryItem.unitCost.amount);
                        states.set(id, st);
                    }
                });
            }
            return states;
        },

        // write = { quantity?, policy, state, trackInventory }
        async writeMaster(master, write) {
            const [r] = await this.writeMasters([{ master, write }]);
            if (r.error) throw new Error(r.error);
        },

        /**
         * Batch writer: items = [{ master, write }]. One bulk update, one quantity call and one metafield call per product
         * (instead of three calls per variant). Returns one { variantId, error? } per item, in order; one product failing never stops the others.
         */
        async writeMasters(items) {
            const results = items.map((it) => ({ variantId: it.master.variantId }));
            const byProduct = new Map();
            items.forEach((it, i) => {
                if (!it.master.gid || !it.master.productId) { results[i].error = 'master is missing its Shopify ids'; return; }
                if (!byProduct.has(it.master.productId)) byProduct.set(it.master.productId, []);
                byProduct.get(it.master.productId).push(i);
            });
            for (const [productId, idxs] of byProduct) {
                try {
                    // 1. policy (+ tracking only when it is not already on, so nothing needs an inventory scope when nothing about stock changes)
                    const variants = idxs.map((i) => {
                        const { master, write } = items[i];
                        const v = { id: master.gid, inventoryPolicy: write.policy };
                        if (write.trackInventory && master.tracked !== true) v.inventoryItem = { tracked: true };
                        return v;
                    });
                    must(await gql(BULK_UPDATE, { productId, variants }), 'productVariantsBulkUpdate');
                    // 2. quantity: only when a master really holds stock (closing a build sets it to 0 at every location; needs read/write_inventory scopes)
                    const quantities = [];
                    for (const i of idxs) {
                        const { master, write } = items[i];
                        if (write.quantity !== undefined && Number(master.quantity) !== write.quantity) {
                            if (!master.inventoryItemId) throw new Error('master has no inventory item');
                            const lv = await gql(LEVELS_QUERY, { id: master.inventoryItemId });
                            const locationIds = lv.inventoryItem.inventoryLevels.edges.map((e) => e.node.location.id);
                            if (locationIds.length === 0) throw new Error('master has no inventory location');
                            locationIds.forEach((locationId) => quantities.push({ inventoryItemId: master.inventoryItemId, locationId, quantity: write.quantity }));
                        }
                    }
                    if (quantities.length) must(await gql(SET_QTY, { input: { name: 'available', reason: 'correction', ignoreCompareQuantity: true, quantities } }), 'inventorySetQuantities');
                    // 3. who closed / opened it (the guard only reopens what it closed)
                    const metas = idxs.map((i) => ({ ownerId: items[i].master.gid, namespace: NS, key: 'build_guard_state', type: 'single_line_text_field', value: items[i].write.state }));
                    for (let c = 0; c < metas.length; c += META_CHUNK) must(await gql(SET_META, { m: metas.slice(c, c + META_CHUNK) }), 'metafieldsSet');
                } catch (e) {
                    idxs.forEach((i) => { if (!results[i].error) results[i].error = e.message; });
                }
            }
            return results;
        },
    };
}

/** Real gql over fetch (Admin API 2024-04 unless a version is given). Throws on transport / GraphQL errors. */
function makeGql(fetchFn, shop, token, version = '2024-04') {
    return async function gql(query, variables) {
        const res = await fetchFn(`https://${shop}.myshopify.com/admin/api/${version}/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
        });
        if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
        const body = await res.json();
        if (body.errors) throw new Error(`Shopify: ${JSON.stringify(body.errors).slice(0, 200)}`);
        return body.data;
    };
}

module.exports = { createShopifyStore, makeGql, MASTER_TAG, MASTERS_QUERY, VARIANTS_PAGE_QUERY };
