import React from 'react';
import { RefreshCcw, Search, Plus, Settings, X, ShieldAlert, ChevronDown, Info, ExternalLink, Loader2, AlertCircle } from 'lucide-react';

export default function ProductLab(props) {
  const { syncCatalogFull, loading, setActiveTab, selectedVendors, setSelectedVendors, visibleVendorNames, vendorLogos, toggleVendor, setVisibleCount, labSearch, setLabSearch, labCategory, setLabCategory, labDiscrepancyOnly, setLabDiscrepancyOnly, selectedLabProducts, setSelectedLabProducts, globalLabGroupMode, setGlobalLabGroupMode, setLabProductGroupModes, allUniqueRules, expandedLabProducts, setExpandedLabProducts, expandedGroups, setExpandedGroups, selectedLabVariants, setSelectedLabVariants, getDiscrepancies, metafieldRegistry, metafieldOptionsMap, toggleLabVariant, setLoading, fetchRules, syncFieldToFamily, setEditingRule, labProductGroupModes } = props;

  return (
    <>
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center justify-between mb-8">
               <div>
                   <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Product Lab</h1>
                   <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mt-1">Catalog Architect & Batch Metafield Editor</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={syncCatalogFull} disabled={loading} title="Updates Entire Catalog: Tags, Technical Specs, and Metafield Definitions from Shopify." className={`bg-black text-white p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-xl ${loading ? 'opacity-50' : ''}`}>
                    {loading ? <Loader2 className="animate-spin" size={14}/> : <RefreshCcw size={14}/>} Sync Catalog
                  </button>
                  <button className="bg-zinc-100 text-zinc-600 p-3 px-6 rounded-xl font-black uppercase italic text-[10px] hover:bg-black hover:text-white transition-all shadow-sm flex items-center gap-2">
                    <Plus size={14} /> Create New Product
                  </button>
                  <button onClick={() => setActiveTab('admin')} className="bg-zinc-100 text-zinc-400 p-3 px-4 rounded-xl hover:text-black transition-all border border-transparent hover:border-zinc-200">
                    <Settings size={14} />
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
                 <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Filter by Tag</label>
                 <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
                  <input type="text" placeholder="Search Lab..." value={labSearch} onChange={(e) => setLabSearch(e.target.value)} className="pl-9 pr-8 py-2 w-52 rounded-xl border-2 border-zinc-100 text-xs font-bold outline-none focus:border-black transition-all placeholder:text-zinc-300 placeholder:font-bold placeholder:italic" />
                  {labSearch && <button onClick={() => setLabSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600"><X size={12} /></button>}
                </div>
               </div>
               <div className="flex flex-wrap gap-2 mb-8">
                 {[
                   { id: 'all', label: 'All Components' },
                   { id: 'component:rim', label: 'Rims' },
                   { id: 'component:hub', label: 'Hubs' },
                   { id: 'component:spoke', label: 'Spokes' },
                   { id: 'component:nipple', label: 'Nipples' },
                   { id: 'component:valvestem', label: 'Valve Stems' },
                   { id: 'component:freehub', label: 'Freehubs' },
                   { id: 'addon', label: 'Addons' },
                   { id: 'accessory', label: 'Accessories' },
                   { id: 'handbuilt', label: 'Wheel Sets' }
                 ].map(cat => (
                   <button 
                     key={cat.id} 
                     onClick={() => setLabCategory(cat.id)} 
                     className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${labCategory === cat.id ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                   >
                     {cat.label}
                   </button>
                 ))}
                <div className="flex-grow"></div>
                <button 
                  onClick={() => setLabDiscrepancyOnly(!labDiscrepancyOnly)}
                  className={`px-6 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${labDiscrepancyOnly ? 'bg-red-600 text-white border-red-700 shadow-lg shadow-red-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-red-200 hover:text-red-500'}`}
                >
                  <ShieldAlert size={14} /> {labDiscrepancyOnly ? 'Viewing Discrepancies Only' : 'Show Discrepancies Only'}
                </button>
              </div>
            </div>

             <div className="bg-white rounded-[2.5rem] border border-zinc-200 shadow-xl overflow-hidden mb-12">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-zinc-100 border-b text-[10px] uppercase font-black text-zinc-500 tracking-widest font-mono">
                    <tr>
                      <th className="w-12 p-6">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded-lg border-2 border-zinc-200 text-black focus:ring-black"
                          checked={selectedLabProducts.length > 0} 
                          onChange={(e) => {
                            if (!e.target.checked) setSelectedLabProducts([]);
                          }}
                        />
                      </th>
                      <th className="w-4 p-0"></th>
                      <th className="p-6">
                        <div className="flex flex-col gap-1 items-start">
                          <span>Product Family (A-Z)</span>
                          <select 
                            value={globalLabGroupMode}
                            onChange={e => {
                               setGlobalLabGroupMode(e.target.value);
                               setLabProductGroupModes({});
                            }}
                            className="text-[8px] font-black uppercase tracking-[0.2em] bg-transparent text-zinc-400 hover:text-black cursor-pointer outline-none border-0 p-0 transition-colors"
                          >
                            <option value="default">Group: Default Sort</option>
                            <option value="Option 1">Group: Option 1</option>
                            <option value="Option 2">Group: Option 2</option>
                            <option value="Option 3">Group: Option 3</option>
                          </select>
                        </div>
                      </th>
                      <th className="p-6">Vendor</th>
                      <th className="p-6 text-center">Variants</th>
                      <th className="p-6 text-center">Integrity</th>
                      <th className="p-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(() => {
                      const filtered = Object.values(allUniqueRules.filter(r => {
                        const matchesVendor = selectedVendors.length === 0 || selectedVendors.includes(r.vendor_name);
                        const normalize = (str) => String(str || "").toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
                        const searchString = normalize(labSearch);
                        const searchTokens = searchString ? searchString.split(' ').filter(Boolean) : [];
                        const searchMatch = searchTokens.length === 0 || searchTokens.every(token => 
                           normalize(r.title).includes(token) || normalize(r.vendor_name).includes(token)
                        );

                        const labTags = ['component:hub','component:rim','component:spoke','component:nipple','component:valvestem','component:freehub', 'addon','accessory','spoke','nipple','valvestem','hub','rim','freehub', 'handbuilt'];
                        const itemTags = Array.isArray(r.tags) ? r.tags.map(t => t.toLowerCase()) : [];
                        
                        if (itemTags.includes('lab-ignore')) return false;

                        const isLabItem = itemTags.some(t => labTags.includes(t.toLowerCase()));
                        const matchesCategory = labCategory === 'all' || itemTags.some(t => t.toLowerCase() === labCategory);
                        return matchesVendor && isLabItem && matchesCategory && searchMatch;
                      }).reduce((acc, r) => {
                        if (!acc[r.shopify_product_id]) acc[r.shopify_product_id] = { ...r, variantCount: 0 };
                        acc[r.shopify_product_id].variantCount++;
                        return acc;
                      }, {}))
                      .filter(product => {
                        if (!labDiscrepancyOnly) return true;
                        const productVariants = allUniqueRules.filter(r => String(r.shopify_product_id) === String(product.shopify_product_id));
                        return Object.keys(getProductGroupedDiscrepancies(product, productVariants)).length > 0;
                      })
                      .sort((a,b) => a.title.localeCompare(b.title));

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan="6" className="p-20 text-center">
                              <div className="flex flex-col items-center gap-4">
                                {Object.entries(COMPONENT_SUGGESTIONS).map(([key, options]) => (
                                   <datalist id={`list-${key.replace(/\s+/g, '-')}`} key={key}>
                                      {options.map(opt => <option key={opt} value={opt} />)}
                                   </datalist>
                                ))}

                                <div className="p-6 bg-zinc-50 rounded-full text-zinc-300">
                                  <Search size={40} />
                                </div>
                                <div className="font-black uppercase italic text-zinc-400">No matching products found</div>
                                <p className="text-xs text-zinc-400 font-bold max-w-xs mx-auto">Click "Sync Catalog Tags" above to populate component categories for the first time.</p>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map(product => {
                        const isExpanded = expandedProducts.includes(product.shopify_product_id);
                        const productVariants = allUniqueRules.filter(r => r.shopify_product_id === product.shopify_product_id);
                        const discrepancies = getProductGroupedDiscrepancies(product, productVariants);
                        const hasIssue = Object.keys(discrepancies).length > 0;

                        return (
                          <React.Fragment key={product.shopify_product_id}>
                            <tr className={`hover:bg-zinc-50 transition-colors ${isExpanded ? 'bg-zinc-50/50' : ''}`}>
                              <td className="p-6">
                                <input 
                                  type="checkbox" 
                                  className="w-5 h-5 rounded-lg border-2 border-zinc-200 text-black focus:ring-black"
                                  checked={selectedLabProducts.some(id => String(id)===String(product.shopify_product_id))}
                                  onChange={() => toggleLabProduct(product.shopify_product_id)}
                                />
                              </td>
                              <td className="p-0">
                                <button 
                                  onClick={() => setExpandedProducts(prev => isExpanded ? prev.filter(id => id !== product.shopify_product_id) : [...prev, product.shopify_product_id])}
                                  className={`p-2 rounded-lg hover:bg-zinc-200 transition-all ${isExpanded ? 'rotate-90' : ''}`}
                                >
                                  <ChevronRight size={16} className="text-zinc-400" />
                                </button>
                              </td>
                              <td className="p-6 font-black text-sm">{product.title.split('(')[0].trim()}</td>
                              <td className="p-6 text-zinc-400 font-bold uppercase text-[10px] tracking-widest">{product.vendor_name}</td>
                              <td className="p-6 text-center">
                                <span className="bg-zinc-100 text-zinc-600 px-3 py-1 rounded-full font-black text-[10px]">{product.variantCount} SKUs</span>
                              </td>
                              <td className="p-6 text-center">
                                {hasIssue ? (
                                  <div className="group/integrity relative inline-block">
                                    <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full font-black text-[9px] uppercase italic animate-pulse cursor-help border border-red-200">âš ï¸ Discrepancy</span>
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover/integrity:block w-48 bg-black text-white text-[10px] p-3 rounded-xl z-50 shadow-2xl font-sans text-left leading-relaxed">
                                       <div className="text-zinc-400 mb-2 uppercase font-black tracking-widest">Inconsistent Fields:</div>
                                       {Object.keys(discrepancies).map(k => (
                                         <div key={k} className="flex items-center justify-between gap-2 border-b border-zinc-800 last:border-0 py-1">
                                           <span className="text-zinc-500">{metafieldRegistry.find(m=>m.key===k)?.label || k}</span>
                                           <span className="text-red-400 font-bold">{discrepancies[k].values.length} vals</span>
                                         </div>
                                       ))}
                                       <div className="mt-2 text-[8px] text-zinc-500 italic">Expand to fix individual variants</div>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full font-black text-[9px] uppercase italic border border-green-100">Healthy</span>
                                )}
                              </td>
                              <td className="p-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => alert("Multi-Variant Edit Mode coming next.")} className="bg-zinc-100 hover:bg-black hover:text-white text-zinc-600 p-2 rounded-lg transition-all border border-transparent">
                                    <Edit3 size={14} />
                                  </button>
                                  <button 
                                    onClick={() => openDupModal(product)} 
                                    disabled={loading}
                                    className={`bg-zinc-100 border-2 border-transparent hover:border-black text-zinc-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                    <RefreshCcw size={12} className={loading ? 'animate-spin' : ''}/>
                                    {loading ? 'Processing...' : 'Duplicate'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                               <tr>
                                 <td colSpan="6" className="p-0 bg-white shadow-inner">
                                   <div className="flex items-center gap-2 px-6 pt-5 pb-3">
                                      <span className="text-[9px] uppercase font-black text-zinc-400 tracking-widest">Group By:</span>
                                      {['default', 'Option 1', 'Option 2', 'Option 3'].map(mode => {
                                         const isActive = (labProductGroupModes[product.shopify_product_id] || globalLabGroupMode) === mode;
                                         return (
                                           <button 
                                             key={mode}
                                             onClick={() => setLabProductGroupModes(prev => ({...prev, [product.shopify_product_id]: mode}))}
                                             className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-black text-white border-black shadow-md' : 'bg-white text-zinc-500 border-zinc-200 hover:border-black hover:text-black hover:bg-zinc-50'}`}
                                           >
                                              {mode.replace('Option ', 'Opt ')}
                                           </button>
                                         );
                                      })}
                                   </div>
                                   <div className="divide-y divide-zinc-50 border-x border-b border-zinc-100 mx-6 mb-6 rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50">
                                     {(() => {
                                        const groups = productVariants.reduce((acc, v) => {
                                            const groupKey = getVariantGroupKey(v, product);
                                            if (!acc[groupKey]) acc[groupKey] = [];
                                            acc[groupKey].push(v);
                                            return acc;
                                        }, {});
                                        const linearVariants = Object.entries(groups)
                                           .sort(([ka], [kb]) => ka.localeCompare(kb, undefined, { numeric: true }))
                                           .flatMap(([_, vArr]) => vArr.sort((a,b) => a.title.localeCompare(b.title)));

                                        return Object.entries(groups)
                                          .sort(([ka], [kb]) => ka.localeCompare(kb, undefined, { numeric: true }))
                                          .map(([groupName, variants]) => {
                                             const groupId = `${product.shopify_product_id}-${groupName}`;
                                             const isGroupExpanded = expandedGroups.includes(groupId);
                                             
                                             return (
                                               <div key={groupId} className="border-b border-zinc-100 last:border-0">
                                                  <div 
                                                    onClick={() => setExpandedGroups(prev => isGroupExpanded ? prev.filter(id => id !== groupId) : [...prev, groupId])}
                                                    className="flex items-center justify-between p-4 bg-zinc-100/30 hover:bg-zinc-200/50 cursor-pointer transition-colors group"
                                                  >
                                                     <div className="flex items-center gap-4">
                                                        <input 
                                                          type="checkbox" 
                                                          className="w-4 h-4 rounded border-2 border-zinc-200 text-black focus:ring-black cursor-pointer pointer-events-auto"
                                                          checked={variants.length > 0 && variants.every(v => selectedLabVariants.includes(String(v.shopify_variant_id)))}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            const variantIds = variants.map(v => String(v.shopify_variant_id));
                                                            const allSelected = variants.every(v => selectedLabVariants.includes(String(v.shopify_variant_id)));
                                                            if (allSelected) {
                                                              setSelectedLabVariants(prev => prev.filter(id => !variantIds.includes(String(id))));
                                                            } else {
                                                              setSelectedLabVariants(prev => {
                                                                const newIds = variantIds.filter(id => !prev.includes(id));
                                                                return [...prev, ...newIds];
                                                              });
                                                            }
                                                          }}
                                                          onChange={() => {}}
                                                        />
                                                        <ChevronDown size={14} className={`text-zinc-400 transition-transform ${isGroupExpanded ? '' : '-rotate-90'}`} />
                                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">{groupName}</div>
                                                        <span className="text-[8px] font-black bg-white px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-400">{variants.length} Variant(s)</span>
                                                     </div>
                                                  </div>
                                                  {isGroupExpanded && (
                                                    <div className="bg-white divide-y divide-zinc-50">
                                                        {(() => {
                                                           const groupDiscrepancies = getDiscrepancies(variants);
                                                           return variants.sort((a,b) => a.title.localeCompare(b.title)).map(variant => {
                                                              const pSplit = String(product.title || "").split('(')[0].trim().toLowerCase();
                                                              let clean = variant.title;
                                                              if (clean.toLowerCase().startsWith(pSplit)) { clean = clean.substring(pSplit.length).trim(); }
                                                              clean = clean.replace(/^[(\s/-]+|[)\s/-]+$/g, '').trim();
                                                              const subLabel = clean.split(/[/-]/).map(p => p.trim()).slice(1).join(' / ') || clean.split(/[/-]/)[0];

                                                              const variantConstantMetafields = metafieldRegistry.filter(m => m.isConstant && m.target === 'variant');
                                                              const tags = Array.isArray(product.tags) ? product.tags.map(t => t.toLowerCase()) : [];
                                                              const activeConstants = variantConstantMetafields.filter(m => m.categories.some(c => 
                                                                (c === 'RIM' && (tags.includes('rim') || tags.includes('component:rim'))) ||
                                                                (c === 'HUB' && (tags.includes('hub') || tags.includes('component:hub'))) ||
                                                                (c === 'SPOKE' && (tags.includes('spoke') || tags.includes('component:spoke'))) ||
                                                                (c === 'NIPPLE' && (tags.includes('nipple') || tags.includes('component:nipple'))) ||
                                                                (c === 'VALVESTEM' && (tags.includes('valvestem') || tags.includes('component:valvestem'))) ||
                                                                (c === 'ACCESSORY' && (tags.includes('accessory') || tags.includes('component:accessory')))
                                                              ));

                                                          return (
                                                          <div key={variant.shopify_variant_id} className="flex items-center justify-between p-4 pl-12 hover:bg-zinc-50 transition-colors group select-none" onClick={(e) => { if (e.target.tagName!=='INPUT' && e.target.tagName!=='BUTTON') toggleLabVariant(variant.shopify_variant_id, e, linearVariants); }}>
                                                             <div className="flex items-center gap-4">
                                                               <input 
                                                                 type="checkbox" 
                                                                 className="w-4 h-4 rounded border-2 border-zinc-200 text-black focus:ring-black cursor-pointer pointer-events-auto"
                                                                 checked={selectedLabVariants.some(id => String(id)===String(variant.shopify_variant_id))}
                                                                 onChange={() => {}} onClick={(e) => toggleLabVariant(variant.shopify_variant_id, e, linearVariants)}
                                                               />
                                                               <div className="w-8 h-8 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center font-black text-[8px] text-zinc-300">SKU</div>
                                                               <div>
                                                                  <div className="text-[9px] font-black uppercase text-zinc-400 tracking-widest leading-none mb-1">{variant.sku || 'No SKU'}</div>
                                                                  <div className="text-xs font-bold text-zinc-700">{subLabel}</div>
                                                                  <div className="text-[9px] text-zinc-400 mt-0.5">{variant.title}</div>
                                                               </div>
                                                             </div>

                                                             <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar ml-8 mr-8">
                                                                  {activeConstants.map(m => {
                                                                     let val = variant[m.key];
                                                                     let parsedVal = val;
                                                                     if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
                                                                        try { const arr = JSON.parse(val); if (arr.length > 0) parsedVal = arr[0]; } catch(e) {}
                                                                     }
                                                                     const disc = groupDiscrepancies[m.key];
                                                                     const isMismatch = disc && val !== disc.consensus;
                                                                     
                                                                     return (
                                                                       <div key={m.key} className={`group/m group flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all ${isMismatch ? 'bg-red-50 border-red-200 text-red-600 shadow-sm' : val ? 'bg-zinc-50 border-zinc-100 text-zinc-500' : 'bg-transparent border-transparent text-zinc-300 opacity-60'}`}>
                                                                          <span className="uppercase opacity-50 text-[8px] tracking-widest">{m.label.replace('Wheel Spec ','').replace('Rim ','')}:</span>
                                                                          {metafieldOptionsMap[m.key] && metafieldOptionsMap[m.key].length > 0 ? (
                                                                             <select 
                                                                               className={`${isMismatch ? 'font-black' : ''} bg-transparent outline-none cursor-pointer hover:text-black focus:text-black leading-none pb-0 text-[10px]`}
                                                                               style={{ width: '45px' }}
                                                                               value={parsedVal || ''}
                                                                               title="Select new value directly"
                                                                               onClick={e => e.stopPropagation()}
                                                                               onChange={async (e) => {
                                                                                 const rawVal = e.target.value;
                                                                                 let newVal = rawVal;
                                                                                 if (m.type && m.type.startsWith('list.') && rawVal) {
                                                                                    newVal = JSON.stringify([rawVal]);
                                                                                 }
                                                                                 if (newVal === val) return;
                                                                                 setLoading(true);
                                                                                 try {
                                                                                   const auth = localStorage.getItem('loam_ops_auth');
                                                                                   await fetch('/api/bulk-update-metafields', {
                                                                                     method: 'POST',
                                                                                     headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
                                                                                     body: JSON.stringify({ ids: [String(variant.shopify_variant_id)], metafields: [{ namespace: 'custom', key: m.key, value: newVal, type: m.type }], targetType: 'ProductVariant' })
                                                                                   });
                                                                                   fetchRules();
                                                                                 } catch(err) {}
                                                                                 setLoading(false);
                                                                               }}
                                                                             >
                                                                               <option value="">Clear</option>
                                                                               {metafieldOptionsMap[m.key].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                             </select>
                                                                           ) : m.type === 'boolean' ? (
                                                                             <select 
                                                                               className={`${isMismatch ? 'font-black' : ''} bg-transparent outline-none cursor-pointer hover:text-black focus:text-black leading-none pb-0 text-[10px]`}
                                                                               style={{ width: '45px' }}
                                                                               value={val === 'true' || val === true ? 'true' : val === 'false' || val === false ? 'false' : ''}
                                                                               title="Toggle boolean value"
                                                                               onClick={e => e.stopPropagation()}
                                                                               onChange={async (e) => {
                                                                                 const newVal = e.target.value;
                                                                                 if (newVal === val) return;
                                                                                 setLoading(true);
                                                                                 try {
                                                                                   const auth = localStorage.getItem('loam_ops_auth');
                                                                                   await fetch('/api/bulk-update-metafields', {
                                                                                     method: 'POST',
                                                                                     headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
                                                                                     body: JSON.stringify({ ids: [String(variant.shopify_variant_id)], metafields: [{ namespace: 'custom', key: m.key, value: newVal, type: m.type }], targetType: 'ProductVariant' })
                                                                                   });
                                                                                   fetchRules();
                                                                                 } catch(err) {}
                                                                                 setLoading(false);
                                                                               }}
                                                                             >
                                                                               <option value="">Clear</option>
                                                                               <option value="true">True</option>
                                                                               <option value="false">False</option>
                                                                             </select>
                                                                           ) : (
                                                                             <span 
                                                                                className={`${isMismatch ? 'font-black' : ''} cursor-pointer hover:text-black hover:underline decoration-dashed decoration-1 underline-offset-4 flex-1`}
                                                                                title="Click to edit value directly"
                                                                                onClick={async (e) => {
                                                                                   e.stopPropagation();
                                                                                   const newVal = window.prompt(`Update ${m.label}:\n\n(Leave blank to clear the value)`, val || '');
                                                                                if (newVal !== null && newVal !== val) {
                                                                                   setLoading(true);
                                                                                   try {
                                                                                     const auth = localStorage.getItem('loam_ops_auth');
                                                                                     await fetch('/api/bulk-update-metafields', {
                                                                                       method: 'POST',
                                                                                       headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
                                                                                       body: JSON.stringify({ 
                                                                                         ids: [String(variant.shopify_variant_id)], 
                                                                                         metafields: [{ namespace: 'custom', key: m.key, value: newVal, type: m.type }], 
                                                                                         targetType: 'ProductVariant' 
                                                                                       })
                                                                                     });
                                                                                     fetchRules();
                                                                                   } catch(err) { alert("Failed to update."); }
                                                                                   setLoading(false);
                                                                                }
                                                                             }}
                                                                            >{val || '--'}</span>
                                                                           )}
                                                                          {val && (
                                                                             <button 
                                                                               onClick={(e) => { e.stopPropagation(); syncFieldToFamily(product, m.key, val); }}
                                                                               title={`Sync ${m.label} to all variants`}
                                                                               className="ml-1 p-1 bg-white hover:bg-black hover:text-white rounded-md border border-zinc-200 opacity-0 group-hover/m:opacity-100 transition-all shadow-sm"
                                                                             >
                                                                               <RefreshCcw size={10} />
                                                                             </button>
                                                                          )}
                                                                       </div>
                                                                     );
                                                                  })}
                                                              </div>

                                                             <div className="flex items-center gap-8 text-right">
                                                                <div>
                                                                   <div className="text-[8px] font-black uppercase text-zinc-300 tracking-widest">Base Price</div>
                                                                   <div className="text-xs font-mono font-bold">${(variant.last_price / 100).toFixed(2)}</div>
                                                                </div>
                                                                <button onClick={(e) => { e.stopPropagation(); setEditingRule(variant); }} className=" p-2 text-zinc-400 hover:text-black transition-all bg-white rounded-lg border border-zinc-100 flex items-center gap-2 ml-4">
                                                                    <div className="text-[10px] font-mono text-zinc-300">#{variant.shopify_variant_id}</div>
                                                                    <ExternalLink size={14}/>
                                                                 </button>
                                                             </div>
                                                          </div>
                                                          );
                                                        })})()}
                                                    </div>
                                                  )}
                                               </div>
                                             );
                                          });
                                     })()}
                                   </div>
                                 </td>
                               </tr>
                             )}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
             </div>
          </div>
    </>
  );
}
