// lib/signature-build/shopify.js
// Shopify Admin GraphQL store for the Create Signature Build tool. All requests go through the injected gql(query, variables) -> data,
// so tests can fake it. Needs only read_products / write_products.
// Writes: productCreate (DRAFT), productVariantsBulkUpdate (the new variant), metafieldsSet / metafieldsDelete (rim rules), productDelete (only a draft this tool made).
// It never publishes, never sets ACTIVE, never writes build_guard_state.
const { num } = require('./util');

const API_VERSION = '2025-01';
const NS = 'custom';

const VARIANTS_QUERY = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant {
  id title price inventoryQuantity inventoryPolicy selectedOptions { name value }
  inventoryItem { unitCost { amount } }
  product { id title handle status }
} } }`;

const PRODUCT_HEAD = `query($id: ID!) { product(id: $id) {
  id title vendor options { name values }
  freehub: metafield(namespace: "${NS}", key: "freehub") { value }
  freehubMap: metafield(namespace: "${NS}", key: "freehub_variant_map") { value }
  rules: metafield(namespace: "${NS}", key: "pre_configured_wheel_rules") { value compareDigest }
} }`;

const PRODUCT_VARIANTS = `query($id: ID!, $cursor: String) { product(id: $id) { variants(first: 100, after: $cursor) {
  pageInfo { hasNextPage endCursor }
  edges { node { id title price inventoryQuantity inventoryPolicy selectedOptions { name value } } }
} } }`;

const MASTERS_QUERY = `query($cursor: String) { products(first: 50, after: $cursor, query: "tag:loamlabs-build") {
  pageInfo { hasNextPage endCursor }
  edges { node { id handle title recipe: metafield(namespace: "${NS}", key: "build_recipe") { value } } }
} }`;

const CREATE = `mutation($product: ProductCreateInput!) { productCreate(product: $product) {
  product { id variants(first: 1) { edges { node { id } } } }
  userErrors { field message }
} }`;

const BULK_UPDATE = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
}`;

const READ_BACK = `query($id: ID!) { product(id: $id) {
  id status tags templateSuffix
  collections(first: 5) { edges { node { id } } }
  build_recipe: metafield(namespace: "${NS}", key: "build_recipe") { value }
  freehub: metafield(namespace: "${NS}", key: "freehub") { value }
  freehub_variant_map: metafield(namespace: "${NS}", key: "freehub_variant_map") { value }
  hidden: metafield(namespace: "seo", key: "hidden") { value }
  variants(first: 1) { edges { node { id price inventoryPolicy
    components: metafield(namespace: "${NS}", key: "build_components") { value }
    state: metafield(namespace: "${NS}", key: "build_guard_state") { value } } } }
} }`;

const RULES_QUERY = `query($id: ID!) { product(id: $id) { rules: metafield(namespace: "${NS}", key: "pre_configured_wheel_rules") { value compareDigest } } }`;
const STATUS_QUERY = `query($id: ID!) { product(id: $id) { status } }`;

const SET_META = `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`;
const DEL_META = `mutation($m: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $m) { userErrors { field message } } }`;
const DEL_PRODUCT = `mutation($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message } } }`;

function createShopifyBuildStore(gql) {
    const must = (data, key) => {
        const errs = (data && data[key] && data[key].userErrors) || [];
        if (errs.length) throw new Error(`${key}: ${errs.map((e) => e.message).join('; ').slice(0, 300)}`);
    };
    const toVariant = (n, product) => ({
        id: num(n.id), gid: n.id, title: n.title, price: Number(n.price), qty: n.inventoryQuantity, policy: n.inventoryPolicy,
        selectedOptions: n.selectedOptions, cost: n.inventoryItem && n.inventoryItem.unitCost ? Number(n.inventoryItem.unitCost.amount) : null,
        productGid: product ? product.id : undefined, productTitle: product ? product.title : undefined,
    });

    return {
        async getVariants(ids) {
            const out = new Map();
            for (let i = 0; i < ids.length; i += 50) {
                const chunk = ids.slice(i, i + 50);
                const d = await gql(VARIANTS_QUERY, { ids: chunk.map((id) => `gid://shopify/ProductVariant/${num(id)}`) });
                d.nodes.forEach((n, k) => { if (n) out.set(chunk[k], toVariant(n, n.product)); });
            }
            return out;
        },

        async getProduct(gid) {
            const d = await gql(PRODUCT_HEAD, { id: gid });
            const p = d.product;
            const variants = [];
            let cursor = null;
            for (;;) {
                const v = await gql(PRODUCT_VARIANTS, { id: gid, cursor });
                v.product.variants.edges.forEach((e) => variants.push(toVariant(e.node, p)));
                if (!v.product.variants.pageInfo.hasNextPage) break;
                cursor = v.product.variants.pageInfo.endCursor;
            }
            const json = (m) => { if (!m || !m.value) return null; try { return JSON.parse(m.value); } catch (e) { return null; } };
            return {
                gid: p.id, title: p.title, vendor: p.vendor, options: p.options, variants,
                freehub: json(p.freehub), freehubMap: json(p.freehubMap),
                rulesRaw: p.rules ? p.rules.value : null, rulesDigest: p.rules ? p.rules.compareDigest : null,
            };
        },

        async listMasters() {
            const out = [];
            let cursor = null;
            for (;;) {
                const d = await gql(MASTERS_QUERY, { cursor });
                d.products.edges.forEach(({ node }) => out.push({ productGid: node.id, handle: node.handle, title: node.title, recipeRaw: node.recipe ? node.recipe.value : null }));
                if (!d.products.pageInfo.hasNextPage) break;
                cursor = d.products.pageInfo.endCursor;
            }
            return out;
        },

        // product = the plan's product object (status DRAFT, tags, template, SEO, metafields)
        async createDraft(product) {
            const d = await gql(CREATE, { product: {
                title: product.title, handle: product.handle, vendor: product.vendor, productType: product.productType, tags: product.tags,
                templateSuffix: product.templateSuffix, status: 'DRAFT', descriptionHtml: product.descriptionHtml, seo: product.seo, metafields: product.metafields,
            } });
            must(d, 'productCreate');
            const p = d.productCreate.product;
            return { productGid: p.id, variantGid: p.variants.edges[0].node.id };
        },

        async updateVariant(productGid, variantGid, v) {
            must(await gql(BULK_UPDATE, { productId: productGid, variants: [{
                id: variantGid, price: v.price, compareAtPrice: null, inventoryPolicy: v.policy, inventoryItem: { tracked: !!v.tracked }, metafields: v.metafields,
            }] }), 'productVariantsBulkUpdate');
        },

        async readBack(productGid) {
            const d = await gql(READ_BACK, { id: productGid });
            const p = d.product;
            const v = p.variants.edges[0].node;
            const val = (m) => (m ? m.value : null);
            return {
                status: p.status, tags: p.tags, templateSuffix: p.templateSuffix, collectionCount: p.collections.edges.length,
                metafields: { 'custom.build_recipe': val(p.build_recipe), 'custom.freehub': val(p.freehub), 'custom.freehub_variant_map': val(p.freehub_variant_map), 'seo.hidden': val(p.hidden) },
                variantMetafields: { 'custom.build_components': val(v.components) },
                guardState: val(v.state), price: v.price, policy: v.inventoryPolicy,
            };
        },

        async getRules(gid) {
            const d = await gql(RULES_QUERY, { id: gid });
            const m = d.product.rules;
            return { raw: m ? m.value : null, digest: m ? m.compareDigest : null };
        },

        // digest = the compareDigest read just before; Shopify refuses the write if the metafield changed in between
        async setRules(gid, raw, digest) {
            const m = { ownerId: gid, namespace: NS, key: 'pre_configured_wheel_rules', type: 'json', value: raw };
            if (digest) m.compareDigest = digest;
            must(await gql(SET_META, { m: [m] }), 'metafieldsSet');
        },

        async deleteRules(gid) {
            must(await gql(DEL_META, { m: [{ ownerId: gid, namespace: NS, key: 'pre_configured_wheel_rules' }] }), 'metafieldsDelete');
        },

        async getProductStatus(gid) {
            const d = await gql(STATUS_QUERY, { id: gid });
            return d.product ? d.product.status : null;
        },

        async deleteProduct(gid) {
            must(await gql(DEL_PRODUCT, { input: { id: gid } }), 'productDelete');
        },
    };
}

module.exports = { createShopifyBuildStore, API_VERSION };
