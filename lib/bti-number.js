// lib/bti-number.js
// Which BTI part number should watcher_rules keep for a variant?
// A real stored number must never be replaced by blank or by the Watcher's old "IGNORE" marker
// (the catalog import used to do exactly that, which erased the only copy after BTI deleted the number in Shopify).

const isRealNumber = (value) => {
  if (value === null || value === undefined) return false;
  const v = String(value).trim();
  return v !== '' && v.toUpperCase() !== 'IGNORE';
};

/**
 * @param {string|null} shopifyValue  custom.bti_part_number as read from Shopify now
 * @param {string|null} storedValue   watcher_rules.bti_part_number as stored
 * @returns {string|null} what to write to watcher_rules.bti_part_number (never "IGNORE", never blank text)
 */
function mergeBtiNumber(shopifyValue, storedValue) {
  if (isRealNumber(shopifyValue)) return String(shopifyValue).trim();   // Shopify has a real number: it wins
  if (isRealNumber(storedValue)) return String(storedValue).trim();     // Shopify blank/IGNORE: keep the stored real number
  return null;
}

module.exports = { mergeBtiNumber, isRealNumber };
