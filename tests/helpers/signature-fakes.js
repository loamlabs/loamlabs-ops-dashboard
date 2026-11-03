// Fake Shopify store + in-memory database for the Signature Build tests. No network, no real store.
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const opt = (c, extra = []) => [{ name: 'Color', value: c }, ...extra];

const I = (n) => String(7000000 + Number(n));   // ids must look like real numeric Shopify ids

function makeWorld(over = {}) {
    // variants: id -> {id, productGid, productTitle, title, price, cost, qty, policy, selectedOptions}
    const V = {};
    const P = {};
    const addProduct = (id, title, extra = {}) => { P[id] = { gid: `gid://shopify/Product/${id}`, title, vendor: 'X', options: [], variants: [], freehub: null, freehubMap: null, rulesRaw: null, ...extra }; return P[id]; };
    const addVariant = (pid, id, title, price, selectedOptions, extra = {}) => {
        const v = { id: I(id), gid: `gid://shopify/ProductVariant/${I(id)}`, title, price, cost: extra.cost === undefined ? 10 : extra.cost, qty: extra.qty ?? 5, policy: extra.policy || 'DENY', selectedOptions, productGid: P[pid].gid, productTitle: P[pid].title };
        V[v.id] = v; P[pid].variants.push(v); return v;
    };
    // rim 100 (29" 28h black)
    addProduct(100, 'Reserve 30|HD Carbon Rim', { rulesRaw: over.rimRules === undefined ? JSON.stringify([{ name: 'legacy rule', pairedRimProductId: 'gid://shopify/Product/100' }]) : over.rimRules });
    addVariant(100, 1001, '29" / 28h / Black', 649, [{ name: 'Size', value: '29"' }, { name: 'Spoke Count', value: '28h' }, { name: 'Color', value: 'Black' }], { cost: 360 });
    // second rim product (mullet rear), optional
    addProduct(101, 'Reserve 30|DH Carbon Rim', { rulesRaw: over.rim2Rules === undefined ? null : over.rim2Rules });
    addVariant(101, 1011, '27.5" / 28h / Black', 649, [{ name: 'Size', value: '27.5"' }, { name: 'Spoke Count', value: '28h' }, { name: 'Color', value: 'Black' }], { cost: null });
    // hubs
    addProduct(200, 'Onyx Vesper Front Hub - Centerlock - 15x110mm');
    addProduct(300, 'Onyx Vesper Rear Hub - Centerlock - 12x148mm', { freehub: ['XD', 'HG', 'Campy'], freehubMap: { XD: `gid://shopify/ProductVariant/${I(3901)}`, HG: `gid://shopify/ProductVariant/${I(3902)}` } });
    [['Black', 245], ['Blue', 245], ['Gold', 260]].forEach(([c, price], i) => {
        addVariant(200, 2001 + i, `28h / ${c}`, price, [{ name: 'Spoke Count', value: '28h' }, opt(c)[0]], { cost: 150 });
        addVariant(300, 3001 + i, `28h / ${c}`, price === 245 ? 550 : 570, [{ name: 'Spoke Count', value: '28h' }, opt(c)[0]], { cost: 300 });
    });
    addProduct(390, 'Onyx Freehub body');
    addVariant(390, 3901, 'XD', 0, [{ name: 'Freehub', value: 'XD' }], { cost: null });
    addVariant(390, 3902, 'HG', 0, [{ name: 'Freehub', value: 'HG' }], { cost: null });
    // spokes 400: Black ok, Silver 298 out of stock, Red missing 298, all builder variants $54.99
    addProduct(400, 'Sapim Race Spokes - Straight Pull');
    let sid = 4000;
    for (const c of ['Black', 'Silver', 'Red']) addVariant(400, ++sid, `${c} / -`, 54.99, [opt(c)[0], { name: 'Length', value: '-' }], { cost: 20 });
    const sp = (c, mm, extra) => addVariant(400, ++sid, `${c} / ${mm}mm`, 0, [opt(c)[0], { name: 'Length', value: `${mm}mm` }], { cost: 20, ...extra });
    sp('Black', 296); sp('Black', 298); sp('Silver', 296); sp('Silver', 298, { qty: 0, policy: 'DENY' }); sp('Red', 296);
    // nipples
    addProduct(500, 'Sapim Brass Nipples');
    addVariant(500, 5001, 'Black', 19.99, [opt('Black')[0]], { cost: 6 });
    // fix ids of builder spoke variants to stable ones
    const builder = (c) => P[400].variants.find((v) => v.title === `${c} / -`).id;

    const recipe = (o = {}) => ({
        v: 1, ridingStyle: 'mtb',
        specs: { frontWheelSize: '29"', rearWheelSize: '29"', frontSpokeCount: '28', rearSpokeCount: '28', brakeStyle: 'Centerlock', frontHubSpacing: '15x110', rearHubSpacing: '12x148' },
        parts: { frontRim: I(1001), rearRim: I(1001), frontHub: I(2001), rearHub: I(3001), frontSpokes: builder('Black'), rearSpokes: builder('Black'), frontNipples: I(5001), rearNipples: I(5001) },
        spokeLengths: { front: { left: 296, right: 298 }, rear: { left: 296, right: 298 } },
        freehub: 'XD', displayedTotal: 2100.75, ...o,
    });
    return { V, P, recipe, builder };
}

function makeStore(world, opts = {}) {
    const { V, P } = world;
    const writes = [];            // every write, in order
    const created = {};           // productGid -> product state
    let n = 90000;
    const digestOf = (raw) => (raw === null || raw === undefined ? null : sha(raw));
    const failOn = (name) => { if (opts.failAt === name) { const e = new Error(`fake failure at ${name}`); throw e; } };
    const store = {
        writes, created,
        async getVariants(ids) { const m = new Map(); ids.forEach((id) => { if (V[id]) m.set(id, V[id]); }); return m; },
        async getProduct(gid) { const p = Object.values(P).find((x) => x.gid === gid); return { ...p, rulesDigest: digestOf(p.rulesRaw) }; },
        async listMasters() { return opts.masters || Object.values(created).map((c) => ({ productGid: c.gid, handle: c.handle, title: c.title, recipeRaw: c.metafields['custom.build_recipe'] })); },
        async createDraft(product) {
            failOn('createDraft'); writes.push('productCreate:' + product.status);
            const id = ++n; const gid = `gid://shopify/Product/${id}`;
            created[gid] = { gid, handle: product.handle, title: product.title, status: product.status, tags: product.tags, metafields: Object.fromEntries(product.metafields.map((m) => [`${m.namespace}.${m.key}`, m.value])), variantMetafields: {}, variant: `gid://shopify/ProductVariant/${id}1` };
            return { productGid: gid, variantGid: created[gid].variant };
        },
        async updateVariant(productGid, variantGid, v) {
            failOn('updateVariant'); writes.push('variantUpdate:' + v.price);
            const c = created[productGid]; c.price = v.price; c.policy = v.policy; c.tracked = v.tracked;
            v.metafields.forEach((m) => { c.variantMetafields[`${m.namespace}.${m.key}`] = m.value; writes.push('metafield:' + m.key); });
        },
        async readBack(productGid) {
            const c = created[productGid];
            return { status: opts.readBackStatus || c.status, tags: c.tags, collectionCount: 0, metafields: c.metafields, variantMetafields: c.variantMetafields, guardState: c.variantMetafields['custom.build_guard_state'] || null, price: c.price, policy: c.policy };
        },
        async getRules(gid) { const p = Object.values(P).find((x) => x.gid === gid); return { raw: p.rulesRaw, digest: digestOf(p.rulesRaw) }; },
        async setRules(gid, raw, digest) {
            const p = Object.values(P).find((x) => x.gid === gid);
            if (opts.failAt === 'setRules:' + gid.split('/').pop()) throw new Error('fake failure at setRules ' + gid);
            if (digest && digest !== digestOf(p.rulesRaw)) throw new Error('compareDigest mismatch');
            writes.push('rules:' + gid.split('/').pop()); p.rulesRaw = raw;
            if (opts.afterRulesWrite) opts.afterRulesWrite(p);
        },
        async deleteRules(gid) { const p = Object.values(P).find((x) => x.gid === gid); writes.push('rulesDeleted:' + gid.split('/').pop()); p.rulesRaw = null; },
        async getProductStatus(gid) { return created[gid] ? created[gid].status : null; },
        async deleteProduct(gid) { if (opts.failAt === 'deleteProduct') throw new Error('fake failure at deleteProduct'); writes.push('productDelete'); delete created[gid]; },
    };
    return store;
}

function makeDb() {
    const plans = {}, runs = {}, locks = {}, fails = [];
    return {
        plans, runs, locks, fails,
        async savePlan({ planId, planHash, plan, expiresAt }) { plans[planId] = { plan_id: planId, plan_hash: planHash, plan, expires_at: expiresAt }; },
        async getPlan(id) { return plans[id] || null; },
        async createRun({ runId, fingerprint, status, name, record }) { runs[runId] = { run_id: runId, fingerprint, status, name, record }; },
        async updateRun(id, patch) { if (!runs[id]) throw new Error('no run'); runs[id] = { ...runs[id], ...patch }; },
        async getRun(id) { return runs[id] || null; },
        async listRuns() { return Object.values(runs); },
        async findActiveRunByFingerprint(fp) { return Object.values(runs).find((r) => r.fingerprint === fp && ['creating', 'created'].includes(r.status)) || null; },
        async acquireLock(key, holder, ttl) { const l = locks[key]; if (l && l.expires > Date.now()) return false; locks[key] = { holder, expires: Date.now() + ttl }; return true; },
        async releaseLock(key, holder) { if (locks[key] && locks[key].holder === holder) delete locks[key]; },
        async recordFailure(key, at) { fails.push({ key, at }); },
        async countFailures(key, since) { return fails.filter((f) => f.key === key && f.at >= since).length; },
    };
}

module.exports = { makeWorld, makeStore, makeDb, sha, I };
