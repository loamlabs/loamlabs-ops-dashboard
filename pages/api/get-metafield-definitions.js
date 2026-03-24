export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
    return res.status(500).json({ error: 'Shopify credentials missing' });
  }

  const query = `
    query {
      productMetafields: metafieldDefinitions(first: 250, ownerType: PRODUCT) {
        edges {
          node {
            namespace
            key
            type
            validations {
              name
              value
            }
          }
        }
      }
      variantMetafields: metafieldDefinitions(first: 250, ownerType: VARIANT) {
        edges {
          node {
            namespace
            key
            type
            validations {
              name
              value
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    if (data.errors) {
      console.error('GraphQL Errors:', data.errors);
      return res.status(600).json({ error: 'Shopify GraphQL Error', details: data.errors });
    }

    const productDefs = data.data.productMetafields.edges.map(e => e.node);
    const variantDefs = data.data.variantMetafields.edges.map(e => e.node);

    // Combine and parse the choices
    const allDefs = [...productDefs, ...variantDefs];
    
    // Create a dictionary mapping keys to their options (if any)
    const optionsDict = {};
    
    for (const def of allDefs) {
      // Find choices validation
      const choicesValidation = def.validations?.find(v => v.name === 'choices');
      if (choicesValidation && choicesValidation.value) {
        try {
           // Value is usually a JSON string array like "[\"Option 1\", \"Option 2\"]"
           const parsedChoices = JSON.parse(choicesValidation.value);
           if (Array.isArray(parsedChoices)) {
              // We use namespace.key combined, but for simplicity most keys are unique enough
              // Or we store specifically by key. In some cases, we need exact matching.
              optionsDict[def.key] = parsedChoices;
           }
        } catch(e) {
           console.error('Failed to parse choices for', def.key);
        }
      }
      
      // Also map booleans
      if (def.type === 'boolean') {
         optionsDict[def.key] = 'boolean';
      }
    }

    res.status(200).json({ success: true, optionsDict });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
