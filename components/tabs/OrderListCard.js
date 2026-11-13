import React, { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';

// The I9 order list card (System orders): sections A to E exactly as Backend 1 gives them (sheet.orderList.sections, shaped by buildOrderList in lib/order-sheet-view.js).
// Lengths are shown as given, never recalculated here. The cart link is a normal link the person clicks (new tab); nothing opens or fills it automatically.
const lenText = (mm) => (mm === null || mm === undefined ? 'length not known' : mm + ' mm');
const qtyText = (e) => (e.spare ? e.n + ' + ' + e.spare + ' spare = ' + e.qty : String(e.qty === null ? e.n : e.qty));

// A copy button that says "Copied" for two seconds; the text is copied unchanged (line breaks kept).
export function CopyBtn({ text, label, className = '' }) {
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState(false);
  const go = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setFail(false); setTimeout(() => setDone(false), 2000); } catch (e) { setFail(true); }
  };
  return (
    <button type="button" onClick={go} className={'no-print px-3 py-2 rounded-xl border border-zinc-300 bg-white font-bold text-xs uppercase tracking-widest inline-flex items-center gap-2 ' + className}>
      <Copy size={13} />{done ? 'Copied' : fail ? 'Could not copy' : label}
    </button>
  );
}

function SpokeTable({ sides, showReason }) {
  if (!sides.length) return null;
  return (
    <table className="text-sm w-full border-collapse mt-2">
      <thead><tr className="text-left text-zinc-500 border-b"><th className="py-1 pr-3">Wheel</th><th className="pr-3">Side</th><th className="pr-3">Length</th><th className="pr-3">Color</th><th className="pr-3">Order</th><th>Note</th></tr></thead>
      <tbody>{sides.flatMap((s) => s.entries.map((e, i) => (
        <tr key={s.position + s.side + i} className="border-b border-zinc-100 align-top">
          <td className="py-0.5 pr-3 font-bold">{i === 0 ? s.positionLabel : ''}</td>
          <td className="pr-3">{i === 0 ? s.sideLabel : ''}</td>
          <td className="pr-3">{i === 0 ? lenText(s.lengthMm) : ''}</td>
          <td className="pr-3">{e.color}{s.baseColor && e.color === s.baseColor ? ' (base color)' : ''}</td>
          <td className="pr-3 font-bold">{qtyText(e)}</td>
          <td className="text-xs">
            {e.outOfStock ? <strong className="text-red-700">OUT OF STOCK at I9</strong> : null}
            {showReason && e.reason && e.reason !== 'length' ? <span className="text-amber-800"> {e.reasonText || e.reason}</span> : null}
          </td>
        </tr>
      )))}</tbody>
    </table>
  );
}

export default function OrderListCard({ ol, label }) {
  const noList = !ol.dealer.hasAnything;
  return (
    <section className="os-sec os-ol bg-white rounded-3xl border border-zinc-200 p-6 text-sm" data-testid="order-list">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="os-heading text-xl font-black italic uppercase">I9 order list</h3>
        {ol.text ? <CopyBtn text={ol.text} label="Copy as text" /> : null}
      </div>
      {label ? <p className="text-xs font-bold text-amber-800 mb-3" data-testid="order-list-label">{label}</p> : null}
      <div className="space-y-5">
        <div className="os-keep">
          <h4 className="font-black uppercase text-xs mb-1">{ol.prebuilt.title}</h4>
          {ol.prebuilt.lines.map((l, i) => <p key={i}>{l}</p>)}
          {ol.prebuilt.wheels.length ? <ul className="list-disc ml-5">{ol.prebuilt.wheels.map((w) => <li key={w.position}>{w.positionLabel}: check I9 for a pre-built wheelset{w.color ? ' (' + w.color + ')' : ''}</li>)}</ul> : null}
        </div>

        <div>
          <h4 className="os-heading font-black uppercase text-xs mb-1">{ol.dealer.title}</h4>
          {noList ? <p className="text-zinc-500">No spokes on the dealer list for this order.</p> : null}
          <SpokeTable sides={ol.dealer.sides} />
          {ol.dealer.noLength.length ? <div className="os-keep mt-2 p-3 rounded-2xl border border-red-300 bg-red-50 text-red-800 font-bold">No length for: {ol.dealer.noLength.map((s) => s.positionLabel + ' ' + s.sideLabel).join(', ')}</div> : null}
          {ol.dealer.cart ? (
            <div className="os-keep mt-3 p-3 rounded-2xl border border-zinc-200 bg-zinc-50">
              {ol.cartUrl
                ? <a href={ol.cartUrl} target="_blank" rel="noopener noreferrer" className="no-print inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black text-white font-black text-xs uppercase tracking-widest"><ExternalLink size={14} />Open I9 cart link</a>
                : <p className="font-bold text-amber-800">No safe cart link for this list.</p>}
              {ol.cartAdds ? <p className="mt-2 font-bold">THE LINK ADDS: {ol.cartAdds}</p> : null}
              {ol.dealer.cart.outOfStockItems ? <p className="mt-1 font-bold text-red-700">{ol.dealer.cart.outOfStockItems} line(s) out of stock at I9.</p> : null}
              <p className="mt-1 font-bold">{ol.dealer.checkLine || 'Check the cart against this list before paying.'}</p>
              {ol.cartUrl ? <p className="hidden os-print-only text-xs mt-1 break-all">Cart link: {ol.cartUrl}</p> : null}
            </div>
          ) : null}
        </div>

        {ol.email.sides.length || ol.emailText ? (
          <div>
            <h4 className="os-heading font-black uppercase text-xs mb-1">{ol.email.title}</h4>
            <SpokeTable sides={ol.email.sides} showReason />
            {ol.emailText ? (
              <div className="os-keep mt-3 p-3 rounded-2xl border border-zinc-200 bg-zinc-50">
                <p className="text-xs text-zinc-500 font-bold uppercase mb-1">Ready to send{ol.email.to ? ' to ' + ol.email.to : ''}</p>
                <p className="font-medium" data-testid="email-text">{ol.emailText}</p>
                <div className="mt-2"><CopyBtn text={ol.emailText} label="Copy" /></div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="os-keep">
          <h4 className="font-black uppercase text-xs mb-1">{ol.hubs.title}</h4>
          <ul className="list-disc ml-5">{ol.hubs.wheels.map((w) => <li key={w.position}>{w.positionLabel}: {w.text}{w.customerSupplied ? ' (customer supplied)' : ''}</li>)}</ul>
        </div>
        <div className="os-keep">
          <h4 className="font-black uppercase text-xs mb-1">{ol.rims.title}</h4>
          <ul className="list-disc ml-5">{ol.rims.wheels.map((w) => <li key={w.position}>{w.positionLabel}: {w.text}{w.i9Code ? ' (I9 code ' + w.i9Code + ')' : ''}{w.customerSupplied ? ' (customer supplied)' : ''}</li>)}</ul>
        </div>
      </div>
      {ol.snapshotDate ? <p className="mt-3 text-xs text-zinc-500">I9 dealer list snapshot: {ol.snapshotDate}</p> : null}
    </section>
  );
}
