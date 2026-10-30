const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDryRunSupabase, makeDryRunFetch, makeDryRunResend, summarizePlannedWrites, isDryRunRequest } = require('../lib/dryrun');

// A fake Supabase client that records every call that reaches it.
function fakeSupabase(log) {
  const builder = (table) => {
    const b = {};
    for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'neq', 'lt', 'range', 'order']) {
      b[m] = (...args) => { log.push({ table, m, args }); return b; };
    }
    b.then = (resolve) => resolve({ data: [{ id: 1 }], error: null });
    return b;
  };
  return { from: builder };
}

test('Supabase: reads reach the real client, writes are recorded and never reach it', async () => {
  const reached = [], planned = [];
  const db = makeDryRunSupabase(fakeSupabase(reached), planned);

  const read = await db.from('watcher_rules').select('*').eq('id', 1);
  assert.deepEqual(read.data, [{ id: 1 }]);
  assert.ok(reached.some((c) => c.m === 'select'));

  const before = reached.length;
  const w1 = await db.from('watcher_rules').update({ last_log: 'x', last_run_at: 'now' }).eq('id', 5);
  const w2 = await db.from('watcher_rules').upsert([{ a: 1 }, { a: 2 }], { onConflict: 'shopify_variant_id' });
  const w3 = await db.from('watcher_rules').delete().in('shopify_variant_id', ['1']);
  const w4 = await db.from('sync_logs').insert([{ status: 'success' }]);
  const w5 = await db.from('sync_logs').delete().lt('created_at', 'x');
  assert.equal(reached.length, before, 'no write call may reach the real client');
  for (const w of [w1, w2, w3, w4, w5]) assert.deepEqual(w, { data: null, error: null });
  assert.deepEqual(planned.map((p) => `${p.table}.${p.op}`), ['watcher_rules.update', 'watcher_rules.upsert', 'watcher_rules.delete', 'sync_logs.insert', 'sync_logs.delete']);
  assert.equal(planned[1].rows, 2);
});

test('fetch: Shopify writes are recorded and answered, reads and others pass through', async () => {
  const real = []; const planned = [];
  const realFetch = async (url, opts) => { real.push({ url, method: (opts && opts.method) || 'GET' }); return new Response('{"ok":1}', { status: 200 }); };
  const f = makeDryRunFetch(realFetch, planned);
  const shop = 'https://loam.myshopify.com/admin/api/2024-04';

  // writes (must not reach the real fetch)
  const put = await f(`${shop}/variants/55.json`, { method: 'PUT', body: JSON.stringify({ variant: { id: 55, price: '9.99' } }) });
  const mut = await f(`${shop}/graphql.json`, { method: 'POST', body: JSON.stringify({ query: 'mutation { metafieldsSet(metafields: []) { userErrors { message } } }' }) });
  assert.equal(put.status, 200);
  assert.deepEqual(await mut.json(), {});
  assert.equal(real.length, 0);
  assert.equal(planned.length, 2);
  assert.equal(planned[0].method, 'PUT');
  assert.deepEqual(planned[0].body, { variant: { id: 55, price: '9.99' } });
  assert.match(planned[1].body, /^mutation \{ metafieldsSet/);

  // reads (must reach the real fetch)
  await f(`${shop}/graphql.json`, { method: 'POST', body: JSON.stringify({ query: 'query($id: ID!) { product(id: $id) { title } }' }) });
  await f('https://velonixcyclesupply.com/products/x.js', { headers: { 'User-Agent': 'x' } });
  await f('https://loam.myshopify.com/admin/oauth/access_token', { method: 'POST', body: JSON.stringify({ client_id: 'a', client_secret: 'b', grant_type: 'client_credentials' }) });
  assert.equal(real.length, 3);
  assert.equal(planned.length, 2);
});

test('fetch: a GraphQL query whose TEXT contains the word mutation inside a field name is still a read', async () => {
  const real = []; const planned = [];
  const f = makeDryRunFetch(async (u, o) => { real.push(u); return new Response('{}'); }, planned);
  await f('https://loam.myshopify.com/admin/api/2024-04/graphql.json', { method: 'POST', body: JSON.stringify({ query: 'query { product(id: "x") { title } } # mutation in a comment' }) });
  assert.equal(real.length, 1);
  assert.equal(planned.length, 0);
});

test('Resend stand-in records instead of sending', async () => {
  const planned = [];
  const r = makeDryRunResend(planned);
  await r.emails.send({ to: 'a@b.c', subject: 'Vendor Watcher: 3 Updates', html: '<p>x</p>' });
  assert.deepEqual(planned, [{ target: 'email', to: 'a@b.c', subject: 'Vendor Watcher: 3 Updates' }]);
});

test('summarizePlannedWrites counts by target', () => {
  const s = summarizePlannedWrites([
    { target: 'supabase', table: 'watcher_rules', op: 'update' }, { target: 'supabase', table: 'watcher_rules', op: 'update' },
    { target: 'shopify', method: 'PUT' }, { target: 'email' },
  ]);
  assert.deepEqual(s, { 'supabase.watcher_rules.update': 2, 'shopify.PUT': 1, email: 1 });
});

test('isDryRunRequest only for an explicit switch', () => {
  assert.equal(isDryRunRequest({ body: { dryRun: true } }), true);
  assert.equal(isDryRunRequest({ query: { dryRun: '1' } }), true);
  assert.equal(isDryRunRequest({ query: { dryRun: 'true' } }), true);
  assert.equal(!!isDryRunRequest({ body: {}, query: {} }), false);
  assert.equal(!!isDryRunRequest({ body: { dryRun: 'yes' } }), false);
  assert.equal(!!isDryRunRequest({ body: { dryRun: false }, query: { dryRun: '0' } }), false);
  assert.equal(!!isDryRunRequest({}), false);
  assert.equal(!!isDryRunRequest(undefined), false);
});
