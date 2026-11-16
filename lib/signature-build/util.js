// lib/signature-build/util.js
// Small shared helpers for the Create Signature Build tool. Plain CommonJS, no I/O.
const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** JSON with sorted keys, so the same data always gives the same hash. */
function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
}

const num = (gid) => String(gid || '').split('/').pop();
const variantGid = (id) => `gid://shopify/ProductVariant/${num(id)}`;
const productGid = (id) => `gid://shopify/Product/${num(id)}`;

function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** A tool error that the API layer turns into { ok:false, code, message } with a status. */
class ToolError extends Error {
    constructor(code, message, status = 400, extra = {}) {
        super(message);
        this.code = code;
        this.status = status;
        this.extra = extra;
    }
}

const money = (n) => Math.round(Number(n) * 100) / 100;

// ---- freehub fields: the VARIANT version first, the PRODUCT version only as a fallback, never merged (same rule as theme Release 37; Jerry, Nov 2026).
// The list (custom.freehub) and the map (custom.freehub_variant_map) are each resolved on their own. A value counts as present when it is a non-empty list / a non-empty object.
const hasValue = (v) => (Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object' && Object.keys(v).length > 0);
function pickVariantFirst(variantValue, productValue) {
    if (hasValue(variantValue)) return { value: variantValue, from: 'variant' };
    if (hasValue(productValue)) return { value: productValue, from: 'product' };
    return { value: null, from: null };
}
/** the freehub list of this hub variant, else of its product: { value: string[]|null, from: 'variant'|'product'|null } */
const freehubListOf = (variant, product) => pickVariantFirst(variant && variant.freehub, product && product.freehub);
/** the freehub map of this hub variant, else of its product: { value: object|null, from: 'variant'|'product'|null } */
const freehubMapOf = (variant, product) => pickVariantFirst(variant && variant.freehubMap, product && product.freehubMap);

module.exports = { sha256, stable, num, variantGid, productGid, slugify, ToolError, money, hasValue, freehubListOf, freehubMapOf };
