import React from 'react';
import { RefreshCcw, Search, Package, X, Info, Loader2, Zap, ZapOff, DollarSign, Tag, Trash2, ShieldAlert, AlertCircle, CheckCircle, Edit } from 'lucide-react';

export default function VendorWatcher(props) {
  const { 
    filteredRules, rules, handleAutoImport, loading, runManualSync, fetchRules, 
    selectedVendors, setSelectedVendors, visibleVendorNames, vendorLogos, 
    toggleVendor, setVisibleCount, syncFilter, setSyncFilter, registrySearch, 
    setRegistrySearch, selectedRules, setSelectedRules, bulkSetAutoSync, 
    bulkSetPriceAdjust, bulkSetCompareAt, runSelectiveSync, setShowBulkEditModal, 
    bulkDelete, bulkIgnore, paginatedRules, handleCheckboxClick, toggleAutoSync, 
    setEditingRule, deleteRule, visibleCount
  } = props;

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Registry</h1>
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1">
            Viewing {filteredRules.length} of {rules.length} Total Registry Items
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleAutoImport} disabled={loading} title="Finds unmonitored vendor products on Shopify and pulls them into the system" className="bg-zinc-200 text-zinc-800 p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-zinc-300 transition-all disabled:opacity-50 shadow-sm">
            {loading ? <Loader2 className="animate-spin" size={14} /> : <Package size={14} />} Auto Import
          </button>

          <button onClick={runManualSync} disabled={loading} title="Forces an immediate scrape to synchronize all prices and inventory with Distributor sites" className="bg-orange-500 text-white p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-orange-600 transition-all shadow-lg">
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Run Live Sync
          </button>

          <button onClick={() => fetchRules()} title="Downloads the latest state from your central Supabase dashboard" className="bg-white border-2 border-zinc-200 p-3 px-4 rounded-xl hover:border-black transition-all shadow-sm text-zinc-400">
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
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
      </div>
      
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Auto-Update Filter</label>
        </div>
        <div className="flex items-center gap-2 mb-8">
          <div className="flex flex-wrap gap-2 flex-1 items-center">
            <button 
              onClick={() => setSyncFilter('all')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${syncFilter === 'all' ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
              All Items
            </button>
            <button 
              onClick={() => setSyncFilter('on')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'on' ? 'bg-green-600 text-white border-green-700 shadow-lg shadow-green-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
              <Zap size={14} /> Syncing (True)
            </button>
            <button 
              onClick={() => setSyncFilter('off')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'off' ? 'bg-zinc-600 text-white border-zinc-700 shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
              <ZapOff size={14} /> Paused (False)
            </button>
            <button 
              onClick={() => setSyncFilter('sale')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'sale' ? 'bg-amber-500 text-white border-amber-500/30 shadow-lg shadow-amber-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
                Drastic Sales (10%+)
            </button>
            <button 
              onClick={() => setSyncFilter('oos')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'oos' ? 'bg-red-600 text-white border-red-700 shadow-lg shadow-red-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
                <AlertCircle size={14} /> Out of Stock
            </button>
            <button 
              onClick={() => setSyncFilter('review')} 
              className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'review' ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg shadow-indigo-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
            >
                <AlertCircle size={14} /> Review Required
            </button>
          </div>
          <div className="relative flex-shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
            <input type="text" placeholder="Search Registries..." value={registrySearch} onChange={(e) => setRegistrySearch(e.target.value)} className="pl-9 pr-8 py-2 w-52 rounded-xl border-2 border-zinc-100 text-xs font-bold outline-none focus:border-black transition-all placeholder:text-zinc-300 placeholder:font-bold placeholder:italic" />
            {registrySearch && <button onClick={() => setRegistrySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600"><X size={12} /></button>}
          </div>
        </div>
      </div>

      {selectedRules.length > 0 && (
        <div className="fixed bottom-6 left-[calc(16rem+1.5rem)] right-6 z-50 bg-black text-white p-4 rounded-[1.5rem] flex items-center justify-between shadow-2xl border border-zinc-800" style={{animation: 'slideUp 0.3s ease-out'}}>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setSelectedRules([])} className="text-zinc-500 hover:text-white transition-colors"><X size={16} /></button>
            <div className="font-bold text-sm tracking-widest uppercase italic border-r border-zinc-800 pr-6 mr-1">
              {selectedRules.length} Selected
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <button onClick={() => bulkSetAutoSync(true)} className="flex items-center gap-2 text-[10px] font-black uppercase text-green-400 hover:text-green-300 transition-colors bg-green-950/30 px-3 py-2 rounded-xl"><Zap size={14} /> Enable Auto-Sync</button>
            <button onClick={() => bulkSetAutoSync(false)} className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-400 hover:text-white transition-colors bg-zinc-900 px-3 py-2 rounded-xl"><ZapOff size={14} /> Disable Auto-Sync</button>
            <div className="w-px h-6 bg-zinc-800 hidden sm:block"></div>
            <button onClick={bulkSetPriceAdjust} className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors bg-blue-950/30 px-3 py-2 rounded-xl"><DollarSign size={14} /> Set Price Adjust</button>
            <button onClick={bulkSetCompareAt} className="flex items-center gap-2 text-[10px] font-black uppercase text-purple-400 hover:text-purple-300 transition-colors bg-purple-950/30 px-3 py-2 rounded-xl"><Tag size={14} /> Set Compare-At → Base</button>
            <div className="w-px h-6 bg-zinc-800 hidden sm:block"></div>
            <button onClick={() => runSelectiveSync(selectedRules)} className="flex items-center gap-2 text-[10px] font-black uppercase text-white hover:text-green-400 transition-colors bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-700"><RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> Sync Selected Items</button>
            <div className="w-px h-6 bg-zinc-800 hidden sm:block"></div>
            <button onClick={() => setShowBulkEditModal(true)} className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-400 hover:text-amber-300 transition-colors bg-amber-950/30 px-3 py-2 rounded-xl"><Edit size={14} /> Mass Edit URL</button>
            <div className="w-px h-6 bg-zinc-800 hidden sm:block"></div>
            <button onClick={bulkDelete} className="flex items-center gap-2 text-[10px] font-black uppercase text-red-500/60 hover:text-red-400 transition-colors px-3 py-2"><Trash2 size={14} /> Delete Selected</button>
            <button onClick={bulkIgnore} className="flex items-center gap-2 text-[10px] font-black uppercase text-white hover:text-red-400 transition-colors bg-red-600 px-3 py-2 rounded-xl"><ShieldAlert size={14} /> Ignore & Purge Product(s)</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-sm border border-zinc-200 overflow-hidden text-sm">
        <table className="w-full text-left">
          <thead className="bg-zinc-100 border-b text-[10px] uppercase font-black text-zinc-500 tracking-widest font-mono">
            <tr>
              <th className="p-6 pr-0 w-4">
                <input type="checkbox" className="w-4 h-4 rounded text-black focus:ring-black cursor-pointer" onChange={(e) => {
                  if (e.target.checked) setSelectedRules(filteredRules.map(r => r.id));
                  else setSelectedRules([]);
                }} checked={selectedRules.length === filteredRules.length && filteredRules.length > 0} />
              </th>
              <th className="p-6 italic tracking-tighter">
                <div className="flex items-center gap-2">
                  Registry Item
                  <div className="group/legend relative">
                    <Info size={12} className="text-zinc-300 hover:text-zinc-600 transition-colors cursor-help" />
                    <div className="absolute left-0 top-full mt-2 hidden group-hover/legend:block w-72 bg-black text-white text-[10px] p-4 rounded-xl z-50 shadow-2xl border border-zinc-700 leading-relaxed">
                      <div className="text-zinc-400 mb-2 uppercase font-black tracking-widest">Row Color Legend</div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500/30 border border-red-400"></div> Review Required — margin safety triggered</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-200 border border-amber-400"></div> Drastic Sale — vendor price 10%+ below MSRP</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-600 border border-blue-700"></div> BTI Active — inventory deferred to BTI</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-50 border border-red-200"></div> Missing URL — no vendor URL mapped</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-zinc-200 border border-zinc-300"></div> Selected — currently checked</div>
                        <div className="border-t border-zinc-700 my-2"></div>
                        <div className="text-zinc-400 mb-1 uppercase font-black tracking-widest">Status Pills</div>
                        <div className="flex items-center gap-2"><span className="bg-green-100 text-green-700 text-[8px] px-2 py-0.5 rounded-full font-black">ACTIVE</span> Vendor shows in stock</div>
                        <div className="flex items-center gap-2"><span className="bg-red-100 text-red-600 text-[8px] px-2 py-0.5 rounded-full font-black">OUT OF STOCK</span> Vendor shows unavailable</div>
                        <div className="flex items-center gap-2"><span className="bg-red-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black">REVIEW</span> Needs manual review</div>
                        <div className="border-t border-zinc-700 my-2"></div>
                        <div className="text-zinc-400 mb-1 uppercase font-black tracking-widest">Price Columns</div>
                        <div>Current (Shopify) shows <span className="text-red-400">red</span> when it doesn't match the Adjusted Price</div>
                      </div>
                    </div>
                  </div>
                </div>
              </th>
              <th className="p-6 text-center whitespace-nowrap" title="BTI status relative to inventory monitoring">Dist. Status</th>
              <th className="p-6 text-center" title="Whether BTI is currently governing inventory for this variant">BTI</th>
              <th className="p-6" title="The highest detected MSRP or High-Water-Mark price from the vendor.">Memory (Base)</th>
              <th className="p-6" title="Target price based on Adjustment Factor (e.g. 0.99 = 1% discount).">Adjusted Price</th>
              <th className="p-6" title="Live price on your Shopify store. Red indicates a mismatch with Adjusted Price.">Current (Shopify)</th>
              <th className="p-6" title="The 'Was' price on Shopify. Should be >= Adjusted Price to show a sale badge.">Compare-At (Shopify)</th>
              <th className="p-6 text-right" title="Automation controls and row actions.">Auto-Sync / Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {paginatedRules.map((rule) => {
              const isMissingUrl = !rule.vendor_url;
              const expectedPriceText = rule.last_price ? ((rule.last_price / 100) * (rule.price_adjustment_factor || 1.0)).toFixed(2) : '--';
              const shopifyPriceText = rule.current_shopify_price ? (rule.current_shopify_price / 100).toFixed(2) : '--';
              const priceMismatch = expectedPriceText !== '--' && shopifyPriceText !== '--' && expectedPriceText !== shopifyPriceText;
              
              const dynamicMsrp = rule.original_msrp || (rule.current_compare_at_price ? rule.current_compare_at_price / 100 : null);
              const isDeepSale = dynamicMsrp && (dynamicMsrp - (rule.last_price / 100)) / dynamicMsrp >= 0.10;

              return (
                <tr key={rule.id} className={`${rule.needs_review ? 'bg-red-500/20 shadow-inner' : isDeepSale ? 'bg-amber-100/60 hover:bg-amber-100 shadow-sm shadow-amber-500/10 border-l-4 border-l-amber-500' : rule.bti_part_number ? 'bg-blue-50/70 hover:bg-blue-100' : isMissingUrl ? 'bg-red-50/50' : selectedRules.includes(rule.id) ? 'bg-zinc-100 shadow-inner' : 'hover:bg-zinc-50'} transition-colors group cursor-pointer`} onClick={(e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'DIV') { const idx = paginatedRules.findIndex(r => r.id === rule.id); handleCheckboxClick(idx, rule.id, e); }}}>
                  <td className="p-6 pr-0" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="w-4 h-4 rounded text-black focus:ring-black cursor-pointer pointer-events-auto" checked={selectedRules.includes(rule.id)} onClick={(e) => { const idx = paginatedRules.findIndex(r => r.id === rule.id); handleCheckboxClick(idx, rule.id, e); }} onChange={() => {}} />
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-2"><div className="font-bold text-zinc-900 text-base">{rule.title}</div>
                    {rule.last_log && <div className="group/log relative pointer-events-auto"><Info size={14} className="text-zinc-300 hover:text-black transition-colors cursor-help" /><div className="absolute left-0 bottom-full mb-2 hidden group-hover/log:block w-64 bg-black text-white text-[10px] p-3 rounded-xl z-50 shadow-2xl font-mono leading-relaxed border border-zinc-800"><div className="text-zinc-500 mb-1 uppercase font-black font-sans tracking-widest">System Log:</div>{rule.last_log}</div></div>}</div>
                    <div className="text-[10px] text-zinc-400 font-mono mt-1 truncate max-w-sm flex items-center gap-2">
                        {isMissingUrl && <AlertCircle size={10} className="text-red-400"/>}
                        {rule.vendor_url || 'No URL mapped - Action Required'}
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    {rule.needs_review ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-full animate-pulse uppercase tracking-tighter whitespace-nowrap">Review Required</span>
                        {rule.review_reason && (
                          <div className="group/reason relative flex flex-col items-center cursor-help pointer-events-auto">
                            <span className="text-[10px] font-mono text-red-500 font-bold uppercase truncate max-w-[160px]">
                              {rule.review_reason}
                            </span>
                            <div className="absolute bottom-full mb-2 hidden group-hover/reason:block w-max max-w-[280px] bg-black text-white text-[11px] p-3 rounded-xl z-50 shadow-2xl font-mono leading-relaxed border border-red-900/50 whitespace-normal text-left">
                              <div className="text-red-500 mb-1 uppercase font-black font-sans tracking-widest text-[9px]">Review Reason:</div>
                              {rule.review_reason}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : rule.last_availability ? (
                      <span className="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase italic whitespace-nowrap">Active</span>
                    ) : (
                      <span className="bg-red-100 text-red-600 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter whitespace-nowrap">Out of Stock</span>
                    )}
                  </td>
                  <td className="p-6 text-center text-xs">
                    {rule.bti_inventory_active ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase italic shadow-sm">BTI Active</span>
                        {rule.bti_part_number && <span className="text-[7px] font-mono text-blue-400 font-bold">{rule.bti_part_number}</span>}
                      </div>
                    ) : rule.bti_part_number ? (
                      <div className="flex flex-col items-center gap-1 opacity-60">
                        <span className="bg-zinc-100 text-zinc-500 text-[8px] font-black px-2 py-0.5 rounded-full uppercase italic border border-zinc-200">Linked</span>
                        <span className="text-[7px] font-mono text-zinc-400 font-bold">{rule.bti_part_number}</span>
                      </div>
                    ) : (
                      <span className="text-zinc-200 text-[10px] font-bold">—</span>
                    )}
                  </td>
                  <td className="p-6 font-mono font-bold text-lg text-zinc-700">
                    {rule.last_price ? `$${(rule.last_price / 100).toFixed(2)}` : '--'}
                  </td>
                  <td className="p-6 font-mono font-bold text-lg text-blue-600">
                    {expectedPriceText !== '--' ? `$${expectedPriceText}` : '--'}
                  </td>
                  <td className="p-6 font-mono font-bold text-lg">
                    {shopifyPriceText !== '--' ? (
                      <div className={priceMismatch ? "text-red-700 bg-red-50 inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-red-200 shadow-sm" : "text-zinc-600 px-3 py-1"}>
                          ${shopifyPriceText}
                          {priceMismatch && (
                            <div className="group/price relative inline-block ml-1">
                              <AlertCircle size={14} className="hover:text-red-900 transition-colors cursor-help" />
                              <div className="absolute right-0 bottom-full mb-2 hidden group-hover/price:block w-48 bg-black text-white text-[10px] p-2.5 rounded-xl z-50 shadow-2xl leading-relaxed font-sans font-normal border border-zinc-800">
                                <div className="text-zinc-400 mb-1 uppercase font-black tracking-widest">Price Mismatch</div>
                                The price in Shopify does not match the computed Adjusted Price (${expectedPriceText}).
                              </div>
                            </div>
                          )}
                      </div>
                    ) : '--'}
                  </td>
                  <td className="p-6 font-mono font-bold text-lg text-zinc-400">
                    {rule.current_compare_at_price ? `$${(rule.current_compare_at_price / 100).toFixed(2)}` : '--'}
                  </td>
                    <td className="p-6 flex justify-end items-center gap-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
                      <button onClick={() => runSelectiveSync([rule.id])} title="Sync this item now" className="p-2 bg-zinc-100 hover:bg-black hover:text-white text-zinc-400 rounded-lg transition-all"><RefreshCcw size={14} /></button>
                      <button onClick={() => toggleAutoSync(rule.id, rule.auto_update)} className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${rule.auto_update ? 'bg-black justify-end shadow-inner' : 'bg-zinc-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md"></div></button>
                      <button onClick={() => setEditingRule(rule)} className="bg-zinc-100 hover:bg-black hover:text-white text-zinc-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all">Edit</button>
                    <button onClick={() => deleteRule(rule.id)} className="text-zinc-300 hover:text-red-500 transition-colors "><Trash2 size={18} /></button>
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
    </>
  );
}
