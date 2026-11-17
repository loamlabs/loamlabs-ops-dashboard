const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadMasters, loadNewIds, rekey, formatDiff } = require('../lib/hub-rekey');
const { diffRows } = require('../lib/components-store');

const PROD = 'master_title,new_handle,product_id_to_grow,old_handle_of_grown_product (redirect to new handle),handles_to_retire_and_redirect,product_ids_to_DRAFT_after_overlap\n"Acme Rear Hub","acme-rear-hub","100","acme-old","acme-r142","200"\n';
const VH = 'master_title,new_handle,product_id_to_grow,variant_status,existing_variant_id,spoke_count,color,hub_spacing,wheel_spec_hub_spacing,weight_g,wheel_spec_position,wheel_spec_riding_style,hub_flange_diameter_left,hub_flange_diameter_right,hub_flange_offset_left,hub_flange_offset_right,hub_spoke_hole_diameter';
const VARS = (extra = '') => [VH,
  '"Acme Rear Hub","acme-rear-hub","100","KEEP","1001","32h","Black","12x148mm (Boost)","12x148mm (Boost)","315","Rear","[""mtb""]","58","64","37","25","2.6"',
  '"Acme Rear Hub","acme-rear-hub","100","KEEP","1002","32h","Red","12x148mm (Boost)","12x148mm (Boost)","315","Rear","[""mtb""]","58","64","37","25","2.6"',
  '"Acme Rear Hub","acme-rear-hub","100","NEW (replaces 2001, id lost)","","32h","Black","12x142mm","12x142mm","309","Rear","[""mtb""]","58","64","34","22","2.6"',
  '"Acme Rear Hub","acme-rear-hub","100","NEW","","32h","Black","12x157mm (SuperBoost)","12x157mm (SuperBoost)","323","Rear","[""mtb""]","58","64","39.5","29.5","2.6"', extra].filter(Boolean).join('\n') + '\n';
const row = (over) => ({ shopify_product_id: 100, shopify_variant_id: 1001, ProductURL: 'https://loamlabsusa.com/products/acme-old', Title: 'Acme Rear Hub - 12x148 Boost', Vendor: 'Acme', 'Option1 Name': 'Spoke Count', 'Option1 Value': '32h',
  'Metafield: custom.hub_flange_diameter_left [number_decimal]': 58, 'Metafield: custom.hub_flange_diameter_right [number_decimal]': 64, 'Metafield: custom.hub_flange_offset_left [number_decimal]': 37, 'Metafield: custom.hub_flange_offset_right [number_decimal]': 25,
  'Metafield: custom.hub_spoke_hole_diameter [number_decimal]': 2.6, 'Metafield: custom.hub_type [single_line_text_field]': 'Classic Flange', 'Metafield: custom.weight_g [number_decimal]': '', 'Variant Metafield: custom.wheel_spec_position [single_line_text_field]': 'Rear', 'Variant Metafield: custom.weight_g [number_decimal]': 315, ...over });
const LIB = () => [row({ shopify_variant_id: 9, shopify_product_id: 5, Title: 'Other Hub', Vendor: 'Other' }), row(), row({ shopify_product_id: 200, shopify_variant_id: 2001, Title: 'Acme Rear Hub - 12x142', ProductURL: 'https://loamlabsusa.com/products/acme-r142' }), row({ shopify_product_id: 7, shopify_variant_id: 8, Title: 'Last Hub', Vendor: 'Other' })];
const masters = () => loadMasters(PROD, VARS());
const SP = ['12x148mm (Boost)', '12x142mm', '12x157mm (SuperBoost)'];

test('the sheet is read: statuses, kept ids, ids that are lost, spacings and numbers', () => {
  const [m] = masters(); assert.equal(m.title, 'Acme Rear Hub'); assert.equal(m.productId, '100'); assert.deepEqual(m.oldProductIds, ['200']); assert.equal(m.variants.length, 4);
  assert.deepEqual(m.variants.map((v) => v.status), ['KEEP', 'KEEP', 'NEW', 'NEW']); assert.equal(m.variants[2].replacesId, '2001'); assert.equal(m.variants[0].sheet.hub_flange_offset_left, 37); assert.equal(m.variants[3].sheet.weight_g, 323);
});
test('a kept variant\'s row is updated IN PLACE: identity fields only (product id, URL, title, spacing, riding style); numbers and weights untouched', () => {
  const lib = LIB(); const r = rekey({ rows: lib, masters: masters(), spacings: SP }); const before = lib[1], after = r.rows[1];
  assert.equal(after.shopify_variant_id, 1001); assert.equal(after.Title, 'Acme Rear Hub'); assert.equal(after.ProductURL, 'https://loamlabsusa.com/products/acme-rear-hub'); assert.equal(after.hub_spacing, '12x148mm (Boost)'); assert.equal(after.riding_style, '["mtb"]');
  for (const k of Object.keys(before)) if (!['Title', 'ProductURL'].includes(k)) assert.equal(JSON.stringify(after[k]), JSON.stringify(before[k]), k);
  assert.equal(r.log.updated.length, 1);
});
test('a spacing with no row gets a NEW row after the master\'s last row: sheet numbers, weight in the variant column only, placeholder id when no real id is given', () => {
  const r = rekey({ rows: LIB(), masters: masters(), spacings: SP }); const created = r.rows.filter((x) => String(x.shopify_variant_id).startsWith('PLACEHOLDER'));
  assert.equal(created.length, 2); assert.equal(r.checks.placeholders, 2);
  const c142 = created.find((x) => x.hub_spacing === '12x142mm'); assert.equal(c142['Metafield: custom.hub_flange_offset_left [number_decimal]'], 34); assert.equal(c142['Variant Metafield: custom.weight_g [number_decimal]'], 309); assert.equal(c142['Metafield: custom.weight_g [number_decimal]'], ''); assert.equal(c142.shopify_product_id, 100); assert.equal(c142.Title, 'Acme Rear Hub');
  const lastIdx = r.rows.findIndex((x) => x.Title === 'Last Hub'); const idxs = created.map((x) => r.rows.indexOf(x)); assert.ok(idxs.every((i) => i < lastIdx)); assert.ok(r.rows[lastIdx - 1].Title === 'Acme Rear Hub');   // after the master's rows, before the next vendor
});
test('with the real ids from Agent C\'s apply there is no placeholder; the representative variant is the Black one', () => {
  const ids = loadNewIds('master_title,hub_spacing,spoke_count,color,variant_id\nAcme Rear Hub,12x142mm,32h,Black,3001\nAcme Rear Hub,12x157mm (SuperBoost),32h,Black,3002\n');
  const r = rekey({ rows: LIB(), masters: masters(), newIds: ids, spacings: SP }); assert.equal(r.checks.placeholders, 0);
  assert.deepEqual(r.rows.filter((x) => [3001, 3002].includes(x.shopify_variant_id)).map((x) => x.hub_spacing).sort(), ['12x142mm', '12x157mm (SuperBoost)']);
});
test('a variant that loses its id: its row is marked Status "retired", kept in the file with its id, never deleted; no variant id disappears; the new row replaces it as the active one', () => {
  const lib = LIB(); const r = rekey({ rows: lib, masters: masters(), spacings: SP });
  const old = r.rows.find((x) => x.shopify_variant_id === 2001); assert.equal(old.Status, 'retired'); assert.equal(old.Title, 'Acme Rear Hub - 12x142'); assert.equal(old.shopify_product_id, 200);
  assert.ok(r.rows.length >= lib.length && r.rows.length === lib.length + 2); assert.deepEqual(r.checks.variantIdsLost, []); assert.equal(r.checks.rowsDeleted, 0); assert.equal(r.checks.ok, true);
  assert.equal(r.rows.filter((x) => x.hub_spacing === '12x142mm' && x.Status !== 'retired').length, 1);
});
test('checks: duplicate active keys, a spacing outside the store list, a master with no row to clone, and sheet numbers that differ from the library are all reported (nothing guessed)', () => {
  const warn = rekey({ rows: LIB(), masters: loadMasters(PROD, VARS().replace('"12x157mm (SuperBoost)","12x157mm (SuperBoost)"', '"12x999mm","12x999mm"')), spacings: SP }); assert.ok(warn.log.warnings.some((w) => /12x999mm/.test(w)));
  const noBase = rekey({ rows: [LIB()[0]], masters: masters() }); assert.ok(noBase.log.warnings.some((w) => /no existing library row for this master/.test(w))); assert.equal(noBase.log.created.length, 0);
  const drift = rekey({ rows: [row({ 'Metafield: custom.hub_flange_offset_left [number_decimal]': 36 })], masters: masters() }); assert.ok(drift.log.warnings.some((w) => /hub_flange_offset_left sheet 37 but library row 36/.test(w))); assert.equal(drift.rows[0]['Metafield: custom.hub_flange_offset_left [number_decimal]'], 36);
  const dup = rekey({ rows: [row(), row()], masters: masters() }); assert.ok(dup.checks.duplicateVariantIds.includes('1001')); assert.equal(dup.checks.ok, false);   // two rows with one variant id
});
test('the dashboard\'s own row diff sees only edits and additions (no removals) for the re-keyed file', () => {
  const lib = LIB(); const r = rekey({ rows: lib, masters: masters(), spacings: SP }); const d = diffRows(lib, r.rows); const n = (k) => (Array.isArray(d[k]) ? d[k].length : d[k] || 0);
  assert.equal(n('removed'), 0); assert.equal(n('added'), 2); assert.ok(n('edited') >= 2);
});
test('the dry-run text lists created, updated and retired rows and flags placeholders', () => {
  const t = formatDiff(rekey({ rows: LIB(), masters: masters(), spacings: SP }), 'x'); assert.match(t, /created 2, updated in place 1, retired 1, deleted 0/); assert.match(t, /PLACEHOLDER/); assert.match(t, /RETIRED/);
});
test('the command is offline and never writes the library in place: only the output folder, a PLACEHOLDERS file name while placeholders remain, and it refuses an output folder inside the repo', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'hub-rekey-cli.js'), 'utf8');
  assert.match(src, /hubs_rekeyed_PLACEHOLDERS\.json/); assert.match(src, /--out is inside the repository/); assert.ok(!/fetch\(|require\('https?'\)|shopify|api\.github/i.test(src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')));
  assert.ok(!/writeFileSync\(lib\b/.test(src));
});

// ---- every vendor: the generic sheet format (master_apply.mjs), folded products, unmatched rows, coverage
const { redirectIndex, hubCoverage, otherFileLinks, formatCoverage } = require('../lib/hub-rekey-coverage');
const GP = 'model_id,master_title,new_handle,product_id_to_grow,old_handle_of_grown_product,handles_to_retire_and_redirect,redirect_to,product_ids_to_DRAFT_after_overlap,kept_variants,new_variants,total_variants\n"M1","Acme Rear Hub","acme-rear-hub","100","acme-old","acme-r142 acme-r150 acme-old (grown product, handle changes)","/products/acme-rear-hub","200 300","1","1","2"\n';
const GVH = 'model_id,master_title,new_handle,master_product_id,variant_status,master_variant_id_if_kept,folded_from_product_id,old_variant_id_that_dies,options (name: value),spoke_count,color,hub_spacing,hub_flange_diameter_left,hub_flange_offset_left,weight_g,wheel_spec_hub_spacing,wheel_spec_riding_style';
const GV = [GVH, '"M1","Acme Rear Hub","acme-rear-hub","100","KEEP","1001","","","","32h","Black","12x148mm (Boost)","58","37","315","12x148mm (Boost)","[""mtb""]"', '"M1","Acme Rear Hub","acme-rear-hub","100","NEW","","200","2001","","32h","Black","12x142mm","58","34","309","12x142mm","[""mtb""]"'].join('\n') + '\n';
const grow = () => loadMasters(GP, GV);
const LIB2 = () => [row({ shopify_variant_id: 9, shopify_product_id: 5, Title: 'Other Hub', Vendor: 'Other', ProductURL: 'https://loamlabsusa.com/products/other-hub' }), row({ shopify_product_id: '100', shopify_variant_id: '1001' }),
  row({ shopify_product_id: '200', shopify_variant_id: '2001', Title: 'Acme Rear Hub - 12x142', ProductURL: 'https://loamlabsusa.com/products/acme-r142' }),
  row({ shopify_product_id: '200', shopify_variant_id: '2002', Title: 'Acme Rear Hub - 12x142', 'Option1 Value': '28h', ProductURL: 'https://loamlabsusa.com/products/acme-r142' }),   // a folded product's variant that the sheet does not carry
  row({ shopify_product_id: '300', shopify_variant_id: '3001', Title: 'Acme Rear Hub - 12x150', ProductURL: 'https://loamlabsusa.com/products/acme-r150' }),
  row({ shopify_product_id: null, shopify_variant_id: null, Title: 'Acme old no id', ProductURL: 'https://loamlabsusa.com/products/acme-old' }),
  row({ shopify_product_id: '100', shopify_variant_id: '1999', Title: 'Acme grown, variant not in sheet' })];
test('generic sheets are read: kept id, the id that dies, folded products, folded handles apart from the grown product\'s old handle', () => {
  const [m] = grow(); assert.equal(m.productId, '100'); assert.deepEqual(m.oldProductIds, ['200', '300']); assert.deepEqual(m.foldedProductIds.sort(), ['200', '300']);
  assert.deepEqual(m.foldedHandles.sort(), ['acme-r142', 'acme-r150']); assert.deepEqual(m.grownOldHandles, ['acme-old']);
  assert.equal(m.variants[0].existingId, '1001'); assert.equal(m.variants[1].status, 'NEW'); assert.deepEqual(m.variants[1].replacesIds, ['2001']); assert.equal(m.variants[1].spacing, '12x142mm'); assert.equal(m.variants[1].sheet.weight_g, 309);
});
test('ids keep the type the file uses (text stays text, numbers stay numbers); new rows copy the base row\'s type', () => {
  const r = rekey({ rows: LIB2(), masters: grow() }); const kept = r.rows.find((x) => String(x.shopify_variant_id) === '1001'); assert.equal(typeof kept.shopify_product_id, 'string'); assert.equal(kept.shopify_product_id, '100');
  assert.equal(r.log.updated.length, 1); assert.deepEqual(Object.keys(r.log.updated[0].after).sort(), ['ProductURL', 'Title', 'hub_spacing', 'riding_style']);   // the id type did not register as a change
  const created = r.rows.find((x) => String(x.shopify_variant_id).startsWith('PLACEHOLDER')); assert.equal(typeof created.shopify_product_id, 'string');
});
test('every row of a folded product is handled: a dying variant is retired with the new row named, any other row of a folded product (by id or URL) is retired as "no master variant"; the row on the grown product that no sheet line matches is only listed', () => {
  const r = rekey({ rows: LIB2(), masters: grow() }); const by = (id) => r.log.retired.find((x) => x.variantId === String(id));
  assert.match(by(2001).reason, /dies/); assert.match(by(2001).replacedBy, /12x142mm \| 32h/);
  assert.match(by(2002).reason, /no master variant/); assert.match(by(3001).reason, /no master variant/);
  assert.equal(r.rows.find((x) => String(x.shopify_variant_id) === '3001').Status, 'retired'); assert.equal(r.checks.rowsDeleted, 0); assert.deepEqual(r.checks.variantIdsLost, []); assert.equal(r.checks.ok, true);
  assert.deepEqual(r.log.unmatched.map((u) => u.variantId).sort(), ['', '1999']); assert.equal(r.rows.find((x) => String(x.shopify_variant_id) === '1999').Status, undefined);   // nothing changed for the unmatched
  assert.ok(!r.log.unmatched.some((u) => /PLACEHOLDER/.test(u.variantId)), 'the rows the tool created are not reported as unmatched');
});
test('a dying id without a library row is counted, not a warning; placeholder ids are different for every vendor run', () => {
  const r = rekey({ rows: LIB2().filter((x) => String(x.shopify_variant_id) !== '2001'), masters: grow(), placeholderPrefix: 'acme' }); assert.deepEqual(r.log.dyingWithoutRow, [{ master: 'Acme Rear Hub', variantId: '2001' }]); assert.ok(!r.log.warnings.some((w) => /loses its id/.test(w)));
  const a = rekey({ rows: LIB2(), masters: grow(), placeholderPrefix: 'acme' }).rows.find((x) => /^PLACEHOLDER/.test(String(x.shopify_variant_id))).shopify_variant_id; const b = rekey({ rows: LIB2(), masters: grow(), placeholderPrefix: 'zed' }).rows.find((x) => /^PLACEHOLDER/.test(String(x.shopify_variant_id))).shopify_variant_id; assert.notEqual(a, b); assert.match(a, /^PLACEHOLDER-acme-/);
});
test('coverage: every library row linked to a folded, grown or redirect_map product gets an outcome; a row whose master is not in any sheet is "NOT HANDLED" and named; other library files that mention a retiring product are listed', () => {
  const lib = LIB2().concat([row({ shopify_product_id: '777', shopify_variant_id: '7001', Title: 'Held hub', ProductURL: 'https://loamlabsusa.com/products/held-hub' })]); const masters = grow(); const r = rekey({ rows: lib, masters });
  const redirect = redirectIndex([{ from: '/products/acme-r142', to: '/products/acme-rear-hub' }, { from: '/products/held-hub', to: '/products/held-master' }], [{ redirect_from_handle: 'held-hub', model_id: 'M9', status_in_plan: 'hold' }]);
  const cov = hubCoverage({ rowsBefore: lib, vendors: [{ name: 'acme', masters, logs: [r.log] }], redirect });
  const out = (id) => cov.linked.find((l) => l.variantId === String(id)).how;
  assert.match(out(1001), /moved in place/); assert.match(out(2001), /replaced by a new master row/); assert.match(out(2002), /retired \(no master variant/); assert.match(out(1999), /UNMATCHED/); assert.match(out(7001), /NOT HANDLED/);
  assert.ok(cov.linked.every((l) => l.how)); assert.ok(!cov.linked.some((l) => l.vendor === 'Other' && l.variantId === '9'));
  assert.ok(cov.notHandled.some((l) => l.variantId === '7001' && /M9/.test(l.detail)));
  const other = otherFileLinks({ rims: [{ Title: 'Some rim', note: 'https://loamlabsusa.com/products/acme-r142' }, { Title: 'clean', note: 'x' }], nipples: [{ Title: 'n', id: '2001' }] }, [{ masters }], redirect);
  assert.deepEqual(other.map((x) => x.file + ':' + x.title), ['rims:Some rim', 'nipples:n']); assert.match(formatCoverage(cov, other, 'x'), /NOT HANDLED/);
});
test('the multi-vendor command is offline, refuses an output folder inside the repo, never writes the library in place, and writes the coverage report', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'hub-rekey-all-cli.js'), 'utf8');
  assert.match(src, /--out is inside the repository/); assert.match(src, /hubs_rekeyed_PLACEHOLDERS\.json/); assert.match(src, /COVERAGE\.txt/); assert.ok(!/fetch\(|require\('https?'\)|api\.github/i.test(src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'))); assert.ok(!/writeFileSync\(lib\b/.test(src));
});
