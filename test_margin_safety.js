const rule = {
  original_msrp: 2000.00,
  standard_factor: 1.0,
  price_last_changed_at: new Date(Date.now() - 46 * 24 * 60 * 60 * 1000).toISOString(),
  last_price: 130000,
  title: "Test Wheelset"
};

const vendorPrice = 1300.00;
const stdFactor = rule.standard_factor || 1.0;
let goalPriceNum = vendorPrice * stdFactor;
let isDeepSale = false;

if (rule.original_msrp && rule.original_msrp > 0) {
  const discountRatio = (rule.original_msrp - vendorPrice) / rule.original_msrp;
  console.log(`Discount Ratio: ${(discountRatio * 100).toFixed(2)}%`);
  if (discountRatio >= 0.10) {
    goalPriceNum = vendorPrice / 0.90;
    isDeepSale = true;
  }
}

const goalPrice = parseFloat(goalPriceNum).toFixed(2);
console.log(`Vendor Price: $${vendorPrice}`);
console.log(`Goal Website Price: $${goalPrice}`);
console.log(`Price customer will pay after 10% builder discount: $${(goalPrice * 0.90).toFixed(2)}`);

let newPriceLastChangedAt = rule.price_last_changed_at || null;
if (rule.last_price !== (vendorPrice * 100)) {
  newPriceLastChangedAt = new Date().toISOString();
  console.log("Price changed, resetting timer.");
} else if (newPriceLastChangedAt && isDeepSale) {
  const daysPersistent = (new Date() - new Date(newPriceLastChangedAt)) / (1000 * 60 * 60 * 24);
  console.log(`Days persistent: ${daysPersistent}`);
  if (daysPersistent >= 45) {
     console.log(`ATTENTION: Sale Price persistent for ${Math.floor(daysPersistent)} days: Confirm as New MSRP?`);
  }
}
