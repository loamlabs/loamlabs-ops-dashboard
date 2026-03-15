import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, RefreshCcw, Power, Search, Package, ShieldCheck, UserCheck, Plus, X, Info, Image as ImageIcon } from 'lucide-react';

export default function OpsDashboard() {
  const [activeTab, setActiveTab] = useState('vendors');
  const [rules, setRules] = useState([]);
  const [vendorLogos, setVendorLogos] = useState([]);
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterVendor, setFilterVendor] = useState('All');

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState([]);
  const [vendorUrl, setVendorUrl] = useState('');
  const [freehubKeyword, setFreehubKeyword] = useState('');

  const fetchRules = async () => {
    setLoading(true);
    const res = await fetch('/api/get-rules', { headers: { 'x-dashboard-auth': password } });
    if (res.ok) { 
      const rulesData = await res.json();
      setRules(rulesData);
      
      // Also fetch logos for the filter bar
      const logoRes = await fetch('/api/get-logos', { headers: { 'x-dashboard-auth': password } });
      const logoData = await logoRes.json();
      setVendorLogos(logoData.savedLogos);
      
      setIsAuthorized(true); 
    } else { alert("Unauthorized"); }
    setLoading(false);
  };

  const toggleAutoSync = async (id, currentState) => {
    await fetch('/api/update-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
      body: JSON.stringify({ id, updates: { auto_update: !currentState } })
    });
    fetchRules();
  };

  const searchShopify = async () => {
    if (!searchQuery) return;
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

  const vendorNames = ['All', ...new Set(rules.map(r => r.vendor_name).filter(Boolean))];
  const filteredRules = filterVendor === 'All' ? rules : rules.filter(r => r.vendor_name === filterVendor);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white font-sans">
        <div className="max-w-md w-full text-center">
          <div className="h-16 mb-6 flex justify-center"><div className="bg-white/10 w-32 h-12 rounded-lg animate-pulse border border-white/5"></div></div>
          <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 shadow-2xl">
            <input type="password" placeholder="ACCESS KEY" className="w-full bg-zinc-950 border border-zinc-700 p-4 rounded-2xl mb-4 text-center text-xl outline-none" onKeyDown={(e) => e.key === 'Enter' && fetchRules()} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={fetchRules} className="w-full bg-white text-black font-black p-4 rounded-2xl uppercase">Initialize</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <aside className="w-64 bg-black text-zinc-400 p-6 hidden md:flex flex-col border-r border-zinc-800">
        <div className="mb-12">
          <div className="font-black italic text-xl text-white tracking-tighter mb-1">LOAMLABS OPS</div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-black italic">v1.2 Production</p>
        </div>
        <nav className="space-y-2 flex-grow">
          <SidebarLink icon={<Package size={18}/>} label="Vendor Watcher" active={activeTab === 'vendors'} onClick={() => setActiveTab('vendors')} />
          <SidebarLink icon={<ShieldCheck size={18}/>} label="Shop Health" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} />
          <SidebarLink icon={<ImageIcon size={18}/>} label="Branding" active={false} onClick={() => window.location.href = '/logos'} />
        </nav>
      </aside>

      <main className="flex-grow p-6 md:p-12 overflow-auto">
        <div className="flex items-center justify-between mb-8">
          <div><h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Vendor Registry</h1></div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddModal(true)} className="bg-black text-white p-3 px-6 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-xl"><Plus size={18} /> Add Component</button>
            <button onClick={fetchRules} className="bg-white border-2 border-zinc-200 p-3 px-4 rounded-xl hover:border-black shadow-sm"><RefreshCcw size={18} className={loading ? "animate-spin" : ""} /></button>
          </div>
        </div>

        {/* LOGO FILTER BAR */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-4 no-scrollbar">
          {vendorNames.map(v => {
            const logo = vendorLogos.find(l => l.name === v);
            return (
              <button 
                key={v} onClick={() => setFilterVendor(v)}
                className={`flex items-center gap-3 px-5 py-2 rounded-full border-2 transition-all whitespace-nowrap ${filterVendor === v ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-500 border-zinc-100 hover:border-zinc-300'}`}
              >
                {logo?.logo_url ? <img src={logo.logo_url} className="h-4 w-auto object-contain" /> : null}
                <span className="font-black text-[10px] uppercase tracking-widest">{v}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-[2rem] shadow-sm border border-zinc-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-zinc-100 border-b text-[10px] uppercase font-black text-zinc-500 tracking-widest"><tr className="p-6">
              <th className="p-6">Registry Item</th>
              <th className="p-6 text-center">Status</th>
              <th className="p-6">Memory</th>
              <th className="p-6 text-right">Auto-Sync</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className={`${rule.needs_review ? 'bg-red-50' : 'hover:bg-zinc-50'} transition-colors`}>
                  <td className="p-6">
                    <div className="flex items-center gap-2">
                       <div className="font-bold text-zinc-900 text-base">{rule.title}</div>
                       {rule.review_reason && <div className="group relative cursor-help text-red-500"><Info size={14} /><div className="hidden group-hover:block absolute left-full ml-2 w-48 p-3 bg-black text-white text-[10px] rounded-xl shadow-2xl z-10 leading-relaxed">{rule.review_reason}</div></div>}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono mt-1 truncate max-w-sm">{rule.vendor_url}</div>
                  </td>
                  <td className="p-6 text-center">
                    {rule.needs_review ? <span className="bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-full animate-pulse uppercase">Review Required</span> : rule.last_availability ? <span className="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase">Active</span> : <span className="bg-zinc-200 text-zinc-600 text-[9px] font-black px-3 py-1 rounded-full uppercase">Out of Stock</span>}
                  </td>
                  <td className="p-6 font-mono font-bold text-lg text-zinc-700">${(rule.last_price / 100).toFixed(2)}</td>
                  <td className="p-6 flex justify-end">
                    <button onClick={() => toggleAutoSync(rule.id, rule.auto_update)} className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${rule.auto_update ? 'bg-black justify-end' : 'bg-zinc-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md"></div></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* ADD MODAL (Remains the same as before) */}
      </main>
    </div>
  );
}

function SidebarLink({ icon, label, active, onClick }) {
  return (<button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-black text-xs uppercase tracking-tight ${active ? 'bg-white text-black shadow-xl' : 'hover:bg-zinc-900 text-zinc-600'}`}>{icon} {label}</button>);
}
