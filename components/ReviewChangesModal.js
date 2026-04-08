import React from 'react';

const ReviewChangesModal = ({ isOpen, onClose, onConfirm, changes, originalData, addedRows, category }) => {
  if (!isOpen) return null;

  const modifiedIds = Object.keys(changes);
  const totalModifications = modifiedIds.length;
  const totalAdditions = addedRows.length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-zinc-100">
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Review Changes: {category?.toUpperCase()}</h2>
            <p className="text-sm text-zinc-500 mt-1">
              {totalModifications} modifications and {totalAdditions} additions found.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white rounded-full transition-colors text-zinc-400 hover:text-zinc-600 shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          {/* Section: Additions */}
          {totalAdditions > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                New Items to Add ({totalAdditions})
              </h3>
              <div className="bg-emerald-50 rounded-2xl border border-emerald-100 divide-y divide-emerald-100 overflow-hidden">
                {addedRows.map((row, idx) => (
                  <div key={idx} className="p-4 text-sm text-emerald-900 flex justify-between items-center">
                    <span className="font-medium">{row.Name || 'Unnamed Component'}</span>
                    <span className="text-xs bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 uppercase font-bold tracking-tighter">New Row</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Modifications */}
          {totalModifications > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                Modified Items ({totalModifications})
              </h3>
              <div className="space-y-3">
                {modifiedIds.map(rid => {
                  const original = originalData.find(item => (item._rid || item.id) === rid);
                  const fieldChanges = Object.entries(changes[rid]);
                  if (!original) return null;

                  return (
                    <div key={rid} className="bg-amber-50 rounded-2xl border border-amber-100 overflow-hidden">
                      <div className="bg-amber-100/30 p-3 text-xs font-bold text-amber-900 border-b border-amber-100 flex justify-between items-center">
                        <span>{original.Name || 'Unnamed'}</span>
                        <span className="text-[10px] opacity-50 uppercase tracking-widest">{original.Vendor || 'No Vendor'}</span>
                      </div>
                      <div className="p-3 space-y-2">
                        {fieldChanges.map(([key, newVal]) => (
                          <div key={key} className="flex items-center text-sm gap-2">
                            <span className="text-zinc-500 font-medium min-w-[80px]">{key}:</span>
                            <span className="text-zinc-400 line-through truncate max-w-[120px]">{original[key] || '(empty)'}</span>
                            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className="text-amber-900 font-bold bg-amber-200/50 px-2 py-0.5 rounded-md">{newVal}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {totalAdditions === 0 && totalModifications === 0 && (
            <div className="text-center py-12 text-zinc-400">
              <p>No changes detected in your current draft.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-grow py-3 px-4 bg-white border border-zinc-200 text-zinc-700 font-bold rounded-2xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            Go Back & Edit
          </button>
          <button 
            onClick={onConfirm}
            disabled={totalAdditions === 0 && totalModifications === 0}
            className="flex-grow py-3 px-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95"
          >
            Confirm & Push to GitHub
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewChangesModal;
