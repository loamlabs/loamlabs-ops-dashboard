import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, AlertTriangle, Copy, Printer, ExternalLink } from 'lucide-react';
import { normalizeOrderNumber, messageFor, buildView, sheetToText, imagePath } from '../../lib/order-sheet-view';

// Order sheet tab: type an order NUMBER, see the wheel pictures, the lengths, the per-spoke list and (System orders) the I9 order list. Read only.
// Data: /api/order-sheet and /api/order-sheet-image (dashboard routes that call Backend 1 with the shared secret on the server). No customer data is shown.
export default function OrderSheet({ getAuth }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(null);
  const [images, setImages] = useState({});          // key -> { url } | { error } | { loading: true }
  const [copied, setCopied] = useState(false);
  const runRef = useRef(0);
  const urlsRef = useRef([]);

  const clearUrls = () => { urlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); urlsRef.current = []; };
  useEffect(() => () => { runRef.current++; clearUrls(); }, []);

  const keyOf = (im) => `${im.wheel}|${im.view}`;
  const authHeaders = () => ({ 'x-dashboard-auth': getAuth() || '' });

  // images one at a time (each call asks Shopify for the order again on Backend 1's side)
  const loadImages = async (orderNumber, view, run) => {
    const list = view.wheels.flatMap((w) => w.images);
    for (const im of list) {
      if (runRef.current !== run) return;
      setImages((prev) => ({ ...prev, [keyOf(im)]: { loading: true } }));
      try {
        const res = await fetch(imagePath(orderNumber, im), { headers: authHeaders() });
        if (runRef.current !== run) return;
        if (res.ok && /image\/png/i.test(res.headers.get('content-type') || '')) {
          const url = URL.createObjectURL(await res.blob()); urlsRef.current.push(url);
          setImages((prev) => ({ ...prev, [keyOf(im)]: { url } }));
        } else {
          let body = null; try { body = await res.json(); } catch (e) { body = null; }
          setImages((prev) => ({ ...prev, [keyOf(im)]: { error: (body && body.message) || messageFor(res.status, body) } }));
        }
      } catch (e) { if (runRef.current === run) setImages((prev) => ({ ...prev, [keyOf(im)]: { error: messageFor(502, { error: 'UNREACHABLE' }) } })); }
    }
  };

  const open = async (e) => {
    if (e) e.preventDefault();
    const n = normalizeOrderNumber(input);
    if (!n) { setError(messageFor(400, { error: 'BAD_ORDER_NUMBER' })); setSheet(null); return; }
    const run = ++runRef.current; clearUrls(); setImages({}); setError(''); setSheet(null); setLoading(true);
    try {
      const res = await fetch(`/api/order-sheet?order=${n}`, { headers: authHeaders() });
      let body = null; try { body = await res.json(); } catch (err) { body = null; }
      if (runRef.current !== run) return;
      if (!res.ok || !body || !body.ok) { setError((body && body.message) || messageFor(res.status, body)); setLoading(false); return; }
      setSheet(body.sheet); setLoading(false);
      loadImages(n, buildView(body.sheet), run);
    } catch (err) { if (runRef.current === run) { setError(messageFor(502, { error: 'UNREACHABLE' })); setLoading(false); } }
  };

  const view = sheet ? buildView(sheet) : null;
  const copy = async () => { try { await navigator.clipboard.writeText(sheetToText(sheet)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { setError('Could not copy. Select the text and copy it by hand.'); } };
  const toneClass = view && view.header.calcTone === 'amber' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-zinc-100 border-zinc-300 text-zinc-800';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 order-sheet-root">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          aside, .no-print { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; overflow: visible !important; }
          body, .order-sheet-root { background: #fff !important; }
          .os-wheel { break-inside: avoid; page-break-inside: avoid; }
          .os-images { display: grid !important; grid-template-columns: 1fr 1fr; gap: 0.15in; }
          .os-images img { width: 100% !important; max-width: 3.4in; }
          .os-spoke-table { font-size: 9pt; }
        }
      `}</style>
      <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic mb-2 no-print">Order Sheet</h1>
      <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-8 no-print">Wheel pictures, lengths and the per-spoke build list for one order</p>

      <form onSubmit={open} className="flex flex-wrap items-center gap-3 mb-8 no-print">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={input} onChange={(e) => setInput(e.target.value)} inputMode="numeric" placeholder="Order number, e.g. 1466" aria-label="Order number"
            className="pl-11 pr-4 py-3 w-72 rounded-2xl border border-zinc-200 bg-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
        <button type="submit" disabled={loading} className="px-6 py-3 rounded-2xl bg-black text-white font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}Open order sheet
        </button>
        {sheet ? (<>
          <button type="button" onClick={copy} className="px-4 py-3 rounded-2xl border border-zinc-300 bg-white font-bold text-xs uppercase tracking-widest flex items-center gap-2"><Copy size={14} />{copied ? 'Copied' : 'Copy as text'}</button>
          <button type="button" onClick={() => window.print()} className="px-4 py-3 rounded-2xl border border-zinc-300 bg-white font-bold text-xs uppercase tracking-widest flex items-center gap-2"><Printer size={14} />Print</button>
        </>) : null}
      </form>

      {error ? <div role="alert" className="mb-8 p-4 rounded-2xl border border-red-300 bg-red-50 text-red-800 font-bold text-sm flex items-start gap-3 no-print"><AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />{error}</div> : null}

      {view ? (
        <div className="space-y-8">
          <section className="bg-white rounded-3xl border border-zinc-200 p-6">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-3">
              <h2 className="text-2xl font-black italic uppercase">{view.header.orderName}</h2>
              <span className="text-zinc-500 text-sm font-bold">{view.header.kind}</span>
              {view.header.date ? <span className="text-zinc-500 text-sm">{view.header.date}</span> : null}
              {view.header.buildId ? <span className="text-zinc-400 text-xs">Build id {view.header.buildId}</span> : null}
              {view.header.cancelled ? <span className="text-red-700 text-xs font-black uppercase">Cancelled order</span> : null}
            </div>
            <div className={`border rounded-2xl p-3 text-sm font-bold ${toneClass}`} data-testid="calc-line">Lengths: {view.header.calcText}</div>
            <p className="text-xs text-zinc-500 mt-3"><strong>Spoke numbering:</strong> {view.header.numberingLabel}{view.header.numberingRule ? ` - ${view.header.numberingRule}` : ''}</p>
          </section>

          {view.warnings.length || view.orderChecks.length ? (
            <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6">
              <h3 className="font-black uppercase text-sm mb-2">Warnings and order checks</h3>
              <ul className="list-disc ml-5 text-sm space-y-1">{view.orderChecks.map((c, i) => <li key={'c' + i}><strong>Check:</strong> {c}</li>)}{view.warnings.map((w, i) => <li key={'w' + i}>{w}</li>)}</ul>
            </section>
          ) : null}

          {view.supplied ? (
            <section className="rounded-3xl border border-blue-300 bg-blue-50 p-6 text-sm">
              <h3 className="font-black uppercase text-sm mb-2">Customer-supplied parts</h3>
              <p className="font-bold">{view.supplied.text}</p>{view.supplied.reminder ? <p className="mt-1">{view.supplied.reminder}</p> : null}
            </section>
          ) : null}

          {view.wheels.map((w) => (
            <section key={w.position} className="os-wheel bg-white rounded-3xl border border-zinc-200 p-6" data-wheel={w.position}>
              <h3 className="text-xl font-black italic uppercase mb-4">{w.title} wheel</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <table className="text-sm w-full"><tbody>{w.facts.map(([k, v]) => <tr key={k}><td className="pr-4 py-1 text-zinc-500 font-bold align-top whitespace-nowrap">{k}</td><td className="py-1 font-medium">{v}</td></tr>)}</tbody></table>
                  <div className={`mt-4 p-3 rounded-2xl border text-sm font-bold ${w.notCalculated ? 'bg-red-50 border-red-300 text-red-800' : 'bg-zinc-50 border-zinc-200'}`}>
                    {w.lengthsText || 'No length text'}
                    {w.sides.length ? <div className="mt-2 font-medium space-y-0.5">{w.sides.map((s) => <div key={s.side}>{s.label} side{s.high ? ' (high tension)' : s.low ? ' (low tension)' : ''}: {s.count} spokes{s.lengthMm ? `, ${s.lengthMm} mm` : ''}{s.colors ? `, ${s.colors}` : ''}</div>)}</div> : null}
                    {w.lengthsCaveat ? <div className="mt-2 font-medium text-amber-800">{w.lengthsCaveat}</div> : null}
                    {w.sourceText ? <div className="mt-2 text-xs font-medium text-zinc-500">{w.sourceText}</div> : null}
                  </div>
                  {w.supplied ? <p className="mt-3 text-sm text-blue-800 font-bold">{w.supplied}</p> : null}
                  {w.warnings.length ? <ul className="mt-3 list-disc ml-5 text-sm text-amber-800">{w.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
                </div>
                <div className="os-images flex flex-wrap gap-4">
                  {w.images.length === 0 ? <p className="text-sm text-zinc-400">No pictures for this wheel.</p> : null}
                  {w.images.map((im) => { const st = images[`${im.wheel}|${im.view}`] || {}; return (
                    <figure key={im.view} className="w-56" data-image={`${im.wheel}-${im.view}`}>
                      {st.url ? <img src={st.url} alt={im.caption} className="w-56 border border-zinc-200 rounded-xl" /> : <div className="w-56 h-56 border border-dashed border-zinc-300 rounded-xl flex items-center justify-center text-xs text-center p-3 text-zinc-500">{st.error ? st.error : (st.loading ? 'Loading picture...' : 'Waiting...')}</div>}
                      <figcaption className="text-xs text-zinc-500 mt-1">{im.caption}</figcaption>
                    </figure>); })}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div>
                  <h4 className="font-black uppercase text-xs mb-2">Per-spoke list ({w.spokes.length})</h4>
                  <table className="os-spoke-table text-sm w-full border-collapse"><thead><tr className="text-left text-zinc-500 border-b"><th className="py-1 pr-3">Spoke</th><th className="pr-3">Side</th><th>Color</th></tr></thead>
                    <tbody>{w.spokes.map((sp) => <tr key={sp.text + sp.side} className="border-b border-zinc-100"><td className="py-0.5 pr-3 font-bold">{sp.text}</td><td className="pr-3">{sp.sideLabel}{sp.high ? ' (high)' : ''}</td><td>{sp.color}</td></tr>)}</tbody></table>
                </div>
                <div className="text-sm space-y-4">
                  {w.lists.map((l) => <div key={l.side}><h4 className="font-black uppercase text-xs mb-1">{l.label}</h4><p>{l.items.map((i) => `${i.text} ${i.color}`).join(', ')}</p></div>)}
                </div>
              </div>
            </section>
          ))}

          {view.i9 ? (
            <section className="bg-white rounded-3xl border border-zinc-200 p-6 text-sm">
              <h3 className="text-xl font-black italic uppercase mb-3">I9 order list</h3>
              <pre className="whitespace-pre-wrap font-mono text-xs bg-zinc-50 border border-zinc-200 rounded-2xl p-4">{view.i9.text}</pre>
              {view.i9.linkUrl ? <p className="mt-3 no-print"><a href={view.i9.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-black underline"><ExternalLink size={14} />Open I9 cart link</a> <span className="text-zinc-500">({view.i9.linkAdds}) - opens in your own browser, nothing is added automatically</span></p> : null}
              {view.i9.thomasText ? <p className="mt-3"><strong>Text for the dealer desk:</strong> {view.i9.thomasText}</p> : null}
              {view.i9.snapshotDate ? <p className="mt-2 text-xs text-zinc-500">I9 dealer list snapshot: {view.i9.snapshotDate}</p> : null}
            </section>
          ) : null}

          {view.chartSources.length ? <p className="text-xs text-zinc-500">Chart source: {view.chartSources.join(' | ')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
