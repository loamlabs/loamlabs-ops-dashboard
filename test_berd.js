

const cleanNum = (str) => str ? str.toString().replace(/\D/g, '') : '';
const normalize = (t) => String(t || "").toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();

async function testMatch(rule) {
  try {
    const vResponse = await fetch(`${rule.vendor_url}.js`);
    const vData = await vResponse.json();
    
    // Attempt parse if option_values is string
    let parsedOptions = rule.option_values;
    if (typeof parsedOptions === 'string') {
        try { parsedOptions = JSON.parse(parsedOptions); } catch (e) {}
    }
    
    const spokeGoal = cleanNum(parsedOptions["Spoke Count"]);
    const isFrontRule = rule.title.toLowerCase().includes('front');
    
    console.log(`\nTesting: ${rule.title}`);
    console.log(`Spoke Goal: ${spokeGoal}, isFront: ${isFrontRule}`);

    let candidates = vData.variants.filter(v => {
      const vTitle = normalize(v.public_title);
      const ruleTitle = normalize(rule.title);
      
      const hasSpoke = vTitle.includes(`${spokeGoal} spoke`) || vTitle.includes(`${spokeGoal}h`) || vTitle.includes(`${spokeGoal} hole`);
      if (!hasSpoke) return false;
      if (isFrontRule && !vTitle.includes('front')) return false;
      if (!isFrontRule && !(vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms'))) return false;

      const axleMatch = ['100', '110', '142', '148', '157'].find(size => ruleTitle.includes(size));
      if (axleMatch && !vTitle.includes(axleMatch)) return false;

      return true;
    });

    if (candidates.length > 0) {
      const winner = candidates.reduce((prev, curr) => (prev.price > curr.price) ? prev : curr);
      console.log(`Winner: ${winner.public_title} ($${winner.price/100})`);
    } else {
      const vendorOptions = vData.variants.slice(0, 2).map(v => v.public_title).join(', ');
      console.log(`FAILED: Found 0 matches. Vendor uses: ${vendorOptions}`);
    }
  } catch (err) {
    console.error(`Error on ${rule.title}:`, err.message);
  }
}

const rules = [
    { title: "Berd Talon Front Hub - Centerlock - 12x100mm (24h)", vendor_url: "https://berdspokes.com/products/berd-talon-gravel-road-hubs", option_values: {"Spoke Count": "24h"} },
    { title: "Berd Talon Front Hub - Centerlock - 15x110mm (28h)", vendor_url: "https://berdspokes.com/products/berd-talon-mtb-hubs", option_values: {"Spoke Count": "28h"} },
    { title: "Berd Talon Rear Hub - Centerlock - 12x142mm (24h)", vendor_url: "https://berdspokes.com/products/berd-talon-gravel-road-hubs", option_values: {"Spoke Count": "24h"} },
    { title: "Berd Talon Rear Hub - Centerlock - 12x142mm (28h)", vendor_url: "https://berdspokes.com/products/berd-talon-gravel-road-hubs", option_values: {"Spoke Count": "28h"} },
    { title: "Berd Talon Rear Hub - Centerlock - 12x148mm (28h)", vendor_url: "https://berdspokes.com/products/berd-talon-mtb-hubs", option_values: {"Spoke Count": "28h"} },
    { title: "Berd Talon Superboost Rear Hub - Centerlock - 12x157mm (28h)", vendor_url: "https://berdspokes.com/products/berd-talon-super-boost-hubs", option_values: {"Spoke Count": "28h"} }
];

async function run() {
    for (const r of rules) {
        await testMatch(r);
    }
}
run();
