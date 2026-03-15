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
          {/* Logo with fallback if file is missing */}
          <div className="h-20 mb-6 flex justify-center">
            <img 
              src="/logo.png" 
              alt="LoamLabs" 
              className="h-full object-contain" 
              onError={(e) => { e.target.style.display = 'none'; }} 
            />
          </div>
          <p className="text-zinc-500 mb-8 uppercase text-xs tracking-[0.3em] font-black">Ops Command Center</p>
          <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 shadow-2xl">
            <input 
              type="password" 
              placeholder={loading ? "INITIALIZING..." : "ACCESS KEY"} 
              disabled={loading}
              className="w-full bg-zinc-950 border border-zinc-700 p-4 rounded-2xl mb-4 text-center text-xl tracking-widest outline-none focus:border-white transition-all disabled:opacity-50" 
              onKeyDown={(e) => e.key === 'Enter' && fetchRules()} 
              onChange={(e) => setPassword(e.target.value)} 
            />
            <button 
              onClick={fetchRules} 
              disabled={loading}
              className="w-full bg-white text-black font-black p-4 rounded-2xl uppercase tracking-tighter hover:bg-zinc-200 transition-all flex justify-center items-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : "Initialize Session"}
            </button>
          </div>
        </div>
      </div>
    );
  }

function SidebarLink({ icon, label, active, onClick }) {
  return (<button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-black text-xs uppercase tracking-tight ${active ? 'bg-white text-black shadow-xl' : 'hover:bg-zinc-900 text-zinc-600'}`}>{icon} {label}</button>);
}
