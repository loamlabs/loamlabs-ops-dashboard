import React, { useState, useEffect } from 'react';
import { ChevronLeft, Image as ImageIcon, Loader2, CheckCircle2 } from 'lucide-react';

export default function BrandingCenter() {
  const [vendors, setVendors] = useState([]);
  const [savedLogos, setSavedLogos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // Tracks which vendor is saving

  useEffect(() => {
    const auth = localStorage.getItem('loam_ops_auth');
    if (!auth) window.location.href = '/';
    fetchData(auth);
  }, []);

  const fetchData = async (auth) => {
    try {
      // 1. Get all vendors currently in Shopify
      const vRes = await fetch('/api/search-products?query='); 
      const vData = await vRes.json();
      const uniqueVendors = [...new Set(vData.map(p => p.node.vendor))].sort();
      setVendors(uniqueVendors);

      // 2. Get saved logos from Supabase
      const lRes = await fetch('/api/get-logos', { headers: { 'x-dashboard-auth': auth } });
      const lData = await lRes.json();
      setSavedLogos(lData.savedLogos || []);
    } catch (e) { console.error(e); }
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
        // Update local state to show the change immediately
        setSavedLogos(prev => {
          const existing = prev.find(l => l.name === vendorName);
          if (existing) return prev.map(l => l.name === vendorName ? { ...l, logo_url: url } : l);
          return [...prev, { name: vendorName, logo_url: url }];
        });
      }
    } catch (e) { console.error(e); }
    
    setTimeout(() => setSaving(null), 1000);
  };

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-zinc-50 p-12 font-sans">
      <div className="max-w-4xl mx-auto">
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
                  {logo?.logo_url ? <img src={logo.logo_url} className="w-full h-full object-contain p-2" /> : <ImageIcon className="text-zinc-200" />}
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
