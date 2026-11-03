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

module.exports = { sha256, stable, num, variantGid, productGid, slugify, ToolError, money };
