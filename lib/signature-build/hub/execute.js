// lib/signature-build/hub/execute.js
// create (the DRAFT hub-choice product, all variants, the rim rules last, read-back, automatic rollback) and one-step undo.
// Everything DRAFT: never ACTIVE, never published, never writes build_guard_state, never touches another product.
const crypto = require('crypto');
const { sha256, stable, ToolError, variantGid } = require('../util');
const { parseRules } = require('../rules');
const { checkHubRules, appendRules, removeRules, withRealVariants } = require('./rules-build');

const LOCK_TTL_MS = 2 * 60 * 1000;

function sameValue(a, b) {
    if (a === b) return true;
    try { return stable(JSON.parse(a)) === stable(JSON.parse(b)); } catch (e) { return false; }
}
const release = async (db, keys, holder) => { for (const k of keys) { try { await db.releaseLock(k, holder); } catch (e) { /* lock expires */ } } };

/** Put every rim back the way this run found it. */
async function restoreHubRims({ store, rims }) {
    const lines = [];
    for (const r of rims) {
        try {
            if (!r.wrote) { lines.push(`${r.rimTitle}: nothing had been written`); continue; }
            const cur = await store.getRules(r.rimProductGid);
            if ((cur.raw ?? null) === (r.oldRaw ?? null)) { lines.push(`${r.rimTitle}: already unchanged`); continue; }
            if (cur.raw === r.wroteRaw) {
                if (r.oldRaw === null) await store.deleteRules(r.rimProductGid); else await store.setRules(r.rimProductGid, r.oldRaw, cur.digest);
                lines.push(`${r.rimTitle}: restored to the saved value`);
            } else {
                const without = removeRules(cur.raw, r.ruleRefs);
                await store.setRules(r.rimProductGid, without, cur.digest);
                lines.push(`${r.rimTitle}: someone changed the rules since, so only this run's ${r.ruleRefs.length} rules were removed`);
            }
        } catch (e) {
            lines.push(`${r.rimTitle}: COULD NOT RESTORE (${e.message}); saved old value is in the run record`);
            r.failed = true;
        }
    }
    return lines;
}

async function createHubChoice({ store, db, row, planHash, belowFloorOk = false }) {
    const plan = row.plan;
    if (plan.blockers.length) throw new ToolError(plan.blockers[0].code, plan.blockers[0].message, 409);
    if (plan.margin.belowFloor.length && !belowFloorOk) throw new ToolError('BELOW_FLOOR', `These builds are below your floor: ${plan.margin.belowFloor.slice(0, 4).join('; ')}${plan.margin.belowFloor.length > 4 ? '...' : ''}. Tick "below floor" to go ahead.`, 400);

    const holder = crypto.randomUUID();
    const lockKeys = ['create', ...plan.rules.map((r) => 'rim:' + r.rimProductGid)];
    const got = [];
    for (const k of lockKeys) {
        if (!(await db.acquireLock(k, holder, LOCK_TTL_MS))) { await release(db, got, holder); throw new ToolError('RIM_LOCKED', 'Someone else is changing this rim right now. Try again in two minutes.', 423); }
        got.push(k);
    }

    const runId = crypto.randomUUID();
    const rims = plan.rules.map((r) => {
        const b = row.plan._backups.find((x) => x.rimProductGid === r.rimProductGid);
        return { rimProductGid: r.rimProductGid, rimTitle: r.rimTitle, oldRaw: b.raw, oldSha: b.sha256, ruleRefs: [], wrote: false, wroteRaw: null };
    });
    let productGid = null, step = 'start';
    const optionNames = plan.product.options.map((o) => o.name);
    try {
        const dup = await db.findActiveRunByFingerprint(plan.fingerprint);
        if (dup) throw new ToolError('DUPLICATE_BUILD', `This build already exists: run ${dup.run_id}.`, 409);
        for (const r of rims) {
            const cur = await store.getRules(r.rimProductGid);
            if (sha256(cur.raw ?? '') !== r.oldSha) throw new ToolError('PLAN_EXPIRED', `The rules on ${r.rimTitle} changed since the preview. Run the preview again.`, 410);
        }
        await db.createRun({ runId, fingerprint: plan.fingerprint, status: 'creating', name: plan.name, record: { kind: 'hub-choice', rims, plan: { product: plan.product, variants: plan.variants.map((v) => v.key) } } });

        step = 'create the draft product';
        const made = await store.createDraftHub(plan.product, plan.variants[0]);
        productGid = made.productGid;
        await db.updateRun(runId, { product_gid: productGid, record: { kind: 'hub-choice', rims, productGid } });

        const gidByKey = { [plan.variants[0].key]: made.firstVariantGid };
        step = 'set the first variant';
        const first = plan.variants[0];
        await store.updateVariant(productGid, made.firstVariantGid, { price: first.price, policy: first.policy, tracked: first.tracked, metafields: first.metafields });

        step = 'create the other variants';
        const rest = plan.variants.slice(1);
        if (rest.length) (await store.bulkCreateVariants(productGid, rest, optionNames)).forEach((m) => { gidByKey[m.key] = m.variantGid; });
        await db.updateRun(runId, { record: { kind: 'hub-choice', rims, productGid, variants: gidByKey } });

        step = 'check the new product';
        const rb = await store.readBackHub(productGid);
        const fail = [];
        if (rb.status !== 'DRAFT') fail.push('status is ' + rb.status);
        if (stable(rb.tags) !== stable(['loamlabs-build'])) fail.push('tags are not exactly loamlabs-build');
        if (rb.collectionCount !== 0) fail.push('the product is in a collection');
        if (rb.variants.length !== plan.variants.length) fail.push(`${rb.variants.length} variants exist, ${plan.variants.length} were planned`);
        plan.product.metafields.forEach((m) => { if (!sameValue(rb.metafields[`${m.namespace}.${m.key}`], m.value)) fail.push(`metafield ${m.key} did not round-trip`); });
        if (rb.metafields['custom.freehub'] || rb.metafields['custom.freehub_variant_map']) fail.push('freehub metafields must not exist at product level');
        for (const v of plan.variants) {
            const g = gidByKey[v.key];
            const x = rb.variants.find((y) => y.gid === g);
            if (!x) { fail.push(`variant ${v.key} is missing`); continue; }
            if (stable(x.options) !== stable(v.optionValues)) fail.push(`variant ${v.key} has options ${x.options.join(' / ')}`);
            if (Number(x.price) !== Number(v.price)) fail.push(`variant ${v.key} price is ${x.price}`);
            if (x.policy !== 'CONTINUE') fail.push(`variant ${v.key} policy is ${x.policy}`);
            const comp = v.metafields.find((m) => m.key === 'build_components'), rec = v.metafields.find((m) => m.key === 'build_variant_recipe');
            if (!sameValue(x.components, comp.value)) fail.push(`variant ${v.key}: build_components did not round-trip`);
            if (!sameValue(x.recipe, rec.value)) fail.push(`variant ${v.key}: build_variant_recipe did not round-trip`);
            if (x.guardState) fail.push(`variant ${v.key}: build_guard_state must be empty`);
        }
        if (fail.length) throw new Error('read-back failed: ' + fail.slice(0, 6).join('; ') + (fail.length > 6 ? '...' : ''));

        for (const r of rims) {   // rim rules last, after the product exists and is verified
            step = `add the rules to ${r.rimTitle}`;
            const planned = plan.rules.find((x) => x.rimProductGid === r.rimProductGid);
            const newRules = withRealVariants(planned.newRules, gidByKey);
            const cur = await store.getRules(r.rimProductGid);
            if (sha256(cur.raw ?? '') !== r.oldSha) throw new Error('the rim rules changed while this was running');
            const chk = checkHubRules(newRules, parseRules(cur.raw).rules);
            if (chk.internal.length || chk.existing.length || chk.nameExists.length) throw new Error('a conflicting rule appeared');
            const next = appendRules(cur.raw, newRules);
            r.ruleRefs = newRules.map((x) => ({ name: x.name, masterVariantGid: x.masterVariantGid }));
            r.wroteRaw = next; r.wrote = true;
            await store.setRules(r.rimProductGid, next, cur.digest);
            step = `check the rules on ${r.rimTitle}`;
            const after = await store.getRules(r.rimProductGid);
            const oldList = parseRules(r.oldRaw).rules, newList = parseRules(after.raw).rules;
            if (newList.length !== oldList.length + newRules.length || stable(newList.slice(0, oldList.length)) !== stable(oldList)) throw new Error('the old rules are not identical after the write');
            for (const nr of newRules) if (!newList.some((x) => x.name === nr.name && x.masterVariantGid === nr.masterVariantGid)) throw new Error(`the rule ${nr.name} was not stored as written`);
        }
        await db.updateRun(runId, { status: 'created', record: { kind: 'hub-choice', rims, productGid, variants: gidByKey } });
        return {
            ok: true, kind: 'hub-choice', runId, productId: productGid, variantCount: plan.variants.length, adminUrl: `https://admin.shopify.com/products/${productGid.split('/').pop()}`,
            rims: rims.map((r) => ({ id: r.rimProductGid, title: r.rimTitle, before: parseRules(r.oldRaw).rules.length, after: parseRules(r.oldRaw).rules.length + r.ruleRefs.length })), verified: true,
        };
    } catch (err) {
        if (err instanceof ToolError) { await release(db, got, holder); if (!productGid) { try { await db.updateRun(runId, { status: 'failed' }); } catch (e) { /* run may not exist yet */ } } throw err; }
        const cleanup = await restoreHubRims({ store, rims });
        let deleted = 'no product had been made';
        let incomplete = rims.some((r) => r.failed);
        if (productGid) {
            try { await store.deleteProduct(productGid); deleted = 'the draft product was deleted'; } catch (e) { deleted = 'COULD NOT DELETE the draft product ' + productGid; incomplete = true; }
        }
        try { await db.updateRun(runId, { status: incomplete ? 'failed_incomplete' : 'failed', record: { kind: 'hub-choice', rims, productGid, error: err.message, step } }); } catch (e) { /* ignore */ }
        await release(db, got, holder);
        if (incomplete) throw new ToolError('ROLLBACK_INCOMPLETE', `Step "${step}" failed (${err.message}) AND the clean-up did not finish. Run ${runId} lists what to remove by hand.`, 500, { runId });
        throw new ToolError('SHOPIFY_ERROR', `Shopify refused step "${step}": ${err.message}. Nothing was left behind: ${cleanup.join('; ')}; ${deleted}.`, 502, { runId });
    } finally {
        await release(db, got, holder);
    }
}

/** Undo one hub-choice run: restore the rims, then delete the draft product (its variants and metafields go with it). Draft only. */
async function undoHubRun({ store, db, run, runId }) {
    const status = await store.getProductStatus(run.product_gid);
    if (status && status !== 'DRAFT') throw new ToolError('UNDO_REFUSED', 'The product is Active or has orders. Set it to Draft first.', 409);
    const holder = crypto.randomUUID();
    const rims = run.record.rims;
    const keys = ['create', ...rims.map((r) => 'rim:' + r.rimProductGid)];
    const got = [];
    for (const k of keys) {
        if (!(await db.acquireLock(k, holder, LOCK_TTL_MS))) { await release(db, got, holder); throw new ToolError('RIM_LOCKED', 'Someone else is changing this rim right now. Try again in two minutes.', 423); }
        got.push(k);
    }
    try {
        const lines = await restoreHubRims({ store, rims });
        if (rims.some((r) => r.failed)) throw new ToolError('ROLLBACK_INCOMPLETE', 'A rim could not be restored; the product was NOT deleted. ' + lines.join('; '), 500, { runId });
        let deletedProductId = null;
        if (status) { await store.deleteProduct(run.product_gid); deletedProductId = run.product_gid; }
        await db.updateRun(runId, { status: 'undone' });
        return { ok: true, restoredRims: lines, deletedProductId };
    } finally {
        await release(db, got, holder);
    }
}

module.exports = { createHubChoice, undoHubRun, restoreHubRims, variantGid };
