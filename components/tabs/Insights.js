import React from 'react';
import { RefreshCcw, Activity, History, Search, Plus, Settings, X, ShieldAlert, ChevronDown, Info, ExternalLink, Loader2, AlertCircle, Clock, ShieldCheck, Layers, FileDown, Eye, CheckCircle2, Copy, Play, ArrowDownToLine, GitMerge, FileUp, Save, UploadCloud, FileEdit, HelpCircle } from 'lucide-react';

export default function Insights(props) {
  const { runManualAuditReport, loading, Activity, abandonedBuilds, rules, History, fetchAbandonedBuilds, insightsLoading } = props;

  return (
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Operational Insights</h1>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1 italic tracking-[0.2em]">Customer Behavior & Catalog Health</p>
                </div>
                <button onClick={runManualAuditReport} disabled={loading} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-lg">
                  <Activity size={14}/> Run Daily Audit & Reports
                </button>
              </div>

              <div className="grid grid-cols-3 gap-8 mb-12">
                 <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Tracked Abandoned Builds</div>
                    <div className="text-5xl font-black italic tracking-tighter">{abandonedBuilds.length}</div>
                    <p className="text-[10px] text-zinc-400 mt-2">Captured in the last 24 hours</p>
                 </div>
                 <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Negative Inventory</div>
                    <div className="text-5xl font-black italic tracking-tighter text-red-500">{rules.filter(r => r.last_availability === false && r.last_price > 0).length}</div>
                    <p className="text-[10px] text-zinc-400 mt-2">Active items with 0 stock</p>
                 </div>
                 <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Catalog Health</div>
                    <div className="text-5xl font-black italic tracking-tighter text-green-500">98%</div>
                    <p className="text-[10px] text-zinc-400 mt-2">Registry Coverage Score</p>
                 </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-zinc-200 shadow-xl overflow-hidden">
                 <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                    <h3 className="font-black uppercase italic tracking-tight flex items-center gap-2"><History size={18}/> Abandoned Build Activity</h3>
                    <button onClick={fetchAbandonedBuilds} className="p-2 text-zinc-400 hover:text-black transition-colors"><RefreshCcw size={16} className={insightsLoading ? 'animate-spin' : ''}/></button>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                       <thead>
                          <tr className="border-b border-zinc-100 italic">
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Time</th>
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Build Type</th>
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Customer</th>
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Subtotal</th>
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Components</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-zinc-50">
                          {abandonedBuilds.length === 0 ? (
                             <tr><td colSpan="5" className="p-12 text-center text-zinc-400 font-bold italic">No abandoned builds captured recently.</td></tr>
                          ) : abandonedBuilds.map((build, i) => (
                             <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="p-6 text-xs text-zinc-500 font-mono italic">{new Date(build.capturedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                                <td className="p-6"><span className="px-3 py-1 bg-zinc-100 rounded-full text-[10px] font-black uppercase">{build.buildType}</span></td>
                                <td className="p-6">
                                   <div className="text-xs font-bold">{build.visitor?.isLoggedIn ? `${build.visitor.firstName} ${build.visitor.lastName}` : 'Anonymous Visitor'}</div>
                                   <div className="text-[10px] text-zinc-400 font-mono">{build.visitor?.email || build.visitor?.anonymousId?.slice(0,8)}</div>
                                </td>
                                <td className="p-6 text-xs font-black italic">${((build.subtotal || 0)/100).toFixed(2)}</td>
                                <td className="p-6 flex flex-wrap gap-2 max-w-sm">
                                   {(build.components?.front || []).concat(build.components?.rear || []).slice(0,4).map((c, ci) => (
                                      <div key={ci} className="text-[8px] bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded uppercase font-black text-zinc-400">{c.type}: {c.name.slice(0,15)}...</div>
                                   ))}
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
  );
}
