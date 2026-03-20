import React, { useState, useEffect, useRef } from 'react';
import { RefreshCcw, Search, Package, ShieldCheck, ShieldAlert, Plus, X, Info, Image as ImageIcon, Loader2, LogOut, ChevronUp, Trash2, AlertCircle, Zap, ZapOff, DollarSign, Tag } from 'lucide-react';

export default function OpsDashboard() {
  const [editingRule, setEditingRule] = useState(null);
  const [activeTab, setActiveTab] = useState('vendors');
  const [rules, setRules] = useState([]);
  const [vendorLogos, setVendorLogos] = useState([]);
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState([]); 
  const [registrySearch, setRegistrySearch] = useState(''); 
  const [syncFilter, setSyncFilter] = useState('all'); 
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedRules, setSelectedRules] = useState([]);
  const lastCheckedIndex = useRef(null);

  const handleCheckboxClick = (index, ruleId, e) => {
    if (e.shiftKey && lastCheckedIndex.current !== null && lastCheckedIndex.current !== index) {
      const start = Math.min(lastCheckedIndex.current, index);
      const end = Math.max(lastCheckedIndex.current, index);
      const rangeIds = paginatedRules.slice(start, end + 1).map(r => r.id);
      setSelectedRules(prev => {
        const combined = new Set([...prev, ...rangeIds]);
        return [...combined];
      });
    } else {
      setSelectedRules(prev =>
        prev.includes(ruleId) ? prev.filter(id => id !== ruleId) : [...prev, ruleId]
      );
    }
    lastCheckedIndex.current = index;
  };

  useEffect(() => {
    const savedPass = localStorage.getItem('loam_ops_auth');
    if (savedPass) { setPassword(savedPass); fetchRules(savedPass); }
  }, []);

  const fetchRules = async (passToUse) => {
    const auth = passToUse || password;
    if (!auth) return;
    setLoading(true);
    try {
      const res = await fetch('/api/get-rules', { headers: { 'x-dashboard-auth': auth } });
      if (res.ok) { 
        const data = await res.json();
        setRules(data || []);
        localStorage.setItem('loam_ops_auth', auth);
        const logoRes = await fetch('/api/get-logos', { headers: { 'x-dashboard-auth': auth } });
        const logoData = await logoRes.json();
        setVendorLogos(logoData.savedLogos || []);
        setIsAuthorized(true); 
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const updateRule = async (id, updates) => {
    setLoading(true);
    try {
      const res = await fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates })
      });
      if (res.ok) {
        setEditingRule(null);
        fetchRules();
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const deleteRule = async (id) => {
    if (!confirm("⚠️ PERMANENT ACTION: Remove this item from the Registry?")) return;
    await fetch('/api/delete-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
      body: JSON.stringify({ id })
    });
    fetchRules();
  };

  const toggleAutoSync = async (id, currentState) => {
    await fetch('/api/update-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
      body: JSON.stringify({ id, updates: { auto_update: !currentState } })
    });
    fetchRules();
  };

  const bulkSetAutoSync = async (state) => {
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates: { auto_update: state } })
      })));
      fetchRules();
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkDelete = async () => {
    if (!confirm(`⚠️ PERMANENT ACTION: Delete ${selectedRules.length} items from the Registry?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/delete-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id })
      })));
      setSelectedRules([]);
      fetchRules();
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkIgnore = async () => {
    if (!confirm(`⚠️ PERMANENT DESTRUCTIVE ACTION: Do you want to tag these ${selectedRules.length} items to be permanently ignored in Shopify and purged from this Registry?`)) return;
    setLoading(true);
    try {
      const productIds = [...new Set(selectedRules.map(id => rules.find(r => r.id === id)?.shopify_product_id).filter(Boolean))];
      await fetch('/api/ignore-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ product_ids: productIds })
      });
      setSelectedRules([]);
      fetchRules();
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkSetPriceAdjust = async () => {
    const input = prompt(`Set Price Adjustment Factor for ${selectedRules.length} selected items.\n\nExamples: 0.95 = 5% discount, 0.99 = 1% discount, 1.0 = vendor MSRP\n\nEnter new factor:`);
    if (!input) return;
    const factor = parseFloat(input);
    if (isNaN(factor) || factor <= 0 || factor > 2) { alert('Invalid factor. Must be between 0.01 and 2.0.'); return; }
    if (!confirm(`Apply factor ${factor} to ${selectedRules.length} items?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates: { price_adjustment_factor: factor } })
      })));
      alert(`Price adjustment set to ${factor} for ${selectedRules.length} items.`);
      fetchRules();
    } catch(e) { console.error(e); alert('Error updating price adjustment.'); }
    setLoading(false);
  };

  const bulkSetCompareAt = async () => {
    if (!confirm(`Set Shopify Compare-At price to the Memory (Base) price for ${selectedRules.length} selected items?\n\nThis writes directly to your Shopify store.`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/bulk-compare-at', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ ruleIds: selectedRules })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Done! ${data.updated} variants updated.${data.errors > 0 ? ` ${data.errors} errors.` : ''}`);
        fetchRules();
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch(e) { console.error(e); alert('Network error.'); }
    setLoading(false);
  };

  const handleAutoImport = async () => {
    const input = prompt("Enter Vendor Name ('Berd'), a specific Shopify Product ID ('7615286575192'), or 'ALL' for a full scan:");
    if (!input) return;

    setLoading(true);
    try {
      const isAll = input.toUpperCase() === 'ALL';
      const isProductId = /^\d+$/.test(input.trim());
      
      const payload = {
        vendor: (!isAll && !isProductId) ? input.trim() : null,
        productId: isProductId ? input.trim() : null
      };

      const res = await fetch('/api/import-catalog', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Success: Enrolled ${data.count} variants.`);
        fetchRules(password); 
      } else {
        alert("Import failed: " + (data.error || "Check Vercel Logs"));
      }
    } catch (e) {
      alert("Network Error: Could not reach the server.");
    }
    setLoading(false);
  };

  const runManualSync = async () => {
    if (!confirm("Run live price sync now? This will check all vendors and update Shopify.")) return;
    setLoading(true);
    try {
      const res = await fetch('/api/sync', { 
        // Use the password you used to log in to the dashboard
        headers: { 'x-dashboard-auth': password } 
      });
      if (res.ok) {
        alert("Sync Complete!");
        fetchRules(password);
      } else {
        alert("Sync failed. Error code: " + res.status);
      }
    } catch (e) { alert("Sync failed to connect."); }
    setLoading(false);
  };
  
  const toggleVendor = (name) => {
    setSelectedVendors(prev => 
      prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]
    );
  };

  // 1. Unified variable name to prevent the crash
  const visibleVendorNames = [...new Set(rules.map(r => r.vendor_name).filter(Boolean))].sort();

  // 2. Sorting: Alphabetical by Vendor, then by Product Title
  const filteredRules = rules.filter(r => {
    if (!r) return false;
    const normalize = (str) => String(str || "").toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
    const vendorMatch = selectedVendors.length === 0 || 
      selectedVendors.some(v => normalize(v) === normalize(r.vendor_name));
    
    // Safety check for title search
    const searchString = normalize(registrySearch);
    const searchMatch = !searchString || normalize(r.title).includes(searchString);
    
    // Safety check for sync filter
    let syncMatch = true;
    const isDeepSale = r.original_msrp && (r.original_msrp - (r.last_price / 100)) / r.original_msrp >= 0.10;

    if (syncFilter === 'on') syncMatch = r.auto_update === true;
    if (syncFilter === 'off') syncMatch = r.auto_update === false;
    if (syncFilter === 'sale') syncMatch = isDeepSale;
    if (syncFilter === 'oos') syncMatch = r.last_availability === false;
    
    return vendorMatch && searchMatch && syncMatch;
  }).sort((a, b) => {
    const vendorA = String(a.vendor_name || "");
    const vendorB = String(b.vendor_name || "");
    const vendorSort = vendorA.localeCompare(vendorB);
    if (vendorSort !== 0) return vendorSort;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  const paginatedRules = filteredRules.slice(0, visibleCount);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white font-sans">
        <div className="max-w-md w-full text-center">
          <div className="h-20 mb-12 flex justify-center"><img src="/logo.png" alt="LoamLabs" className="h-full object-contain" /></div>
          <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-800 shadow-2xl">
            <input type="password" placeholder={loading ? "VERIFYING..." : "ACCESS KEY"} className="w-full bg-zinc-950 border border-zinc-700 p-5 rounded-2xl mb-4 text-center text-xl tracking-widest outline-none font-mono" onKeyDown={(e) => e.key === 'Enter' && fetchRules()} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={() => fetchRules()} className="w-full bg-white text-black font-black p-5 rounded-2xl uppercase tracking-tighter hover:scale-[1.02] transition-all flex items-center justify-center gap-2">{loading && <Loader2 className="animate-spin" size={20} />} Start Session</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <aside className="w-64 bg-black text-zinc-400 p-6 hidden md:flex flex-col border-r border-zinc-800 fixed h-full z-20">
        <div className="mb-12">
          <img src="/logo.png" alt="LoamLabs" className="h-10 mb-4 object-contain opacity-100" />
          <div className="font-black italic text-xl text-white tracking-tighter uppercase">Ops Dashboard</div>
        </div>
        <nav className="space-y-1 flex-grow">
          <SidebarLink icon={<Package size={18}/>} label="Vendor Watcher" active={activeTab === 'vendors'} onClick={() => setActiveTab('vendors')} />
          <SidebarLink icon={<ShieldCheck size={18}/>} label="Shop Health" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} />
          <SidebarLink icon={<ImageIcon size={18}/>} label="Branding" active={false} onClick={() => window.location.href = '/logos'} />
        </nav>
        <div className="relative mt-auto border-t border-zinc-800 pt-6">
           {showUserMenu && (
             <div className="absolute bottom-full left-0 w-full mb-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
                <button onClick={() => { localStorage.removeItem('loam_ops_auth'); window.location.reload(); }} className="w-full p-4 flex items-center gap-3 text-red-500 hover:bg-red-500/10 font-bold text-xs uppercase transition-all"><LogOut size={16}/> End Session</button>
             </div>
           )}
           <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900 transition-all">
              <div className="flex items-center gap-3 text-white"><div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-black text-xs uppercase">A</div><span className="text-xs font-bold uppercase">Admin</span></div>
              <ChevronUp size={14} className={showUserMenu ? 'rotate-180' : ''}/>
           </button>
        </div>
      </aside>

      <main className="flex-grow ml-64 p-6 md:p-12 overflow-auto min-h-screen">
        
        {activeTab === 'vendors' ? (
          <>
            {/* --- REGISTRY HEADER --- */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Registry</h1>
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                  Viewing {filteredRules.length} of {rules.length} Total Registry Items
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleAutoImport} disabled={loading} className="bg-zinc-200 text-zinc-800 p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-zinc-300 transition-all disabled:opacity-50 shadow-sm">
                  {loading ? <Loader2 className="animate-spin" size={14} /> : <Package size={14} />} Auto Import
                </button>

                <button onClick={runManualSync} disabled={loading} className="bg-orange-500 text-white p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-orange-600 transition-all shadow-lg">
                  <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Run Live Sync
                </button>

                <button onClick={() => fetchRules()} className="bg-white border-2 border-zinc-200 p-3 px-4 rounded-xl hover:border-black transition-all shadow-sm text-zinc-400">
                  <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* --- VENDOR FILTER BAR --- */}
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
            
            {/* --- SYNC CONFIG FILTER BAR --- */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Auto-Update Filter</label>
              </div>
              <div className="flex flex-wrap gap-2 mb-8">
                <button 
                  onClick={() => setSyncFilter('all')} 
                  className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${syncFilter === 'all' ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                >
                  All Items
                </button>
                <button 
                  onClick={() => setSyncFilter('on')} 
                  className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'on' ? 'bg-green-500 text-white border-green-600 shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                >
                  <Zap size={14} className={syncFilter === 'on' ? 'animate-pulse' : ''} /> Active (True)
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
                        if (e.target.checked) setSelectedRules(paginatedRules.map(r => r.id));
                        else setSelectedRules([]);
                      }} checked={selectedRules.length === paginatedRules.length && paginatedRules.length > 0} />
                    </th>
                    <th className="p-6 italic tracking-tighter">Registry Item</th>
                    <th className="p-6 text-center">Status</th>
                    <th className="p-6">Memory (Base)</th>
                    <th className="p-6">Adjusted Price</th>
                    <th className="p-6">Current (Shopify)</th>
                    <th className="p-6">Compare-At (Shopify)</th>
                    <th className="p-6 text-right">Auto-Sync / Actions</th>
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
                          {rule.needs_review ? <span className="bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-full animate-pulse uppercase tracking-tighter">Review Required</span> : rule.last_availability ? <span className="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase italic font-black">Active</span> : <span className="bg-zinc-200 text-zinc-600 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">Out of Stock</span>}
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
                               {priceMismatch && <AlertCircle size={14}/>}
                            </div>
                          ) : '--'}
                        </td>
                        <td className="p-6 font-mono font-bold text-lg text-zinc-400">
                          {rule.current_compare_at_price ? `$${(rule.current_compare_at_price / 100).toFixed(2)}` : '--'}
                        </td>
                        <td className="p-6 flex justify-end items-center gap-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
                          <button onClick={() => toggleAutoSync(rule.id, rule.auto_update)} className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${rule.auto_update ? 'bg-black justify-end shadow-inner' : 'bg-zinc-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md"></div></button>
                          <button onClick={() => setEditingRule(rule)} className="bg-zinc-100 hover:bg-black hover:text-white text-zinc-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all">Edit</button>
                          <button onClick={() => deleteRule(rule.id)} className="text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
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
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic mb-2">Shop Health</h1>
             <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-12">Automated Data Audit & Integrity Engine</p>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <HealthCard title="Missing URLs" count={rules.filter(r => !r.vendor_url).length} subtitle="Items requiring configuration" icon={<AlertCircle className="text-red-500"/>}/>
                <HealthCard title="Missing Metafields" count="--" subtitle="Items lacking engineering data" icon={<Info className="text-blue-500"/>}/>
                <HealthCard title="Sync Conflicts" count={rules.filter(r => r.needs_review).length} subtitle="Margin safety violations" icon={<RefreshCcw className="text-orange-500"/>}/>
             </div>
             <div className="bg-white p-20 rounded-[3rem] border-2 border-dashed border-zinc-200 text-center">
                <ShieldCheck size={60} className="mx-auto text-zinc-200 mb-6"/>
                <h3 className="text-xl font-black uppercase italic">Data Audit in Progress</h3>
                <p className="text-zinc-400 text-sm max-w-xs mx-auto mt-2">Integrating Section 4.11 from Master Notes. Reporting on Negative Inventory coming next.</p>
             </div>
          </div>
        )}

        {editingRule && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden text-sm border border-zinc-800 animate-in fade-in zoom-in-95">
              <div className="p-6 border-b flex justify-between items-center bg-zinc-50">
                <h3 className="text-xl font-black uppercase italic tracking-tighter">Edit Configuration</h3>
                <button onClick={() => setEditingRule(null)}><X size={20}/></button>
              </div>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Internal Title</label>
                  <input type="text" className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.title} onChange={(e) => setEditingRule({...editingRule, title: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Vendor Product URL</label>
                  <input type="text" className="w-full p-4 bg-zinc-100 rounded-xl font-mono text-xs outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.vendor_url || ''} onChange={(e) => setEditingRule({...editingRule, vendor_url: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Price Adjustment</label>
                        <input 
      type="number" 
      step="0.0001" 
      className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" 
      value={editingRule.price_adjustment_factor ?? ''} 
      placeholder="1.0"
      onChange={(e) => setEditingRule({...editingRule, price_adjustment_factor: e.target.value === '' ? null : e.target.value})} 
    />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Safety Threshold</label>
                        <input type="number" step="0.01" className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.price_drop_threshold || 0.20} onChange={(e) => setEditingRule({...editingRule, price_drop_threshold: e.target.value})} />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">OOS Reminder (Days)</label>
                        <input type="number" step="1" min="1" className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.oos_reminder_days ?? 20} onChange={(e) => setEditingRule({...editingRule, oos_reminder_days: parseInt(e.target.value) || 20})} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">OOS Reminder</label>
                        <button onClick={() => setEditingRule({...editingRule, oos_reminder_enabled: !editingRule.oos_reminder_enabled})} className={`w-full p-4 rounded-xl font-black text-sm uppercase transition-all border-2 ${editingRule.oos_reminder_enabled !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-zinc-100 text-zinc-400 border-transparent'}`}>
                            {editingRule.oos_reminder_enabled !== false ? '✓ Enabled' : '✗ Disabled'}
                        </button>
                    </div>
                </div>
                <button onClick={() => updateRule(editingRule.id, editingRule)} className="w-full bg-black text-white font-black p-5 rounded-2xl uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-xl italic">Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function HealthCard({ title, count, subtitle, icon }) {
    return (
        <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100">{icon}</div>
                <div className="text-3xl font-black italic">{count}</div>
            </div>
            <div className="font-black uppercase text-xs mb-1">{title}</div>
            <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">{subtitle}</div>
        </div>
    );
}

function SidebarLink({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-black text-xs uppercase tracking-tight ${active ? 'bg-white text-black shadow-xl scale-[1.03]' : 'hover:bg-zinc-900 text-zinc-600'}`}>
      {icon} {label}
    </button>
  );
}
