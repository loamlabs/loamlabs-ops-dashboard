const axios = require('axios');

const cleanNum = (str) => str ? str.toString().replace(/\D/g, '') : '';
const normalize = (t) => String(t || "").toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();

async function testMatch(rule) {
  try {
    const vResponse = await axios.get(`${rule.vendor_url}.js`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const vData = vResponse.data;
    
    // Attempt parse if option_values is string
    let parsedOptions = rule.option_values;
    if (typeof parsedOptions === 'string') {
        try { parsedOptions = JSON.parse(parsedOptions); } catch (e) {}
    }
    
    const isFrontRule = rule.title.toLowerCase().includes('front');
    
    console.log(`\nTesting: ${rule.title}`);
    console.log(`isFront: ${isFrontRule}`);

    let candidates = vData.variants.filter(v => {
      const vTitle = normalize(v.public_title);
      const ruleTitle = normalize(rule.title);
      const isHub = ruleTitle.includes('hub');
      
      // TOKEN ALGORITHM
      let reqTokens = [];
      for (const [optName, optValue] of Object.entries(parsedOptions)) {
         if (!optValue || optValue.toLowerCase() === 'default title') continue;
         
         // Berd skips "Color" in hub titles, so avoid filtering out valid hubs because they lack "black"
         if (isHub && optName.toLowerCase().includes('color')) continue;

         // For spoke count on hubs, we handle it separately below
         if (isHub && optName.toLowerCase().includes('spoke')) continue;

         // Tokenize option values (e.g. "HAWK30 29" -> ["hawk30", "29"])
         let tokens = optValue.toLowerCase().replace(/×/g, 'x').replace(/[\"\']/g, '').split(/[\s/+\-]+/).filter(t => t.length > 0);
         reqTokens.push(...tokens);
      }

      // Ensure vTitle contains all required tokens
      const normalizedTitleForTokens = vTitle.replace(/[\"\']/g, '');
      for (let token of reqTokens) {
          if (!normalizedTitleForTokens.includes(token)) {
              return false;
          }
      }

      if (isHub) {
          if (isFrontRule && !vTitle.includes('front')) return false;
          if (!isFrontRule && !(vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms'))) return false;

          const axleMatch = ['100', '110', '142', '148', '157'].find(size => ruleTitle.includes(size));
          if (axleMatch && !vTitle.includes(axleMatch)) return false;

          // Enforce Spoke Count for hubs
          let hasSpokeOption = false;
          let spokeMatch = false;
          for (const [optName, optValue] of Object.entries(parsedOptions)) {
              if (optName.toLowerCase().includes('spoke')) {
                  hasSpokeOption = true;
                  const numOnly = cleanNum(optValue);
                  if (numOnly && (vTitle.includes(`${numOnly} spoke`) || vTitle.includes(`${numOnly}h`) || vTitle.includes(`${numOnly} hole`))) {
                      spokeMatch = true;
                  }
              }
          }
          if (hasSpokeOption && !spokeMatch) return false;
      }

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
    { title: "Berd Builder's Tool Kit (Std)", vendor_url: "https://berdspokes.com/collections/accessories/products/wheel-building-kit", option_values: {"Title": "Default Title"} },
    { title: "Berd HAWK27 Carbon Wheels (Std)", vendor_url: "https://berdspokes.com/collections/berd-wheels/products/berd-hawk27-carbon-wheels", option_values: {"Rim": "HAWK27", "Hub Model": "Talon 15x110/12x148 XD", "Spoke Color": "Black"} },
    { title: "Berd HAWK30 Carbon Wheels (Std)", vendor_url: "https://berdspokes.com/collections/berd-wheels/products/berd-hawk30-carbon-wheels", option_values: {"Rim": "HAWK30 29\"", "Hub Model": "Talon 15x110/12x148 XD", "Spoke Color": "Black"} },
    { title: "Berd P62 Carbon Aero Wheels (Std)", vendor_url: "https://berdspokes.com/collections/berd-wheels/products/berd-p62-carbon-aero-wheels", option_values: {"Rim": "P62", "Hub Model": "Talon 12x100/12x142 XDR", "Spoke Color": "Black"} },
    { title: "Berd Sparrow Carbon Gravel Wheels (Std)", vendor_url: "https://berdspokes.com/collections/berd-wheels/products/berd-sparrow-carbon-gravel-wheels", option_values: {"Rim": "Sparrow", "Hub Model": "Talon 12x100/12x142 XDR", "Spoke Color": "Black"} },
    { title: "Berd Service Kit (Std)", vendor_url: "https://berdspokes.com/collections/accessories/products/berd-service-kit", option_values: {"Title": "Default Title"} },
    { title: "Berd Talon Front Hub - Centerlock - 12x100mm (24h)", vendor_url: "https://berdspokes.com/products/berd-talon-gravel-road-hubs", option_values: {"Color": "Black", "Spoke Count": "24h"} },
    { title: "Berd Talon Front Hub - Centerlock - 15x110mm (28h)", vendor_url: "https://berdspokes.com/products/berd-talon-mtb-hubs", option_values: {"Color": "Black", "Spoke Count": "28h"} }
];

async function run() {
    for (const r of rules) {
        await testMatch(r);
    }
}
run();
