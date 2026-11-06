// lib/signature-build/plan.js
// The dry run: reads the store, writes NOTHING to Shopify, and returns everything create would write plus blockers and warnings.
const crypto = require('crypto');
const { sha256, stable, num, variantGid, productGid, money } = require('./util');
const { validateRecipe, ROLES } = require('./recipe');
const { proposeName, derive, rimModel, hubModel, seoDescription, USE_WORD } = require('./naming');
const { parseRules, checkRule, buildRule } = require('./rules');
const { computePricing } = require('./pricing');
const { berdInsertsNeeded } = require('./hub/rules-check');

const PLAN_TTL_MS = 30 * 60 * 1000;
const optVal = (v, re) => { const o = (v.selectedOptions || []).find((x) => re.test(x.name)); return o ? o.value : null; };
const COLOUR = /^colou?r$/i, HOLES = /spoke count|hole/i, LENGTH = /^length$/i;
const available = (v) => v.qty > 0 || v.policy === 'CONTINUE';   // same meaning as the build guard
const ci = (s) => String(s).toLowerCase();

const PRODUCT_ROLE_LABEL = { frontRim: 'front rim', rearRim: 'rear rim', frontHub: 'front hub', rearHub: 'rear hub', frontSpokes: 'front spokes', rearSpokes: 'rear spokes', frontNipples: 'front nipples', rearNipples: 'rear nipples' };

/**
 * @param {object} p { store, db, recipe, overrides, now? }
 * @returns {Promise<object>} the plan (also saved with db.savePlan when it has no blockers or even with them, so the page can show it)
 */
async function planBuild({ store, db, recipe, overrides = {}, now = Date.now() }) {
    const blockers = [], warnings = [];
    const block = (code, message) => blockers.push({ code, message });
    const warn = (code, message) => warnings.push({ code, message });

    const v = validateRecipe(recipe);
    if (!v.ok) return { ok: false, blockers: [{ code: 'RECIPE_INVALID', message: 'The build is incomplete or malformed: ' + v.errors.join('; ') + '.' }], warnings };

    // ---- 1. the eight parts must exist
    const found = await store.getVariants([...new Set(ROLES.map((r) => recipe.parts[r]))]);
    const part = {};
    for (const r of ROLES) {
        const x = found.get(recipe.parts[r]);
        if (!x) block('PART_NOT_FOUND', `Part ${PRODUCT_ROLE_LABEL[r]} (variant ${recipe.parts[r]}) does not exist or is archived.`);
        else part[r] = x;
    }
    if (blockers.length) return finish({ blockers, warnings });

    const prod = (r) => num(part[r].productGid);
    if (prod('frontSpokes') !== prod('rearSpokes')) block('RULE_UNSUPPORTED', 'Front and rear spokes are different products; the rim rule can name only one spoke product.');
    if (blockers.length) return finish({ blockers, warnings });

    // ---- 2. hub products (hole count / colours / freehub fields) and spoke product
    const frontHubP = await store.getProduct(part.frontHub.productGid);
    const rearHubP = prod('rearHub') === prod('frontHub') ? frontHubP : await store.getProduct(part.rearHub.productGid);
    const spokeP = await store.getProduct(part.frontSpokes.productGid);

    // ---- 3. spokes: real length variants for the default colour
    const spokeColour = optVal(part.frontSpokes, COLOUR);
    const lengthVariant = (colour, mm) => spokeP.variants.find((x) => ci(optVal(x, COLOUR)) === ci(colour) && ci(optVal(x, LENGTH)) === `${mm}mm`);
    const haveLengths = !!recipe.spokeLengths;
    const lengthsFor = (w) => (haveLengths ? [...new Set([recipe.spokeLengths[w].left, recipe.spokeLengths[w].right])].sort((a, b) => a - b) : []);
    if (!haveLengths) warn('SPOKE_LENGTHS_NOT_CHECKED', "Spoke lengths were not calculated here, so stock at the cut lengths was not checked. Check Backend 1's spoke length report on the first order.");
    const builderVariant = (colour) => spokeP.variants.find((x) => ci(optVal(x, COLOUR)) === ci(colour) && optVal(x, LENGTH) === '-');
    const spokeGroup = (w, role, colour) => {
        if (!haveLengths) { const b = builderVariant(colour); return b ? { role, variants: [b], mode: undefined } : null; }
        const vs = [];
        for (const mm of lengthsFor(w)) {
            const lv = lengthVariant(colour, mm);
            if (!lv) { if (ci(colour) === ci(spokeColour)) block('SPOKE_LENGTH_NOT_FOUND', `No ${colour} spoke variant at ${mm} mm exists (${spokeP.title}).`); return null; }
            vs.push(lv);
        }
        return { role, variants: vs, mode: (overrides.spokeMode && overrides.spokeMode[w]) || (vs.length > 1 ? 'all' : undefined) };
    };
    const spokesFront = spokeGroup('front', 'spokes_front', spokeColour);
    const spokesRear = spokeGroup('rear', 'spokes_rear', spokeColour);

    // ---- 3b. colour rules (Agent B, release 9): option named exactly "Color"; front and rear start in the same colour; painted spokes cannot be in a master
    const hasColorOption = (P) => (P.options || []).some((o) => o.name === 'Color');
    const hubOptionOk = hasColorOption(frontHubP) && hasColorOption(rearHubP);
    const spokeOptionOk = hasColorOption(spokeP);
    if (!hubOptionOk) warn('COLOUR_OPTION_NAME', 'A hub product does not name its colour option "Color", so only the chosen hub colour is listed (no colour picker).');
    if (!spokeOptionOk) warn('COLOUR_OPTION_NAME', 'The spoke product does not name its colour option "Color", so only the chosen spoke colour is listed (no colour picker).');
    if (ci(optVal(part.frontSpokes, COLOUR)) !== ci(optVal(part.rearSpokes, COLOUR))) block('COLOUR_MISMATCH', `Front spokes are ${optVal(part.frontSpokes, COLOUR)} but rear spokes are ${optVal(part.rearSpokes, COLOUR)}; a master needs both wheels in the same colour.`);
    if (part.frontSpokes.paintFee || part.rearSpokes.paintFee) block('PAINTED_SPOKE_COLOUR', `This build has a painted spoke colour (${spokeColour}); a master can't hold the paint fee ($35 per wheel). Choose Black or White.`);

    // ---- 4. colours: hubs
    const hubColourOf = (variant) => optVal(variant, COLOUR);
    const holesOf = (variant) => optVal(variant, HOLES);
    const hubCandidates = (P, chosen) => P.variants.filter((x) => holesOf(x) === holesOf(chosen) && x.price === chosen.price);
    const fh = hubCandidates(frontHubP, part.frontHub), rh = hubCandidates(rearHubP, part.rearHub);
    const hubDefault = hubColourOf(part.frontHub);
    if (ci(hubColourOf(part.rearHub)) !== ci(hubDefault)) block('COLOUR_MISMATCH', `Front hub is ${hubDefault} but rear hub is ${hubColourOf(part.rearHub)}; a master needs both hubs in the same colour.`);
    const hubOffered = [], hubExcluded = [];
    const allHubColours = [...new Set([...frontHubP.variants, ...rearHubP.variants].map(hubColourOf).filter(Boolean))];
    for (const c of (hubOptionOk ? allHubColours : [])) {
        const f = fh.find((x) => ci(hubColourOf(x)) === ci(c)), r = rh.find((x) => ci(hubColourOf(x)) === ci(c));
        if (f && r) { hubOffered.push({ name: c, front: f, rear: r }); continue; }
        const anyF = frontHubP.variants.find((x) => ci(hubColourOf(x)) === ci(c) && holesOf(x) === holesOf(part.frontHub)), anyR = rearHubP.variants.find((x) => ci(hubColourOf(x)) === ci(c) && holesOf(x) === holesOf(part.rearHub));
        if (!anyF || !anyR) hubExcluded.push({ name: c, reason: `no ${holesOf(part.frontHub)} variant in this colour on the front or rear hub` });
        else hubExcluded.push({ name: c, reason: `its price differs from ${hubDefault} (front $${anyF.price.toFixed(2)} / rear $${anyR.price.toFixed(2)} vs $${part.frontHub.price.toFixed(2)} / $${part.rearHub.price.toFixed(2)}), so the master price would be wrong` });
    }
    // ---- 5. colours: spokes (only colours that exist at every needed length and are available)
    const spokeOffered = [], spokeExcluded = [];
    const allSpokeColours = [...new Set(spokeP.variants.map((x) => optVal(x, COLOUR)).filter(Boolean))];
    const needed = [...new Set([...lengthsFor('front'), ...lengthsFor('rear')])];
    for (const c of (spokeOptionOk ? allSpokeColours : [])) {
        const builder = spokeP.variants.find((x) => ci(optVal(x, COLOUR)) === ci(c) && optVal(x, LENGTH) === '-');
        if (!builder) { spokeExcluded.push({ name: c, reason: 'it has no builder (Length -) variant' }); continue; }
        if (builder.paintFee) { spokeExcluded.push({ name: c, reason: 'painted colour: the builder adds the Spoke Color Studio fee ($35 per wheel), which takes the build off the master price' }); continue; }
        if (builder.price !== part.frontSpokes.price) { spokeExcluded.push({ name: c, reason: `its price ($${builder.price.toFixed(2)}) differs from the chosen spokes ($${part.frontSpokes.price.toFixed(2)})` }); continue; }
        if (!haveLengths) { if (!available(builder)) { spokeExcluded.push({ name: c, reason: 'the builder spoke variant is out of stock' }); continue; } spokeOffered.push({ name: c }); continue; }
        const missing = needed.filter((mm) => !lengthVariant(c, mm));
        if (missing.length) { spokeExcluded.push({ name: c, reason: `no ${missing.join(' / ')} mm length exists in this colour` }); continue; }
        const out = needed.filter((mm) => !available(lengthVariant(c, mm)));
        if (out.length) { spokeExcluded.push({ name: c, reason: `out of stock at ${out.join(' / ')} mm` }); continue; }
        spokeOffered.push({ name: c });
    }
    if (spokeOptionOk && spokeColour && !part.frontSpokes.paintFee && !spokeOffered.some((c) => ci(c.name) === ci(spokeColour))) warn('SPOKE_COLOUR_UNAVAILABLE', `The chosen spoke colour ${spokeColour} is not in stock at every needed length, but it stays in the list because it is the default.`);

    // overrides (Jerry unticks colours); the default colour always stays
    const pick = (offered, wanted, def, label) => {
        if (!Array.isArray(wanted)) return offered;
        const set = new Set(wanted.map(ci));
        set.add(ci(def));
        const bad = wanted.filter((w) => !offered.some((o) => ci(o.name) === ci(w)));
        if (bad.length) block('COLOUR_NOT_ALLOWED', `${label} colour ${bad.join(', ')} cannot be listed: it is not at the master price or is not available.`);
        return offered.filter((o) => set.has(ci(o.name)));
    };
    const hubFinal = pick(hubOffered, overrides.hubColors, hubDefault, 'Hub');
    const spokeFinal = pick(spokeOffered.length ? spokeOffered : (spokeColour ? [{ name: spokeColour }] : []), overrides.spokeColors, spokeColour, 'Spoke');
    if (hubDefault && !hubFinal.some((c) => ci(c.name) === ci(hubDefault))) hubFinal.unshift({ name: hubDefault, front: part.frontHub, rear: part.rearHub });
    if (!hubDefault && !hubFinal.length) hubFinal.push({ name: '', front: part.frontHub, rear: part.rearHub });
    if (spokeColour && !spokeFinal.some((c) => ci(c.name) === ci(spokeColour))) spokeFinal.unshift({ name: spokeColour });

    // ---- 6. freehub
    let fhOptions = [], fhMap = {};
    if (!rearHubP.freehub || !rearHubP.freehubMap) block('FREEHUB_MAP_MISSING', `The rear hub (${rearHubP.title}) has no freehub list or map to copy.`);
    else {
        const dropped = rearHubP.freehub.filter((o) => !rearHubP.freehubMap[o]);
        if (dropped.length) warn('FREEHUB_MAP_MISSING', `The rear hub has no freehub body entry for ${dropped.join(', ')}; the master cannot offer it.`);
        fhOptions = rearHubP.freehub.filter((o) => rearHubP.freehubMap[o]);
        if (!fhOptions.includes(recipe.freehub)) block('FREEHUB_MAP_MISSING', `The rear hub has no freehub body entry for ${recipe.freehub}.`);
        else {
            if (Array.isArray(overrides.freehubOptions)) fhOptions = fhOptions.filter((o) => overrides.freehubOptions.includes(o) || o === recipe.freehub);
            fhOptions = [recipe.freehub, ...fhOptions.filter((o) => o !== recipe.freehub)];
            fhOptions.forEach((o) => { fhMap[o] = rearHubP.freehubMap[o]; });
        }
    }

    // ---- 7. names
    const proposed = proposeName({ frontRimTitle: part.frontRim.productTitle, rearRimTitle: part.rearRim.productTitle, frontHubTitle: frontHubP.title, spokeTitle: spokeP.title });
    proposed.warnings.forEach((m) => warn('NAME_CHECK', m));
    const names = derive(overrides.name || proposed.name);
    if (names.forbidden) block('NAME_FORBIDDEN', 'The name must not contain "We Are One" or "WAO".');
    const seoLen = names.seoTitle.length;
    if (seoLen < 47 || seoLen > 59) warn('SEO_TITLE_LENGTH', `The SEO title is ${seoLen} characters (aim for 47 to 59).`);
    const use = overrides.useSentence || USE_WORD[recipe.ridingStyle];
    const seoDesc = overrides.seoDescription || seoDescription({ use, rim: rimModel(part.frontRim.productTitle) + (part.frontRim.productTitle === part.rearRim.productTitle ? '' : ' / ' + rimModel(part.rearRim.productTitle)), hub: hubModel(frontHubP.title), spoke: spokeP.title.replace(/\s+-\s+.*$/, '') });
    if (seoDesc.length < 120 || seoDesc.length > 140) warn('SEO_DESCRIPTION_LENGTH', `The SEO description is ${seoDesc.length} characters (aim for 120 to 140).`);
    const berd = berdInsertsNeeded(spokeP, [frontHubP, rearHubP]);   // only when the hubs really need inserts (not for hook flange hubs)
    const descriptionHtml = overrides.descriptionHtml || `<p>${use} wheelset: ${rimModel(part.frontRim.productTitle)} rims, ${hubModel(frontHubP.title)} hubs, ${spokeP.title.replace(/\s+-\s+.*$/, '')} spokes and nipples. Hand-built in our shop. ${hubDefault}, ${recipe.freehub} freehub by default.</p><p>Valve stems are not included; add them on the next step.</p>${berd ? '<p>Berd Hub Inserts are needed with these hubs and are added to the build.</p>' : ''}`;

    // ---- 8. build_components (what the guard watches)
    const gids = (arr) => arr.map((x) => variantGid(x.id));
    const group = (role, variants, mode) => ({ role, variants: gids(variants), ...(mode && variants.length > 1 ? { mode } : {}) });
    const nipples = part.frontNipples.id === part.rearNipples.id ? [part.frontNipples] : [part.frontNipples, part.rearNipples];
    const components = [
        group('front_rim', [part.frontRim]),
        group('rear_rim', [part.rearRim]),
        group('front_hub', hubFinal.map((c) => c.front), 'any'),
        group('rear_hub', hubFinal.map((c) => c.rear), 'any'),
        { role: 'freehub', variants: fhMap[recipe.freehub] ? [fhMap[recipe.freehub]] : [] },
        group('nipples', nipples, 'all'),
        spokesFront && group('spokes_front', spokesFront.variants, spokesFront.mode),
        spokesRear && group('spokes_rear', spokesRear.variants, spokesRear.mode),
    ].filter(Boolean);

    // ---- 9. rim rules (one per distinct rim product), with the conflict check
    const rimProducts = [...new Set([prod('frontRim'), prod('rearRim')])];
    const rules = [];
    for (const rp of rimProducts) {
        const rim = await store.getProduct(productGid(rp));
        const parsed = parseRules(rim.rulesRaw);
        if (!parsed.ok) { block('RIM_RULES_UNREADABLE', `The rules stored on ${rim.title} cannot be read (${parsed.error}). Nothing was changed.`); continue; }
        const base = {
            name: names.ruleName, masterVariantId: '__NEW_VARIANT__', frontRimProduct: prod('frontRim'), rearRimProduct: prod('rearRim'), thisRimProduct: rp,
            frontHubProduct: prod('frontHub'), rearHubProduct: prod('rearHub'), spokeProduct: prod('frontSpokes'),
            hubColors: hubFinal.map((c) => c.name).filter(Boolean), spokeColors: spokeFinal.map((c) => c.name).filter(Boolean),
        };
        let rule = buildRule(base);
        rule.masterVariantGid = '__NEW_VARIANT__';
        let check = checkRule(rule, parsed.rules);
        if (check.nameExists) block('RULE_NAME_EXISTS', `A rule named "${names.ruleName}" is already on ${rim.title}.`);
        if (check.conflicting.length) {
            const sized = { ...rule, frontWheelSize: recipe.specs.frontWheelSize, rearWheelSize: recipe.specs.rearWheelSize };
            const again = checkRule(sized, parsed.rules);
            if (!again.conflicting.length) { rule = sized; check = again; warn('WHEEL_SIZES_ADDED', `Another rule on ${rim.title} matched this build, so the wheel sizes (${recipe.specs.frontWheelSize} front, ${recipe.specs.rearWheelSize} rear) were added to tell them apart.`); }
            else block('RULE_CONFLICT', `Another rule on ${rim.title} matches this build: ${again.conflicting.join(', ')}. Add a distinguishing size or colour.`);
        }
        if (check.notComparable) warn('LEGACY_RULES_NOT_COMPARABLE', `${check.notComparable} older rule(s) on ${rim.title} could not be compared (no product ids).`);
        rules.push({ rimProductGid: rim.gid, rimTitle: rim.title, existingCount: parsed.rules.length, newRule: rule, backup: { raw: rim.rulesRaw === undefined ? null : rim.rulesRaw, sha256: sha256(rim.rulesRaw ?? '') } });
    }

    // ---- 10. duplicate protection
    const parts = Object.fromEntries(ROLES.map((r) => [r, recipe.parts[r]]));
    const fingerprint = sha256(stable({ parts, sizes: [recipe.specs.frontWheelSize, recipe.specs.rearWheelSize], freehub: recipe.freehub, hubColors: hubFinal.map((c) => ci(c.name)).sort(), spokeColors: spokeFinal.map((c) => ci(c.name)).sort(), lengths: recipe.spokeLengths }));
    const active = db && (await db.findActiveRunByFingerprint(fingerprint));
    if (active) block('DUPLICATE_BUILD', `This build already exists: run ${active.run_id || active.runId}.`);
    for (const m of await store.listMasters()) {
        let same = false;
        try { same = stable(JSON.parse(m.recipeRaw || 'null').parts) === stable(parts); } catch (e) { /* not JSON: ignore */ }
        if (m.handle === names.handle || same) block('DUPLICATE_BUILD', `This build already exists: ${m.title}.`);
    }

    // ---- 11. price / margin (advisory)
    const costParts = ROLES.map((r) => ({ id: part[r].id, role: r, label: `${part[r].productTitle} (${part[r].title})`, price: part[r].price, cost: part[r].cost }));
    const pricing = computePricing({ parts: costParts, price: typeof overrides.price === 'number' ? overrides.price : null, displayedTotal: recipe.displayedTotal, costOverrides: overrides.costOverrides, labour: overrides.labour, shipping: overrides.shipping, feePct: overrides.feePct });
    if (pricing.incomplete) warn('COST_MISSING', `${pricing.costMissing} part(s) have no Cost per item, so the margin is incomplete.`);

    // ---- 12. the writes, exactly
    const buildRecipeJson = { ridingStyle: recipe.ridingStyle, specs: recipe.specs, parts };
    const product = {
        title: names.title, handle: names.handle, vendor: 'LoamLabs', productType: 'LoamLabs Preconfigured Wheelset', tags: ['loamlabs-build'],
        templateSuffix: 'loamlabs-build', status: 'DRAFT', descriptionHtml, seo: { title: names.seoTitle, description: seoDesc },
        metafields: [
            { namespace: 'custom', key: 'build_recipe', type: 'json', value: JSON.stringify(buildRecipeJson) },
            { namespace: 'custom', key: 'freehub', type: 'list.single_line_text_field', value: JSON.stringify(fhOptions) },
            { namespace: 'custom', key: 'freehub_variant_map', type: 'json', value: JSON.stringify(fhMap) },
            { namespace: 'seo', key: 'hidden', type: 'number_integer', value: '1' },
        ],
    };
    const variant = { policy: 'CONTINUE', tracked: true, metafields: [{ namespace: 'custom', key: 'build_components', type: 'json', value: JSON.stringify({ v: 1, components }) }] };
    const hashed = { product, variant, rules: rules.map((r) => ({ rim: r.rimProductGid, rule: r.newRule, backupSha: r.backup.sha256 })), fingerprint };

    return finish({
        blockers, warnings, names, product, variant, rules, fingerprint, pricing, hashed,
        parts: pricing.lines, components,
        colours: { hub: { offered: hubFinal.map((c) => c.name), excluded: hubExcluded }, spoke: { offered: spokeFinal.map((c) => c.name), excluded: spokeExcluded, note: 'Only spoke colours that exist and are in stock at every needed length are listed.' } },
        freehub: { options: fhOptions, default: recipe.freehub },
        spokeLengths: { front: lengthsFor('front'), rear: lengthsFor('rear') },
    });

    async function finish(x) {
        if (!x.hashed) return { ok: false, blockers: x.blockers, warnings: x.warnings };
        const planHash = sha256(stable(x.hashed));
        const planId = crypto.randomUUID();
        const expiresAt = new Date(now + PLAN_TTL_MS).toISOString();
        const plan = {
            ok: true, planId, planHash, expiresAt, status: 'DRAFT', name: x.names.name,
            product: x.product, variant: x.variant, parts: x.parts, suggestedPrice: x.pricing.suggestedPrice, partsSum: x.pricing.partsSum, margin: x.pricing,
            partsSumNote: "Parts only, as the builder's struck figure shows for a master. Assembly ($80 per wheel) is not in it and is not counted as a cost unless you enter it.",
            colours: x.colours, freehub: x.freehub, spokeLengths: x.spokeLengths, components: x.components,
            rules: x.rules.map((r) => ({ rimProductGid: r.rimProductGid, rimTitle: r.rimTitle, existingCount: r.existingCount, newRule: r.newRule, backupSha256: r.backup.sha256 })),
            fingerprint: x.fingerprint, blockers: x.blockers, warnings: x.warnings,
            _backups: x.rules.map((r) => ({ rimProductGid: r.rimProductGid, raw: r.backup.raw, sha256: r.backup.sha256 })),
        };
        if (db) await db.savePlan({ planId, planHash, plan, expiresAt });
        const { _backups, ...visible } = plan;
        return visible;
    }
}

module.exports = { planBuild, PLAN_TTL_MS, available };
