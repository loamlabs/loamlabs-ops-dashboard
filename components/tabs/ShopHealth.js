import React from 'react';
import { RefreshCcw, Search, Plus, Settings, X, ShieldAlert, ChevronDown, Info, ExternalLink, Loader2, AlertCircle, Clock, ShieldCheck, Layers, FileDown, Eye, CheckCircle2, Copy, Play, ArrowDownToLine, GitMerge, FileUp, Save, UploadCloud, FileEdit, HelpCircle, Activity, History, Trash2 } from 'lucide-react';

export default function ShopHealth(props) {
  const { HealthCard, rules } = props;

  return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic mb-2">Shop Health</h1>
             <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-12">Automated Data Audit & Integrity Engine</p>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <HealthCard title="Missing URLs" count={rules.filter(r => !r.vendor_url).length} subtitle="Items requiring configuration" icon={<AlertCircle className="text-red-500"/>}/>
                <HealthCard title="Missing Metafields" count="--" subtitle="Items lacking engineering data" icon={<Info className="text-blue-500"/>}/>
                <HealthCard title="Sync Conflicts" count={rules.filter(r => r.needs_review).length} subtitle="Margin safety violations" icon={<RefreshCcw className="text-orange-500"/>}/>
             </div>
              <div className="bg-white p-20 rounded-[3rem] border-2 border-dashed border-zinc-200 text-center">
                <ShieldCheck size={60} className="mx-auto text-zinc-200 mb-6"/>
                <h3 className="text-xl font-black uppercase italic">Data Audit in Progress</h3>
                <p className="text-zinc-400 text-sm max-w-xs mx-auto mt-2">Integrating Section 4.11 from Master Notes. Reporting on Negative Inventory coming next.</p>
             </div>
          </div>
  );
}
