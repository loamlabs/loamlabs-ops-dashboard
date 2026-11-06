// Fake world, store and spoke length table for the hub-choice tests. No network, no real store. Ids look like real numeric Shopify ids.
const crypto = require('crypto');
const { makeDb } = require('./signature-fakes');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const I = (n) => String(8000000 + Number(n));
const G = (n) => `gid://shopify/ProductVariant/${I(n)}`;
const PG = (n) => `gid://shopify/Product/${n}`;
const FLANGE = { hub_flange_diameter_left: '59.5', hub_flange_diameter_right: '46.0', hub_flange_offset_left: '28.0', hub_flange_offset_right: '41.0', hub_spoke_hole_diameter: '2.6' };

const SPACING = { A: { front: '15x110', rear: '12x148' }, B: { front: '15x110', rear: '12x157' }, C: { front: '20x110', rear: '12x157' } };

/**
 * Builds a world with: two rim variants (Reserve 30|DH 29" and 27.5", 32h), Sapim Race J-bend spokes (builder variant + length variants 268 to 294),
 * brass nipples, and four hub models (Hydra2, Hope Pro 5, Project321, e*thirteen) with front/rear products per spacing, like the real catalogue.
 */
function makeHubWorld(over = {}) {
    const V = {}, P = {};
    let vid = 1000;
    const addProduct = (id, title, extra = {}) => { P[id] = { gid: PG(id), title, vendor: extra.vendor || 'X', tags: [], options: [], variants: [], meta: {}, freehub: null, freehubMap: null, rulesRaw: null, ...extra }; return P[id]; };
    const addVariant = (pid, title, price, selectedOptions, extra = {}) => {
        const n = ++vid;
        const v = { id: I(n), gid: G(n), title, price, cost: extra.cost === undefined ? 10 : extra.cost, qty: extra.qty ?? 0, policy: extra.policy || 'CONTINUE', selectedOptions, productGid: P[pid].gid, productTitle: P[pid].title, paintFee: false, spacing: extra.spacing || null, brake: extra.brake || null, erd: extra.erd || null };
        V[v.id] = v; P[pid].variants.push(v); return v;
    };
    // rims (one product holds the 29" and the 27.5" variant, like Reserve 30|DH)
    addProduct(100, 'Reserve 30|DH Carbon Rim', { vendor: 'Reserve', meta: { rim_washer_policy: 'Optional', nipple_washer_thickness: '0.0', rim_spoke_hole_offset: '3.6' }, rulesRaw: over.rimRules === undefined ? JSON.stringify([{ name: 'LoamLabs Reserve 30|HD + Onyx Vesper', requiredFrontHubProductId: 'gid://shopify/Product/9792788300083', requiredRearHubProductId: 'gid://shopify/Product/9792809926963', requiredSpokeProductId: PG(400), pairedRimProductId: PG(100) }]) : over.rimRules });
    const rim29 = addVariant(100, '29" / 32h / Black', 649, [{ name: 'Size', value: '29"' }, { name: 'Spoke Count', value: '32h' }, { name: 'Color', value: 'Black' }], { cost: 360, erd: 599 });
    const rim275 = addVariant(100, '27.5" / 32h / Black', 649, [{ name: 'Size', value: '27.5"' }, { name: 'Spoke Count', value: '32h' }, { name: 'Color', value: 'Black' }], { cost: 360, erd: 558 });
    // spokes: builder variant + length variants
    addProduct(400, 'Sapim Race Spokes- J-Bend', { vendor: 'Sapim', meta: { spoke_hub_interface: over.spokeInterface === undefined ? 'J-Bend' : over.spokeInterface, spoke_model_group: 'Race' } });
    const builder = addVariant(400, 'Black / -', 54.99, [{ name: 'Color', value: 'Black' }, { name: 'Length', value: '-' }], { cost: 20 });
    const lenVar = {};
    for (const mm of [268, 270, 272, 288, 290, 292, 294]) lenVar[mm] = addVariant(400, `Black / ${mm}mm`, 0, [{ name: 'Color', value: 'Black' }, { name: 'Length', value: `${mm}mm` }], { cost: 20, qty: -80 });
    addProduct(500, 'Sapim Brass Nipples', { vendor: 'Sapim' });
    const nip = addVariant(500, 'Black', 19.99, [{ name: 'Color', value: 'Black' }], { cost: 6 });
    // freehub bodies
    addProduct(390, 'Freehub bodies', { vendor: 'X' });
    const fh = {};
    for (const k of ['XD', 'HG', 'MS']) fh[k] = addVariant(390, k, 0, [{ name: 'Freehub', value: k }], { cost: null });

    let pid = 600;
    const hubProduct = (title, vendor, side, spacing, colours, price, o = {}) => {
        const id = ++pid;
        addProduct(id, title, { vendor, meta: { hub_type: o.hubType === undefined ? 'Classic Flange' : o.hubType, ...(o.noFlange ? {} : FLANGE) }, tags: o.tags || [],
            ...(side === 'rear' ? { freehub: o.freehub || ['XD', 'HG', 'MS'], freehubMap: o.freehubMap || Object.fromEntries(['XD', 'HG', 'MS'].map((k) => [k, fh[k].gid])) } : {}) });
        for (const hole of (o.holes || ['28h', '32h'])) for (const c of colours) {
            addVariant(id, `${hole} / ${c}`, price, [{ name: 'Spoke Count', value: hole }, { name: 'Color', value: c }], { cost: price * 0.65, spacing: `${spacing}mm`, brake: ['6-Bolt'], qty: o.qty ?? 0, policy: o.policy || 'CONTINUE' });
        }
        return id;
    };
    const hubs = [];
    const defineHub = (model, vendor, colours, prices, o = {}) => {
        const f15 = hubProduct(`${model} Front Hub - 6-Bolt - 15x110mm`, vendor, 'front', '15x110', colours, prices.front, o);
        const f20 = o.noFront20 ? null : hubProduct(`${model} Boost Front Hub - 6-Bolt - 20x110mm`, vendor, 'front', '20x110', o.front20Colours || colours, prices.front20 ?? prices.front, o);
        const r148 = hubProduct(`${model} Rear Hub - 6-Bolt - 12x148mm`, vendor, 'rear', '12x148', colours, prices.rear, o);
        const r157 = hubProduct(`${model} Superboost Rear Hub - 6-Bolt - 12x157mm`, vendor, 'rear', '12x157', colours, prices.rear157 ?? prices.rear, o);
        hubs.push({ model, vendor, frontProducts: { '15x110': String(f15), ...(f20 ? { '20x110': String(f20) } : {}) }, rearProducts: { '12x148': String(r148), '12x157': String(r157) }, lengthsName: model });
    };
    defineHub('Industry Nine Hydra2', 'Industry Nine', ['Black', 'Blue', 'Red'], { front: 240, rear: 510 });
    defineHub('Hope Pro 5', 'Hope', ['Black', 'Blue'], { front: 129.99, rear: 294.99, rear157: 315 });
    defineHub('Project321 G3', 'Project321', ['Black', 'Blue', 'Gold'], { front: 210, front20: 225, rear: 435 }, { front20Colours: ['Black', 'Silver'] });
    defineHub('e*thirteen Sidekick GR', 'e*thirteen', ['Black'], { front: 159.95, rear: 399.95 }, { qty: 0, policy: 'DENY' });

    const config = (o = {}) => ({
        v: 2, kind: 'hub-choice', name: 'Reserve 30|DH Mullet', lengthsKey: 'Reserve 30|DH Mullet (29 F / 27.5 R)', ridingStyle: 'mtb',
        specs: { frontWheelSize: '29"', rearWheelSize: '27.5"', spokeCount: '32' },
        rims: { front: rim29.id, rear: rim275.id }, spokes: builder.id, nipples: nip.id,
        hubs: hubs.map((h) => ({ ...h })), ...o,
    });
    return { V, P, config, hubs, rim29, rim275, builder, nip, lenVar, fh };
}

/** Spoke length table in Backend 1's CSV shape, consistent with the world (front 290/292, rear 292/290 or 270/272 for a 27.5" rear). */
function makeLengthsCsv(world, { product = 'Reserve 30|DH Mullet (29 F / 27.5 R)', drop = [], status = {}, hubVariantOverride = {}, rimVariantOverride = {}, leftOverride = {} } = {}) {
    const head = 'product,hub,spacing,spacing_text,side,wheel_size,rim_variant,hub_variant,status,cross,erd,washer_policy,washer_mm,final_erd,geo_left,geo_right,left_mm,right_mm,no_washer_left,no_washer_right,left_variant,left_policy,left_stock,right_variant,right_policy,right_stock';
    const rows = [head];
    const lv = world.lenVar;
    for (const h of world.hubs) for (const key of ['A', 'B', 'C']) for (const side of ['front', 'rear']) {
        if (drop.includes(`${h.model}|${key}|${side}`)) continue;
        const sp = SPACING[key];
        const fp = world.P[h.frontProducts[sp.front]], rp = world.P[h.rearProducts[sp.rear]];
        const hubP = side === 'front' ? fp : rp;
        if (!hubP) continue;
        const hv = hubP.variants.find((v) => v.title.startsWith('32h') && v.title.includes('Black')) || hubP.variants.find((v) => v.title.startsWith('32h'));
        const l = side === 'front' ? 290 : 270, r = side === 'front' ? 292 : 272;
        const left = leftOverride[`${h.model}|${key}|${side}`] || l;
        const rim = side === 'front' ? world.rim29 : world.rim275;
        const st = status[`${h.model}|${key}|${side}`] || 'ok';
        const cell = (v, t) => `"${v.id} | ${String(t).replace(/"/g, '""')}"`;
        rows.push([`"${product}"`, `"${h.model}"`, `"${key}"`, `"${sp.front} / ${sp.rear}"`, `"${side}"`, `"${side === 'front' ? 29 : 27.5}"`,
            cell({ id: rimVariantOverride[`${h.model}|${key}|${side}`] || rim.id }, rim.title), cell({ id: hubVariantOverride[`${h.model}|${key}|${side}`] || hv.id }, hv.title), `"${st}"`, '"3/3"', '"558"', '"Optional"', '"0"', '"558.00"', '"270"', '"270"',
            `"${left}"`, `"${r}"`, `"${left}"`, `"${r}"`, cell(lv[left], `Black / ${left}mm`), '"CONTINUE"', '"-80"', cell(lv[r], `Black / ${r}mm`), '"CONTINUE"', '"-80"'].join(','));
    }
    return rows.join('\r\n') + '\r\n';
}

/** A fake store with the single-build methods the hub-choice code uses plus the hub-choice ones. */
function makeHubStore(world, opts = {}) {
    const { V, P } = world;
    const writes = [];
    const created = {};
    let n = 70000;
    const digestOf = (raw) => (raw === null || raw === undefined ? null : sha(raw));
    const failOn = (name) => { if (opts.failAt === name) throw new Error(`fake failure at ${name}`); };
    const store = {
        writes, created,
        async getVariants(ids) { const m = new Map(); ids.forEach((id) => { if (V[id]) m.set(id, V[id]); }); return m; },
        async getPartProduct(gid) {
            const p = Object.values(P).find((x) => x.gid === gid);
            if (!p) throw new Error('no such product ' + gid);
            return { ...p, rulesDigest: digestOf(p.rulesRaw) };
        },
        async listMasters() { return opts.masters || Object.values(created).map((c) => ({ productGid: c.gid, handle: c.handle, title: c.title, recipeRaw: c.metafields['custom.build_recipe'] })); },
        async createDraftHub(product, first) {
            failOn('createDraftHub'); writes.push('productCreate:' + product.status);
            const id = ++n; const gid = `gid://shopify/Product/${id}`;
            const v0 = `gid://shopify/ProductVariant/${id}0`;
            created[gid] = { gid, handle: product.handle, title: product.title, status: product.status, tags: product.tags, options: product.options, metafields: Object.fromEntries(product.metafields.map((m) => [`${m.namespace}.${m.key}`, m.value])), variants: [{ gid: v0, options: first.optionValues, price: null, policy: 'DENY', metafields: {} }] };
            return { productGid: gid, firstVariantGid: v0 };
        },
        async updateVariant(productGid, variantGid, v) {
            failOn('updateVariant'); writes.push('variantUpdate');
            const x = created[productGid].variants.find((y) => y.gid === variantGid);
            x.price = v.price; x.policy = v.policy; x.tracked = v.tracked; v.metafields.forEach((m) => { x.metafields[`${m.namespace}.${m.key}`] = m.value; });
        },
        async bulkCreateVariants(productGid, variants) {
            failOn('bulkCreateVariants'); writes.push('bulkCreate:' + variants.length);
            const c = created[productGid]; const out = [];
            variants.forEach((v, i) => {
                const gid = `gid://shopify/ProductVariant/${productGid.split('/').pop()}${c.variants.length + 1}`;
                c.variants.push({ gid, options: v.optionValues, price: v.price, policy: v.policy, tracked: v.tracked, metafields: Object.fromEntries(v.metafields.map((m) => [`${m.namespace}.${m.key}`, m.value])) });
                out.push({ key: v.key, variantGid: gid });
            });
            if (opts.shortBulk) out.pop();
            return out;
        },
        async readBackHub(productGid) {
            const c = created[productGid];
            return {
                status: opts.readBackStatus || c.status, tags: c.tags, collectionCount: 0, options: c.options, metafields: c.metafields,
                variants: c.variants.map((v) => ({ gid: v.gid, price: opts.readBackPrice ? '1.00' : v.price, policy: v.policy, options: v.options, components: v.metafields['custom.build_components'] || null, recipe: v.metafields['custom.build_variant_recipe'] || null, guardState: v.metafields['custom.build_guard_state'] || null })),
            };
        },
        async getRules(gid) { const p = Object.values(P).find((x) => x.gid === gid); return { raw: p.rulesRaw, digest: digestOf(p.rulesRaw) }; },
        async setRules(gid, raw, digest) {
            const p = Object.values(P).find((x) => x.gid === gid);
            if (opts.failAt === 'setRules') throw new Error('fake failure at setRules');
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

module.exports = { makeHubWorld, makeLengthsCsv, makeHubStore, makeDb, SPACING, I, G };
