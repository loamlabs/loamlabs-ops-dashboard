// lib/ownership.js
// "One owner per variant" decision (Vendor Watcher vs BTI). PURE: no network, no Shopify, no Supabase.
// Not used by sync.js yet (plan step 5 wires it in, behind an allowlist).
//
// The rule:
//   vendor in stock      -> the Watcher owns the variant  -> custom.bti_sync_authority = false
//   vendor out of stock  -> BTI owns inventory            -> custom.bti_sync_authority = true
//   The Watcher always owns the price. The flag is written only by the Watcher.
//   The BTI part number is never replaced with a marker (no "IGNORE") and never wiped.
//   Pending price approval is NOT an input: it blocks the price only, never the owner switch.

// Vendors the rule is switched on for. e*thirteen is deliberately NOT here (Jerry: it stays unlinked from BTI).
const ONE_OWNER_VENDORS = ['OneUp'];
function isOneOwnerVendor(name) {
  const n = String(name === null || name === undefined ? '' : name).trim().toLowerCase();
  return ONE_OWNER_VENDORS.some((v) => v.toLowerCase() === n);
}

const NOT_A_NUMBER = new Set(['', 'IGNORE']);

// A "real" BTI part number: a non-empty string that is not the old IGNORE marker.
function isRealNumber(value) {
  if (value === null || value === undefined) return false;
  const v = String(value).trim();
  return !NOT_A_NUMBER.has(v.toUpperCase());
}

// Shopify boolean metafield value -> true | false | null (null = missing / unknown)
function parseFlag(value) {
  if (value === true || value === 'true' || value === 'True') return true;
  if (value === false || value === 'false' || value === 'False') return false;
  return null;
}

/**
 * @param {object} input
 * @param {boolean} input.vendorAllowed        vendor is on the allowlist (OneUp first)
 * @param {boolean} input.autoUpdate           watcher_rules.auto_update
 * @param {boolean|null} input.vendorInStock   null = vendor data unavailable (failed fetch): never treated as out of stock
 * @param {boolean|string|null} input.currentFlag   Shopify custom.bti_sync_authority as read (missing = null)
 * @param {string|null} input.shopifyNumber    Shopify custom.bti_part_number as read
 * @param {string|null} input.storedNumber     watcher_rules.bti_part_number
 * @returns {{
 *   managed: boolean,          // the one-owner rule applies to this variant
 *   reason: string,
 *   realNumber: string|null,   // the number BTI should use (Shopify's, else the stored one)
 *   restoreNumber: string|null,// write this to Shopify bti_part_number (Shopify blank / IGNORE, stored real)
 *   numberMismatch: boolean,   // Shopify and stored numbers are both real and differ (report, never overwrite)
 *   unlinked: boolean,         // no real number anywhere: BTI cannot own this variant
 *   desiredFlag: boolean|null, // value bti_sync_authority should have (null = leave alone)
 *   writeFlag: boolean         // the flag must be written
 * }}
 */
function decideOwner(input) {
  const i = input || {};
  const shopifyReal = isRealNumber(i.shopifyNumber);
  const storedReal = isRealNumber(i.storedNumber);
  const realNumber = shopifyReal ? String(i.shopifyNumber).trim() : (storedReal ? String(i.storedNumber).trim() : null);
  const currentFlag = parseFlag(i.currentFlag);

  const out = {
    managed: false, reason: '', realNumber,
    restoreNumber: null, numberMismatch: false, unlinked: false,
    desiredFlag: null, writeFlag: false,
  };

  if (!i.vendorAllowed) { out.reason = 'vendor not enabled for one-owner rule'; return out; }
  if (i.autoUpdate !== true) { out.reason = 'auto_update is off'; return out; }

  out.managed = true;
  out.numberMismatch = shopifyReal && storedReal && String(i.shopifyNumber).trim() !== String(i.storedNumber).trim();
  if (!shopifyReal && storedReal) out.restoreNumber = String(i.storedNumber).trim();

  // No real number anywhere: BTI can never own it. The Watcher keeps it; a leftover "BTI owns" flag is cleared.
  if (!realNumber) {
    out.unlinked = true;
    out.desiredFlag = false;
    out.writeFlag = currentFlag === true;
    out.reason = out.writeFlag ? 'no BTI number: clear leftover BTI flag' : 'no BTI number: Watcher owns, nothing to do';
    return out;
  }

  // Vendor data unavailable (fetch failed, no match): do not switch owner.
  if (i.vendorInStock === null || i.vendorInStock === undefined) {
    out.reason = 'vendor stock unknown: owner left unchanged';
    return out;
  }

  out.desiredFlag = i.vendorInStock === false;      // out of stock -> BTI owns
  out.writeFlag = out.desiredFlag !== (currentFlag === true);   // a missing flag counts as false
  out.reason = out.desiredFlag ? 'vendor out of stock: BTI owns inventory' : 'vendor in stock: Watcher owns';
  return out;
}

module.exports = { decideOwner, isRealNumber, parseFlag, isOneOwnerVendor, ONE_OWNER_VENDORS };
