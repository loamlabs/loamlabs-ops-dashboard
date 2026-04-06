import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronRight, ChevronDown, CheckCircle, AlertTriangle, 
  Trash2, Edit, Save, Plus, ArrowLeft, ArrowRight,
  Database, ShieldAlert, Loader2, X, Layers
} from 'lucide-react';

const EditableCell = React.memo(({ 
  rowId, 
  colKey, 
  value, 
  isDropdown, 
  options, 
  isFocused, 
  isEditing, 
  onFocus, 
  onBlur, 
  onChange, 
  onKeyDown, 
  onPaste,
  onDoubleClick
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select && !isDropdown) inputRef.current.select();
    }
  }, [isEditing, isDropdown]);

  const getDisplayValue = () => {
    if (value === null || value === undefined) return '';
    return String(value);
  };

  if (isEditing) {
    if (isDropdown) {
      return (
        <select 
          ref={inputRef}
          value={getDisplayValue()}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="w-full h-full bg-blue-50 border-none outline-none text-[11px] font-bold text-blue-700 p-0 m-0 cursor-pointer"
        >
          <option value="">-- Select --</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    }
    return (
      <input 
        ref={inputRef}
        type="text"
        value={getDisplayValue()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="w-full h-full bg-blue-50 border-none outline-none text-[11px] font-bold text-blue-700 px-4 m-0"
      />
    );
  }

  return (
    <div 
      onClick={onFocus}
      onDoubleClick={onDoubleClick}
      onPaste={onPaste}
      className={`w-full h-full min-h-[2.5rem] flex items-center px-4 cursor-cell transition-all group-hover:bg-zinc-50 ${isFocused ? 'bg-blue-50 ring-2 ring-inset ring-blue-400 z-10' : ''}`}
    >
      <span className="truncate text-[11px]">
        {getDisplayValue() || '(empty)'}
      </span>
    </div>
  );
});

const ComponentLibraryGrid = React.memo(({
  componentTab,
  finalFilteredList,
  selectedComponents,
  setSelectedComponents,
  gridUnsavedChanges,
  handleGridEdit,
  handleGridPaste,
  componentColumnWidths,
  startResizing,
  handleDragStart,
  handleDragOver,
  handleDrop,
  formatColumnTitle,
  getComponentUniqueId,
  getComponentValidation,
  toggleComponentSelection,
  DROPDOWN_OPTIONS,
  handleEditComponent,
  saveComponentChanges,
  componentData,
  focusedCell,
  setFocusedCell,
  editingCell,
  setEditingCell,
  componentSaving
}) => {
  const tableRef = useRef(null);

  const getBiologicalCols = () => {
    const rawData = componentData[componentTab] || [];
    const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'Tags', 'tags', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'tags', '_rid', '_isNew', '_rawIdx', '_editIdx'];
    
    // Scan all rows to find every possible unique key (specification column)
    const allKeys = new Set();
    rawData.forEach(row => {
      Object.keys(row).forEach(k => {
        if (!excludeKeys.includes(k)) allKeys.add(k);
      });
    });
    
    return ['Vendor', 'Name', ...Array.from(allKeys)];
  };

  const navigateGrid = (direction) => {
    if (!focusedCell) return;
    
    const { rowId, colKey } = focusedCell;
    const rowIndex = finalFilteredList.findIndex(r => (r._rid || getComponentUniqueId(r)) === rowId);
    const allCols = getBiologicalCols();
    const colIndex = allCols.indexOf(colKey);
    
    if (rowIndex === -1 || colIndex === -1) return;

    let newRowIdx = rowIndex;
    let newColIdx = colIndex;

    switch (direction) {
      case 'ArrowUp': newRowIdx = Math.max(0, rowIndex - 1); break;
      case 'ArrowDown': newRowIdx = Math.min(finalFilteredList.length - 1, rowIndex + 1); break;
      case 'ArrowLeft': newColIdx = Math.max(0, colIndex - 1); break;
      case 'ArrowRight': newColIdx = Math.min(allCols.length - 1, colIndex + 1); break;
      case 'Tab': 
        newColIdx = colIndex + 1;
        if (newColIdx >= allCols.length) {
          newColIdx = 0;
          newRowIdx = Math.min(finalFilteredList.length - 1, rowIndex + 1);
        }
        break;
      case 'Enter':
        newRowIdx = Math.min(finalFilteredList.length - 1, rowIndex + 1);
        break;
    }

    const nextRow = finalFilteredList[newRowIdx];
    if (nextRow) {
      const nextRowId = nextRow._rid || getComponentUniqueId(nextRow);
      const nextColKey = allCols[newColIdx];
      setFocusedCell({ rowId: nextRowId, colKey: nextColKey });
    }
  };

  const handleKeyDown = (e) => {
    if (editingCell) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        setEditingCell(null);
        setTimeout(() => navigateGrid(e.key), 50);
      }
      return;
    }

    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      navigateGrid(e.key);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      navigateGrid('Tab');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedCell) setEditingCell(focusedCell);
    } else if (e.key === ' ' || e.key === 'F2') {
      e.preventDefault();
      if (focusedCell) setEditingCell(focusedCell);
    } else if (e.key === 'Escape') {
      setFocusedCell(null);
      setEditingCell(null);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (focusedCell) setEditingCell(focusedCell);
    }
  };

  const biologicalCols = getBiologicalCols();

  return (
    <div 
      className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="overflow-x-auto max-h-[650px] relative scrollbar-thin rounded-2xl border border-zinc-100 shadow-inner">
        <table className="min-w-full text-left text-sm whitespace-nowrap select-none border-collapse" ref={tableRef}>
          <thead className="bg-zinc-50 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <tr>
              <th className="p-4 px-6 w-12 bg-zinc-50 border-r border-zinc-100 sticky left-0 z-40">
                <input 
                  type="checkbox" 
                  checked={selectedComponents.length === finalFilteredList.length && finalFilteredList.length > 0} 
                  onChange={(e) => {
                    if (e.target.checked) setSelectedComponents(finalFilteredList.map((v) => v._rid || getComponentUniqueId(v)));
                    else setSelectedComponents([]);
                  }} 
                  className="w-4 h-4 rounded border-zinc-300 accent-blue-600 cursor-pointer" 
                />
              </th>
              
              <th 
                style={{ width: 150, minWidth: 150, position: 'sticky', left: '48px', zIndex: 20 }}
                className="p-4 px-6 font-black text-[10px] uppercase text-zinc-400 tracking-widest bg-zinc-50 border-r border-zinc-100 group/h relative"
              >
                Vendor
              </th>

              <th 
                style={{ width: componentColumnWidths[componentTab + '_name'] || 300, minWidth: componentColumnWidths[componentTab + '_name'] || 300, position: 'sticky', left: '198px', zIndex: 20 }}
                className="p-4 px-6 font-black text-[10px] uppercase text-zinc-400 tracking-widest bg-zinc-50 border-r border-zinc-100 group/h relative"
              >
                Name
                <div onMouseDown={(e) => startResizing(e, componentTab + '_name')} className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-black/20 transition-colors z-30" />
              </th>

              {biologicalCols.slice(2).map(col => (
                <th 
                  key={col} 
                  style={{ 
                    width: componentColumnWidths[componentTab + '_' + col] || 150, 
                    minWidth: componentColumnWidths[componentTab + '_' + col] || 150 
                  }}
                  className="p-4 font-black text-[10px] uppercase text-zinc-400 tracking-widest hover:bg-zinc-100 transition-colors relative group/h border-r border-zinc-50"
                >
                  {formatColumnTitle(col)}
                  <div onMouseDown={(e) => startResizing(e, componentTab + '_' + col)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-black/20 transition-colors z-30 opacity-0 group-hover/h:opacity-100" />
                </th>
              ))}
              <th className="p-4 px-6 font-black text-[10px] uppercase text-zinc-400 tracking-widest text-right bg-zinc-50">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {finalFilteredList.map((row, i) => {
              const rowId = row._rid || getComponentUniqueId(row);
              const isSelected = selectedComponents.includes(rowId);
              const validation = getComponentValidation(row, componentTab);
              const { isValid } = validation;
              const reactKey = "row_" + componentTab + "_" + rowId;
              const unsaved = (gridUnsavedChanges[componentTab] || {})[rowId] || {};
              
              return (
                <tr key={reactKey} className={(isValid ? 'odd:bg-white even:bg-zinc-100/30' : 'bg-red-50 hover:bg-red-100/50') + ' transition-colors group border-b border-zinc-100 last:border-0 ' + (isSelected ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : '')}>
                  <td className="p-4 px-6 w-12 border-r border-zinc-100 sticky left-0 z-30 bg-zinc-50">
                    <input type="checkbox" checked={isSelected} onChange={(e) => toggleComponentSelection(rowId, e, finalFilteredList)} className="w-4 h-4 rounded border-zinc-300 accent-blue-600 cursor-pointer" />
                  </td>

                  <td 
                    style={{ position: 'sticky', left: '48px', zIndex: 20 }}
                    className={"p-0 border-r border-zinc-100 " + (isValid ? (i % 2 === 0 ? 'bg-white' : 'bg-zinc-50') : 'bg-red-50') + " group-hover:bg-zinc-100 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.02)]"}
                  >
                    <EditableCell 
                      rowId={rowId}
                      colKey="Vendor"
                      value={unsaved.Vendor !== undefined ? unsaved.Vendor : (row.Vendor || row.vendor || row.Brand || row.brand || row.brand_name || '')}
                      isFocused={focusedCell?.rowId === rowId && focusedCell?.colKey === 'Vendor'}
                      isEditing={editingCell?.rowId === rowId && editingCell?.colKey === 'Vendor'}
                      onFocus={() => { setFocusedCell({ rowId, colKey: 'Vendor' }); }}
                      onBlur={() => setEditingCell(null)}
                      onChange={(val) => handleGridEdit(rowId, 'Vendor', val)}
                      onDoubleClick={() => setEditingCell({ rowId, colKey: 'Vendor' })}
                      onPaste={(e) => handleGridPaste(e, rowId, 'Vendor', biologicalCols)}
                    />
                  </td>

                  <td 
                    style={{ width: componentColumnWidths[componentTab + '_name'] || 300, minWidth: componentColumnWidths[componentTab + '_name'] || 300, position: 'sticky', left: '198px', zIndex: 20 }}
                    className={"p-0 border-r border-zinc-100 " + (isValid ? (i % 2 === 0 ? 'bg-white' : 'bg-zinc-50') : 'bg-red-50') + " group-hover:bg-zinc-100 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.05)] relative"}
                  >
                    <div className="flex items-center justify-between px-2">
                        <div className="flex-grow">
                          <EditableCell 
                            rowId={rowId}
                            colKey="Name"
                            value={unsaved.Name !== undefined ? unsaved.Name : (row.Name || row.name || row.title || row.Title || row.displayName || row.product_title || '')}
                            isFocused={focusedCell?.rowId === rowId && focusedCell?.colKey === 'Name'}
                            isEditing={editingCell?.rowId === rowId && editingCell?.colKey === 'Name'}
                            onFocus={() => { setFocusedCell({ rowId, colKey: 'Name' }); }}
                            onBlur={() => setEditingCell(null)}
                            onChange={(val) => handleGridEdit(rowId, 'Name', val)}
                            onDoubleClick={() => setEditingCell({ rowId, colKey: 'Name' })}
                            onPaste={(e) => handleGridPaste(e, rowId, 'Name', biologicalCols)}
                          />
                        </div>
                        {!isValid && (
                          <div 
                            className="flex-shrink-0 ml-2 animate-pulse cursor-help group/val" 
                            title={`DATA REQUIRED: ${validation.missingFields.join(', ')}`}
                          >
                            <div className="bg-red-500 text-white rounded-full p-1.5 shadow-lg border border-red-400">
                                <ShieldAlert size={10} />
                            </div>
                            {/* Detailed Popover on Hover */}
                            <div className="absolute top-[80%] right-2 hidden group-hover/val:block z-[100] bg-zinc-900 text-white p-3 rounded-xl border border-zinc-800 shadow-2xl min-w-[200px] animate-in fade-in zoom-in duration-200">
                               <div className="text-[9px] font-black uppercase text-red-400 italic mb-1 tracking-widest">Enrollment Error Detected</div>
                               <div className="text-[10px] font-bold text-zinc-300">Missing: {validation.missingFields.join(', ')}</div>
                            </div>
                          </div>
                        )}
                    </div>
                  </td>

                  {biologicalCols.slice(2).map(col => {
                    const val = unsaved[col] !== undefined ? unsaved[col] : row[col];
                    const options = DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[formatColumnTitle(col)];
                    
                    return (
                      <td key={col} className="p-0 border-r border-zinc-50">
                        <EditableCell 
                          rowId={rowId}
                          colKey={col}
                          value={val}
                          isDropdown={!!options}
                          options={options || []}
                          isFocused={focusedCell?.rowId === rowId && focusedCell?.colKey === col}
                          isEditing={editingCell?.rowId === rowId && editingCell?.colKey === col}
                          onFocus={() => { setFocusedCell({ rowId, colKey: col }); }}
                          onBlur={() => setEditingCell(null)}
                          onChange={(newVal) => handleGridEdit(rowId, col, newVal)}
                          onDoubleClick={() => setEditingCell({ rowId, colKey: col })}
                          onPaste={(e) => handleGridPaste(e, rowId, col, biologicalCols)}
                        />
                      </td>
                    );
                  })}
                  <td className="p-4 px-6 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                       <button onClick={() => { handleEditComponent(row, i); }} title="Advanced Edit" className="p-2 bg-zinc-100 hover:bg-black hover:text-white text-zinc-400 rounded-lg transition-all"><Edit size={12} /></button>
                       <button onClick={() => {
                          if (confirm("Delete " + (row.Name || row.title) + "? This cannot be undone.")) {
                             const delId = rowId;
                             const rawData = componentData[componentTab] || [];
                             const updatedArray = rawData.filter((item, idx) => getComponentUniqueId(item, idx) !== delId);
                             saveComponentChanges(updatedArray, componentTab).catch(err => console.error("Delete failed:", err));
                          }
                       }} title="Trash Component" className="p-2 bg-zinc-100 hover:bg-red-500 hover:text-white text-zinc-400 rounded-lg transition-all"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default ComponentLibraryGrid;

