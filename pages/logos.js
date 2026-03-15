import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Save, ArrowLeft, Loader2, Link2, EyeOff, Eye, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function LogoManager() {
  const [data, setData] = useState({ vendors: [], savedLogos: [] });
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    const savedPass = localStorage.getItem('loam_ops_auth');
    if (savedPass) { setPassword(savedPass); fetchLogos(savedPass); }
  }, []);

  const fetchLogos = async (passToUse) => {
    const auth = passToUse || password;
    if (!auth) return;
    setLoading(true);
    try {
      const res = await fetch('/api/get-logos', { headers: { 'x-dashboard-auth': auth } });
      if (res.ok) {
        setData(await res.json());
        setIsAuthorized(true);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const updateLogo = async (vendorName, updates) => {
    setSavingId(vendorName);
    const existing = data.savedLogos.find(l => l.name === vendorName) || {};
    const finalData = { 
      name: vendorName, 
      logo_url: updates.logo_url !== undefined ? updates.logo_url : existing.logo_url, 
      is_hidden: updates.is_hidden !== undefined ? updates.is_hidden : existing.is_hidden 
    };
    
    await fetch('/api/update-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
      body: JSON.stringify(finalData)
    });
    
    await fetchLogos(password);
    setSavingId(null);
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white font-sans text-center">
        <div className="max-w-sm w-full">
           <h1 className="text-2xl font-black mb-12 uppercase tracking-widest italic tracking-tighter">Branding Auth</h1>
           <input type="password" placeholder="PASSWORD" className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-2xl mb-4 text-center text-xl outline-none font-mono" onKeyDown={(e) => e.key === 'Enter' && fetchLogos(e.target.value)} />
           <button onClick={() => fetchLogos()} className="w-full bg-white text-black font-black p-5 rounded-2xl uppercase tracking-tighter shadow-xl">Authorize</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
           <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-black transition-all font-bold uppercase text-xs tracking-widest italic font-black"><ArrowLeft size={16} /> Back to Dashboard</Link>
           <h1 className="text-3xl font-black italic uppercase tracking-tighter">Branding Center</h1>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {data.vendors.map(vendor => {
            const saved = data.savedLogos.find(l => l.name === vendor);
            const isSaving = savingId === vendor;

            return (
              <div key={vendor} className={`bg-white p-5 rounded-[2rem] border transition-all flex flex-col md:flex-row items-center gap-6 shadow-sm ${saved?.is_hidden ? 'opacity-40 grayscale border-zinc-100' : 'border-zinc-200'}`}>
                <div className="w-20 h-20 bg-zinc-100 rounded-2xl flex items-center justify-center overflow-hidden border border-zinc-50 shrink-0">
                  {saved?.logo_url ? <img src={saved.logo_url} alt={vendor} className="max-w-full max-h-full object-contain p-2" /> : <ImageIcon className="text-zinc-300" size={24} />}
                </div>
                
                <div className="flex-grow w-full">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-black uppercase text-[10px] tracking-widest text-zinc-400 italic">{vendor}</h3>
                    <div className="flex items-center gap-2">
                       {isSaving && <Loader2 className="animate-spin text-zinc-400" size={14} />}
                       {!isSaving && saved?.logo_url && <CheckCircle2 className="text-green-500" size={14} />}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Paste Shopify Logo URL..." 
                      className="flex-grow p-4 bg-zinc-50 border border-zinc-100 rounded-xl text-[11px] font-mono outline-none focus:border-black transition-all shadow-inner"
                      defaultValue={saved?.logo_url || ''}
                      onBlur={(e) => updateLogo(vendor, { logo_url: e.target.value })}
                    />
                    <button 
                      onClick={() => updateLogo(vendor, { is_hidden: !saved?.is_hidden })}
                      className={`p-4 rounded-xl transition-all shadow-md ${saved?.is_hidden ? 'bg-red-500 text-white' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}`}
                      title={saved?.is_hidden ? "Show Vendor" : "Ignore Vendor"}
                    >
                      {saved?.is_hidden ? <EyeOff size={20}/> : <Eye size={20}/>}
                    </button>
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
