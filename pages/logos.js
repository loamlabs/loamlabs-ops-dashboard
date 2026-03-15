import React, { useState, useEffect } from 'react';
import { ChevronLeft, Image as ImageIcon, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function BrandingCenter() {
  const [vendors, setVendors] = useState([]);
  const [savedLogos, setSavedLogos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); 
  const [error, setError] = useState(null);

  useEffect(() => {
    const auth = localStorage.getItem('loam_ops_auth');
    if (!auth) window.location.href = '/';
    fetchData(auth);
  }, []);

  const fetchData = async (auth) => {
    setLoading(true);
    setError(null);
    try {
      const vRes = await fetch('/api/search-products?query='); 
      const vData = await vRes.json();
      
      if (vData.error) throw new Error(vData.error);
      
      // Safety: vData is expected to be an array of { node: { vendor: '...' } }
      if (!Array.isArray(vData) || vData.length === 0) {
          throw new Error("No products found in Shopify. Verify API Permissions.");
      }

      const uniqueVendors = [...new Set(vData.map(item => {
          const vendorName = item.node?.vendor || item.vendor;
          return vendorName;
      }))].filter(Boolean).sort();
      
      setVendors(uniqueVendors);

      const lRes = await fetch('/api/get-logos', { headers: { 'x-dashboard-auth': auth } });
      const lData = await lRes.json();
      setSavedLogos(lData.savedLogos || []);
    } catch (e) { 
        setError(e.message);
    }
    setLoading(false);
  };

  const handleLogoUpdate = async (vendorName, url) => {
    const auth = localStorage.getItem('loam_ops_auth');
    setSaving(vendorName);
    
    try {
      const res = await fetch('/api/update-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
        body: JSON.stringify({ name: vendorName, logo_url: url })
      });
      if (res.ok) {
        setSavedLogos(prev => {
          const existing = prev.find(l => l.name === vendorName);
          if (existing) return prev.map(l => l.name === vendorName ? { ...l, logo_url: url } : l);
          return [...prev, { name: vendorName, logo_url: url }];
        });
      }
    } catch (e) { console.error(e); }
    
    setTimeout(() => setSaving(null), 1000);
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center flex-col gap-4">
        <Loader2 className="animate-spin text-zinc-900" size={40} />
        <span className="font-black uppercase italic text-[10px] tracking-widest animate-pulse">Scanning Shopify Catalog...</span>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-12 font-sans">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-red-100 text-center max-w-md">
            <AlertTriangle className="mx-auto text-red-500 mb-6" size={60} />
            <h2 className="text-2xl font-black uppercase italic mb-4 tracking-tighter">Discovery Issue</h2>
            <div className="bg-red-50 p-4 rounded-2xl mb-8 border border-red-100">
                <p className="text-red-800 text-[10px] font-mono leading-relaxed">{error}</p>
            </div>
            <button onClick={() => fetchData(localStorage.getItem('loam_ops_auth'))} className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase italic flex items-center gap-3 mx-auto hover:scale-105 transition-all shadow-xl">
                <RefreshCw size={18} /> Retry Sync
            </button>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 p-12 font-sans">
      <div className="max-w-4xl mx-auto text-zinc-900">
        <div className="flex items-center justify-between mb-12">
          <button onClick={() => window.location.href = '/'} className="flex items-center gap-2 text-zinc-400 hover:text-black font-black uppercase text-[10px] tracking-widest transition-all">
            <ChevronLeft size={16} /> Back to Dashboard
          </button>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter">Branding Center</h1>
        </div>

        <div className="grid gap-4">
          {vendors.map(vendor => {
            const logo = savedLogos.find(l => l.name === vendor);
            return (
              <div key={vendor} className="bg-white p-6 rounded-[2rem] border border-zinc-200 flex items-center gap-8 group hover:shadow-xl transition-all">
                <div className="w-20 h-20 bg-zinc-50 rounded-[1.5rem] flex items-center justify-center overflow-hidden border border-zinc-100">
                  {logo?.logo_url ? <img src={logo.logo_url} className="w-full h-full object-contain p-2" alt="" /> : <ImageIcon className="text-zinc-200" />}
                </div>
                
                <div className="flex-grow">
                  <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">{vendor}</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Paste Shopify Logo URL..." 
                      className="w-full p-4 bg-zinc-50 rounded-xl outline-none border-2 border-transparent focus:border-black transition-all font-mono text-xs"
                      defaultValue={logo?.logo_url || ''}
                      onBlur={(e) => handleLogoUpdate(vendor, e.target.value)}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      {saving === vendor ? <Loader2 className="animate-spin text-zinc-400" size={16} /> : logo?.logo_url ? <CheckCircle2 className="text-green-500" size={16} /> : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
