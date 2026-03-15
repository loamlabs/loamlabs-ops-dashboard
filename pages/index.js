import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, RefreshCcw, Power, Search, Package, ShieldCheck, UserCheck, Plus, X, Info, Image as ImageIcon, Loader2, LogOut, ChevronUp, Trash2 } from 'lucide-react';

export default function OpsDashboard() {
  const [editingRule, setEditingRule] = useState(null);
  const [activeTab, setActiveTab] = useState('vendors');
  const [rules, setRules] = useState([]);
  const [vendorLogos, setVendorLogos] = useState([]);
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterVendor, setFilterVendor] = useState('All');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState([]);
  const [vendorUrl, setVendorUrl] = useState('');
  const [freehubKeyword, setFreehubKeyword] = useState('');

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
        setRules(await res.json());
        localStorage.setItem('loam_ops_auth', auth);
        const logoRes = await fetch('/api/get-logos', { headers: { 'x-dashboard-auth': auth } });
        const logoData = await logoRes.json();
        setVendorLogos(logoData.savedLogos || []);
        setIsAuthorized(true); 
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
  
  const searchShopify = async () => {
    const res = await fetch(`/api/search-products?query=${searchQuery}`);
    setSearchResults(await res.json());
  };

  const handleSave = async () => {
    const newRules = selectedVariants.map(variant => ({
      shopify_product_id: selectedProduct.id.split('/').pop(),
      shopify_variant_id: variant.id.split('/').pop(),
      title: `${selectedProduct.title} - ${variant.title}`,
      vendor_name: selectedProduct.vendor,
      vendor_url: vendorUrl,
      site_type: 'SHOPIFY',
      option_values: { "Spoke Count": variant.title, ...(freehubKeyword && { "Freehub": freehubKeyword }) },
      auto_update: false
    }));
    await fetch('/api/create-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
      body: JSON.stringify({ rules: newRules })
    });
    setShowAddModal(false);
    fetchRules();
  };

  // FIXED VENDOR LOGIC: Gets unique vendors from the registry and checks for hidden status
  const visibleVendorNames = ['All', ...new Set(rules.map(r => r.vendor_name).filter(name => {
    if (!name) return false;
    const logo = vendorLogos.find(l => l.name === name);
    return logo ? !logo.is_hidden : true;
  }))];

  const filteredRules = filterVendor === 'All' ? rules : rules.filter(r => r.vendor_name === filterVendor);

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
             <div className="absolute bottom-full left-0 w-full mb-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2">
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
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Registry</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowAddModal(true)} className="bg-black text-white p-3 px-6 rounded-xl font-bold flex items-center gap-2 shadow-xl hover:bg-zinc-800 transition-all"><Plus size={18} /> Add Component</button>
            <button onClick={() => fetchRules()} className="bg-white border-2 border-zinc-200 p-3 px-4 rounded-xl hover:border-black transition-all shadow-sm"><RefreshCcw size={18} className={loading ? "animate-spin" : ""} /></button>
          </div>
        </div>

        <div className="flex gap-3 mb-8 overflow-x-auto pb-4 no-scrollbar min-h-[50px]">
          {visibleVendorNames.map(v => {
            const logo = vendorLogos.find(l => l.name === v);
            return (
              <button key={v} onClick={() => setFilterVendor(v)} className={`flex items-center gap-3 px-5 py-2 rounded-full border-2 transition-all whitespace-nowrap ${filterVendor === v ? 'bg-black text-white border-black shadow-lg scale-105 font-black' : 'bg-white text-zinc-500 border-zinc-100 hover:border-zinc-300 font-bold'}`}>
                {logo?.logo_url && <img src={logo.logo_url} className="h-4 w-auto object-contain" alt="" />}
                <span className="text-[10px] uppercase tracking-widest">{v}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-[2rem] shadow-sm border border-zinc-200 overflow-hidden text-sm">
          <table className="w-full text-left">
            <thead className="bg-zinc-100 border-b text-[10px] uppercase font-black text-zinc-500 tracking-widest font-mono"><tr className="p-6">
              <th className="p-6 italic tracking-tighter">Registry Item</th>
              <th className="p-6 text-center">Status</th>
              <th className="p-6">Memory</th>
              <th className="p-6 text-right">Auto-Sync / Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className={`${rule.needs_review ? 'bg-red-50' : 'hover:bg-zinc-50'} transition-colors group`}>
                  <td className="p-6">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-zinc-900 text-base">{rule.title}</div>
                      {rule.last_log && (
                        <div className="group relative">
                          <Info size={14} className="text-zinc-300 hover:text-black transition-colors cursor-help" />
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 bg-black text-white text-[10px] p-3 rounded-xl z-50 shadow-2xl font-mono leading-relaxed border border-zinc-800">
                            <div className="text-zinc-500 mb-1 uppercase font-black">Last System Log:</div>
                            {rule.last_log}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono mt-1 truncate max-w-sm">{rule.vendor_url}</div>
                  </td>
                  <td className="p-6 text-center">
                    {rule.needs_review ? <span className="bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-full animate-pulse uppercase tracking-tighter">Review Required</span> : rule.last_availability ? <span className="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase italic font-black">Active</span> : <span className="bg-zinc-200 text-zinc-600 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">Out of Stock</span>}
                  </td>
                  <td className="p-6 font-mono font-bold text-lg text-zinc-700">${(rule.last_price / 100).toFixed(2)}</td>
                  <td className="p-6 flex justify-end items-center gap-6">
                    <button onClick={() => toggleAutoSync(rule.id, rule.auto_update)} className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${rule.auto_update ? 'bg-black justify-end shadow-inner' : 'bg-zinc-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md"></div></button>
                    <button onClick={() => setEditingRule(rule)} className="text-zinc-300 hover:text-black transition-colors"><Plus size={18} className="rotate-45" /></button>
                    <button onClick={() => deleteRule(rule.id)} className="text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden text-sm">
               <div className="p-8 border-b flex justify-between items-center bg-zinc-50"><h3 className="text-2xl font-black tracking-tighter italic uppercase">Registry Enrollment</h3><button onClick={() => setShowAddModal(false)}><X size={24}/></button></div>
               <div className="p-10 space-y-8 max-h-[80vh] overflow-y-auto no-scrollbar">
                  <div><label className="text-[10px] font-black uppercase text-zinc-400 mb-3 block tracking-widest font-black italic">1. Search Catalog</label><div className="flex gap-3"><input type="text" placeholder="Product Name..." className="flex-grow p-5 bg-zinc-100 rounded-2xl outline-none font-bold shadow-inner" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchShopify()} /><button onClick={searchShopify} className="bg-zinc-950 text-white p-5 rounded-2xl hover:bg-black"><Search size={24}/></button></div></div>
                  {searchResults.length > 0 && <div className="max-h-48 overflow-auto border-2 border-zinc-100 rounded-2xl divide-y shadow-sm">{searchResults.map(({ node: p }) => (<button key={p.id} onClick={() => { setSelectedProduct(p); setSelectedVariants([]); }} className={`w-full text-left p-4 hover:bg-zinc-50 flex justify-between items-center ${selectedProduct?.id === p.id ? 'bg-zinc-100 font-bold' : ''}`}><span>{p.title}</span><span className="text-[10px] font-black bg-zinc-200 px-2 py-1 rounded text-zinc-500 uppercase">{p.vendor}</span></button>))}</div>}
                  {selectedProduct && <div className="bg-zinc-50 p-8 rounded-[1.5rem] border-2 border-zinc-100"><label className="text-[10px] font-black uppercase text-zinc-400 mb-4 block tracking-widest text-center italic">Pick Variants</label><div className="grid grid-cols-2 gap-2">{selectedProduct.variants.edges.map(({ node: v }) => (<button key={v.id} onClick={() => { const exists = selectedVariants.find(sv => sv.id === v.id); if (exists) setSelectedVariants(selectedVariants.filter(sv => sv.id !== v.id)); else setSelectedVariants([...selectedVariants, v]); }} className={`p-3 rounded-xl border-2 text-xs font-black transition-all ${selectedVariants.find(sv => sv.id === v.id) ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400'}`}>{v.title}</button>))}</div></div>}
                  <div><label className="text-[10px] font-black uppercase text-zinc-400 mb-3 block tracking-widest italic text-center font-black">3. Meta</label><input type="text" placeholder="Vendor Product URL" className="w-full p-5 bg-zinc-100 rounded-2xl mb-3 outline-none focus:ring-2 focus:ring-black font-mono text-xs shadow-inner" value={vendorUrl} onChange={(e) => setVendorUrl(e.target.value)} /><input type="text" placeholder="Freehub Keyword (Optional)" className="w-full p-5 bg-zinc-100 rounded-2xl outline-none focus:ring-2 focus:ring-black font-bold shadow-inner" value={freehubKeyword} onChange={(e) => setFreehubKeyword(e.target.value)} /></div>
                  <button onClick={handleSave} disabled={!selectedVariants.length || !vendorUrl} className="w-full bg-black text-white font-black p-6 rounded-[1.5rem] hover:bg-zinc-800 disabled:opacity-10 transition-all uppercase tracking-widest shadow-2xl text-lg italic tracking-widest">Create rules</button>
               </div>
            </div>
          </div>
        )}

        {editingRule && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden text-sm">
              <div className="p-6 border-b flex justify-between items-center bg-zinc-50">
                <h3 className="text-xl font-black uppercase italic tracking-tighter">Edit Configuration</h3>
                <button onClick={() => setEditingRule(null)}><X size={20}/></button>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Vendor Product URL</label>
                  <input type="text" className="w-full p-4 bg-zinc-100 rounded-xl font-mono text-xs outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.vendor_url} onChange={(e) => setEditingRule({...editingRule, vendor_url: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Price Adjustment (Builder Buffer)</label>
                  <input type="number" step="0.0001" className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.price_adjustment_factor || 1.1111} onChange={(e) => setEditingRule({...editingRule, price_adjustment_factor: e.target.value})} />
                  <p className="text-[9px] text-zinc-400 mt-2 font-medium">Standard is 1.1111 (Offsets the 10% builder discount).</p>
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

function SidebarLink({ icon, label, active, onClick }) {
  return (<button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-black text-xs uppercase tracking-tight ${active ? 'bg-white text-black shadow-xl scale-[1.03]' : 'hover:bg-zinc-900 text-zinc-600'}`}>{icon} {label}</button>);
}
