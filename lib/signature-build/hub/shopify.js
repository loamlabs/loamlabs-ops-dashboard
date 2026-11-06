// lib/signature-build/hub/shopify.js
// Extra Shopify Admin calls for hub-choice products, added to the store object by createShopifyBuildStore.
// Reads: part products with their custom metafields (hub flange numbers, hub type, washer, spoke interface ...).
// Writes (DRAFT products only, made by this tool): productCreate with options, productVariantsBulkCreate, productVariantsBulkUpdate (first variant),
// and the same rim-rules metafield write as the single-build tool. Nothing is published; the product is read back after creation.
// UNVERIFIED against the real store until the throwaway test (HUB_CHOICE_REAL_TEST_PLAN.md): productCreate with productOptions, bulk create with
// optionValues and variant metafields at API 2025-01.
const { num } = require('../util');

const NS = 'custom';

const PART_PRODUCT = `query($id: ID!, $cursor: String) { product(id: $id) {
  id title vendor tags options { name values }
  metafields(first: 60, namespace: "${NS}") { edges { node { key value } } }
  rules: metafield(namespace: "${NS}", key: "pre_configured_wheel_rules") { value compareDigest }
  variants(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node { id title price inventoryQuantity inventoryPolicy selectedOptions { name value }
      inventoryItem { unitCost { amount } }
      spacing: metafield(namespace: "${NS}", key: "wheel_spec_hub_spacing") { value }
      brake: metafield(namespace: "${NS}", key: "wheel_spec_brake_interface") { value }
      erd: metafield(namespace: "${NS}", key: "rim_erd") { value } } }
  }
} }`;

const CREATE_WITH_OPTIONS = `mutation($product: ProductCreateInput!) { productCreate(product: $product) {
  product { id variants(first: 5) { edges { node { id selectedOptions { name value } } } } }
  userErrors { field message }
} }`;

const BULK_CREATE = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) { productVariants { id selectedOptions { name value } } userErrors { field message } }
}`;

const READ_BACK_HUB = `query($id: ID!, $cursor: String) { product(id: $id) {
  id status tags templateSuffix options { name values }
  collections(first: 5) { edges { node { id } } }
  build_recipe: metafield(namespace: "${NS}", key: "build_recipe") { value }
  freehub: metafield(namespace: "${NS}", key: "freehub") { value }
  freehub_variant_map: metafield(namespace: "${NS}", key: "freehub_variant_map") { value }
  hidden: metafield(namespace: "seo", key: "hidden") { value }
  variants(first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } edges { node { id price inventoryPolicy selectedOptions { name value }
    components: metafield(namespace: "${NS}", key: "build_components") { value }
    recipe: metafield(namespace: "${NS}", key: "build_variant_recipe") { value }
    state: metafield(namespace: "${NS}", key: "build_guard_state") { value } } } }
} }`;

function createHubStoreMethods(gql) {
    const must = (data, key) => {
        const errs = (data && data[key] && data[key].userErrors) || [];
        if (errs.length) throw new Error(`${key}: ${errs.map((e) => e.message).join('; ').slice(0, 300)}`);
    };
    const parseJson = (v) => { if (v === null || v === undefined || v === '') return null; try { return JSON.parse(v); } catch (e) { return v; } };
    const toOptionValues = (names, values) => names.map((n, i) => ({ optionName: n, name: values[i] }));

    return {
        /** A part product with its custom metafields, every variant (paged), rules and digest. */
        async getPartProduct(gid) {
            let p = null;
            const variants = [];
            let cursor = null;
            for (;;) {
                const d = await gql(PART_PRODUCT, { id: gid, cursor });
                p = p || d.product;
                d.product.variants.edges.forEach(({ node: n }) => variants.push({
                    id: num(n.id), gid: n.id, title: n.title, price: Number(n.price), qty: n.inventoryQuantity, policy: n.inventoryPolicy, selectedOptions: n.selectedOptions,
                    cost: n.inventoryItem && n.inventoryItem.unitCost ? Number(n.inventoryItem.unitCost.amount) : null,
                    spacing: n.spacing ? n.spacing.value : null, brake: parseJson(n.brake && n.brake.value), erd: n.erd ? Number(n.erd.value) : null,
                    productGid: p.id, productTitle: p.title,
                }));
                if (!d.product.variants.pageInfo.hasNextPage) break;
                cursor = d.product.variants.pageInfo.endCursor;
            }
            const meta = Object.fromEntries(p.metafields.edges.map((e) => [e.node.key, e.node.value]));
            return {
                gid: p.id, title: p.title, vendor: p.vendor, tags: p.tags || [], options: p.options, variants, meta,
                freehub: parseJson(meta.freehub), freehubMap: parseJson(meta.freehub_variant_map),
                rulesRaw: p.rules ? p.rules.value : null, rulesDigest: p.rules ? p.rules.compareDigest : null,
            };
        },

        /** DRAFT product with the two options, holding only the first variant combination (the others are added by bulkCreateVariants). */
        async createDraftHub(product, firstVariant) {
            const names = product.options.map((o) => o.name);
            const d = await gql(CREATE_WITH_OPTIONS, { product: {
                title: product.title, handle: product.handle, vendor: product.vendor, productType: product.productType, tags: product.tags,
                templateSuffix: product.templateSuffix, status: 'DRAFT', descriptionHtml: product.descriptionHtml, seo: product.seo, metafields: product.metafields,
                productOptions: names.map((n, i) => ({ name: n, values: [{ name: firstVariant.optionValues[i] }] })),
            } });
            must(d, 'productCreate');
            const p = d.productCreate.product;
            return { productGid: p.id, firstVariantGid: p.variants.edges[0].node.id };
        },

        /** Create the remaining variants (100 per call). Returns [{ key, variantGid }] in the order given. */
        async bulkCreateVariants(productGid, variants, optionNames) {
            const out = [];
            for (let i = 0; i < variants.length; i += 100) {
                const chunk = variants.slice(i, i + 100);
                const d = await gql(BULK_CREATE, { productId: productGid, variants: chunk.map((v) => ({
                    optionValues: toOptionValues(optionNames, v.optionValues), price: v.price, compareAtPrice: null, inventoryPolicy: v.policy, inventoryItem: { tracked: !!v.tracked }, metafields: v.metafields,
                })) });
                must(d, 'productVariantsBulkCreate');
                const made = d.productVariantsBulkCreate.productVariants;
                if (made.length !== chunk.length) throw new Error(`Shopify made ${made.length} of ${chunk.length} variants`);
                chunk.forEach((v, k) => out.push({ key: v.key, variantGid: made[k].id }));
            }
            return out;
        },

        async readBackHub(productGid) {
            let p = null;
            const variants = [];
            let cursor = null;
            for (;;) {
                const d = await gql(READ_BACK_HUB, { id: productGid, cursor });
                p = p || d.product;
                d.product.variants.edges.forEach(({ node: n }) => variants.push({
                    gid: n.id, price: n.price, policy: n.inventoryPolicy, options: n.selectedOptions.map((o) => o.value),
                    components: n.components ? n.components.value : null, recipe: n.recipe ? n.recipe.value : null, guardState: n.state ? n.state.value : null,
                }));
                if (!d.product.variants.pageInfo.hasNextPage) break;
                cursor = d.product.variants.pageInfo.endCursor;
            }
            const val = (m) => (m ? m.value : null);
            return {
                status: p.status, tags: p.tags, templateSuffix: p.templateSuffix, collectionCount: p.collections.edges.length, options: p.options,
                metafields: { 'custom.build_recipe': val(p.build_recipe), 'custom.freehub': val(p.freehub), 'custom.freehub_variant_map': val(p.freehub_variant_map), 'seo.hidden': val(p.hidden) },
                variants,
            };
        },
    };
}

module.exports = { createHubStoreMethods };
