import React, { useState } from 'react';

// Component library tools: checks (validation, coverage, drift), history with restore, CSV import, export, push to Shopify (one variant).
// Everything talks to /api/components-report and /api/components-tools; nothing here changes data until a button that says so is clicked.
const authHeader = () => ({ 'x-dashboard-auth': localStorage.getItem('loam_ops_auth') || '', 'Content-Type': 'application/json' });
const btn = 'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-100 hover:bg-zinc-200 text-zinc-700 disabled:opacity-40';
const dark = 'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-black text-white hover:bg-zinc-800 disabled:opacity-40';
const List = ({ title, items, render, empty = 'none' }) => (
  <div className="mb-4">
    <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">{title} ({items.length})</div>
    {items.length === 0 ? <div className="text-xs text-zinc-400 italic">{empty}</div> : <ul className="text-xs text-zinc-700 max-h-40 overflow-auto list-disc pl-5">{items.slice(0, 60).map((x, i) => <li key={i}>{render(x)}</li>)}{items.length > 60 && <li>...and {items.length - 60} more</li>}</ul>}
  </div>
);

export default function ComponentTools({ componentTab, onChanged, notify }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('checks');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState(null);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState(null);
  const [pushVid, setPushVid] = useState('');
  const [pushPlan, setPushPlan] = useState(null);
  const [pushConfirm, setPushConfirm] = useState('');
  const [pushAction, setPushAction] = useState('push-preview');
  const [ticked, setTicked] = useState({});   // products ticked as 'intentionally not in the calculator'
  const say = (m, t = 'info') => (notify ? notify(m, t) : console.log(m));

  const call = async (url, opts = {}) => { const r = await fetch(url, { headers: authHeader(), ...opts }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; };
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { say(e.message, 'error'); } setBusy(false); };

  const loadReport = () => run(async () => setReport(await call(`/api/components-report?tab=${componentTab}`)));
  const loadHistory = () => run(async () => setHistory(await call(`/api/components-tools?action=history&tab=${componentTab}`)));
  const doPreview = () => run(async () => setPreview(await call('/api/components-tools', { method: 'POST', body: JSON.stringify({ action: 'import-preview', tab: componentTab, csv }) })));
  const doAdd = () => run(async () => {
    if (!window.confirm(`Add ${preview.toAdd.length} rows to ${componentTab}? ${preview.countBefore} now, ${preview.countBefore + preview.toAdd.length} after.`)) return;
    await call('/api/components-tools', { method: 'POST', body: JSON.stringify({ action: 'import-add', tab: componentTab, csv, baseSha: preview.sha }) });
    say(`Added ${preview.toAdd.length} rows.`, 'success'); setPreview(null); setCsv(''); onChanged && onChanged();
  });
  const doRestore = (h) => run(async () => {
    const cur = await call(`/api/components?tab=${componentTab}`);
    if (!window.confirm(`Restore ${componentTab}.json to this version?\n"${h.message}"\nIt is saved as a NEW version; rows added since are archived (rows of retired/draft products cannot be removed).`)) return;
    await call('/api/components-tools', { method: 'POST', body: JSON.stringify({ action: 'restore', tab: componentTab, commitSha: h.sha, baseSha: cur.shas[componentTab] }) });
    say('Restored as a new version.', 'success'); onChanged && onChanged(); loadHistory();
  });
  const markRetired = () => run(async () => {
    const ids = new Set(report.coverage.suggestRetired.map((r) => String(r.variantId)));
    if (!window.confirm(`Mark ${ids.size} rows as Retired? (Only a label: the rows stay in the calculator exactly as now.)`)) return;
    const cur = await call(`/api/components?tab=${componentTab}`);
    const rows = cur[componentTab].map((r) => (ids.has(String(r.shopify_variant_id || r['Variant ID'] || '')) ? { ...r, Status: 'retired' } : r));
    await call('/api/components', { method: 'POST', body: JSON.stringify({ [componentTab]: rows, baseShas: { [componentTab]: cur.shas[componentTab] } }) });
    say('Marked as Retired.', 'success'); onChanged && onChanged(); loadReport();
  });
  const saveExcluded = (add, remove) => run(async () => {
    await call('/api/components-tools', { method: 'POST', body: JSON.stringify({ action: 'excluded-save', tab: componentTab, add, remove }) });
    say('Exclusion list saved.', 'success'); setTicked({}); loadReport();
  });
  const pushPreview = (action = 'push-preview') => run(async () => { setPushAction(action); setPushConfirm(''); setPushPlan(await call('/api/components-tools', { method: 'POST', body: JSON.stringify({ action, tab: componentTab, variantId: pushVid.trim() }) })); });
  const pushNow = (undo) => run(async () => { const r = await call('/api/components-tools', { method: 'POST', body: JSON.stringify({ action: undo ? 'push-undo' : 'push', tab: componentTab, variantId: pushVid.trim(), confirm: pushConfirm }) }); say(`${undo ? 'Undone' : 'Pushed'}: ${r.logged.changes.map((c) => `${c.label} ${c.old} -> ${c.new}`).join(', ')}`, 'success'); setPushPlan(null); });
  const download = (fmt) => { window.location.href = `/api/components-tools?action=export&tab=${componentTab}&format=${fmt}&auth=${encodeURIComponent(localStorage.getItem('loam_ops_auth') || '')}`; };
  const onFile = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { setCsv(String(rd.result)); setPreview(null); }; rd.readAsText(f); };

  if (!open) return <div className="mb-6"><button className={btn} onClick={() => { setOpen(true); }}>Library tools: checks, history, import, export, push</button></div>;
  const v = report && report.validation, c = report && report.coverage;
  return (
    <div className="mb-8 p-6 bg-white border border-zinc-200 rounded-[2rem] shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">{['checks', 'history', 'import', 'export', 'push'].map((s) => <button key={s} className={section === s ? dark : btn} onClick={() => setSection(s)}>{s}</button>)}</div>
        <button className={btn} onClick={() => setOpen(false)}>Close</button>
      </div>

      {section === 'checks' && (<div>
        <p className="text-xs text-zinc-500 mb-3">Read-only. Nothing is changed or deleted by these lists: rows of retired, draft or missing products are only ever suggested as "Retired", never for deletion. ({componentTab})</p>
        <button className={dark} disabled={busy || !['rims', 'hubs'].includes(componentTab)} onClick={loadReport}>{busy ? 'Working...' : 'Run checks'}</button>
        {report && (<div className="mt-4">
          <List title="Rows with no ERD" items={v.missingErd} render={(x) => `${x.vendor} ${x.title}`} />
          <List title="ERD far from similar rims (check)" items={v.outliers} render={(x) => `${x.title} ${x.size} ERD ${x.erd} (typical ${x.sizeMedian})`} />
          <List title="Duplicate Shopify variant ids" items={v.duplicateVariantIds} render={(x) => `${x.variantId}: ${x.titles.join(' / ')}`} />
          <div className="mb-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Active Shopify products with no calculator row ({c.missingRows.length}). Tick the ones that are intentionally not in the calculator (rim brake, road, Your Own Rim...)</div>
            {c.missingRows.length === 0 ? <div className="text-xs text-zinc-400 italic">none</div> : <ul className="text-xs text-zinc-700 max-h-48 overflow-auto">{c.missingRows.map((x) => (<li key={x.id}><label><input type="checkbox" checked={!!ticked[x.id]} onChange={(e) => setTicked({ ...ticked, [x.id]: e.target.checked })} /> {x.title} ({x.variants} variants)</label></li>))}</ul>}
            {Object.values(ticked).some(Boolean) && <button className={btn} disabled={busy} onClick={() => saveExcluded(c.missingRows.filter((x) => ticked[x.id]).map((x) => ({ id: x.id, title: x.title })), [])}>Save {Object.values(ticked).filter(Boolean).length} as intentionally excluded</button>}
          </div>
          <List title="Intentionally excluded (stored in excluded.json, never shown to customers)" items={c.excluded} render={(x) => (<span>{x.title} <button className="underline text-[10px]" onClick={() => saveExcluded([], [x.id])}>include again</button></span>)} />
          <List title="Rows whose Shopify product is draft or archived (stay in the library)" items={c.onDraft} render={(x) => `${x.title} [${x.shopify}] ${x.status === 'retired' ? '(retired)' : ''}`} />
          <List title="Rows whose variant is missing in Shopify (stay in the library)" items={c.missingInShopify} render={(x) => x.title} />
          <List title="Library and Shopify disagree (ERD / weight)" items={report.drift} render={(x) => `${x.title}: ${x.field} library ${x.library}, Shopify ${x.shopify}`} />
          {c.suggestRetired.length > 0 && <button className={btn} disabled={busy} onClick={markRetired}>Mark the {c.suggestRetired.length} suggested rows as Retired (label only)</button>}
        </div>)}
      </div>)}

      {section === 'history' && (<div>
        <button className={dark} disabled={busy} onClick={loadHistory}>{busy ? 'Working...' : 'Load history'}</button>
        {history && <ul className="mt-4 text-xs space-y-2">{history.history.map((h) => (
          <li key={h.sha} className="border-b border-zinc-100 pb-2 flex justify-between gap-4">
            <span><b>{new Date(h.date).toLocaleString()}</b> {h.message}{h.changes && <span className="text-zinc-500"> | +{h.changes.added} ~{h.changes.edited} -{h.changes.removed}, {h.changes.rowsAfter} rows{h.changes.examples.length ? ` (${h.changes.examples.join(', ')})` : ''}</span>} <a className="underline" href={h.url} target="_blank" rel="noreferrer">view</a></span>
            <button className={btn} disabled={busy} onClick={() => doRestore(h)}>Restore this version</button>
          </li>))}</ul>}
      </div>)}

      {section === 'import' && (<div>
        <p className="text-xs text-zinc-500 mb-2">Paste or load a CSV (Agent C's Block A or Block B). You see a preview with the same checks as a save before anything is added.</p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-xs mb-2" />
        <textarea className="w-full h-28 border border-zinc-200 rounded-xl p-2 text-xs font-mono" value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} placeholder="CSV text" />
        <div className="mt-2 flex gap-2"><button className={dark} disabled={busy || !csv.trim()} onClick={doPreview}>Preview</button>{preview && preview.problems.length === 0 && preview.toAdd.length > 0 && <button className={dark} disabled={busy} onClick={doAdd}>Add {preview.toAdd.length} rows</button>}</div>
        {preview && (<div className="mt-3 text-xs"><div>Format {preview.format}. Now {preview.countBefore} rows, after {preview.countBefore + preview.toAdd.length}. New {preview.toAdd.length}, already in the library {preview.alreadyThere.length}.</div>
          {preview.parseErrors.length > 0 && <div className="text-red-600">{preview.parseErrors.join(' | ')}</div>}
          {preview.problems.length > 0 && <div className="text-red-600">Not addable: {preview.problems.map((p) => `${p.title}: ${p.problems.join(', ')}`).join(' | ')}</div>}
          <ul className="list-disc pl-5 max-h-40 overflow-auto">{preview.toAdd.map((r, i) => <li key={i}>{r.title} {r.size} {r.holes} ERD {String(r.erd)}</li>)}</ul></div>)}
      </div>)}

      {section === 'export' && (<div className="flex gap-2 items-center"><button className={dark} onClick={() => download('json')}>Download {componentTab}.json</button><button className={btn} onClick={() => download('csv')}>Download {componentTab}.csv</button><span className="text-xs text-zinc-500">Download one before any big edit.</span></div>)}

      {section === 'push' && (<div>
        <p className="text-xs text-zinc-500 mb-2">Library to Shopify, ONE variant at a time, only Rim ERD and Weight. You see exactly what changes first; the old values are logged so it can be undone. The server switch must be on.</p>
        <div className="flex gap-2"><input className="border border-zinc-200 rounded-xl px-3 py-2 text-xs" placeholder="Shopify variant id" value={pushVid} onChange={(e) => { setPushVid(e.target.value); setPushPlan(null); }} /><button className={dark} disabled={busy || !pushVid.trim() || componentTab !== 'rims'} onClick={() => pushPreview('push-preview')}>Preview push</button><button className={btn} disabled={busy || !pushVid.trim() || componentTab !== 'rims'} onClick={() => pushPreview('push-undo')}>Preview undo of last push</button></div>
        {pushPlan && (<div className="mt-3 text-xs"><div className="font-bold">{pushPlan.title} (variant {pushPlan.plan.variantId})</div>
          {pushPlan.plan.changes.length === 0 ? <div>Nothing to change.</div> : <ul className="list-disc pl-5">{pushPlan.plan.changes.map((c) => <li key={c.key}>{c.label}: Shopify {String(c.from)} to {String(c.to)}</li>)}</ul>}
          {pushPlan.plan.refused.map((r, i) => <div key={i} className="text-red-600">{r}</div>)}
          {!pushPlan.pushEnabled && <div className="text-amber-600">Push is switched off on the server (preview only).</div>}
          {pushPlan.pushEnabled && pushPlan.plan.changes.length > 0 && (<div className="mt-2 flex gap-2"><input className="border border-zinc-200 rounded-xl px-3 py-2 text-xs" placeholder={`Type PUSH ${pushPlan.plan.variantId}`} value={pushConfirm} onChange={(e) => setPushConfirm(e.target.value)} /><button className={dark} disabled={busy || pushConfirm !== `PUSH ${pushPlan.plan.variantId}`} onClick={() => pushNow(pushAction === 'push-undo')}>{pushAction === 'push-undo' ? 'Undo the last push' : 'Push to Shopify'}</button></div>)}
        </div>)}
      </div>)}
    </div>
  );
}
