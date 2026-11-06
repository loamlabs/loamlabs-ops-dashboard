// lib/signature-build/execute.js
// create (writes the DRAFT master and appends the rim rules, with read-back and automatic rollback) and undo.
// Writes only: productCreate (DRAFT), the new variant, the rim rules metafield (append). Never activates, publishes, writes the guard state, or touches other products.
const crypto = require('crypto');
const { sha256, stable, ToolError, variantGid } = require('./util');
const { parseRules, appendRule, removeRule, checkRule } = require('./rules');

const LOCK_TTL_MS = 2 * 60 * 1000;

// Shopify may re-format JSON metafield text, so compare JSON by content and everything else exactly.
function sameValue(a, b) {
    if (a === b) return true;
    try { return stable(JSON.parse(a)) === stable(JSON.parse(b)); } catch (e) { return false; }
}

/** Put every rim back the way this run found it. Returns lines describing what happened. */
async function restoreRims({ store, rims }) {
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
                const without = removeRule(cur.raw, r.ruleName, r.masterVariantGid);
                await store.setRules(r.rimProductGid, without, cur.digest);
                lines.push(`${r.rimTitle}: someone changed the rules since, so only this run's rule was removed`);
            }
        } catch (e) {
            lines.push(`${r.rimTitle}: COULD NOT RESTORE (${e.message}); saved old value is in the run record`);
            r.failed = true;
        }
    }
    return lines;
}

async function release(db, keys, holder) { for (const k of keys) { try { await db.releaseLock(k, holder); } catch (e) { /* lock expires on its own */ } } }

/**
 * @param {object} p { store, db, planId, planHash, price, belowFloorOk, now? }
 */
async function createBuild({ store, db, planId, planHash, price, belowFloorOk = false, now = Date.now() }) {
    const row = await db.getPlan(planId);
    if (!row || row.plan_hash !== planHash || new Date(row.expires_at).getTime() < now) throw new ToolError('PLAN_EXPIRED', 'The plan is older than 30 minutes or changed. Run the preview again.', 410);
    if (row.plan.kind === 'hub-choice') return require('./hub/execute').createHubChoice({ store, db, row, planHash, belowFloorOk });   // hub-choice products: hub/execute.js
    const plan = row.plan;
    if (plan.blockers.length) throw new ToolError(plan.blockers[0].code, plan.blockers[0].message, 409);
    if (typeof price !== 'number' || !(price > 0)) throw new ToolError('PRICE_REQUIRED', 'Enter the price before creating.', 400);
    const floor = plan.margin.floor;
    if (price < floor && !belowFloorOk) throw new ToolError('BELOW_FLOOR', `The price is below your floor of $${floor}. Tick "below floor" to go ahead.`, 400);

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
        return { rimProductGid: r.rimProductGid, rimTitle: r.rimTitle, oldRaw: b.raw, oldSha: b.sha256, ruleName: r.newRule.name, masterVariantGid: null, wrote: false, wroteRaw: null };
    });
    let productGid = null, variantId = null, step = 'start';
    try {
        // fresh checks under the lock
        const dup = await db.findActiveRunByFingerprint(plan.fingerprint);
        if (dup) throw new ToolError('DUPLICATE_BUILD', `This build already exists: run ${dup.run_id}.`, 409);
        for (const r of rims) {
            const cur = await store.getRules(r.rimProductGid);
            if (sha256(cur.raw ?? '') !== r.oldSha) throw new ToolError('PLAN_EXPIRED', `The rules on ${r.rimTitle} changed since the preview. Run the preview again.`, 410);
        }
        await db.createRun({ runId, fingerprint: plan.fingerprint, status: 'creating', name: plan.name, record: { rims, plan: { product: plan.product, rules: plan.rules } } });

        step = 'create the draft product';
        const made = await store.createDraft(plan.product);
        productGid = made.productGid; variantId = made.variantGid;
        await db.updateRun(runId, { product_gid: productGid, variant_gid: variantId, record: { rims, productGid, variantId } });

        step = 'set the price and stock settings';
        await store.updateVariant(productGid, variantId, { price: price.toFixed(2), policy: plan.variant.policy, tracked: plan.variant.tracked, metafields: plan.variant.metafields });

        step = 'check the new product';
        const rb = await store.readBack(productGid);
        const fail = [];
        if (rb.status !== 'DRAFT') fail.push('status is ' + rb.status);
        if (stable(rb.tags) !== stable(['loamlabs-build'])) fail.push('tags are not exactly loamlabs-build');
        if (rb.collectionCount !== 0) fail.push('the product is in a collection');
        plan.product.metafields.forEach((m) => { if (!sameValue(rb.metafields[`${m.namespace}.${m.key}`], m.value)) fail.push(`metafield ${m.key} did not round-trip`); });
        if (!sameValue(rb.variantMetafields['custom.build_components'], plan.variant.metafields[0].value)) fail.push('build_components did not round-trip');
        if (rb.guardState) fail.push('build_guard_state must be empty');
        if (fail.length) throw new Error('read-back failed: ' + fail.join('; '));

        // rim rules last, after the master exists and is verified
        for (const r of rims) {
            r.masterVariantGid = variantGid(variantId);
            step = `add the rule to ${r.rimTitle}`;
            const cur = await store.getRules(r.rimProductGid);
            if (sha256(cur.raw ?? '') !== r.oldSha) throw new Error('the rim rules changed while this was running');
            const rule = { ...plan.rules.find((x) => x.rimProductGid === r.rimProductGid).newRule, masterVariantGid: variantGid(variantId) };
            const recheck = checkRule(rule, parseRules(cur.raw).rules);
            if (recheck.conflicting.length || recheck.nameExists) throw new Error('a conflicting rule appeared');
            const next = appendRule(cur.raw, rule);
            r.wroteRaw = next; r.wrote = true;
            await store.setRules(r.rimProductGid, next, cur.digest);
            step = `check the rules on ${r.rimTitle}`;
            const after = await store.getRules(r.rimProductGid);
            const oldList = parseRules(r.oldRaw).rules, newList = parseRules(after.raw).rules;
            if (newList.length !== oldList.length + 1 || stable(newList.slice(0, oldList.length)) !== stable(oldList)) throw new Error('the old rules are not identical after the write');
            if (newList[newList.length - 1].masterVariantGid !== variantGid(variantId)) throw new Error('the new rule was not stored as written');
        }
        await db.updateRun(runId, { status: 'created', record: { rims, productGid, variantId, price } });
        return { ok: true, runId, productId: productGid, variantId, adminUrl: `https://admin.shopify.com/products/${productGid.split('/').pop()}`, rims: rims.map((r) => ({ id: r.rimProductGid, title: r.rimTitle, before: parseRules(r.oldRaw).rules.length, after: parseRules(r.oldRaw).rules.length + 1 })), verified: true };
    } catch (err) {
        if (err instanceof ToolError) { await release(db, got, holder); if (!productGid) { try { await db.updateRun(runId, { status: 'failed' }); } catch (e) { /* run may not exist yet */ } } throw err; }
        const cleanup = await restoreRims({ store, rims });
        let deleted = 'no product had been made';
        let incomplete = rims.some((r) => r.failed);
        if (productGid) {
            try { await store.deleteProduct(productGid); deleted = 'the draft product was deleted'; } catch (e) { deleted = 'COULD NOT DELETE the draft product ' + productGid; incomplete = true; }
        }
        try { await db.updateRun(runId, { status: incomplete ? 'failed_incomplete' : 'failed', record: { rims, productGid, variantId, error: err.message, step } }); } catch (e) { /* ignore */ }
        await release(db, got, holder);
        if (incomplete) throw new ToolError('ROLLBACK_INCOMPLETE', `Step "${step}" failed (${err.message}) AND the clean-up did not finish. Run ${runId} lists what to remove by hand.`, 500, { runId });
        throw new ToolError('SHOPIFY_ERROR', `Shopify refused step "${step}": ${err.message}. Nothing was left behind: ${cleanup.join('; ')}; ${deleted}.`, 502, { runId });
    } finally {
        await release(db, got, holder);
    }
}

/** Undo one run: restore the rims, then delete the draft product. Draft only. */
async function undoRun({ store, db, runId, confirm }) {
    if (confirm !== `UNDO ${runId}`) throw new ToolError('CONFIRM_REQUIRED', `Type exactly: UNDO ${runId}`, 400);
    const run = await db.getRun(runId);
    if (!run) throw new ToolError('RUN_NOT_FOUND', 'No such run.', 404);
    if (run.status !== 'created') throw new ToolError('UNDO_REFUSED', `This run is "${run.status}", nothing to undo.`, 409);
    if (run.record && run.record.kind === 'hub-choice') return require('./hub/execute').undoHubRun({ store, db, run, runId });
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
        const lines = await restoreRims({ store, rims });
        if (rims.some((r) => r.failed)) throw new ToolError('ROLLBACK_INCOMPLETE', 'A rim could not be restored; the product was NOT deleted. ' + lines.join('; '), 500, { runId });
        let deletedProductId = null;
        if (status) { await store.deleteProduct(run.product_gid); deletedProductId = run.product_gid; }
        await db.updateRun(runId, { status: 'undone' });
        return { ok: true, restoredRims: lines, deletedProductId };
    } finally {
        await release(db, got, holder);
    }
}

module.exports = { createBuild, undoRun, restoreRims, LOCK_TTL_MS };
