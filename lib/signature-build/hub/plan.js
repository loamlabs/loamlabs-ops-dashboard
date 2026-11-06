// lib/signature-build/hub/plan.js
// The dry run for a hub-choice product: reads the store, writes NOTHING to Shopify, returns everything create would write, plus the matrix
// (hub x spacing) with price, cost, margin, warnings, rule results and the list of dropped hubs with the reason.
const crypto = require('crypto');
const { sha256, stable, num, productGid, variantGid, money } = require('../util');
const { parseRules } = require('../rules');
const { computePricing } = require('../pricing');
const { USE_WORD, rimModel } = require('../naming');
const { PLAN_TTL_MS } = require('../plan');
const { OPTION_SPACING, OPTION_HUB, SPACINGS, spacingValue, spacingName, BRAKE_STYLE, FREEHUB_LABELS, PRODUCT_TYPE, ASSEMBLY } = require('./constants');
const { importLengths, lookupLengths } = require('./lengths');
const { variantPrice } = require('./pricing');
const { evaluateHubCombo, checkRimData, optVal, COLOUR, HOLES } = require('./fit');
const { checkSpokeProduct, checkSignatureRules, berdInsertsNeeded, describeSpoke } = require('./rules-check');
const { hubChoiceNames, ruleNameFor, seoDescriptionFor } = require('./naming');
const { buildHubRule, checkHubRules } = require('./rules-build');
const { buildComponents, buildVariantRecipe, buildSharedRecipe } = require('./components');

const ci = (s) => String(s == null ? '' : s).trim().toLowerCase();
const isId = (v) => typeof v === 'string' && /^\d{6,20}$/.test(v);
const STYLES = ['mtb', 'gravelroad', 'hybrid'];

/** Shape check of the config (recipe v2). @returns {string[]} problems */
function validateHubConfig(c) {
    const e = [];
    if (!c || typeof c !== 'object') return ['the hub-choice setup is missing'];
    if (c.v !== 2 || c.kind !== 'hub-choice') e.push('v must be 2 and kind must be "hub-choice"');
    if (!c.name || typeof c.name !== 'string') e.push('name is missing');
    if (!STYLES.includes(c.ridingStyle)) e.push('ridingStyle must be one of ' + STYLES.join(', '));
    const s = c.specs || {};
    ['frontWheelSize', 'rearWheelSize', 'spokeCount'].forEach((k) => { if (typeof s[k] !== 'string' || !s[k]) e.push(`specs.${k} is missing`); });
    if (s.spokeCount && !/^\d{2}$/.test(s.spokeCount)) e.push('specs.spokeCount must be a plain number such as "32"');
    ['front', 'rear'].forEach((k) => { if (!isId((c.rims || {})[k])) e.push(`rims.${k} must be a numeric variant id (text)`); });
    if (!isId(c.spokes)) e.push('spokes must be the numeric id of the builder (Length -) spoke variant');
    if (!isId(c.nipples)) e.push('nipples must be a numeric variant id (text)');
    if (!Array.isArray(c.hubs) || !c.hubs.length) e.push('hubs is empty');
    else c.hubs.forEach((h, i) => {
        if (!h || !h.model) e.push(`hubs[${i}].model is missing`);
        if (!h || !h.frontProducts || !h.rearProducts) e.push(`hubs[${i}] needs frontProducts and rearProducts (spacing -> product id)`);
    });
    if (c.hubs && new Set(c.hubs.map((h) => h && h.model)).size !== c.hubs.length) e.push('two hubs have the same model name');
    return e;
}

/**
 * @param {object} p { store, db, config, lengthsCsv, overrides, now }
 */
async function planHubChoice({ store, db, config, lengthsCsv = null, overrides = {}, now = Date.now() }) {
    const blockers = [], warnings = [], notes = [], dropped = [];
    let washer = false;   // a mandatory rim washer: stated in the notes and in the page description
    const block = (code, message) => blockers.push({ code, message });
    const warn = (code, message) => warnings.push({ code, message });
    const finish = (extra) => finishPlan({ db, now, blockers, warnings, notes, dropped, ...extra });

    const problems = validateHubConfig(config);
    if (problems.length) { block('RECIPE_INVALID', 'The hub-choice setup is incomplete or malformed: ' + problems.join('; ') + '.'); return finish({}); }
    const c = config;
    const holes = c.specs.spokeCount;

    // ---- lengths table (Backend 1's CSV, imported every time)
    let lengths = null;
    if (lengthsCsv) {
        const imp = importLengths(lengthsCsv);
        imp.problems.forEach((m) => block('LENGTHS_TABLE', m));
        lengths = imp.index;
        if (!c.lengthsKey) block('LENGTHS_TABLE', 'Say which product in the spoke length table this is (lengthsKey).');
    } else warn('SPOKE_LENGTHS_NOT_CHECKED', "No spoke length table was given, so the guard will watch each build's builder spoke variant instead of the exact lengths. Import Backend 1's table to check stock at the real lengths.");

    // ---- the shared parts: rims, spokes, nipples
    const found = await store.getVariants([c.rims.front, c.rims.rear, c.spokes, c.nipples]);
    const get = (id, label) => { const v = found.get(id); if (!v) block('PART_NOT_FOUND', `The ${label} (variant ${id}) does not exist or is archived.`); return v; };
    const rimF = get(c.rims.front, 'front rim'), rimR = get(c.rims.rear, 'rear rim'), spokeB = get(c.spokes, 'builder spoke variant'), nip = get(c.nipples, 'nipple variant');
    if (blockers.length) return finish({});

    const cache = new Map();
    const load = async (gid) => { if (!cache.has(gid)) cache.set(gid, await store.getPartProduct(gid)); return cache.get(gid); };
    const rimFP = await load(rimF.productGid), rimRP = rimR.productGid === rimF.productGid ? rimFP : await load(rimR.productGid);
    const spokeP = await load(spokeB.productGid);
    const rimVar = (P, v) => (P.variants || []).find((x) => x.id === v.id) || v;

    // rim holes must equal the product's spoke count (the order webhook takes the count from the build specs, never from the hub)
    for (const [side, v] of [['front', rimF], ['rear', rimR]]) {
        const h = optVal(v, HOLES);
        if (ci(h) !== ci(`${holes}h`)) block('SPECS_HOLE_MISMATCH', `The ${side} rim variant is ${h || 'unknown'} but the setup says ${holes}h. The specs, the rim and every hub must all be ${holes}h.`);
    }
    if (!/^(?:\d+(?:\.\d+)?")$|700c|650b/.test(c.specs.frontWheelSize)) warn('WHEEL_SIZE_SPELLING', `Front wheel size "${c.specs.frontWheelSize}" is not spelled the way the builder spells sizes (29", 27.5").`);
    [[rimFP, rimF, 'front'], [rimRP, rimR, 'rear']].forEach(([P, v, side]) => {
        checkRimData(P, rimVar(P, v)).forEach((b) => block(b.code, b.message));
        if (ci(P.meta && P.meta.rim_washer_policy) === 'mandatory' && parseFloat(P.meta.nipple_washer_thickness) > 0 && side === 'front') {
            notes.push(`${P.title} has a mandatory rim washer (${P.meta.nipple_washer_thickness} mm per side). The spoke calculator adds it to the ERD, so the spoke lengths already include it. There is no washer product and no priced washer line: it is free stock, included in the build price (Jerry, 2026-11-05). The page description says so. Check the washers go in the box.`); washer = true;
        }
    });
    // a rim that cannot be ordered today switches EVERY variant of the product off (every variant contains the rim): say so before creating
    [[rimFP, rimF, 'front'], [rimRP, rimR, 'rear']].forEach(([P, v, side]) => {
        if (!(Number(v.qty) > 0 || ci(v.policy) === 'continue')) warn('RIM_OUT_OF_STOCK_TODAY', `The ${side} rim (${P.title}, ${v.title}) is out of stock and sold only while in stock. Every variant of this product contains it, so the build guard will switch ALL variants off (an "all builds are off" alert) until the rim is back.`);
    });
    // spoke product: never the newer 1,000-variant product (the order webhook would pick the wrong spoke count from it)
    if ((spokeP.variants || []).some((v) => /\bspokes?\b/i.test(v.title))) block('SPOKE_PRODUCT_MULTI_COUNT', `${spokeP.title} has variants with a spoke count in the title; the order webhook would pick the wrong count. Use the product with plain "Colour / length" variants (the one master 4 uses).`);
    checkSpokeProduct(spokeP).forEach((b) => block(b.code, b.message));
    if (blockers.length) return finish({});

    const spokeColour = optVal(spokeB, COLOUR) || 'Black';
    const lengthVariantIds = new Set((spokeP.variants || []).map((v) => v.id));
    const spokeVariantById = new Map((spokeP.variants || []).map((v) => [v.id, v]));
    const builderSpokeBySide = { front: spokeB, rear: spokeB };

    // ---- the matrix: hub x spacing
    const cells = [];
    const hubOutcome = [];
    for (let hi = 0; hi < c.hubs.length; hi++) {
        const hub = c.hubs[hi];
        const lengthsName = hub.lengthsName || hub.model;
        // products per spacing
        const prods = {};
        for (const sp of SPACINGS) {
            const fid = (hub.frontProducts || {})[sp.front], rid = (hub.rearProducts || {})[sp.rear];
            prods[sp.key] = { front: fid ? await load(productGid(fid)) : null, rear: rid ? await load(productGid(rid)) : null };
        }
        // signature rules once per hub model (hub types of the products it uses)
        const allProds = Object.values(prods).flatMap((x) => [x.front, x.rear]).filter(Boolean);
        const types = [...new Set(allProds.map((p) => p.meta && p.meta.hub_type))];
        const rc = checkSignatureRules({ ridingStyle: c.ridingStyle, spoke: spokeP, hubModel: hub.model, hubTypes: types });
        if (!rc.ok) {
            rc.drop.forEach((d) => dropped.push({ hub: hub.model, spacing: null, code: d.code, reason: d.message }));
            hubOutcome.push({ hub: hub.model, dropped: true });
            continue;
        }
        rc.warnings.forEach((w) => warn(w.code, w.message));

        for (const sp of SPACINGS) {
            const cellKey = `${hi}${sp.key}`;
            const where = `${hub.model} at ${spacingName(sp)}`;
            const fit = evaluateHubCombo({ spacing: sp, holes, frontProduct: prods[sp.key].front, rearProduct: prods[sp.key].rear, defaultColor: hub.defaultColor });
            if (!fit.ok) { fit.reasons.forEach((r) => dropped.push({ hub: hub.model, spacing: sp.key, code: r.code, reason: `${where}: ${r.message}` })); continue; }

            // freehubs of the rear hub: list intersect map
            const fhList = Array.isArray(fit.rear.product.freehub) ? fit.rear.product.freehub : [];
            const fhMap = fit.rear.product.freehubMap || {};
            // only the three bodies of contract resolution 2 are offered (XD-R, HG-R and N3W are not: those customers use Customize)
            const offeredKeys = fhList.filter((k) => FREEHUB_LABELS[k]);
            const freehubs = offeredKeys.filter((k) => fhMap[k]).map((k) => ({ key: k, label: FREEHUB_LABELS[k], gid: fhMap[k] }));
            if (!freehubs.length) { dropped.push({ hub: hub.model, spacing: sp.key, code: 'FREEHUB_MAP_MISSING', reason: `${where}: the rear hub has no freehub body list or map` }); continue; }
            if (freehubs.length < offeredKeys.length) warn('FREEHUB_MAP_MISSING', `${where}: the rear hub lists ${offeredKeys.filter((k) => !fhMap[k]).join(', ')} but has no body variant for it; those are not offered.`);
            fit.labelNotes.forEach((n) => warn(n.code, `${where}: ${n.message}`));

            // spoke lengths for exactly this variant
            let lens = null;
            if (lengths) {
                const lk = lookupLengths(lengths, { product: c.lengthsKey, hub: lengthsName, spacingKey: sp.key });
                if (!lk.ok) { dropped.push({ hub: hub.model, spacing: sp.key, code: 'LENGTHS_MISSING', reason: `${where}: ${lk.reason}` }); continue; }
                const wrong = [];
                if (lk.front.rimVariantId && lk.front.rimVariantId !== rimF.id) wrong.push('the front rim');
                if (lk.rear.rimVariantId && lk.rear.rimVariantId !== rimR.id) wrong.push('the rear rim');
                if (lk.front.hubVariantId && lk.front.hubVariantId !== fit.front.default.id) wrong.push('the front hub');
                if (lk.rear.hubVariantId && lk.rear.hubVariantId !== fit.rear.default.id) wrong.push('the rear hub');
                if (wrong.length) { dropped.push({ hub: hub.model, spacing: sp.key, code: 'LENGTHS_FOR_OTHER_PARTS', reason: `${where}: the spoke length table was calculated with a different ${wrong.join(' / ')} than the one in this setup; regenerate the table` }); continue; }
                const idsOk = [lk.front.leftVariantId, lk.front.rightVariantId, lk.rear.leftVariantId, lk.rear.rightVariantId].every((id) => lengthVariantIds.has(id));
                if (!idsOk) { dropped.push({ hub: hub.model, spacing: sp.key, code: 'SPOKE_LENGTH_NOT_FOUND', reason: `${where}: a spoke length variant named in the table does not exist on ${spokeP.title}` }); continue; }
                const mmOf = (id) => { const m = /(\d+)\s*mm/i.exec((spokeVariantById.get(id) || {}).title || ''); return m ? Number(m[1]) : null; };
                const titleBad = [[lk.front.leftVariantId, lk.front.leftMm], [lk.front.rightVariantId, lk.front.rightMm], [lk.rear.leftVariantId, lk.rear.leftMm], [lk.rear.rightVariantId, lk.rear.rightMm]].some(([id, mm]) => mmOf(id) !== Math.round(mm));
                if (titleBad) { dropped.push({ hub: hub.model, spacing: sp.key, code: 'LENGTH_VARIANT_MISMATCH', reason: `${where}: a spoke length variant does not have the length the table says` }); continue; }
                lens = { front: { left: lk.front.leftVariantId, right: lk.front.rightVariantId, leftMm: lk.front.leftMm, rightMm: lk.front.rightMm }, rear: { left: lk.rear.leftVariantId, right: lk.rear.rightVariantId, leftMm: lk.rear.leftMm, rightMm: lk.rear.rightMm } };
            }

            // price, cost, margin
            const override = (overrides.variantPrices && overrides.variantPrices[`${hub.model}|${sp.key}`]) ?? (overrides.hubPrices && overrides.hubPrices[hub.model]);
            const vp = variantPrice({
                frontRim: rimF.price, rearRim: rimR.price, frontHub: fit.front.default.price, rearHub: fit.rear.default.price, spokes: spokeB.price, nipples: nip.price,
                hubVendor: fit.front.product.vendor, rimVendor: rimFP.vendor, override: typeof override === 'number' ? override : null,
            });
            const parts = [
                { id: rimF.id, role: 'frontRim', label: `${rimFP.title} (${rimF.title})`, price: rimF.price, cost: rimF.cost },
                { id: rimR.id, role: 'rearRim', label: `${rimRP.title} (${rimR.title})`, price: rimR.price, cost: rimR.cost },
                { id: fit.front.default.id, role: 'frontHub', label: `${fit.front.product.title} (${fit.front.default.title})`, price: fit.front.default.price, cost: fit.front.default.cost },
                { id: fit.rear.default.id, role: 'rearHub', label: `${fit.rear.product.title} (${fit.rear.default.title})`, price: fit.rear.default.price, cost: fit.rear.default.cost },
                { id: spokeB.id, role: 'frontSpokes', label: `${spokeP.title} (${spokeB.title})`, price: spokeB.price, cost: spokeB.cost },
                { id: spokeB.id + ':r', role: 'rearSpokes', label: `${spokeP.title} (${spokeB.title})`, price: spokeB.price, cost: spokeB.cost },
                { id: nip.id, role: 'frontNipples', label: `${nip.productTitle} (${nip.title})`, price: nip.price, cost: nip.cost },
                { id: nip.id + ':r', role: 'rearNipples', label: `${nip.productTitle} (${nip.title})`, price: nip.price, cost: nip.cost },
            ];
            const pricing = computePricing({ parts, price: vp.price, displayedTotal: vp.builderPrice, costOverrides: overrides.costOverrides, labour: overrides.labour, shipping: overrides.shipping, feePct: overrides.feePct });
            const cellWarn = [];
            if (pricing.incomplete) cellWarn.push({ code: 'COST_MISSING', message: `${where}: ${pricing.costMissing} part(s) have no Cost per item, so the margin is incomplete.` });
            if (pricing.belowFloor) cellWarn.push({ code: 'BELOW_FLOOR', message: `${where}: price $${vp.price.toFixed(2)} is below the floor $${pricing.floor.toFixed(2)}.` });
            if (fit.excludedColours.length) cellWarn.push({ code: 'COLOUR_EXCLUDED', message: `${where}: left out of the colour list: ${fit.excludedColours.map((x) => `${x.name} (${x.reason})`).join('; ')}` });
            // hub out of stock today: the variant is still made, the guard switches it off
            const orderable = (v) => Number(v.qty) > 0 || ci(v.policy) === 'continue';
            if (!fit.colours.some((c2) => orderable(c2.front) && orderable(c2.rear))) cellWarn.push({ code: 'OUT_OF_STOCK_TODAY', message: `${where}: no colour of this hub is orderable today; the variant is made and the guard will switch it off.` });

            const ruleName = ruleNameFor(c.name, hub.model, sp);
            const spec = {
                hubModel: hub.model, spacing: sp, labels: fit.labels, ruleName, holes, defaultColour: fit.defaultColour, front: fit.front, rear: fit.rear, colours: fit.colours, freehubs,
                rims: { front: rimF, rear: rimR }, nipples: nip, lengths: lens, builderSpokes: builderSpokeBySide,
            };
            cells.push({
                key: cellKey, hubIndex: hi, hubModel: hub.model, spacing: sp, labels: fit.labels, option: [spacingValue(sp), hub.model],
                price: vp.price, builderPrice: vp.builderPrice, listTotal: vp.listTotal, overridden: vp.overridden, assembly: vp.assembly, pricing, parts: pricing.lines,
                warnings: cellWarn, ruleName, colours: fit.colours.map((x) => x.name), excludedColours: fit.excludedColours, freehubs: freehubs.map((f) => f.label),
                lengths: lens, hubPriceCents: { front: Math.round(fit.front.default.price * 100), rear: Math.round(fit.rear.default.price * 100) },
                frontProduct: num(fit.front.product.gid), rearProduct: num(fit.rear.product.gid), hubVendor: fit.front.product.vendor,
                components: buildComponents(spec), variantRecipe: buildVariantRecipe(spec),
            });
            cellWarn.forEach((w) => warn(w.code, w.message));
        }
        hubOutcome.push({ hub: hub.model, dropped: false });
    }
    // two hubs labelling the same spacing differently is reported, not guessed: each rule carries its own hub's label
    for (const sp of SPACINGS) {
        const pairs = [...new Set(cells.filter((x) => x.spacing.key === sp.key).map((x) => `${x.labels.front} / ${x.labels.rear}`))];
        if (pairs.length > 1) warn('SPACING_LABEL_HUBS_DIFFER', `Spacing ${sp.key} (${spacingName(sp)}): the hubs label it differently in the store: ${pairs.join(' | ')}.`);
    }
    if (!cells.length) {
        block('NO_HUB_LEFT', 'No hub is left to offer: ' + (dropped.length ? dropped.slice(0, 6).map((d) => d.reason).join(' | ') : 'none were configured') + '.');
        return finish({ matrix: [] });
    }

    // ---- names
    const names = hubChoiceNames(overrides.name || c.name);
    if (names.forbidden) block('NAME_FORBIDDEN', 'The name must not contain "We Are One" or "WAO".');
    const seoTitle = overrides.seoTitle || names.seoTitle;
    if (!overrides.seoTitle && !names.seoTitleInRange) warn('SEO_TITLE_LENGTH', `The SEO title "${seoTitle}" is ${seoTitle.length} characters (aim for 47 to 59).`);
    else if (overrides.seoTitle && (seoTitle.length < 47 || seoTitle.length > 59)) warn('SEO_TITLE_LENGTH', `The SEO title is ${seoTitle.length} characters (aim for 47 to 59).`);

    // ---- options, offered hubs, description
    const usedSpacings = SPACINGS.filter((sp) => cells.some((x) => x.spacing.key === sp.key));
    const usedHubs = c.hubs.map((h) => h.model).filter((m) => cells.some((x) => x.hubModel === m));
    cells.sort((a, b) => a.hubIndex - b.hubIndex || a.spacing.key.localeCompare(b.spacing.key));
    const use = overrides.useSentence || c.useSentence || USE_WORD[c.ridingStyle];
    const rimName = rimModel(rimFP.title) + (rimFP.title === rimRP.title && c.specs.frontWheelSize !== c.specs.rearWheelSize ? ` (${c.specs.frontWheelSize} front, ${c.specs.rearWheelSize} rear)` : '');
    const hubProductsUsed = [...new Set(cells.flatMap((x) => [x.frontProduct, x.rearProduct]))].map((id) => cache.get(productGid(id)));
    const seoDesc = overrides.seoDescription || seoDescriptionFor({ use, rim: rimModel(rimFP.title), hubs: usedHubs });
    if (!overrides.seoDescription && (seoDesc.length < 120 || seoDesc.length > 140)) warn('SEO_DESCRIPTION_LENGTH', `The SEO description is ${seoDesc.length} characters (aim for 120 to 140).`);
    const spokeName = spokeP.title.replace(/\s*Spokes?\s*-?\s*/i, ' ').replace(/J-Bend/i, 'J-bend').replace(/\s+/g, ' ').trim();   // "Sapim Race Spokes- J-Bend" -> "Sapim Race J-bend"
    const insert = berdInsertsNeeded(spokeP, hubProductsUsed);
    const descriptionHtml = overrides.descriptionHtml
        || `<p>${use} ${BRAKE_STYLE} wheelset: ${rimName} rims, with your choice of hub: ${usedHubs.join(', ')}. Laced with ${spokeName} spokes in ${spokeColour.toLowerCase()} and ${nip.productTitle} in ${(optVal(nip, COLOUR) || spokeColour).toLowerCase()}. Hand-built in our shop.</p>`
        + `<p>Hub colours are chosen in the builder: pick your hub here, then press Customize in the builder to choose its colour. Every colour of one hub model is the same price.</p>`
        + `<p>The freehub body is chosen on this page. Valve stems are not included; add them on the next step.</p>`
        + (washer ? '<p>These rims use a rim washer under each nipple. The washers are included in the build price.</p>' : '')
        + (insert ? '<p>Berd Hub Inserts are needed with these hubs and are added to the build.</p>' : '');

    // ---- rim rules: one rule per hub x spacing per rim product
    const rimProducts = [...new Set([num(rimFP.gid), num(rimRP.gid)])];
    const rules = [];
    for (const rp of rimProducts) {
        const rimP = await load(productGid(rp));
        const parsed = parseRules(rimP.rulesRaw);
        if (!parsed.ok) { block('RIM_RULES_UNREADABLE', `The rules stored on ${rimP.title} cannot be read (${parsed.error}). Nothing was changed.`); continue; }
        const newRules = cells.map((x) => buildHubRule({
            name: x.ruleName, thisRimProduct: rp, frontRimProduct: num(rimFP.gid), rearRimProduct: num(rimRP.gid), frontHubProduct: x.frontProduct, rearHubProduct: x.rearProduct,
            spokeProduct: num(spokeP.gid), spokeColors: [spokeColour], labels: x.labels, sizes: { front: c.specs.frontWheelSize, rear: c.specs.rearWheelSize }, hubPriceCents: x.hubPriceCents, variantKey: x.key,
        }));
        const chk = checkHubRules(newRules, parsed.rules);
        chk.internal.forEach((m) => block('RULE_CONFLICT', `Rules for ${rimP.title}: ${m}.`));
        chk.existing.forEach((x) => block('RULE_CONFLICT', `"${x.rule}" matches the same build as the existing rule "${x.other}" on ${rimP.title}. Retire that master first (masters 2 and 4 are retired when these rules go in) or change a size or colour so they differ.`));
        chk.nameExists.forEach((n) => block('RULE_NAME_EXISTS', `A rule named "${n}" is already on ${rimP.title}.`));
        if (chk.notComparable) warn('LEGACY_RULES_NOT_COMPARABLE', `${chk.notComparable} older rule(s) on ${rimP.title} could not be compared (no product ids).`);
        rules.push({ rimProductGid: rimP.gid, rimTitle: rimP.title, existingCount: parsed.rules.length, newRules, count: newRules.length, bytesBefore: rimP.rulesRaw ? Buffer.byteLength(rimP.rulesRaw) : 0, bytesAfter: Buffer.byteLength(JSON.stringify([...parsed.rules, ...newRules])), backup: { raw: rimP.rulesRaw === undefined ? null : rimP.rulesRaw, sha256: sha256(rimP.rulesRaw ?? '') } });
    }

    // ---- duplicates
    const fingerprint = sha256(stable({
        shared: { rims: [rimF.id, rimR.id], sizes: [c.specs.frontWheelSize, c.specs.rearWheelSize], spokes: spokeB.id, nipples: nip.id, style: c.ridingStyle },
        variants: cells.map((x) => [x.hubModel, x.spacing.key, x.frontProduct, x.rearProduct, x.colours, x.freehubs, x.lengths]),
    }));
    const active = db && (await db.findActiveRunByFingerprint(fingerprint));
    if (active) block('DUPLICATE_BUILD', `This build already exists: run ${active.run_id || active.runId}.`);
    for (const m of await store.listMasters()) if (m.handle === names.handle) block('DUPLICATE_BUILD', `This build already exists: ${m.title}.`);

    // ---- the writes, exactly
    const product = {
        title: names.title, handle: names.handle, vendor: 'LoamLabs', productType: PRODUCT_TYPE, tags: ['loamlabs-build'], templateSuffix: 'loamlabs-build', status: 'DRAFT',
        descriptionHtml, seo: { title: seoTitle, description: seoDesc },
        options: [{ name: OPTION_SPACING, values: usedSpacings.map(spacingValue) }, { name: OPTION_HUB, values: usedHubs }],
        metafields: [
            { namespace: 'custom', key: 'build_recipe', type: 'json', value: JSON.stringify(buildSharedRecipe({ ...c, useSentence: use })) },
            { namespace: 'seo', key: 'hidden', type: 'number_integer', value: '1' },
        ],
    };
    const variants = cells.map((x) => ({
        key: x.key, optionValues: x.option, price: x.price.toFixed(2), policy: 'CONTINUE', tracked: true,
        metafields: [
            { namespace: 'custom', key: 'build_components', type: 'json', value: JSON.stringify(x.components) },
            { namespace: 'custom', key: 'build_variant_recipe', type: 'json', value: JSON.stringify(x.variantRecipe) },
        ],
    }));
    const hashed = { product, variants, rules: rules.map((r) => ({ rim: r.rimProductGid, rules: r.newRules, backupSha: r.backup.sha256 })), fingerprint };
    const margin = {
        floor: Math.max(...cells.map((x) => x.pricing.floor)),
        belowFloor: cells.filter((x) => x.pricing.belowFloor).map((x) => x.ruleName),
        lowest: cells.reduce((a, x) => (x.pricing.marginAfterLabour !== undefined && (a === null || x.pricing.marginAfterLabour < a) ? x.pricing.marginAfterLabour : a), null),
    };
    const matrix = cells.map((x) => ({ key: x.key, hub: x.hubModel, spacing: x.spacing.key, spacingText: spacingName(x.spacing), labels: x.labels, option: x.option, price: x.price, builderPrice: x.builderPrice, overridden: x.overridden, assemblyPerWheel: x.assembly.perWheel, assemblyRule: x.assembly.rule, partsCost: x.pricing.partsCost, marginAfterLabour: x.pricing.marginAfterLabour, marginBeforeLabour: x.pricing.marginBeforeLabour, floor: x.pricing.floor, belowFloor: !!x.pricing.belowFloor, costMissing: x.pricing.costMissing, colours: x.colours, excludedColours: x.excludedColours, freehubs: x.freehubs, lengths: x.lengths && { front: [x.lengths.front.leftMm, x.lengths.front.rightMm], rear: [x.lengths.rear.leftMm, x.lengths.rear.rightMm] }, ruleName: x.ruleName, warnings: x.warnings.map((w) => w.code) }));

    return finish({
        names, product, variants, rules, fingerprint, hashed, matrix, margin, hubOutcome, spokeLengthsFrom: lengthsCsv ? 'table' : 'builder variant',
        assemblySource: ASSEMBLY.source,
        rulesSize: rules.map((r) => ({ rim: r.rimTitle, rulesAdded: r.count, bytesBefore: r.bytesBefore, bytesAfter: r.bytesAfter, limitBytes: 128 * 1024 })),
        shared: { rim: rimName, spokes: spokeP.title, spokeColour, nipples: nip.productTitle, sizes: [c.specs.frontWheelSize, c.specs.rearWheelSize], holes },
    });
}

async function finishPlan(x) {
    const { db, now, blockers, warnings, notes, dropped } = x;
    if (!x.hashed) return { ok: false, kind: 'hub-choice', blockers, warnings, notes, dropped, matrix: x.matrix || [] };
    const planHash = sha256(stable(x.hashed));
    const planId = crypto.randomUUID();
    const expiresAt = new Date(now + PLAN_TTL_MS).toISOString();
    const plan = {
        ok: true, kind: 'hub-choice', planId, planHash, expiresAt, status: 'DRAFT', name: x.names.name,
        product: x.product, variants: x.variants, matrix: x.matrix, margin: x.margin, dropped, notes, assemblySource: x.assemblySource, rulesSize: x.rulesSize, shared: x.shared,
        rules: x.rules.map((r) => ({ rimProductGid: r.rimProductGid, rimTitle: r.rimTitle, existingCount: r.existingCount, newRules: r.newRules, count: r.count, backupSha256: r.backup.sha256 })),
        fingerprint: x.fingerprint, blockers, warnings,
        _backups: x.rules.map((r) => ({ rimProductGid: r.rimProductGid, raw: r.backup.raw, sha256: r.backup.sha256 })),
    };
    if (db) await db.savePlan({ planId, planHash, plan, expiresAt });
    const { _backups, ...visible } = plan;
    return visible;
}

module.exports = { planHubChoice, validateHubConfig };
