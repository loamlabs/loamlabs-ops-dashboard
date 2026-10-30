// lib/dryrun.js
// Dry-run helpers for pages/api/sync.js: let the sync run its normal READS and decisions, but record every WRITE
// (Shopify mutations / REST writes, Supabase insert/update/upsert/delete, the report email) instead of doing it.

const WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete']);

// Chainable, awaitable stand-in for a Supabase write builder: .eq().in().neq().select() ... all return itself, await gives {data:null,error:null}.
function noopBuilder() {
  const p = new Proxy(function () {}, {
    get: (_t, key) => (key === 'then' ? (resolve) => resolve({ data: null, error: null }) : () => p),
    apply: () => p,
  });
  return p;
}

function summarizeRows(args) {
  const first = args && args[0];
  if (Array.isArray(first)) return { rows: first.length };
  if (first && typeof first === 'object') return { fields: Object.keys(first) };
  return {};
}

// Wraps a Supabase client: reads (select) go to the real client, writes are recorded.
function makeDryRunSupabase(real, plannedWrites) {
  return {
    from(table) {
      const query = real.from(table);
      return new Proxy(query, {
        get(target, prop) {
          if (WRITE_OPS.has(prop)) {
            return (...args) => {
              plannedWrites.push({ target: 'supabase', table, op: prop, ...summarizeRows(args) });
              return noopBuilder();
            };
          }
          const v = target[prop];
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    },
  };
}

// Wraps fetch: Shopify Admin writes (GraphQL mutations, REST PUT/POST/PATCH/DELETE) are recorded and answered with an empty 200;
// everything else (GraphQL reads, vendor pages, OAuth token) goes to the real fetch.
function makeDryRunFetch(realFetch, plannedWrites) {
  return async function dryRunFetch(url, opts = {}) {
    const method = String((opts && opts.method) || 'GET').toUpperCase();
    const u = String(url);
    const isShopifyAdmin = /\.myshopify\.com\/admin\//.test(u);
    const isOauth = /\/admin\/oauth\//.test(u);
    const isGraphql = /graphql\.json/.test(u);
    const body = opts && typeof opts.body === 'string' ? opts.body : '';
    const isMutation = isShopifyAdmin && isGraphql && method === 'POST' && /"query"\s*:\s*"\s*mutation\b/.test(body);
    const isRestWrite = isShopifyAdmin && !isGraphql && !isOauth && ['PUT', 'POST', 'PATCH', 'DELETE'].includes(method);
    if (isMutation || isRestWrite) {
      let summary = body.slice(0, 400);
      try { const parsed = JSON.parse(body); summary = isMutation ? String(parsed.query || '').replace(/\s+/g, ' ').slice(0, 400) : parsed; } catch (e) { /* keep raw text */ }
      plannedWrites.push({ target: 'shopify', method, path: u.replace(/^https:\/\/[^/]+/, ''), body: summary });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
}

// Stand-in for Resend: records the subject instead of sending.
function makeDryRunResend(plannedWrites) {
  return { emails: { send: async (msg) => { plannedWrites.push({ target: 'email', to: msg && msg.to, subject: msg && msg.subject }); return { id: 'dry-run' }; } } };
}

// Counts by target/table/op for a compact summary (the full Shopify list is returned separately).
function summarizePlannedWrites(plannedWrites) {
  const counts = {};
  for (const w of plannedWrites) {
    const key = w.target === 'supabase' ? `supabase.${w.table}.${w.op}` : w.target === 'shopify' ? `shopify.${w.method}` : w.target;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function isDryRunRequest(req) {
  const body = req && req.body;
  const query = req && req.query;
  return (body && body.dryRun === true) || (query && (query.dryRun === '1' || query.dryRun === 'true'));
}

module.exports = { makeDryRunSupabase, makeDryRunFetch, makeDryRunResend, summarizePlannedWrites, isDryRunRequest };
