#!/usr/bin/env node
// lib/alpina-hoss-undo.js  node lib/alpina-hoss-undo.js <alpina_undo_DATE.json>
// Puts every variant of an Alpina stock run back to the inventory policy it had (from). Shopify app credentials come from the environment (the NAS container) or, by hand, from .env.local. Writes only inventoryPolicy.
const fs = require('fs');
const path = require('path');
const { shopifyClient } = require('./alpina-hoss-cli');

function readEnv() {
    const env = { ...process.env };
    try {
        for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
    } catch (e) { /* no .env.local: the values come from the environment */ }
    return env;
}

(async () => {
    const file = process.argv[2]; if (!file) { console.error('give the undo file'); process.exit(1); }
    const u = JSON.parse(fs.readFileSync(file, 'utf8'));
    const gql = shopifyClient(readEnv()); const byHandle = new Map(); for (const c of u.changes) (byHandle.get(c.handle) || byHandle.set(c.handle, []).get(c.handle)).push(c);
    for (const [handle, list] of byHandle) {
        const d = await gql(`query($h:String!){productByHandle(handle:$h){id}}`, { h: handle }); const pid = d.productByHandle.id;
        for (let i = 0; i < list.length; i += 100) {
            const r = await gql(`mutation($pid:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$pid,variants:$v){userErrors{message}}}`, { pid, v: list.slice(i, i + 100).map((c) => ({ id: 'gid://shopify/ProductVariant/' + c.id, inventoryPolicy: c.from })) });
            if (r.productVariantsBulkUpdate.userErrors.length) { console.error('ERROR', handle, JSON.stringify(r.productVariantsBulkUpdate.userErrors)); process.exit(1); }
            await new Promise((s) => setTimeout(s, 600));
        }
        console.log(handle + ': ' + list.length + ' variants put back');
    }
    console.log('DONE: ' + u.changes.length + ' variants put back');
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
