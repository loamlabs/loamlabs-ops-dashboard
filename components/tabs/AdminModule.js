import React from 'react';
import { RefreshCcw, Search, Plus, Settings, X, ShieldAlert, ChevronDown, Info, ExternalLink, Loader2, AlertCircle, Clock, ShieldCheck, Layers, FileDown, Eye, CheckCircle2, Copy, Play, ArrowDownToLine, GitMerge, FileUp, Save, UploadCloud, FileEdit, HelpCircle, Activity, History, Trash2 } from 'lucide-react';

export default function AdminModule(props) {
  const { setAdminTab, adminTab, metafieldRegistry, setMetafieldRegistry, removeMetafield, addNewMetafield, visibleVendorNames, vendorLogos, ImageIcon, handleLogoUpdate, savingLogo } = props;

  return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center justify-between mb-8">
               <div>
                  <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Control Module</h1>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1 italic tracking-[0.2em]">Dashboard Configuration</p>
               </div>
             </div>

             <div className="flex gap-4 mb-8 border-b-2 border-zinc-100 pb-2">
                <button onClick={() => setAdminTab('control_module')} className={`px-6 py-3 font-black text-[10px] uppercase tracking-widest transition-all ${adminTab === 'control_module' ? 'text-black border-b-2 border-black -mb-[10px] bg-zinc-100 rounded-t-xl' : 'text-zinc-400 hover:text-zinc-600'}`}>Control Module</button>
                <button onClick={() => setAdminTab('branding')} className={`px-6 py-3 font-black text-[10px] uppercase tracking-widest transition-all ${adminTab === 'branding' ? 'text-black border-b-2 border-black -mb-[10px] bg-zinc-100 rounded-t-xl' : 'text-zinc-400 hover:text-zinc-600'}`}>Branding Center</button>
             </div>

             {adminTab === 'control_module' && (
                <div className="bg-white rounded-[2.5rem] border border-zinc-200 shadow-xl overflow-hidden p-12 animate-in fade-in">
                   <div className="grid grid-cols-3 gap-12">
                      {['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'].map(cat => (
                        <div key={cat} className="space-y-6">
                           <div className="flex items-center justify-between border-b-4 border-black pb-4">
                              <h3 className="text-xl font-black italic tracking-tighter truncate pr-2">{cat.replace('VALVESTEM','VALVE STEM')}</h3>
                              <div className="w-8 h-8 rounded-full bg-zinc-100 flex-shrink-0 flex items-center justify-center"><Activity size={14}/></div>
                           </div>
                           <div className="space-y-2">
                              {metafieldRegistry.map(m => (
                                <div key={m.key} className="flex items-center gap-2 group/row">
                                   <label className="flex-grow flex items-center justify-between p-4 bg-zinc-50 rounded-2xl hover:bg-zinc-100 transition-all cursor-pointer group">
                                      <div className="flex flex-col">
                                         <span className={m.categories.includes(cat) ? "text-[11px] font-black uppercase tracking-tight text-black" : "text-[11px] font-bold uppercase tracking-tight text-zinc-300 group-hover:text-zinc-400"}>{m.label}</span>
                                         <span className="text-[8px] font-black uppercase text-zinc-400 opacity-50">{m.target}</span>
                                      </div>
                                      <input 
                                        type="checkbox" 
                                        className="w-5 h-5 rounded-lg border-2 border-zinc-200 text-black focus:ring-black"
                                        checked={m.categories.includes(cat)}
                                        onChange={() => {
                                          setMetafieldRegistry(prev => prev.map(field => {
                                              if (field.key !== m.key) return field;
                                              const newCats = field.categories.includes(cat) 
                                                  ? field.categories.filter(c => c !== cat) 
                                                  : [...field.categories, cat];
                                              return { ...field, categories: newCats };
                                          }));
                                        }}
                                      />
                                   </label>
                                   <button onClick={() => removeMetafield(m.key)} className="opacity-0 group-hover/row:opacity-100 p-2 text-zinc-300 hover:text-red-500 transition-all"><Trash2 size={14}/></button>
                                 </div>
                               ))}
                            </div>
                            <button onClick={() => addNewMetafield(cat)} className="w-full py-4 border-2 border-dashed border-zinc-200 rounded-2xl text-[10px] font-black uppercase text-zinc-400 hover:border-black hover:text-black transition-all flex items-center justify-center gap-2">
                               <Plus size={14}/> Add New {cat} Metafield
                            </button>
                        </div>
                      ))}
                   </div>
                   <div className="mt-12 pt-12 border-t border-zinc-100 bg-zinc-50 -mx-12 -mb-12 p-12">
                      <div className="flex items-center gap-4 text-zinc-400">
                         <ShieldCheck size={20}/>
                         <p className="text-[10px] font-black uppercase tracking-[0.2em]">Settings are currently session-scoped. Multi-user persistence coming in update 4.12.</p>
                      </div>
                   </div>
                </div>
             )}

             {adminTab === 'branding' && (
                <div className="grid gap-4 max-w-4xl animate-in fade-in">
                   {visibleVendorNames.map(vendor => {
                     const logo = vendorLogos.find(l => l.name === vendor);
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
                               className="w-full p-4 rounded-xl outline-none border-2 bg-zinc-50 border-transparent focus:border-black transition-all font-mono text-xs"
                               defaultValue={logo?.logo_url || ''}
                               onBlur={(e) => handleLogoUpdate(vendor, e.target.value)}
                             />
                             <div className="absolute right-4 top-1/2 -translate-y-1/2">
                               {savingLogo === vendor ? <Loader2 className="animate-spin text-zinc-400" size={16} /> : logo?.logo_url ? <ShieldCheck className="text-green-500" size={16} /> : null}
                             </div>
                           </div>
                         </div>
                       </div>
                     );
                   })}
                </div>
             )}
          </div>
  );
}
