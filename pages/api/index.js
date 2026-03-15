import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, RefreshCcw, Power, Search, Package, LayoutDashboard, Settings, UserCheck } from 'lucide-react';

export default function OpsDashboard() {
  const [activeTab, setActiveTab] = useState('vendors');
  const [rules, setRules] = useState([]);
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    const res = await fetch('/api/get-rules', {
      headers: { 'x-dashboard-auth': password }
    });
    if (res.ok) {
      const data = await res.json();
      setRules(data);
      setIsAuthorized(true);
    } else {
      alert("Unauthorized");
    }
    setLoading(false);
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans text-white">
        <div className="max-w-md w-full text-center">
          <h1 className="text-4xl font-black italic mb-2 tracking-tighter">LOAMLABS OPS</h1>
          <p className="text-gray-500 mb-8 uppercase text-xs tracking-widest font-bold">Admin Command Center</p>
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl">
            <input 
              type="password" 
              placeholder="Enter Access Key" 
              className="w-full bg-zinc-950 border border-zinc-700 p-4 rounded-xl mb-4 focus:ring-2 focus:ring-white outline-none transition-all text-center text-xl tracking-widest"
              onKeyDown={(e) => e.key === 'Enter' && fetchRules()}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={fetchRules} className="w-full bg-white text-black font-black p-4 rounded-xl hover:bg-gray-200 transition-all uppercase tracking-tight">Initialize Console</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-black text-zinc-400 p-6 hidden md:flex flex-col border-r border-zinc-800">
        <div className="mb-10 text-white">
          <h2 className="text-xl font-black italic tracking-tighter">LOAMLABS OPS</h2>
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">v1.2 Production</p>
        </div>
        
        <nav className="space-y-2 flex-grow">
          <SidebarLink icon={<LayoutDashboard size={18}/>} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarLink icon={<Package size={18}/>} label="Vendor Watcher" active={activeTab === 'vendors'} onClick={() => setActiveTab('vendors')} />
          <SidebarLink icon={<ShieldAlert size={18}/>} label="Shop Health" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} />
          <SidebarLink icon={<UserCheck size={18}/>} label="Competitor Intel" active={activeTab === 'competitors'} onClick={() => setActiveTab('competitors')} />
        </nav>

        <div className="pt-6 border-t border-zinc-800">
          <SidebarLink icon={<Settings size={18}/>} label="System Config" active={false} onClick={() => {}} />
        </div>
      </aside>

      {/* MAIN STAGE */}
      <main className="flex-grow p-6 md:p-12 overflow-auto">
        {activeTab === 'vendors' ? (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-zinc-900">Vendor Registry</h1>
                <p className="text-zinc-500 font-medium">Monitoring boutique component margins and stock.</p>
              </div>
              <button onClick={fetchRules} className="bg-white border-2 border-zinc-200 p-3 px-6 rounded-xl font-bold shadow-sm hover:border-black transition-all flex items-center gap-2">
                <RefreshCcw size={18} className={loading ? "animate-spin" : ""} /> Refresh Data
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-zinc-100 border-b text-[10px] uppercase font-black text-zinc-500 tracking-widest">
                    <tr>
                      <th className="p-5">Component Registry Name</th>
                      <th className="p-5 text-center">Status</th>
                      <th className="p-5">Vendor High</th>
                      <th className="p-5">LoamLabs Price</th>
                      <th className="p-5">Auto-Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-sm">
                    {rules.map((rule) => (
                      <tr key={rule.id} className={`${rule.needs_review ? "bg-red-50" : "hover:bg-zinc-50 transition-colors"}`}>
                        <td className="p-5">
                          <div className="font-bold text-zinc-900 leading-tight">{rule.title}</div>
                          <div className="text-[11px] text-zinc-400 font-mono mt-1 truncate max-w-sm">{rule.vendor_url}</div>
                        </td>
                        <td className="p-5 text-center">
                          {rule.needs_review ? (
                            <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full animate-pulse">REVIEW REQ</span>
                          ) : rule.last_availability ? (
                            <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">Active</span>
                          ) : (
                            <span className="bg-zinc-200 text-zinc-600 text-[10px] font-black px-3 py-1 rounded-full uppercase">OOS</span>
                          )}
                        </td>
                        <td className="p-5 font-mono font-bold text-zinc-600">
                          ${(rule.last_price / 100).toFixed(2)}
                        </td>
                        <td className="p-5 font-mono font-bold text-zinc-900">
                          ${((rule.last_price / 100) * (rule.price_adjustment_factor || 1.0)).toFixed(2)}
                        </td>
                        <td className="p-5">
                          <div className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${rule.auto_update ? 'bg-black justify-end' : 'bg-zinc-300 justify-start'}`}>
                            <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400">
             <LayoutDashboard size={64} className="mb-4 opacity-20" />
             <h2 className="text-xl font-bold">Module Incoming</h2>
             <p>This section of the Ops Dashboard is currently under construction.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function SidebarLink({ icon, label, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm ${active ? 'bg-white text-black shadow-lg' : 'hover:bg-zinc-900 text-zinc-500'}`}
    >
      {icon} {label}
    </button>
  );
}
