import React from 'react';
import { RefreshCcw, Search, Plus, Settings, X, ShieldAlert, ChevronDown, Info, ExternalLink, Loader2, AlertCircle, Clock, ShieldCheck, Layers, FileDown, Eye, CheckCircle2, Copy, Play, ArrowDownToLine, GitMerge, FileUp, Save, UploadCloud, FileEdit, HelpCircle } from 'lucide-react';

export default function ComponentLibrary(props) {
  const { fetchComponentHistory, loadingHistory, handleSyncSpecsFromShopify, loading, selectedComponents, componentTab, handleDiscoverVariantIds, isDiscoveringVariants, Zap, handleAuditShopifySync, isAuditing, handleAddNewRow, handleCreateNewComponent, Edit3, componentData, getComponentUniqueId, syncMismatches, setComponentTab, setComponentVendorFilter, setShowMissingOnly, setShowMismatchesOnly, uniqueVendors, componentVendorFilter, showMissingOnly, showMismatchesOnly, AlertTriangle, componentSearch, setComponentSearch, componentsLoaded, finalFilteredList, Database, ComponentLibraryGrid, setSelectedComponents, gridUnsavedChanges, handleGridEdit, handleGridPaste, componentColumnWidths, startResizing, handleDragStart, handleDragOver, handleDrop, formatColumnTitle, getComponentValidation, toggleComponentSelection, handleRemoveAddedRow, handleDeleteComponent, handleDuplicateComponent, DROPDOWN_OPTIONS, handleEditComponent, saveComponentChanges, focusedCell, setFocusedCell, selectedCells, setSelectedCells, handleClipboardCopy, handleBulkPaste, editingCell, setEditingCell, componentSaving, componentColumnOrder, isComponentDrawerOpen, editingComponent, setIsComponentDrawerOpen, isDuplicateMode, getComponentValue, setEditingComponent, productSyncId, setProductSyncId, isImportingProduct, handleImportProductByID, RefreshCw, MANDATORY_FIELDS, metafieldOptionsMap, spokePolish, isBulkEditDrawerOpen, setIsBulkEditDrawerOpen, bulkEditComponent, setBulkEditComponent, handleBulkEdit } = props;

  return (
           <>
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
               <div className="flex items-center justify-between mb-8">
                   <div>
                       <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic mb-2">Component Library</h1>
                       <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest leading-relaxed max-w-2xl">
                           Manage the master specification JSON database directly. Changes here will commit directly to the Unified Calculator Repository via GitHub API.
                       </p>
                   </div>
                    <div className="flex items-center gap-3">
                        <div className="flex bg-zinc-100 p-1 rounded-2xl gap-1">
                           <button 
                             onClick={fetchComponentHistory} 
                             disabled={loadingHistory}
                             className="px-4 py-3 hover:bg-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-zinc-500 hover:text-black flex items-center gap-2 group"
                           >
                             {loadingHistory ? <Loader2 size={12} className="animate-spin"/> : <Clock size={12}/>} History
                           </button>
                           <button 
                             onClick={handleSyncSpecsFromShopify} 
                             disabled={loading || (selectedComponents[componentTab] || []).length === 0}
                             className="px-4 py-3 hover:bg-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-zinc-500 hover:text-blue-600 flex items-center gap-2 group disabled:opacity-30 disabled:hover:text-zinc-500"
                           >
                             <RefreshCcw size={12} className={loading ? 'animate-spin' : ''}/> Sync Selected from Shopify
                           </button>
                           <button 
                             onClick={handleDiscoverVariantIds} 
                             disabled={isDiscoveringVariants}
                             className="px-4 py-3 hover:bg-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-zinc-500 hover:text-emerald-600 flex items-center gap-2 group"
                           >
                             {isDiscoveringVariants ? <Loader2 size={12} className="animate-spin"/> : <Zap size={12}/>} Link Variants
                           </button>
                           <button 
                             onClick={handleAuditShopifySync} 
                             disabled={isAuditing}
                             className="px-4 py-3 hover:bg-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-zinc-500 hover:text-orange-600 flex items-center gap-2 group"
                           >
                             {isAuditing ? <Loader2 size={12} className="animate-spin"/> : <ShieldCheck size={12}/>} Sync Audit
                           </button>
                        </div>
                        <button onClick={() => handleAddNewRow(1)} className="bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all border border-zinc-200 flex items-center gap-2">
                           <Plus size={16}/> Add Blank Row
                        </button>
                        <button onClick={() => handleCreateNewComponent(componentTab)} className="bg-black text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-zinc-800 transition-all shadow-xl flex items-center gap-2">
                           <Edit3 size={16}/> New Component
                        </button>
                    </div>
                </div>

                <div className="mb-10">
                   <div className="flex gap-4 mb-8 border-b-2 border-zinc-100 pb-2">
                      {['rims', 'hubs', 'spokes', 'nipples'].map(tab => {
                         const tabMismatches = (componentData[tab] || []).filter(c => {
                            const rid = c?._rid || getComponentUniqueId(c);
                            return syncMismatches[rid] && syncMismatches[rid].length > 0;
                         }).length;

                         return (
                            <button 
                               key={tab} 
                               onClick={() => { setComponentTab(tab); setComponentVendorFilter('All'); setShowMissingOnly(false); setShowMismatchesOnly(false); }} 
                               className={`relative px-6 py-3 font-black text-[10px] uppercase tracking-widest transition-all ${componentTab === tab ? 'text-black border-b-2 border-black -mb-[10px] bg-zinc-100 rounded-t-xl' : 'text-zinc-400 hover:text-zinc-600'}`}
                            >
                               {tab} ({componentData[tab]?.length || 0})
                               {tabMismatches > 0 && (
                                  <div className="absolute -right-1 top-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse shadow-sm"></div>
                               )}
                            </button>
                         );
                      })}
                   </div>
                   
                   {uniqueVendors.length > 0 && (
                     <div className="mb-8 p-8 bg-white border border-zinc-100 rounded-[2rem] shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col gap-6">
                         <div>
                            <div className="flex items-center justify-between mb-4">
                              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Filter by Component Vendor</label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                               <button 
                                 onClick={() => setComponentVendorFilter('All')} 
                                 className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${componentVendorFilter === 'All' ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                               >
                                 All Vendors
                               </button>
                               {uniqueVendors.map(v => (
                                   <button key={v} onClick={() => setComponentVendorFilter(v)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all ${componentVendorFilter === v ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm scale-[1.02]' : 'bg-white text-zinc-500 border-zinc-100 hover:border-zinc-300'}`}>
                                     <span className="text-[10px] font-bold uppercase tracking-tight">{v}</span>
                                   </button>
                                ))}
                            </div>
                         </div>

                         <div className="pt-6 border-t border-zinc-100 flex items-center justify-between">
                            <div>
                               <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic mb-4">Data Integrity Filters</label>
                               <div className="flex items-center gap-2 p-1 bg-zinc-100/50 rounded-2xl border border-zinc-100 w-fit">
                                  <button onClick={() => { setShowMissingOnly(false); setShowMismatchesOnly(false); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(!showMissingOnly && !showMismatchesOnly) ? "bg-white text-black shadow-sm" : "text-zinc-400 hover:text-zinc-600"}`}>All</button>
                                  <button onClick={() => { setShowMissingOnly(true); setShowMismatchesOnly(false); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showMissingOnly ? "bg-red-500 text-white shadow-lg" : "text-zinc-400 hover:text-red-500"}`}>Missing Info</button>
                                  <button onClick={() => { setShowMismatchesOnly(true); setShowMissingOnly(false); }} className={`relative px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showMismatchesOnly ? "bg-orange-500 text-white shadow-lg" : "text-zinc-400 hover:text-orange-500"}`}>
                                     Sync Mismatches
                                     {Object.keys(syncMismatches).length > 0 && !showMismatchesOnly && (
                                        <div className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-bounce shadow-sm"></div>
                                     )}
                                  </button>
                               </div>
                               {showMissingOnly && <div className="px-4 mt-2 text-[9px] font-bold text-red-500 flex items-center gap-1 uppercase italic animate-pulse"><AlertTriangle size={12} /> Enrollment Errors Detected</div>}
                            </div>
                            
                            <div className="relative">
                               <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
                               <input type="text" placeholder={`Search ${componentTab}...`} value={componentSearch} onChange={(e) => setComponentSearch(e.target.value)} className="pl-9 pr-8 py-2 w-52 rounded-xl border-2 border-zinc-100 text-xs font-bold outline-none focus:border-black transition-all placeholder:text-zinc-300 placeholder:font-bold placeholder:italic" />
                               {componentSearch && <button onClick={() => setComponentSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600"><X size={12} /></button>}
                            </div>
                         </div>
                     </div>
                   )}

                   <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                      {!componentsLoaded ? (
                         <div className="p-12 text-center">
                            <Loader2 className="animate-spin text-zinc-300 mx-auto mb-4" size={32}/>
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Fetching JSON Data</p>
                         </div>
                      ) : finalFilteredList.length === 0 ? (
                         <div className="p-12 text-center">
                            <div className="text-zinc-300 mx-auto mb-4"><Database size={48} className="mx-auto opacity-20" /></div>
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest italic">No {componentTab} match filters ({componentVendorFilter} / Missing Only: {showMissingOnly ? 'Yes' : 'No'})</p>
                         </div>
                      ) : (
                         <ComponentLibraryGrid
                            componentTab={componentTab}
                            finalFilteredList={finalFilteredList}
                            selectedComponents={selectedComponents}
                            setSelectedComponents={setSelectedComponents}
                            gridUnsavedChanges={gridUnsavedChanges}
                            handleGridEdit={handleGridEdit}
                            handleGridPaste={handleGridPaste}
                            componentColumnWidths={componentColumnWidths}
                            startResizing={startResizing}
                            handleDragStart={handleDragStart}
                            handleDragOver={handleDragOver}
                            handleDrop={handleDrop}
                            formatColumnTitle={formatColumnTitle}
                            getComponentUniqueId={getComponentUniqueId}
                            getComponentValidation={getComponentValidation}
                            toggleComponentSelection={toggleComponentSelection}
                            handleRemoveAddedRow={handleRemoveAddedRow}
                            handleDeleteComponent={handleDeleteComponent}
                            handleDuplicateComponent={handleDuplicateComponent}
                            DROPDOWN_OPTIONS={DROPDOWN_OPTIONS}
                            handleEditComponent={handleEditComponent}
                            saveComponentChanges={saveComponentChanges}
                            componentData={componentData}
                            focusedCell={focusedCell}
                            setFocusedCell={setFocusedCell}
                            selectedCells={selectedCells}
                            setSelectedCells={setSelectedCells}
                            onCopy={handleClipboardCopy}
                            onPaste={handleBulkPaste}
                            editingCell={editingCell}
                            setEditingCell={setEditingCell}
                            componentSaving={componentSaving}
                            componentColumnOrder={componentColumnOrder}
                            syncMismatches={syncMismatches}
                         />
                      )}
                   </div>
                </div>

               {/* --- SIDEBAR EDITING DRAWER --- */}
               {isComponentDrawerOpen && editingComponent && (
                 <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsComponentDrawerOpen(false)}></div>
                    <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
                        <div className="p-8 border-b flex justify-between items-center bg-zinc-50 sticky top-0 z-20">
                           <div className="flex items-center gap-4">
                              <div className={`p-4 rounded-2xl shadow-xl border-2 ${isDuplicateMode ? 'bg-amber-500 border-amber-600 text-white' : (getComponentValidation(editingComponent, componentTab).isValid ? 'bg-black text-white' : 'bg-red-500 border-red-600 text-white animate-pulse')}`}>
                                 {isDuplicateMode ? <Plus size={24}/> : (getComponentValidation(editingComponent, componentTab).isValid ? <Database size={24}/> : <ShieldAlert size={24}/>)}
                              </div>
                              <div>
                                 <h3 className="text-2xl font-black uppercase italic tracking-tighter">
                                    {isDuplicateMode ? 'Clone Architect' : (editingComponent.id ? 'Refine Component' : 'Legacy Enrollment')}
                                 </h3>
                                 <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-black uppercase text-zinc-400 italic tracking-widest">{componentTab.slice(0, -1)} registry</p>
                                    {!getComponentValidation(editingComponent, componentTab).isValid && (
                                       <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-red-100 text-red-600 rounded-md animate-pulse">Required Data Missing</span>
                                    )}
                                 </div>
                              </div>
                           </div>
                           <button onClick={() => setIsComponentDrawerOpen(false)} className="p-3 hover:bg-zinc-200 rounded-2xl transition-all"><X size={24}/></button>
                        </div>

                       <div className="flex-grow overflow-y-auto p-8 space-y-8 scrollbar-thin">

                          <div className="grid gap-6">
                             {/* BASIC FIELDS */}
                             <div className="space-y-4 mb-10">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500/60 block italic">Primary Identity</label>
                                {[
                                   { label: 'Display Name', key: 'Title' },
                                   { label: 'Vendor / Brand', key: 'Vendor' }
                                ].map(field => (
                                   <div key={field.key} className="flex gap-4">
                                      <div className="flex-grow">
                                         <div className="text-[9px] font-black uppercase text-zinc-500/60 mb-1 ml-1 tracking-widest">{field.label}{(field.key === 'Title' || field.key === 'Vendor') && <span className="text-red-500 ml-1 font-bold">*</span>}</div>
                                         <input 
                                            type="text" 
                                            value={getComponentValue(editingComponent, field.key)}
                                            onChange={(e) => setEditingComponent({...editingComponent, [field.key]: e.target.value})}
                                             className={`w-full p-4 rounded-xl outline-none border-2 transition-all font-bold text-sm ${(field.key === 'Title' || field.key === 'Vendor') && (String(getComponentValue(editingComponent, field.key)).trim() === '') ? 'bg-red-50 border-red-200 focus:border-red-500' : 'bg-zinc-50 border-transparent focus:border-black'}`}
                                         />
                                      </div>
                                   </div>
                                ))}
                             </div>

                              {/* SHOPIFY LINKAGE SECTION */}
                              <div className="space-y-4 mb-4 bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100/50 shadow-inner">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block italic">Shopify Automation Link (Discovery)</label>
                                 <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                       <div className="text-[8px] font-black uppercase text-zinc-400 ml-1">Shopify Product ID</div>
                                       <div className="flex gap-2">
                                          <input 
                                             type="text" 
                                             placeholder="Numeric ID..."
                                             value={editingComponent.shopify_product_id || productSyncId || ''}
                                             onChange={(e) => {
                                                const val = e.target.value;
                                                setEditingComponent({...editingComponent, shopify_product_id: val});
                                                setProductSyncId(val);
                                             }}
                                             className="flex-grow p-3 rounded-xl outline-none border-2 border-transparent bg-white focus:border-emerald-500 transition-all font-mono text-xs font-bold shadow-sm"
                                          />
                                          <button 
                                             disabled={isImportingProduct || !(editingComponent.shopify_product_id || productSyncId)}
                                             onClick={() => handleImportProductByID()}
                                             className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all shadow-md disabled:bg-zinc-200"
                                             title="Rapid Sync: Pull all Product Metafields & Variants"
                                          >
                                             {isImportingProduct ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                          </button>
                                       </div>
                                    </div>
                                    <div className="space-y-1">
                                       <div className="text-[8px] font-black uppercase text-zinc-400 ml-1">Shopify Variant ID</div>
                                       <input 
                                          type="text" 
                                          placeholder="Auto-synced..."
                                          value={editingComponent.shopify_variant_id || ''}
                                          onChange={(e) => setEditingComponent({...editingComponent, shopify_variant_id: e.target.value})}
                                          className="w-full p-3 rounded-xl outline-none border-2 border-transparent bg-white focus:border-emerald-500 transition-all font-mono text-xs font-bold shadow-sm"
                                       />
                                    </div>
                                 </div>
                                 <p className="text-[8px] font-bold text-zinc-400 uppercase leading-relaxed px-1">
                                    Use the <span className="text-emerald-600 font-black">Product Sync</span> button to pull all engineering specs directly from your live Shopify store.
                                 </p>
                              </div>

                             {/* SPECIFICATION FIELDS */}
                             <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block italic">Technical Specifications</label>
                                {(() => {
                                   const activeList = (componentData[componentTab] || []).filter(Boolean).map((item, idx) => ({ ...item, _rawIdx: idx }));
                                   const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'Shopify Variant ID', 'Shopify Product ID', 'shopify_variant_id', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx', 'Wheel Spec Position', 'wheel_spec_position', 'Wheel Spec Rim Size', 'wheel_spec_rim_size', 'Rim Size', 'Weight G', 'Rim ERD', 'Weight G (p)', 'Weight G (v)', 'Weight G (P)', 'Weight G (V)'];
                                   const specFields = [...new Set(activeList.slice(0, 10).flatMap(item => Object.keys(item)))].filter(k => !excludeKeys.includes(k));
                                   
                                   return specFields.map(key => {
                                      const isMandatoryRaw = MANDATORY_FIELDS[componentTab]?.some(f => { 
                                          const nf = f.toLowerCase().replace(/[^a-z0-9]/g, ''); 
                                          const nk = key.toLowerCase().replace(/[^a-z0-9]/g, ''); 
                                          return nf === nk || nk.startsWith(nf) || nf.startsWith(nk) || nk.includes(nf) || nf.includes(nk); 
                                       });

                                      // CONDITIONAL WEIGHT LOGIC: Only mandatory if BOTH weight fields are empty
                                      let isMandatory = isMandatoryRaw;
                                      if (key.toLowerCase().includes('weight_g')) {
                                         const hasVariantWeight = !!editingComponent['Variant Metafield: custom.weight_g [number_decimal]'];
                                         const hasProductWeight = !!editingComponent['Metafield: custom.weight_g [number_decimal]'];
                                         if (hasVariantWeight || hasProductWeight) isMandatory = false;
                                      }

                                      // DYNAMIC OPTIONS: For Rims, pull Option1 Value choices from Shopify metafield validation
                                      let options = DROPDOWN_OPTIONS[key] || DROPDOWN_OPTIONS[formatColumnTitle(key)] || DROPDOWN_OPTIONS[key.toLowerCase()];
                                      if (key === 'Option1 Value' && componentTab === 'rims' && metafieldOptionsMap['wheel_spec_rim_size']) {
                                         options = metafieldOptionsMap['wheel_spec_rim_size'];
                                      }
                                      
                                      return (
                                         <div key={key} className="flex items-start gap-4 group/field">
                                            <div className="flex-grow">
                                               <div className="text-[9px] font-black uppercase text-zinc-500/60 mb-1 ml-1 tracking-widest flex items-center gap-1">
                                                  {formatColumnTitle(key)}
                                                  {isMandatory && <span className="text-red-500 font-bold">*</span>}
                                               </div>
                                               {options ? (
                                                  <select 
                                                     value={(editingComponent[key] === 0 || editingComponent[key] === '0') ? '0' : (editingComponent[key] || '')}
                                                     onChange={(e) => {
                                                        const val = e.target.value;
                                                        let updates = {[key]: val};
                                                        if (key === 'Hub Type' || key.toLowerCase().replace(/[^a-z]/g,'') === 'hubtype') {
                                                           if (val === 'Straight Pull' || val === 'Hook Flange') {
                                                              updates['Hub Lacing Policy'] = 'Use Manual Override Field';
                                                           }
                                                        }
                                                        setEditingComponent({...editingComponent, ...updates});
                                                     }}
                                                      className={`w-full p-4 rounded-xl outline-none border-2 transition-all font-bold text-sm appearance-none cursor-pointer ${isMandatory && String(editingComponent[key] || '').trim() === '' && editingComponent[key] !== 0 && editingComponent[key] !== '0' ? 'bg-red-50 border-red-200 focus:border-red-500' : 'bg-zinc-50 border-transparent focus:border-black'}`}
                                                  >
                                                     <option value="">Select Option</option>
                                                     {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                  </select>
                                               ) : (
                                                  <input 
                                                     type="text" 
                                                     list={`list-${key.replace(/\s+/g, '-')}`}
                                                     value={(editingComponent[key] === 0 || editingComponent[key] === '0') ? '0' : (editingComponent[key] || '')}
                                                     onChange={(e) => {
                                                        let val = e.target.value;
                                                        // Spoke Polish: Auto-add 'h' for hole counts
                                                        if (key.toLowerCase().includes('hole') || key.toLowerCase().includes('count') || key.toLowerCase().includes('option')) {
                                                           val = spokePolish(val);
                                                        }
                                                        setEditingComponent({...editingComponent, [key]: val});
                                                     }}
                                                     className={`w-full p-4 rounded-xl outline-none border-2 transition-all font-mono text-xs ${isMandatory && String(editingComponent[key] || "").trim() === "" && editingComponent[key] !== 0 && editingComponent[key] !== "0" ? "bg-red-50 border-red-200 focus:border-red-500" : "bg-zinc-50 border-transparent focus:border-black"}`}
                                                  />
                                               )}
                                            </div>
                                         </div>
                                      );
                                   });
                                })()}
                             </div>
                          </div>
                       </div>


                              <div className="p-8 bg-zinc-50 border-t border-zinc-100 flex items-center gap-4">
                          <button 
                             onClick={() => setIsComponentDrawerOpen(false)}
                             className="flex-grow py-5 bg-white border-2 border-zinc-200 text-zinc-400 font-black uppercase tracking-widest text-xs rounded-2xl hover:border-zinc-400 hover:text-zinc-600 transition-all"
                          >
                             Cancel
                          </button>
                          {(() => {
                             const allConfirmed = true; 
                             
                             return (
                                <>
                                    <button 
                                       disabled={!allConfirmed || componentSaving}
                                       onClick={async () => {
                                            const activeArray = [...(componentData[componentTab] || [])];
                                            const targetId = editingComponent._rid || getComponentUniqueId(editingComponent, editingComponent._editIdx);
                                            const existingIdx = editingComponent._rawIdx !== undefined ? editingComponent._rawIdx : activeArray.findIndex(r => (r._rid || getComponentUniqueId(r)) === targetId);
                                            
                                            const { _rawIdx, ...cleanComp } = editingComponent;
                                            if (existingIdx >= 0 && !isDuplicateMode) {
                                               activeArray[existingIdx] = cleanComp;
                                            } else {
                                               const newComp = { ...cleanComp, _rid: `new_${Date.now()}` };
                                               activeArray.unshift(newComp);
                                            }
                                            
                                            await saveComponentChanges(activeArray).catch(err => console.error("[Persistence Error] Save failed:", err));
                                            
                                            if (!isDuplicateMode) setIsComponentDrawerOpen(false);
                                       }}
                                       className={`flex-[2] py-5 font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 ${allConfirmed && !componentSaving ? 'bg-black text-white hover:bg-zinc-800' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none'}`}
                                    >
                                       {componentSaving ? <Loader2 className="animate-spin" size={16}/> : <Database size={16}/>} 
                                       {isDuplicateMode ? 'Confirm & Commit Clone' : 'Save Changes'}
                                    </button>
                                    
                                    {!isDuplicateMode && (
                                       <button 
                                          disabled={!allConfirmed || componentSaving}
                                          onClick={async () => {
                                             const targetId = editingComponent._rid || getComponentUniqueId(editingComponent, editingComponent._editIdx);
                                             const activeArray = [...(componentData[componentTab] || [])];
                                             const existingIdx = editingComponent._rawIdx !== undefined ? editingComponent._rawIdx : activeArray.findIndex(r => (r._rid || getComponentUniqueId(r)) === targetId);
                                             
                                             const { _rawIdx, ...cleanComp } = editingComponent;
                                             if (existingIdx >= 0) {
                                                activeArray[existingIdx] = cleanComp;
                                             } else {
                                                const newComp = { ...cleanComp, _rid: `new_${Date.now()}` };
                                                activeArray.unshift(newComp);
                                             }
                                             
                                             const success = await saveComponentChanges(activeArray);
                                             if (success !== false) {
                                                handleDuplicateComponent(cleanComp);
                                             }
                                          }}
                                          className={`flex-1 py-5 font-black uppercase tracking-widest text-[9px] rounded-2xl shadow-lg transition-all flex flex-col items-center justify-center leading-tight ${allConfirmed && !componentSaving ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-zinc-100 text-zinc-300 cursor-not-allowed shadow-none'}`}
                                       >
                                          <span className="flex items-center gap-1.5"><Copy size={12}/> Clone</span>
                                          <span className="text-[7px] opacity-60">Save & Start Copy</span>
                                       </button>
                                    )}
                                 </>
                             );
                          })()}
                       </div>
                     </div>
                  </div>
               )}

                {/* --- MASS EDIT DRAWER --- */}
                {isBulkEditDrawerOpen && (
                  <div className="fixed inset-0 z-[160] flex justify-end">
                     <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsBulkEditDrawerOpen(false)}></div>
                     <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
                         <div className="p-8 border-b flex justify-between items-center bg-zinc-900 text-white sticky top-0 z-20">
                            <div className="flex items-center gap-4">
                               <div className="p-4 rounded-2xl bg-white/10 border-2 border-white/20 text-white shadow-lg">
                                  <Layers size={24}/>
                               </div>
                               <div>
                                  <h3 className="text-2xl font-black uppercase italic tracking-tighter">
                                     Mass Edit {componentTab.slice(0, -1)}
                                  </h3>
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1 italic">Updating {selectedComponents.length} selected items</p>
                                </div>
                            </div>
                            <button onClick={() => setIsBulkEditDrawerOpen(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X size={24}/></button>
                         </div>
 
                        <div className="flex-grow overflow-y-auto p-8 space-y-8 scrollbar-thin bg-zinc-50/30">
                           <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl mb-4 shadow-sm">
                              <div className="flex items-center gap-3 text-amber-900 mb-2 font-black uppercase italic text-xs">
                                 <AlertTriangle size={16} className="animate-pulse"/> Bulk Update Protocol
                              </div>
                              <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-widest">
                                 Values entered below will overwrite the existing data for ALL {selectedComponents.length} selected components. 
                                 <span className="block mt-1 font-black text-amber-900 underline underline-offset-2">Fields left blank will not be modified.</span>
                              </p>
                           </div>
 
                           <div className="grid gap-6">
                              {/* VENDOR FIELD (Often bulk updated) */}
                              <div className="space-y-4 mb-4">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block italic">Global Identity</label>
                                 <div className="flex-grow">
                                    <div className="text-[9px] font-black uppercase text-zinc-500/60 mb-1 ml-1 tracking-widest uppercase">Vendor / Brand</div>
                                    <input 
                                       type="text" 
                                       placeholder="Leave blank to keep original..."
                                       value={bulkEditComponent.Vendor || ''}
                                       onChange={(e) => setBulkEditComponent({...bulkEditComponent, Vendor: e.target.value})}
                                       className="w-full p-4 rounded-xl outline-none border-2 border-zinc-100 bg-white shadow-sm focus:border-black transition-all font-bold text-sm"
                                    />
                                 </div>
                              </div>

                              {/* SHOPIFY LINKAGE SECTION */}
                              <div className="space-y-4 mb-4 bg-emerald-50/30 p-6 rounded-3xl border border-emerald-100/50">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block italic">Shopify Automation Link</label>
                                 <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                       <div className="text-[8px] font-black uppercase text-zinc-400 ml-1">Shopify Product ID</div>
                                       <input 
                                          type="text" 
                                          placeholder="Numeric ID only..."
                                          value={getComponentValue(editingComponent, 'shopify_product_id')}
                                          onChange={(e) => setEditingComponent({...editingComponent, shopify_product_id: e.target.value})}
                                          className="w-full p-3 rounded-xl outline-none border-2 border-transparent bg-white focus:border-emerald-500 transition-all font-mono text-xs font-bold shadow-sm"
                                       />
                                    </div>
                                    <div className="space-y-1">
                                       <div className="text-[8px] font-black uppercase text-zinc-400 ml-1">Shopify Variant ID</div>
                                       <input 
                                          type="text" 
                                          placeholder="Auto-synced..."
                                          value={getComponentValue(editingComponent, 'shopify_variant_id')}
                                          onChange={(e) => setEditingComponent({...editingComponent, shopify_variant_id: e.target.value})}
                                          className="w-full p-3 rounded-xl outline-none border-2 border-transparent bg-white focus:border-emerald-500 transition-all font-mono text-xs font-bold shadow-sm"
                                       />
                                    </div>
                                 </div>
                                 <p className="text-[8px] font-bold text-zinc-400 uppercase leading-relaxed px-1">
                                    These IDs power the <span className="text-emerald-600 font-black">Link Variants</span> engine. Items without Product IDs are skipped.
                                 </p>
                              </div>

                              {/* SPECIFICATION FIELDS */}
                              <div className="space-y-4">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block italic">Technical Specifications</label>
                                 {(() => {
                                    const activeList = (componentData[componentTab] || []);
                                    const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'Shopify Variant ID', 'Shopify Product ID', 'shopify_variant_id', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx', 'Wheel Spec Position', 'wheel_spec_position', 'Wheel Spec Rim Size', 'wheel_spec_rim_size', 'Rim Size', 'Weight G', 'Rim ERD', 'Weight G (p)', 'Weight G (v)', 'Weight G (P)', 'Weight G (V)'];
                                    const specFields = Array.from(new Set(activeList.slice(0, 10).flatMap(item => Object.keys(item)))).filter(k => !excludeKeys.includes(k));
                                    
                                    const nodes = specFields.map(key => {
                                       const isMandatoryRaw = MANDATORY_FIELDS[componentTab]?.some(f => { 
                                          const nf = f.toLowerCase().replace(/[^a-z0-9]/g, ''); 
                                          const nk = key.toLowerCase().replace(/[^a-z0-9]/g, ''); 
                                          return nf === nk || nk.startsWith(nf) || nf.startsWith(nk) || nk.includes(nf) || nf.includes(nk); 
                                       });

                                       // CONDITIONAL WEIGHT LOGIC for Mass Edit
                                       let isMandatory = isMandatoryRaw;
                                       if (key.toLowerCase().includes('weight_g')) {
                                          const hasVariantWeight = !!bulkEditComponent['Variant Metafield: custom.weight_g [number_decimal]'];
                                          const hasProductWeight = !!bulkEditComponent['Metafield: custom.weight_g [number_decimal]'];
                                          if (hasVariantWeight || hasProductWeight) isMandatory = false;
                                       }

                                       // DYNAMIC OPTIONS: For Rims, pull Option1 Value choices from Shopify metafield validation
                                       let options = DROPDOWN_OPTIONS[key] || DROPDOWN_OPTIONS[formatColumnTitle(key)] || DROPDOWN_OPTIONS[key.toLowerCase()];
                                       
                                       // [SPECIAL] Option1 Value Logic: Dropdown for Rims, Text for Hubs/Others
                                       if (key === 'Option1 Value') {
                                          if (componentTab === 'rims' && metafieldOptionsMap['wheel_spec_rim_size']) {
                                             options = metafieldOptionsMap['wheel_spec_rim_size'];
                                          } else {
                                             options = null; // Forces text input
                                          }
                                       }
                                       
                                       return (
                                          <div key={key} className="flex items-start gap-4">
                                             <div className="flex-grow">
                                                <div className="text-[9px] font-black uppercase text-zinc-500/60 mb-1 ml-1 tracking-widest flex items-center gap-1">
                                                   {formatColumnTitle(key)}
                                                   {isMandatory && <span className="text-red-500 font-bold">*</span>}
                                                </div>
                                                {options ? (
                                                   <select 
                                                      value={bulkEditComponent[key] || ''}
                                                      onChange={(e) => setBulkEditComponent({...bulkEditComponent, [key]: e.target.value})}
                                                       className={`w-full p-4 rounded-xl outline-none border-2 transition-all font-bold text-sm appearance-none cursor-pointer ${isMandatory && String(bulkEditComponent[key] || '').trim() === '' ? 'bg-red-50 border-red-200 focus:border-red-500' : 'bg-white border-zinc-100 focus:border-black'}`}
                                                   >
                                                      <option value="">-- No Change --</option>
                                                      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                   </select>
                                                ) : (
                                                   <input 
                                                      type="text" 
                                                      list={`list-${key.replace(/\s+/g, '-')}`}
                                                      placeholder="Leave blank to skip..."
                                                      value={bulkEditComponent[key] || ''}
                                                      onChange={(e) => setBulkEditComponent({...bulkEditComponent, [key]: e.target.value})}
                                                       className={`w-full p-4 rounded-xl outline-none border-2 transition-all font-mono text-xs ${isMandatory && String(bulkEditComponent[key] || '').trim() === '' ? 'bg-red-50 border-red-200 focus:border-red-500' : 'bg-white border-zinc-100 focus:border-black'}`}
                                                   />
                                                )}
                                             </div>
                                          </div>
                                       );
                                    });
                                    // RECLAIMED SPACE: System Metadata at bottom of scrollable list
                                    const metadata = (
                                       <div className="mt-12 pt-6 border-t border-zinc-100 opacity-40 hover:opacity-100 transition-opacity">
                                          <label className="text-[9px] font-black uppercase tracking-widest text-zinc-300 block italic mb-3">System Metadata (Internal Reference)</label>
                                          <div className="grid grid-cols-2 gap-3">
                                             <div className="bg-zinc-50/50 p-3 rounded-xl border border-zinc-100/30">
                                                <div className="text-[7px] font-black uppercase text-zinc-400 mb-0.5">Internal RID</div>
                                                <div className="font-mono text-[8px] truncate text-zinc-500" title={editingComponent?._rid}>{editingComponent?._rid || "N/A"}</div>
                                             </div>
                                             <div className="bg-zinc-50/50 p-3 rounded-xl border border-zinc-100/30">
                                                <div className="text-[7px] font-black uppercase text-zinc-400 mb-0.5">Raw Index</div>
                                                <div className="font-mono text-[8px] text-zinc-500">{editingComponent?._rawIdx ?? "New"}</div>
                                             </div>
                                          </div>
                                       </div>
                                    );
                                    return <>{nodes}{metadata}</>;
                                 })()}
                              </div>
                           </div>
                        </div>
 
                        <div className="p-8 bg-zinc-900 border-t border-zinc-800 flex items-center gap-4">
                           <button 
                              onClick={() => setIsBulkEditDrawerOpen(false)}
                              className="flex-grow py-5 bg-zinc-800 text-zinc-400 font-black uppercase tracking-widest text-xs rounded-2xl hover:text-white transition-all shadow-lg"
                           >
                              Abort Edit
                           </button>
                           <button 
                              disabled={componentSaving || Object.keys(bulkEditComponent).length === 0}
                              onClick={handleBulkEdit}
                              className={`flex-grow py-5 bg-white text-black font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-[0_10px_30px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 ${componentSaving || Object.keys(bulkEditComponent).length === 0 ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                           >
                              {componentSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={18} />}
                              Apply Changes
                           </button>
                        </div>
                     </div>
                  </div>
               )}
               </div>
            </>
  );
}
