const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ruleVariantIdSet, variantsNeedingRules } = require('../lib/auto-discovery');

test('a rule row WITHOUT a vendor link still counts as existing (the Nov 25 clean-up is not undone)', () => {
    const rules = [{ shopify_variant_id: 1, vendor_url: 'https://x/p' }, { shopify_variant_id: 2, vendor_url: null }, { shopify_variant_id: '3', vendor_url: '' }];
    assert.deepEqual(variantsNeedingRules(['1', '2', '3', '4'], rules), ['4']);
});

test('a variant with no rule row at all still gets one; numbers and strings compare equal', () => {
    assert.deepEqual(variantsNeedingRules([10, 11], [{ shopify_variant_id: '10', vendor_url: null }]), ['11']);
    assert.deepEqual(variantsNeedingRules(['5'], []), ['5']);
    assert.deepEqual([...ruleVariantIdSet([{ shopify_variant_id: 7 }, null, {}])], ['7']);
});

test('watcher-ignore rows keep their link and count as existing (tag rows are never re-created)', () => {
    const rules = [{ shopify_variant_id: 8, vendor_url: 'https://x/p', tags: ['watcher-ignore'] }];
    assert.deepEqual(variantsNeedingRules(['8'], rules), []);
});

test('sync.js uses it: the "new variant" test checks the all-rows set', () => {
    const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'pages', 'api', 'sync.js'), 'utf8');
    assert.match(src, /ruleVariantIdSet\(initialRules\)/);
    assert.match(src, /!existingVariantIds\.includes\(vId\) && !haveRule\.has\(vId\)/);
});
