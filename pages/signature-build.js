import React, { useState, useEffect, useCallback } from 'react';

// Create Signature Build: preview first, one click creates a DRAFT. Needs the dashboard password AND the separate tool key.
// All checks happen on the server (pages/api/signature-build/*); this page only shows what the server says.

const box = { border: '1px solid #d4d4d8', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff' };
const btn = (bg, dis) => ({ background: dis ? '#a1a1aa' : bg, color: '#fff', border: 0, borderRadius: 6, padding: '8px 14px', cursor: dis ? 'not-allowed' : 'pointer', fontWeight: 600 });
const money = (n) => (typeof n === 'number' ? '$' + n.toFixed(2) : '-');

function decodeRecipe(text) {
  let s = String(text || '').trim();
  if (!s) return null;
  if (s.startsWith('{')) return JSON.parse(s);
  const i = s.indexOf('r=');
  if (s.includes('#') || i >= 0) s = s.slice(i >= 0 ? i + 2 : s.indexOf('#') + 1);
  const json = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decodeURIComponent(escape(json)));
}

export default function SignatureBuild() {
  const [dash, setDash] = useState('');
  const [key, setKey] = useState('');
  const [recipe, setRecipe] = useState(null);
  const [paste, setPaste] = useState('');
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [hubColors, setHubColors] = useState(null);
  const [spokeColors, setSpokeColors] = useState(null);
  const [freehubOptions, setFreehubOptions] = useState(null);
  const [costs, setCosts] = useState({});
  const [belowFloorOk, setBelowFloorOk] = useState(false);
  const [result, setResult] = useState(null);
  const [runs, setRuns] = useState([]);
  const [undoText, setUndoText] = useState('');

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'x-dashboard-auth': dash, 'x-signature-tool-key': key }), [dash, key]);

  useEffect(() => {
    try { setDash(localStorage.getItem('loam_ops_auth') || ''); setKey(sessionStorage.getItem('loam_sig_key') || ''); } catch (e) { /* ignore */ }
    try { if (window.location.hash) setRecipe(decodeRecipe(window.location.hash)); } catch (e) { setErr({ message: 'The link from the builder could not be read. Paste it below instead.' }); }
  }, []);

  const call = async (path, body, method = 'POST') => {
    const res = await fetch('/api/signature-build/' + path, { method, headers: headers(), body: method === 'POST' ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok || data.ok === false && !data.blockers) { const e = new Error(data.message || 'Something went wrong'); e.code = data.code; throw e; }
    return data;
  };

  const preview = async (extra = {}) => {
    setBusy(true); setErr(null); setResult(null);
    try {
      try { sessionStorage.setItem('loam_sig_key', key); } catch (e) { /* ignore */ }
      const overrides = {
        name: name || undefined, price: price !== '' ? Number(price) : undefined, hubColors: hubColors || undefined, spokeColors: spokeColors || undefined,
        freehubOptions: freehubOptions || undefined, costOverrides: Object.keys(costs).length ? Object.fromEntries(Object.entries(costs).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) : undefined, ...extra,
      };
      const p = await call('plan', { recipe, overrides });
      setPlan(p);
      if (p.ok) { if (!name) setName(p.name); if (price === '' && p.suggestedPrice) setPrice(String(p.suggestedPrice)); }
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true); setErr(null);
    try { setResult(await call('create', { planId: plan.planId, planHash: plan.planHash, price: Number(price), belowFloorOk })); setPlan(null); loadRuns(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const loadRuns = async () => { try { setRuns((await call('runs', null, 'GET')).runs); } catch (e) { /* needs sign-in */ } };
  const undo = async (runId) => {
    setBusy(true); setErr(null);
    try { setResult(await call('undo', { runId, confirm: undoText })); setUndoText(''); loadRuns(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const toggle = (list, setList, offered, c) => { const cur = list || offered; setList(cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]); };
  const blocked = !plan || !plan.ok || plan.blockers.length > 0;
  const priceNum = Number(price);
  const floor = plan && plan.margin ? plan.margin.floor : 0;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif', color: '#18181b' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Create Signature Build</h1>
      <p style={{ color: '#52525b' }}>Preview first. One click creates a <b>DRAFT</b> product and adds its rule to the rim products. Nothing goes live: you activate and publish it yourself in Shopify. <a href="/signature-build-hubs">Hub choice builds</a></p>

      <div style={box}>
        <b>Sign in</b> (both are needed)
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input type="password" placeholder="Dashboard password" value={dash} onChange={(e) => setDash(e.target.value)} style={{ padding: 6, border: '1px solid #d4d4d8', borderRadius: 6 }} />
          <input type="password" placeholder="Signature tool key" value={key} onChange={(e) => setKey(e.target.value)} style={{ padding: 6, border: '1px solid #d4d4d8', borderRadius: 6 }} />
          <button style={btn('#3f3f46')} onClick={loadRuns}>Show past runs</button>
        </div>
      </div>

      {!recipe && (
        <div style={box}>
          <b>Paste the build</b> (the link the Step 3 button opened, or the part after <code>#r=</code>)
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} style={{ width: '100%', marginTop: 8, border: '1px solid #d4d4d8', borderRadius: 6, padding: 6 }} />
          <button style={btn('#2563eb', !paste)} disabled={!paste} onClick={() => { try { setRecipe(decodeRecipe(paste)); setErr(null); } catch (e) { setErr({ message: 'That could not be read as a build.' }); } }}>Use this build</button>
        </div>
      )}

      {recipe && (
        <div style={box}>
          <button style={btn('#2563eb', busy || !dash || !key)} disabled={busy || !dash || !key} onClick={() => preview()}>{plan ? 'Refresh preview' : 'Preview (changes nothing)'}</button>
          {(!dash || !key) && <span style={{ marginLeft: 8, color: '#b45309' }}>Enter both secrets first.</span>}
        </div>
      )}

      {err && <div style={{ ...box, borderColor: '#dc2626', background: '#fef2f2' }}><b>{err.code ? err.code + ': ' : ''}</b>{err.message}</div>}

      {result && result.ok && result.runId && (
        <div style={{ ...box, borderColor: '#16a34a', background: '#f0fdf4' }}>
          {result.productId ? (<><b>Draft created and checked.</b> Run {result.runId}. <a href={result.adminUrl} target="_blank" rel="noreferrer">Open in Shopify admin</a>. Rim rules: {result.rims.map((r) => `${r.title} ${r.before} to ${r.after}`).join('; ')}.</>) : (<><b>Undone.</b> {(result.restoredRims || []).join('; ')}</>)}
        </div>
      )}

      {plan && !plan.ok && (<div style={{ ...box, borderColor: '#dc2626' }}>{plan.blockers.map((b, i) => <div key={i}><b>{b.code}</b>: {b.message}</div>)}</div>)}

      {plan && plan.ok && (
        <>
          {plan.blockers.length > 0 && <div style={{ ...box, borderColor: '#dc2626', background: '#fef2f2' }}><b>Cannot create yet:</b>{plan.blockers.map((b, i) => <div key={i}><b>{b.code}</b>: {b.message}</div>)}</div>}
          {plan.warnings.length > 0 && <div style={{ ...box, borderColor: '#d97706', background: '#fffbeb' }}><b>Check these:</b>{plan.warnings.map((w, i) => <div key={i}>{w.message}</div>)}</div>}

          <div style={box}>
            <b>Name</b> (edit, then Refresh preview)
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => preview()} style={{ width: '100%', padding: 6, marginTop: 6, border: '1px solid #d4d4d8', borderRadius: 6 }} />
            <div style={{ marginTop: 6, color: '#52525b' }}>Title: {plan.product.title}<br />Handle: {plan.product.handle}<br />SEO: {plan.product.seo.title} ({plan.product.seo.title.length}) / {plan.product.seo.description} ({plan.product.seo.description.length})</div>
          </div>

          <div style={box}>
            <b>Parts, cost and margin</b>
            <table style={{ width: '100%', marginTop: 6, fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left' }}><th>Part</th><th>Price</th><th>Cost per item</th></tr></thead>
              <tbody>{plan.parts.map((p) => (
                <tr key={p.role}><td>{p.role}: {p.label}</td><td>{money(p.price)}</td>
                  <td>{p.cost !== null ? money(p.cost) : <input placeholder="COST MISSING" value={costs[p.id] || ''} onChange={(e) => setCosts({ ...costs, [p.id]: e.target.value })} style={{ width: 110, border: '1px solid #f59e0b', borderRadius: 4, padding: 2 }} />}</td></tr>
              ))}</tbody>
            </table>
            <div style={{ marginTop: 8 }}>Parts total {money(plan.partsSum)} ({plan.partsSumNote}). Builder total (minus the 10%) {money(plan.suggestedPrice)}. Parts cost {money(plan.margin.partsCost)}{plan.margin.incomplete ? ' (incomplete)' : ''}. Labour {money(plan.margin.labour)}, shipping {money(plan.margin.shipping)}, card fees {(plan.margin.feePct * 100).toFixed(0)}%. <b>Floor price {money(plan.margin.floor)}</b>.</div>
            <div style={{ marginTop: 8 }}>
              <b>Your price</b> <input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => preview()} style={{ width: 110, padding: 4, border: '1px solid #d4d4d8', borderRadius: 6 }} />
              {plan.margin.price !== undefined && <span style={{ marginLeft: 8 }}>Margin before labour {money(plan.margin.marginBeforeLabour)}, after labour {money(plan.margin.marginAfterLabour)}</span>}
              {priceNum > 0 && priceNum < floor && <label style={{ marginLeft: 8, color: '#b91c1c' }}><input type="checkbox" checked={belowFloorOk} onChange={(e) => setBelowFloorOk(e.target.checked)} /> I know this is below the floor</label>}
            </div>
          </div>

          <div style={box}>
            <b>Colours that keep the master price</b> (untick to leave one out)
            <div>Hubs: {plan.colours.hub.offered.map((c) => <label key={c} style={{ marginRight: 10 }}><input type="checkbox" checked={(hubColors || plan.colours.hub.offered).includes(c)} onChange={() => { toggle(hubColors, setHubColors, plan.colours.hub.offered, c); }} /> {c}</label>)}</div>
            {plan.colours.hub.excluded.length > 0 && <div style={{ color: '#71717a' }}>Left out: {plan.colours.hub.excluded.map((c) => `${c.name} (${c.reason})`).join('; ')}</div>}
            <div>Spokes: {plan.colours.spoke.offered.map((c) => <label key={c} style={{ marginRight: 10 }}><input type="checkbox" checked={(spokeColors || plan.colours.spoke.offered).includes(c)} onChange={() => { toggle(spokeColors, setSpokeColors, plan.colours.spoke.offered, c); }} /> {c}</label>)}</div>
            <div style={{ color: '#71717a' }}>{plan.colours.spoke.note} Left out: {plan.colours.spoke.excluded.map((c) => `${c.name} (${c.reason})`).join('; ') || 'none'}</div>
            <div style={{ marginTop: 6 }}>Freehub bodies offered (first is the default): {plan.freehub.options.map((o, i) => <label key={o} style={{ marginRight: 10 }}><input type="checkbox" disabled={i === 0} checked={(freehubOptions || plan.freehub.options).includes(o)} onChange={() => toggle(freehubOptions, setFreehubOptions, plan.freehub.options, o)} /> {o}</label>)}</div>
            {plan.spokeLengths.front.length > 0 ? <div style={{ marginTop: 6 }}>Spoke lengths (mm): front {plan.spokeLengths.front.join(' + ')}, rear {plan.spokeLengths.rear.join(' + ')}. These were supplied with the build; check them.</div> : <div style={{ marginTop: 6 }}>Spoke lengths were not supplied; the guard watches the builder spoke variant of the default colour.</div>}
            <button style={{ ...btn('#3f3f46', busy), marginTop: 8 }} disabled={busy} onClick={() => preview()}>Refresh preview</button>
          </div>

          <div style={box}>
            <b>Rim rules that will be added</b> (the old rules stay exactly as they are; a backup is saved)
            {plan.rules.map((r) => (<details key={r.rimProductGid} style={{ marginTop: 6 }}><summary>{r.rimTitle}: {r.existingCount} rule(s) now, {r.existingCount + 1} after</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(r.newRule, null, 2)}</pre></details>))}
            <details style={{ marginTop: 6 }}><summary>Everything else that will be written</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify({ product: plan.product, variant: plan.variant }, null, 2)}</pre></details>
          </div>

          <div style={box}>
            <button style={btn('#16a34a', busy || blocked || !(priceNum > 0))} disabled={busy || blocked || !(priceNum > 0)} onClick={create}>Create draft (nothing goes live)</button>
            <span style={{ marginLeft: 8, color: '#52525b' }}>Status DRAFT, not on any sales channel, not in any collection. Plan expires at {new Date(plan.expiresAt).toLocaleTimeString()}.</span>
          </div>
        </>
      )}

      {runs.length > 0 && (
        <div style={box}>
          <b>Past runs</b>
          {runs.map((r) => (
            <div key={r.run_id} style={{ marginTop: 6, fontSize: 14 }}>
              {r.name} - {r.status} - {r.run_id}
              {r.status === 'created' && (<span> <input placeholder={`type UNDO ${r.run_id}`} value={undoText} onChange={(e) => setUndoText(e.target.value)} style={{ width: 320, padding: 2 }} /> <button style={btn('#dc2626', busy || undoText !== `UNDO ${r.run_id}`)} disabled={busy || undoText !== `UNDO ${r.run_id}`} onClick={() => undo(r.run_id)}>Undo</button></span>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
