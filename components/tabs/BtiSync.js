import React from 'react';
import { RefreshCcw, Search, Package, X, Activity } from 'lucide-react';

export default function BtiSync(props) {
  const {
    fetchRules, loading, runManualSync, selectedVendors, setSelectedVendors,
    visibleVendorNames, vendorLogos, toggleVendor, setVisibleCount,
    btiSyncFilter, setBtiSyncFilter, btiSearch, setBtiSearch,
    rules, visibleCount, setEditingRule
  } = props;

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">BTI Sync Management</h1>
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1">
            Managing Shopify Metafields for Distributor Integration
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => fetchRules()} className={`bg-blue-50 text-blue-700 p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 border border-blue-100 shadow-sm hover:bg-blue-100 transition-all ${loading ? 'opacity-50' : ''}`} disabled={loading}>
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> Distributor Feed Active
          </button>
          <button onClick={runManualSync} disabled={loading} title="Forces an immediate scrape to synchronize all prices and inventory with Distributor sites" className="bg-orange-500 text-white p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-orange-600 transition-all shadow-lg">
             <Activity size={14} /> Run Live Sync
          </button>
        </div>
      </div>

      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Filter by Vendor</label>
          {selectedVendors.length > 0 && (
            <button onClick={() => setSelectedVendors([])} className="text-[10px] font-black uppercase text-red-500 hover:text-red-700 transition-all underline underline-offset-4">
              Clear Filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-8">
          <button 
            onClick={() => setSelectedVendors([])} 
            className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${selectedVendors.length === 0 ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
          >
            All Vendors
          </button>
          {visibleVendorNames.map(v => {
            const logo = vendorLogos.find(l => l.name.toLowerCase() === v.toLowerCase());
            const isActive = selectedVendors.includes(v);
            return (
              <button key={v} onClick={() => { toggleVendor(v); setVisibleCount(50); }} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all ${isActive ? 'border-green-500 bg-green-50 text-green-900 shadow-sm scale-[1.02]' : 'bg-white text-zinc-500 border-zinc-100 hover:border-zinc-300'}`}>
                {logo?.logo_url && <img src={logo.logo_url} className="h-3 w-auto object-contain grayscale-[0.5]" alt="" />}
                <span className="text-[10px] font-bold uppercase tracking-tight">{v}</span>
                <div className={`w-2 h-2 rounded-full border ${isActive ? 'bg-green-500 border-green-600' : 'bg-zinc-100 border-zinc-200'}`}></div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mb-4 mt-10">
          <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Metafield Assignment Filter</label>
        </div>
        <div className="flex items-center justify-between mb-8">
          <div className="flex flex-wrap gap-2 flex-1">
            <button 
              onClick={() => setBtiSyncFilter('all')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${btiSyncFilter === 'all' ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
              All Products
            </button>
            <button 
              onClick={() => setBtiSyncFilter('has')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${btiSyncFilter === 'has' ? 'bg-blue-600 text-white border-blue-700 shadow-lg shadow-blue-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
              <Package size={14} /> Managed (Has BTI #)
            </button>
            <button 
              onClick={() => setBtiSyncFilter('none')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${btiSyncFilter === 'none' ? 'bg-zinc-600 text-white border-zinc-700 shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
              <RefreshCcw size={14} /> Unassigned (No BTI #)
            </button>
          </div>
          <div className="relative flex-shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
            <input type="text" placeholder="Search BTI items..." value={btiSearch} onChange={(e) => setBtiSearch(e.target.value)} className="pl-9 pr-8 py-2 w-52 rounded-xl border-2 border-zinc-100 text-xs font-bold outline-none focus:border-black transition-all placeholder:text-zinc-300 placeholder:font-bold placeholder:italic" />
            {btiSearch && <button onClick={() => setBtiSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600"><X size={12} /></button>}
          </div>
        </div>
      </div>

      {(() => {
        const filteredRules = rules.filter(rule => {
          const matchesVendor = selectedVendors.length === 0 || selectedVendors.includes(rule.vendor_name);
          const matchesSyncFilter = btiSyncFilter === 'all' || (btiSyncFilter === 'has' ? !!rule.bti_part_number : !rule.bti_part_number);
          const searchMatch = !btiSearch || rule.title.toLowerCase().includes(btiSearch.toLowerCase()) || (rule.bti_part_number && rule.bti_part_number.toLowerCase().includes(btiSearch.toLowerCase()));
          return matchesVendor && matchesSyncFilter && searchMatch;
        }).sort((a, b) => a.title.localeCompare(b.title));

        return (
          <div className="bg-white rounded-[2.5rem] border border-zinc-200 shadow-xl overflow-hidden mb-12">
            <table className="w-full text-left border-collapse">
              <thead className="bg-zinc-100 border-b text-[10px] uppercase font-black text-zinc-500 tracking-widest font-mono">
                <tr>
                  <th className="p-6 italic tracking-tighter">Product / Variant</th>
                  <th className="p-6 italic tracking-tighter">BTI Part Number</th>
                  <th className="p-6 italic tracking-tighter text-center">Status</th>
                  <th className="p-6 italic tracking-tighter text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredRules.slice(0, visibleCount).map((rule) => {
                  const isBTI = !!rule.bti_part_number;
                  return (
                    <tr key={rule.id} className={`group transition-all hover:bg-zinc-50/50 ${isBTI ? 'bg-blue-50/30' : 'bg-white'}`}>
                      <td className="p-6">
                        <div className="font-black text-sm text-zinc-900 group-hover:text-black transition-colors">{rule.title}</div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight mt-0.5">{rule.vendor_name}</div>
                      </td>
                      <td className="p-6">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border font-mono font-bold text-xs ${isBTI ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-zinc-100 text-zinc-400 border-zinc-200 italic'}`}>
                           {rule.bti_part_number || 'none_assigned'}
                        </div>
                      </td>
                      <td className="p-6 text-center">
                         {isBTI ? (
                           <span className="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase italic whitespace-nowrap">Distributor Sync Active</span>
                         ) : (
                           <span className="bg-zinc-100 text-zinc-400 text-[9px] font-black px-3 py-1 rounded-full uppercase italic whitespace-nowrap">Manual Inventory Only</span>
                         )}
                      </td>
                      <td className="p-6 text-right">
                         <button onClick={() => setEditingRule(rule)} className="bg-white hover:bg-black hover:text-white text-zinc-600 border border-zinc-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm">Manage BTI Settings</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredRules.length > visibleCount && (
              <div className="p-12 text-center bg-zinc-50 border-t border-zinc-100">
                  <button onClick={() => setVisibleCount(visibleCount + 100)} className="bg-white border-2 border-zinc-200 px-8 py-4 rounded-2xl font-black uppercase italic text-xs hover:border-black transition-all shadow-sm">Load More ({filteredRules.length - visibleCount} remaining)</button>
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
