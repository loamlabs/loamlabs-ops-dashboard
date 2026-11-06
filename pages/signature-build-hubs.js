import React, { useState, useEffect, useCallback } from 'react';

// Create Signature Build, hub-choice products: one DRAFT product with every hub and axle spacing as a variant. Preview first, one click creates the draft.
// Needs the dashboard password AND the separate tool key. All checks happen on the server (pages/api/signature-build/*); this page only shows what it says.

const box = { border: '1px solid #d4d4d8', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff' };
const btn = (bg, dis) => ({ background: dis ? '#a1a1aa' : bg, color: '#fff', border: 0, borderRadius: 6, padding: '8px 14px', cursor: dis ? 'not-allowed' : 'pointer', fontWeight: 600 });
const input = { padding: 6, border: '1px solid #d4d4d8', borderRadius: 6 };
const money = (n) => (typeof n === 'number' ? '$' + n.toFixed(2) : '-');
const SPACING_LABEL = { A: '15x110 / 12x148', B: '15x110 / 12x157', C: '20x110 / 12x157' };

export default function SignatureBuildHubs() {
  const [dash, setDash] = useState('');
  const [key, setKey] = useState('');
  const [setup, setSetup] = useState('');
  const [csv, setCsv] = useState('');
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [hubPrices, setHubPrices] = useState({});
  const [belowFloorOk, setBelowFloorOk] = useState(false);
  const [result, setResult] = useState(null);
  const [runs, setRuns] = useState([]);
  const [undoText, setUndoText] = useState('');
  const [drift, setDrift] = useState(null);

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'x-dashboard-auth': dash, 'x-signature-tool-key': key }), [dash, key]);
  useEffect(() => { try { setDash(localStorage.getItem('loam_ops_auth') || ''); setKey(sessionStorage.getItem('loam_sig_key') || ''); } catch (e) { /* ignore */ } }, []);

  const call = async (path, body, method = 'POST') => {
    const res = await fetch('/api/signature-build/' + path, { method, headers: headers(), body: method === 'POST' ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok || (data.ok === false && !data.blockers)) { const e = new Error(data.message || 'Something went wrong'); e.code = data.code; throw e; }
    return data;
  };

  const preview = async () => {
    setBusy(true); setErr(null); setResult(null);
    try {
      try { sessionStorage.setItem('loam_sig_key', key); } catch (e) { /* ignore */ }
      let config;
      try { config = JSON.parse(setup); } catch (e) { throw new Error('The setup is not valid JSON.'); }
      const overrides = { name: name || undefined, hubPrices: Object.fromEntries(Object.entries(hubPrices).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) };
      const p = await call('plan', { mode: 'hub-choice', config, lengthsCsv: csv || undefined, overrides });
      setPlan(p);
      if (p.ok && !name) setName(p.name);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true); setErr(null);
    try { setResult(await call('create', { planId: plan.planId, planHash: plan.planHash, belowFloorOk })); setPlan(null); loadRuns(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const loadRuns = async () => { try { setRuns((await call('runs', null, 'GET')).runs); } catch (e) { /* needs sign-in */ } };
  const undo = async (runId) => { setBusy(true); setErr(null); try { setResult(await call('undo', { runId, confirm: undoText })); setUndoText(''); loadRuns(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const loadDrift = async () => { setBusy(true); setErr(null); try { setDrift(await call('drift', null, 'GET')); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const acceptDrift = async () => { setBusy(true); setErr(null); try { await call('drift-accept', {}); setDrift(await call('drift', null, 'GET')); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const readFile = (file, set) => { if (!file) return; const r = new FileReader(); r.onload = () => set(String(r.result || '')); r.readAsText(file); };

  const blocked = !plan || !plan.ok || plan.blockers.length > 0;
  const hubs = plan && plan.ok ? plan.product.options[1].values : [];
  const cell = (hub, sp) => (plan.matrix || []).find((m) => m.hub === hub && m.spacing === sp);
  const droppedHubs = plan ? [...new Set((plan.dropped || []).filter((d) => d.spacing === null).map((d) => d.hub))] : [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif', color: '#18181b' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Create Signature Build: hub choice</h1>
      <p style={{ color: '#52525b' }}>One <b>DRAFT</b> product per rim, with every hub and axle spacing as a variant. Preview changes nothing; one click creates the draft and adds one rule per hub and spacing to the rim. Nothing goes live. <a href="/signature-build">Single build tool</a></p>

      <div style={box}>
        <b>Sign in</b> (both are needed)
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input type="password" placeholder="Dashboard password" value={dash} onChange={(e) => setDash(e.target.value)} style={input} />
          <input type="password" placeholder="Signature tool key" value={key} onChange={(e) => setKey(e.target.value)} style={input} />
          <button style={btn('#3f3f46')} onClick={loadRuns}>Show past runs</button>
        </div>
      </div>

      <div style={box}>
        <b>Setup</b> (JSON for one product: name, sizes, rims, spokes, nipples, hubs with their product ids per spacing)
        <textarea value={setup} onChange={(e) => setSetup(e.target.value)} rows={6} style={{ width: '100%', marginTop: 8, ...input }} />
        <div style={{ marginTop: 8 }}><b>Spoke length table</b> (Backend 1's CSV; paste it or choose the file) <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files[0], setCsv)} /> {csv ? <span style={{ color: '#16a34a' }}>{csv.split('\n').length - 1} rows loaded</span> : <span style={{ color: '#b45309' }}>none: the guard will watch the builder spoke variant only</span>}</div>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={2} placeholder="product,hub,spacing,..." style={{ width: '100%', marginTop: 6, ...input, fontSize: 12 }} />
        <button style={{ ...btn('#2563eb', busy || !dash || !key || !setup), marginTop: 8 }} disabled={busy || !dash || !key || !setup} onClick={preview}>{plan ? 'Refresh preview' : 'Preview (changes nothing)'}</button>
        {(!dash || !key) && <span style={{ marginLeft: 8, color: '#b45309' }}>Enter both secrets first.</span>}
      </div>

      {err && <div style={{ ...box, borderColor: '#dc2626', background: '#fef2f2' }}><b>{err.code ? err.code + ': ' : ''}</b>{err.message}</div>}

      {result && result.ok && result.runId && (
        <div style={{ ...box, borderColor: '#16a34a', background: '#f0fdf4' }}>
          {result.productId ? <><b>Draft created and checked:</b> {result.variantCount} variants. Run {result.runId}. <a href={result.adminUrl} target="_blank" rel="noreferrer">Open in Shopify admin</a>. Rim rules: {result.rims.map((r) => `${r.title} ${r.before} to ${r.after}`).join('; ')}.</> : <><b>Undone.</b> {(result.restoredRims || []).join('; ')}</>}
        </div>
      )}

      {plan && !plan.ok && <div style={{ ...box, borderColor: '#dc2626' }}>{plan.blockers.map((b, i) => <div key={i}><b>{b.code}</b>: {b.message}</div>)}{(plan.dropped || []).length > 0 && <div style={{ marginTop: 6 }}><b>Dropped:</b>{plan.dropped.map((d, i) => <div key={i}>{d.reason}</div>)}</div>}</div>}

      {plan && plan.ok && (
        <>
          {plan.blockers.length > 0 && <div style={{ ...box, borderColor: '#dc2626', background: '#fef2f2' }}><b>Cannot create yet:</b>{plan.blockers.map((b, i) => <div key={i}><b>{b.code}</b>: {b.message}</div>)}</div>}
          {plan.notes.length > 0 && <div style={{ ...box, borderColor: '#2563eb', background: '#eff6ff' }}><b>Note:</b>{plan.notes.map((n, i) => <div key={i}>{n}</div>)}</div>}
          {plan.warnings.length > 0 && <div style={{ ...box, borderColor: '#d97706', background: '#fffbeb' }}><b>Check these:</b>{plan.warnings.map((w, i) => <div key={i}>{w.message}</div>)}</div>}

          <div style={box}>
            <b>Name</b> (edit, then Refresh preview) <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginTop: 6, ...input }} />
            <div style={{ marginTop: 6, color: '#52525b' }}>Title: {plan.product.title}<br />Handle: {plan.product.handle}<br />SEO: {plan.product.seo.title} ({plan.product.seo.title.length}) / {plan.product.seo.description} ({plan.product.seo.description.length})<br />Rim {plan.shared.rim}; {plan.shared.spokes} ({plan.shared.spokeColour}); {plan.shared.nipples}; {plan.shared.sizes.join(' / ')}; {plan.shared.holes}h; spoke lengths from the {plan.spokeLengthsFrom}.</div>
          </div>

          <div style={box}>
            <b>Hub x spacing</b>: price, margin after labour, assembly per wheel. Type a hub price to override it for all its spacings, then Refresh preview.
            <table style={{ width: '100%', marginTop: 6, fontSize: 14, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left' }}><th>Hub</th><th>Your price (all spacings)</th>{['A', 'B', 'C'].map((s) => <th key={s}>{SPACING_LABEL[s]}</th>)}</tr></thead>
              <tbody>
                {hubs.map((h) => (
                  <tr key={h} style={{ borderTop: '1px solid #e4e4e7', verticalAlign: 'top' }}>
                    <td><b>{h}</b></td>
                    <td><input placeholder="builder price" value={hubPrices[h] || ''} onChange={(e) => setHubPrices({ ...hubPrices, [h]: e.target.value })} style={{ width: 100, ...input, padding: 3 }} /></td>
                    {['A', 'B', 'C'].map((s) => { const c = cell(h, s); return c ? (
                      <td key={s} style={{ color: c.belowFloor ? '#b91c1c' : undefined }}>
                        {money(c.price)}{c.overridden ? ' (yours)' : ''}<br /><span style={{ fontSize: 12, color: '#52525b' }}>margin {money(c.marginAfterLabour)}{c.costMissing ? ' (cost missing)' : ''}<br />assembly ${c.assemblyPerWheel} per wheel<br />{c.colours.length} colour{c.colours.length === 1 ? '' : 's'}{c.lengths ? `, spokes ${c.lengths.front.join('/')} front, ${c.lengths.rear.join('/')} rear` : ''}</span>
                        {c.warnings.length > 0 && <div style={{ fontSize: 12, color: '#b45309' }}>{c.warnings.join(', ')}</div>}
                      </td>) : <td key={s} style={{ color: '#a1a1aa' }}>no variant</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 6, color: '#71717a' }}>Assembly fee per wheel comes from the builder's own table ({plan.assemblySource}): the higher of the hub and rim rate, e*thirteen and Project321 have no hub rate there so the rim rate applies (Reserve $50), or the $60 default.</div>
          </div>

          <div style={box}>
            <b>Dropped hubs and why</b> {(plan.dropped || []).length === 0 ? <span style={{ color: '#16a34a' }}>none</span> : null}
            {droppedHubs.length > 0 && <div style={{ color: '#b91c1c' }}>Whole hub left out (Signature rules): {droppedHubs.join(', ')}</div>}
            {(plan.dropped || []).map((d, i) => <div key={i} style={{ fontSize: 14 }}><code>{d.code}</code> {d.reason}</div>)}
          </div>

          <div style={box}>
            <b>Rim rules that will be added</b> (the old rules stay exactly as they are; a backup is saved)
            {plan.rules.map((r) => <div key={r.rimProductGid} style={{ marginTop: 6 }}>{r.rimTitle}: {r.existingCount} rule(s) now, {r.existingCount + r.count} after. <details><summary>Show the {r.count} new rules</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(r.newRules, null, 2)}</pre></details></div>)}
            {plan.rulesSize.map((s) => <div key={s.rim} style={{ color: '#52525b' }}>{s.rim}: {s.bytesBefore} to {s.bytesAfter} bytes of the {s.limitBytes} byte limit ({Math.round((100 * s.bytesAfter) / s.limitBytes)}%).</div>)}
            <details style={{ marginTop: 6 }}><summary>Everything else that will be written</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify({ product: plan.product, variants: plan.variants }, null, 2)}</pre></details>
          </div>

          <div style={box}>
            {plan.margin.belowFloor.length > 0 && <label style={{ color: '#b91c1c', display: 'block', marginBottom: 6 }}><input type="checkbox" checked={belowFloorOk} onChange={(e) => setBelowFloorOk(e.target.checked)} /> I know {plan.margin.belowFloor.length} variant(s) are below the floor price</label>}
            <button style={btn('#16a34a', busy || blocked || (plan.margin.belowFloor.length > 0 && !belowFloorOk))} disabled={busy || blocked || (plan.margin.belowFloor.length > 0 && !belowFloorOk)} onClick={create}>Create draft with {plan.variants.length} variants (nothing goes live)</button>
            <span style={{ marginLeft: 8, color: '#52525b' }}>Status DRAFT, not on any sales channel, not in any collection. Plan expires at {new Date(plan.expiresAt).toLocaleTimeString()}.</span>
          </div>
        </>
      )}

      {runs.length > 0 && (
        <div style={box}>
          <b>Past runs</b>
          {runs.map((r) => (
            <div key={r.run_id} style={{ marginTop: 6, fontSize: 14 }}>{r.name} - {r.status} - {r.run_id}
              {r.status === 'created' && <span> <input placeholder={`type UNDO ${r.run_id}`} value={undoText} onChange={(e) => setUndoText(e.target.value)} style={{ width: 320, ...input, padding: 2 }} /> <button style={btn('#dc2626', busy || undoText !== `UNDO ${r.run_id}`)} disabled={busy || undoText !== `UNDO ${r.run_id}`} onClick={() => undo(r.run_id)}>Undo</button></span>}
            </div>
          ))}
        </div>
      )}

      <div style={box}>
        <b>Price drift</b> (read only: it never changes a price). Shows which component prices moved since each build's basis and how far the build price should move.
        <div style={{ marginTop: 6 }}>
          <button style={btn('#3f3f46', busy || !dash || !key)} disabled={busy || !dash || !key} onClick={loadDrift}>Show price drift</button>
          {drift && drift.rows.length > 0 && <button style={{ ...btn('#b45309', busy), marginLeft: 8 }} disabled={busy} onClick={acceptDrift}>Accept today's prices as the new basis</button>}
        </div>
        {drift && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: '#52525b' }}>{drift.masters} guarded builds; {drift.withBasis} have a basis{drift.withoutBasis ? `, ${drift.withoutBasis} have none yet (the guard run takes it, or accept below)` : ''}. {drift.enabled ? 'The guard run e-mails new drift.' : 'The e-mail part is OFF (set SIGNATURE_DRIFT_REPORT=on after running SIGNATURE_PRICE_BASIS.sql).'}</div>
            {drift.lines.length === 0 ? <div style={{ color: '#16a34a' }}>No drift.</div> : drift.lines.map((l, i) => <div key={i}>{l}</div>)}
            {drift.rows.length > 0 && <details><summary>{drift.rows.length} build(s) affected</summary>{drift.rows.map((r) => <div key={r.variantId} style={{ fontSize: 13 }}>{r.title}: {r.changes.map((c) => `${c.label} ${money(c.was)} to ${money(c.now)}`).join('; ')}{r.colourSpread.length ? ` | colours differ: ${r.colourSpread.map((s) => s.label).join(', ')}` : ''}</div>)}</details>}
          </div>
        )}
      </div>
    </div>
  );
}
