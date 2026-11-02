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

module.exports = { groupOosReminders, productOf };
