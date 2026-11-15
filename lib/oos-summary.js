// lib/oos-summary.js
// "Items Still Out of Stock" in the Watcher email: one line per product (count + longest days out), capped.

// "Sapim Race J-Bend Spokes (Black / 184mm / 20 Spokes)" -> "Sapim Race J-Bend Spokes"
const productOf = (title) => String(title || '').split(' (')[0].trim() || 'Unknown product';

/**
 * @param {{title:string, days:number}[]} reminders
 * @param {number} cap  max product lines
 * @returns {{lines:{product:string,count:number,maxDays:number}[], more:number, totalItems:number, totalProducts:number}}
 */
function groupOosReminders(reminders, cap = 10) {
  const byProduct = new Map();
  for (const r of reminders || []) {
    const key = productOf(r.title);
    const g = byProduct.get(key) || { product: key, count: 0, maxDays: 0 };
    g.count += 1;
    g.maxDays = Math.max(g.maxDays, Number(r.days) || 0);
    byProduct.set(key, g);
  }
  // freshest stock-outs first (fewest days out matters most), then bigger groups
  const all = [...byProduct.values()].sort((a, b) => a.maxDays - b.maxDays || b.count - a.count || a.product.localeCompare(b.product));
  return { lines: all.slice(0, cap), more: Math.max(0, all.length - cap), totalItems: (reminders || []).length, totalProducts: all.length };
}

// Reminder cadence: every `interval` days (default 20) while an item is up to 60 days out; after that every 60 days (or the item's own interval when that is longer).
// So an item out 180 days is mentioned at 120, 180, 240 ... instead of every 20 days.
const LONG_OUT_AFTER_DAYS = 60, LONG_OUT_EVERY_DAYS = 60;
function reminderDue(daysOut, interval) {
  const d = Math.floor(Number(daysOut)), step = Number(interval) > 0 ? Number(interval) : 20;
  if (!(d > 0)) return false;
  if (d <= LONG_OUT_AFTER_DAYS) return d % step === 0;
  return d % Math.max(step, LONG_OUT_EVERY_DAYS) === 0;
}

// "28 lengths" for spoke products (each variant is one length), "N items" for everything else.
const isSpokeProduct = (name) => /spoke/i.test(String(name || ''));
function unitLabel(product, count) { const one = isSpokeProduct(product) ? 'length' : 'item'; return count + ' ' + one + (count === 1 ? '' : 's'); }
function oosLine(g) { return '<li><b>' + g.product + '</b> — ' + unitLabel(g.product, g.count) + ' out, longest <b>' + g.maxDays + ' days</b></li>'; }
// Subject part: counts PRODUCTS, not variants ("+ 2 OOS reminders").
function oosSubject(groups) { const n = groups && groups.totalProducts || 0; return n > 0 ? ' + ' + n + ' OOS reminder' + (n === 1 ? '' : 's') : ''; }
function oosHeader(groups) { return 'Still Out of Stock (' + groups.totalProducts + ' product' + (groups.totalProducts === 1 ? '' : 's') + ')'; }

module.exports = { groupOosReminders, productOf, reminderDue, unitLabel, oosLine, oosSubject, oosHeader };
