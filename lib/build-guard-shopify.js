// lib/build-guard-shopify.js
// Shopify Admin GraphQL store for lib/build-guard.js. All requests go through the injected gql(query, variables) -> data function, so tests can fake it.
// Masters: variants that have the variant metafield custom.build_components, on products tagged "loamlabs-build" (ACTIVE or DRAFT; archived are ignored).
// Writes (only ever on masters): productVariantsBulkUpdate (policy + inventory tracking), inventorySetQuantities (quantity 0 when closing),
// metafieldsSet (custom.build_guard_state). Nothing else is written.

const MASTER_TAG = 'loamlabs-build';
const NS = 'custom';

const MASTERS_QUERY = `query($cursor: String, $q: String!) {
  products(first: 25, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id title status
      variants(first: 100) { edges { node {
        id title inventoryPolicy inventoryQuantity
        inventoryItem { id tracked }
        components: metafield(namespace: "${NS}", key: "build_components") { value }
        state: metafield(namespace: "${NS}", key: "build_guard_state") { value }
        off: metafield(namespace: "${NS}", key: "build_guard_off") { value }
      } } }
    } }
  }
}`;

// Locations are read only when a quantity really has to be written (needs the read_inventory scope, which the dashboard app may not have).
const LEVELS_QUERY = `query($id: ID!) { inventoryItem(id: $id) { inventoryLevels(first: 10) { edges { node { location { id } } } } } }`;

const COMPONENTS_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) { ... on ProductVariant { id title inventoryQuantity inventoryPolicy product { title } } }
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

function createShopifyStore(gql, { statuses = ['ACTIVE', 'DRAFT'], onlyVariantId = null } = {}) {
    const must = (data, key) => {
        const errs = (data && data[key] && data[key].userErrors) || [];
        if (errs.length) throw new Error(`${key}: ${errs.map((e) => e.message).join('; ').slice(0, 200)}`);
    };

    return {
        async listMasters() {
            const masters = [];
            let cursor = null;
            for (;;) {
                const data = await gql(MASTERS_QUERY, { cursor, q: `tag:${MASTER_TAG}` });
                const conn = data.products;
                for (const { node: p } of conn.edges) {
                    if (!statuses.includes(p.status)) continue;
                    for (const { node: v } of p.variants.edges) {
                        if (!v.components || v.components.value == null || String(v.components.value).trim() === '') continue;   // not a guarded build
                        const id = num(v.id);
                        if (onlyVariantId && id !== String(onlyVariantId)) continue;
                        masters.push({
                            variantId: id,
                            gid: v.id,
                            productId: p.id,
                            productStatus: p.status,
                            title: v.title && v.title !== 'Default Title' ? `${p.title} (${v.title})` : p.title,
                            quantity: v.inventoryQuantity,
                            policy: v.inventoryPolicy,
                            tracked: v.inventoryItem ? v.inventoryItem.tracked : null,
                            inventoryItemId: v.inventoryItem ? v.inventoryItem.id : null,
                                                        guardOff: !!(v.off && String(v.off.value).toLowerCase() === 'true'),
                            guardState: v.state && v.state.value ? v.state.value : null,
                            componentsRaw: v.components.value,
                        });
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
                    else states.set(id, { found: true, quantity: n.inventoryQuantity, policy: n.inventoryPolicy, label: `${n.product.title} (${n.title})` });
                });
            }
            return states;
        },

        // write = { quantity?, policy, state, trackInventory }
        async writeMaster(master, write) {
            if (!master.gid || !master.productId) throw new Error('master is missing its Shopify ids');
            // 1. policy (+ tracking only when it is not already on, so nothing needs an inventory scope when nothing about stock changes)
            const variant = { id: master.gid, inventoryPolicy: write.policy };
            if (write.trackInventory && master.tracked !== true) variant.inventoryItem = { tracked: true };
            must(await gql(BULK_UPDATE, { productId: master.productId, variants: [variant] }), 'productVariantsBulkUpdate');
            // 2. quantity: only when the master really holds stock (closing a build sets it to 0 at every location; needs read/write_inventory scopes)
            if (write.quantity !== undefined && Number(master.quantity) !== write.quantity) {
                if (!master.inventoryItemId) throw new Error('master has no inventory item');
                const lv = await gql(LEVELS_QUERY, { id: master.inventoryItemId });
                const locationIds = lv.inventoryItem.inventoryLevels.edges.map((e) => e.node.location.id);
                if (locationIds.length === 0) throw new Error('master has no inventory location');
                must(await gql(SET_QTY, {
                    input: {
                        name: 'available', reason: 'correction', ignoreCompareQuantity: true,
                        quantities: locationIds.map((locationId) => ({ inventoryItemId: master.inventoryItemId, locationId, quantity: write.quantity })),
                    },
                }), 'inventorySetQuantities');
            }
            // 3. who closed / opened it (the guard only reopens what it closed)
            must(await gql(SET_META, { m: [{ ownerId: master.gid, namespace: NS, key: 'build_guard_state', type: 'single_line_text_field', value: write.state }] }), 'metafieldsSet');
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

module.exports = { createShopifyStore, makeGql, MASTER_TAG, MASTERS_QUERY };
