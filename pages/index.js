import React, { useState, useEffect, useRef } from 'react';
import ComponentLibraryGrid from '../components/ComponentLibraryGrid';
import ReviewChangesModal from '../components/ReviewChangesModal';
import { RefreshCcw, Search, Package, ShieldCheck, ShieldAlert, Plus, X, Info, Image as ImageIcon, Loader2, LogOut, ChevronUp, ChevronDown, ChevronRight, Trash2, AlertCircle, AlertTriangle, Zap, ZapOff, DollarSign, Tag, History, Activity, Beaker, Edit3, Edit, Settings, ExternalLink, BarChart, Database, CheckCircle, Layers, Clock } from 'lucide-react';

const COMPONENT_SUGGESTIONS = {};

const DROPDOWN_OPTIONS = {
  'Wheel Spec Position': ['Front', 'Rear', 'Front/Rear'],
  'Brake Interface': ['Centerlock', '6-Bolt', 'N/A', 'Rim Brake'],
  'Option 1 Name': ['Size', 'Spoke Count', 'Freehub', 'Spacing', 'Color', 'Type'],
  'Option 2 Name': ['Size', 'Spoke Count', 'Freehub', 'Spacing', 'Color', 'Type'],
  'Rim Size': ['26"', '27.5"', '29"', '30"', '31"', '32"', '700c', '650b'],
  'Spoke Count': ['16h', '18h', '20h', '24h', '28h', '32h', '36h'],
  'Hub Type': ['J-Bend', 'Straight Pull', 'Hook Flange'],
  'Hub Lacing Policy': ['Standard', 'Force 2-Cross for 28h Only', 'Force 3-Cross for 28h Only', 'Force All as 2-Cross', 'Use Manual Override Field', 'None'],
  'Rim Washer Policy': ['Optional', 'Mandatory', 'Not Compatible', 'None'],
  'Spoke Type': ['J-Bend', 'Straight Pull', 'Carbon'],
  'Spoke Rounding Rule': ['Nearest', 'Even'],
  'Hub Spacing': ['QR', '100mm', '110mm', '135mm', '142mm', '148mm', '150mm', '157mm'],
  'Hub Freehub': ['Standard', 'XD', 'XDR', 'N/A']
};

const MANDATORY_FIELDS = {
  rims: ['Name', 'Vendor', 'Option 1 Name', 'Option 1 Value', 'Option 2 Name', 'Option 2 Value', 'Wheel Spec Position', 'Rim Erd', 'Weight G (p)'],
  hubs: ['Name', 'Vendor', 'Option 1 Name', 'Option 1 Value', 'Hub Type', 'Weight G (v)', 'Wheel Spec Position'],
  spokes: ['Name', 'Vendor', 'Spoke Type', 'Spoke Cross Section Area Mm2', 'Spoke Model Group', 'Weight G (p)', 'Spoke Diameter Spec', 'Spoke Rounding Rule'],
  nipples: ['Name', 'Vendor', 'Option 1 Name', 'Option 1 Value', 'Weight G (p)']
};

function HealthCard({ title, count, subtitle, icon }) {
    return (
        <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100">{icon}</div>
                <div className="text-3xl font-black italic">{count}</div>
            </div>
            <div className="font-black uppercase text-xs mb-1">{title}</div>
            <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">{subtitle}</div>
        </div>
    );
}

function SidebarLink({ icon, label, active, onClick, badge, badgeOnClick }) {
  return (
    <button onClick={onClick} className={`relative w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-black text-xs uppercase tracking-tight ${active ? 'bg-white text-black shadow-xl scale-[1.03]' : 'hover:bg-zinc-900 text-zinc-600'}`}>
      {icon} {label}
      {badge && (
        <div 
          onClick={badgeOnClick}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-red-500/20 hover:scale-110 active:scale-95 transition-transform"
        >
          {badge}
        </div>
      )}
    </button>
  );
}

export default function OpsDashboard() {
  const [editingRule, setEditingRule] = useState(null);
  const [activeTab, setActiveTab] = useState('vendors');
  const [rules, setRules] = useState([]);
  const [vendorLogos, setVendorLogos] = useState([]);
  const [password, setPassword] = useState(process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || '');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metafieldOptionsMap, setMetafieldOptionsMap] = useState({});
  const [adminTab, setAdminTab] = useState('control_module');
  const [savingLogo, setSavingLogo] = useState(null);
  const [selectedVendors, setSelectedVendors] = useState([]); 
  const [registrySearch, setRegistrySearch] = useState(''); 
  const [btiSearch, setBtiSearch] = useState(''); 
  const [syncFilter, setSyncFilter] = useState('all'); 
  const [btiSyncFilter, setBtiSyncFilter] = useState('all'); 
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedRules, setSelectedRules] = useState([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showMetaEditModal, setShowMetaEditModal] = useState(false);
  const [bulkEditUrl, setBulkEditUrl] = useState('');
  const [showDupModal, setShowDupModal] = useState(false);
  const [dupSourceProduct, setDupSourceProduct] = useState(null);
  const [dupOptions, setDupOptions] = useState({ 
    newTitle: '', 
    includeMedia: true, 
    includeInventory: true, 
    status: 'ACTIVE' 
  });
  const [labCategory, setLabCategory] = useState('all');
  const [labSearch, setLabSearch] = useState('');
  const [selectedLabProducts, setSelectedLabProducts] = useState([]);
  const [selectedLabVariants, setSelectedLabVariants] = useState([]);
  const [expandedProducts, setExpandedProducts] = useState([]);
  const [metaEditTab, setMetaEditTab] = useState('variant');
  const [labDiscrepancyOnly, setLabDiscrepancyOnly] = useState(false);
  const [abandonedBuilds, setAbandonedBuilds] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showDiscrepancyDropdown, setShowDiscrepancyDropdown] = useState(false);
  const [componentData, setComponentData] = useState({ hubs: [], rims: [], spokes: [], nipples: [] });
  const [componentsLoaded, setComponentsLoaded] = useState(false);
  const [componentTab, setComponentTab] = useState('rims');
  const [componentVendorFilter, setComponentVendorFilter] = useState('All');
  const [componentColumnOrder, setComponentColumnOrder] = useState({});
  const [selectedComponents, setSelectedComponents] = useState([]);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [isBulkEditDrawerOpen, setIsBulkEditDrawerOpen] = useState(false);
  const [bulkEditComponent, setBulkEditComponent] = useState({});
  
  // Scoped Spreadsheet State
  const [componentColumnWidths, setComponentColumnWidths] = useState({});
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [isComponentDrawerOpen, setIsComponentDrawerOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState(null);
  const [isDuplicateMode, setIsDuplicateMode] = useState(false);
  const [confirmedFields, setConfirmedFields] = useState([]);
  const [componentSaving, setComponentSaving] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [stagedUpdatedArray, setStagedUpdatedArray] = useState(null);
  const [componentHistory, setComponentHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showVariantSyncModal, setShowVariantSyncModal] = useState(false);
  const [proposedVariantUpdates, setProposedVariantUpdates] = useState([]);
  const [isDiscoveringVariants, setIsDiscoveringVariants] = useState(false);
  const [notification, setNotification] = useState(null);
  const [gridUnsavedChanges, setGridUnsavedChanges] = useState({}); 
  const [gridAddedRows, setGridAddedRows] = useState({ hubs: [], rims: [], spokes: [], nipples: [] });
  const [focusedCell, setFocusedCell] = useState(null); 
  const [selectedCells, setSelectedCells] = useState([]); 
  const [editingCell, setEditingCell] = useState(null); 
   const [clipboardValue, setClipboardValue] = useState(null);
   const handleClipboardCopy = React.useCallback(async (val) => {
     setClipboardValue(val);
     if (navigator.clipboard && val !== null && val !== undefined) {
         try {
             await navigator.clipboard.writeText(String(val));
         } catch(e) { console.error("Clipboard write failed", e); }
     }
   }, []);

    const [isAuditing, setIsAuditing] = useState(false);
    const [syncMismatches, setSyncMismatches] = useState({}); // { [rid]: [fieldKey1, fieldKey2] }
    const [showMismatchesOnly, setShowMismatchesOnly] = useState(false);
  const [metafieldRegistry, setMetafieldRegistry] = useState([
    { key: 'inventory_alert_threshold', label: 'Inventory Alert Threshold', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'integer' },
    { key: 'hub_manual_cross_value', label: 'Hub Manual Cross Value', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'weight_g', label: 'Weight G (v)', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'decimal' },
    { key: 'weight', label: 'Weight G (v) Aliased', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'decimal' },
    { key: 'length_adjust_mm', label: 'Length Adjust mm', categories: ['SPOKE'], target: 'variant', type: 'decimal' },
    { key: 'wheel_spec_position', label: 'Wheel Spec Position', categories: ['HUB'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'wheel_spec_brake_interface', label: 'Brake Interface', categories: ['HUB'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'wheel_spec_hub_spacing', label: 'Hub Spacing', categories: ['HUB'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'wheel_spec_rim_size', label: 'Rim Size', categories: ['RIM'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'rim_erd', label: 'Rim Erd', categories: ['RIM'], target: 'variant', type: 'decimal', isConstant: true },
    { key: 'valve_min_rim_depth_mm', label: 'Valve Min Rim Depth mm', categories: ['VALVESTEM'], target: 'variant', type: 'integer', isConstant: true },
    { key: 'valve_max_rim_depth_mm', label: 'Valve Max Rim Depth mm', categories: ['VALVESTEM'], target: 'variant', type: 'integer', isConstant: true },
    { key: 'internal_width_mm', label: 'Internal Width mm', categories: ['RIM'], target: 'variant', type: 'integer', isConstant: true },
    { key: 'acc_rim_width_min', label: 'Accessory Compatible Rim Width MIN (mm)', categories: ['ACCESSORY'], target: 'variant', type: 'integer' },
    { key: 'acc_rim_width_max', label: 'Accessory Compatible Rim Width MAX (mm)', categories: ['ACCESSORY'], target: 'variant', type: 'integer' },
    { key: 'hub_sp_offset_left', label: 'Hub SP Offset Spoke Hole Left', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'hub_sp_offset_right', label: 'Hub SP Offset Spoke Hole Right', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'historical_order_count', label: 'Historical Order Count', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'integer' },
    { key: 'bti_part_number', label: 'BTI Part Number', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'single_line_text_field' },
    { key: 'inventory_sync_key', label: 'Inventory Sync Key', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'single_line_text_field' },
    { key: 'product_weight_g', label: 'Weight G (p)', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'decimal' },
    { key: 'included_valve_variant_id', label: 'Included Valve Variant ID', categories: ['VALVESTEM'], target: 'product', type: 'single_line_text_field' },
    { key: 'integrated_hub_name', label: 'Integrated Hub Name', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'google_shopping_link', label: 'Google Shopping Canonical Link', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'url' },
    { key: 'preconfigured_wheel_rules', label: 'Pre-configured Wheel Rules', categories: ['RIM', 'HUB'], target: 'product', type: 'json' },
    { key: 'spoke_hub_interface', label: 'Spoke Hub Interface', categories: ['HUB', 'SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'price_adjustment_percentage', label: 'Price Adjustment Percentage', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'integer' },
    { key: 'model', label: 'Model', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    { key: 'pairing_key', label: 'Pairing Key', categories: ['RIM', 'HUB'], target: 'product', type: 'single_line_text_field' }
  ]);
  const [resizingCol, setResizingCol] = useState(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  // Refs
  const lastCheckedIndex = useRef(null);
  const lastCheckedComponentRef = useRef(null);

  // Missing States found during cleanup
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);

  // --- DATA DERIVATIONS (Top-Down Initialization) ---
  const visibleVendorNames = React.useMemo(() => {
    const names = new Set(rules.map(r => r.vendor_name).filter(Boolean));
    return Array.from(names).sort();
  }, [rules]);

  const allUniqueRules = React.useMemo(() => {
    const seen = new Set();
    return rules.filter(r => {
      const id = String(r.shopify_variant_id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [rules]);

  const getDiscrepancies = React.useCallback((variants) => {
    if (!variants || variants.length <= 1) return {};
    const constantKeys = metafieldRegistry.filter(m => m.isConstant).map(m => m.key);
    const issues = {};
    
    constantKeys.forEach(key => {
      const values = variants.map(v => v[key]).filter(val => val !== undefined && val !== null && val !== '');
      const uniqueValues = [...new Set(values)];
      if (uniqueValues.length > 1) {
        // Calculate consensus (most common value)
        const counts = {};
        values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
        const consensus = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        
        issues[key] = { values: uniqueValues, consensus };
      }
    });
    return issues;
  }, [metafieldRegistry]);

  const getVariantGroupKey = React.useCallback((variant, product) => {
    const parentTitle = product.title.split('(')[0].trim().toLowerCase();
    let variantLabel = variant.title;
    if (variantLabel.toLowerCase().startsWith(parentTitle)) {
      variantLabel = variantLabel.substring(parentTitle.length).trim();
    }
    const cleanLabel = variantLabel.replace(/^[(\s/-]+|[)\s/-]+$/g, '').trim();
    const parts = cleanLabel.split(/[/-]/).map(p => p.trim());
    const tags = Array.isArray(product.tags) ? product.tags.map(t => t.toLowerCase()) : [];
    
    if (tags.includes('rim') || tags.includes('component:rim')) {
      if (variant.wheel_spec_rim_size) return String(variant.wheel_spec_rim_size);
    }

    if (parts.length > 0) {
      if (tags.includes('component:hub') || tags.includes('hub')) return parts[0]; // Hole Count
      if (tags.includes('component:valvestem') || tags.includes('valvestem') || tags.includes('component:spoke') || tags.includes('spoke') || tags.includes('component:nipple') || tags.includes('nipple')) return parts[0]; // Color
      return parts[0]; // Size for rims, etc.
    }
    return 'Base Config';
  }, []);

  const getProductGroupedDiscrepancies = React.useCallback((product, productVariants) => {
    const groups = productVariants.reduce((acc, v) => {
      const key = getVariantGroupKey(v, product);
      if (!acc[key]) acc[key] = [];
      acc[key].push(v);
      return acc;
    }, {});

    let allDiscrepancies = {};
    Object.values(groups).forEach(groupArr => {
        const groupDiscs = getDiscrepancies(groupArr);
        Object.entries(groupDiscs).forEach(([k, config]) => {
            if (!allDiscrepancies[k]) {
                allDiscrepancies[k] = config;
            } else {
                config.values.forEach(v => {
                    if (!allDiscrepancies[k].values.includes(v)) allDiscrepancies[k].values.push(v);
                });
            }
        });
    });
    return allDiscrepancies;
  }, [getVariantGroupKey, getDiscrepancies]);

  const discrepancyProducts = React.useMemo(() => {
    return Object.values(allUniqueRules.reduce((acc, r) => {
       if (!acc[r.shopify_product_id]) acc[r.shopify_product_id] = { ...r, variants: [] };
       acc[r.shopify_product_id].variants.push(r);
       return acc;
    }, {})).filter(p => Object.keys(getProductGroupedDiscrepancies(p, p.variants)).length > 0);
  }, [allUniqueRules, getProductGroupedDiscrepancies]);

  const totalDiscrepancies = discrepancyProducts.length;

  const filteredRules = React.useMemo(() => {
    return allUniqueRules.filter(rule => {
      const matchesVendor = selectedVendors.length === 0 || selectedVendors.includes(rule.vendor_name);
      
      const normalize = (str) => String(str || "").toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
      const searchString = normalize(registrySearch);
      const searchTokens = searchString ? searchString.split(' ').filter(Boolean) : [];
      const searchMatch = searchTokens.length === 0 || searchTokens.every(token => 
         normalize(rule.title).includes(token) || normalize(rule.vendor_name).includes(token) || normalize(rule.bti_part_number).includes(token)
      );

      const matchesSync = syncFilter === 'all' 
        ? true 
        : syncFilter === 'on' ? rule.auto_update === true
        : syncFilter === 'off' ? rule.auto_update === false
        : syncFilter === 'sale' ? (rule.original_msrp && (rule.original_msrp - (rule.last_price/100))/rule.original_msrp >= 0.10)
        : syncFilter === 'oos' ? rule.last_availability === false
        : syncFilter === 'review' ? rule.needs_review === true
        : true;

      return matchesVendor && searchMatch && matchesSync;
    }).sort((a, b) => a.title.localeCompare(b.title));
  }, [allUniqueRules, selectedVendors, registrySearch, syncFilter]);

  const paginatedRules = React.useMemo(() => {
    return filteredRules.slice(0, visibleCount);
  }, [filteredRules, visibleCount]);

  // --- CORE UTILITIES (Foundation) ---
  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const formatColumnTitle = React.useCallback((title) => {
    const isVariant = title.toLowerCase().includes('variant metafield');
    const isProduct = !isVariant && title.toLowerCase().includes('metafield:');
    let clean = title.replace(/^Metafield:\s*custom\./i, '');
    clean = clean.replace(/^Variant Metafield:\s*custom\./i, '');
    clean = clean.replace(/\[.*?\]/g, '');
    clean = clean.replace(/_/g, ' ');
    let final = clean.trim().replace(/\b\w/g, l => l.toUpperCase());
    if (final.toLowerCase().includes('weight g')) {
       if (isVariant) return final + ' (v)';
       if (isProduct) return final + ' (p)';
    }
    return final;
  }, []);

  const getComponentUniqueId = React.useCallback((item, index) => {
    if (!item) return `empty_${index || 'unknown'}`;
    // Priority 1: Use the permanent stable _rid
    if (item._rid) return item._rid;
    // Priority 2: Use native database IDs
    const baseId = item.id || item.shopify_product_id || item.ID || item['Product ID'] || item['Variant ID'];
    if (baseId) return String(baseId);
    // Priority 3: Use row index only as a last resort during initial render (this should be rare after hydration)
    const name = item.Name || item.name || item.title || "Unknown";
    return `${name}_${item._rawIdx !== undefined ? item._rawIdx : index}`;
  }, []);

  const getComponentValue = React.useCallback((component, key) => {
    if (!component) return '';
    let normTarget = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (normTarget === 'name' || normTarget === 'displayname' || normTarget === 'title') {
       const exactName = component.Name || component.name || component.title || component.Title;
       if (exactName) return exactName;
    }
    if (normTarget === 'vendor' || normTarget === 'brand') {
       const exactVendor = component.Vendor || component.vendor || component.Brand || component.brand;
       if (exactVendor) return exactVendor;
    }

    if (component[key] !== undefined && component[key] !== null && component[key] !== '') return component[key];
    
    if (normTarget.includes('weightg')) {
       const findWeight = (type) => {
          return Object.keys(component).find(k => {
             const nk = k.toLowerCase();
             if (!nk.includes('weightg')) return false;
             if (type === 'v' && (nk.includes('variant') || nk.includes('(v)'))) return true;
             if (type === 'p' && (!nk.includes('variant') && (nk.includes('product') || nk.includes('(p)') || (nk.includes('metafield: custom') && !nk.includes('variant'))))) return true;
             return false;
          });
       };

       if (normTarget.endsWith('p')) {
          const k = findWeight('p');
          if (k && (component[k] || component[k] === 0)) return component[k];
       } else if (normTarget.endsWith('v')) {
          const k = findWeight('v');
          if (k && (component[k] || component[k] === 0)) return component[k];
       } else {
          const keys = Object.keys(component).filter(k => k.toLowerCase().includes('weightg'));
          for (let k of keys) {
             if (component[k] || component[k] === 0 || component[k] === '0') return component[k];
          }
       }
    }

    const foundKey = Object.keys(component).find(k => {
        let cleanKey = k.toLowerCase().replace(/^variant metafield: /i, '');
        cleanKey = cleanKey.replace(/^metafield: /i, '');
        cleanKey = cleanKey.replace(/^custom\./i, '');
        cleanKey = cleanKey.replace(/\[.*?\]/g, '');
        const nk = cleanKey.replace(/[^a-z0-9]/g, '');
        if ((nk.includes('optionname') || nk.includes('optionvalue')) && !normTarget.includes('option')) return false;
        return nk === normTarget;
    });
    if (foundKey && (component[foundKey] || component[foundKey] === 0 || component[foundKey] === '0')) return component[foundKey];

    const fuzzyKey = Object.keys(component).find(k => {
        const nk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const val = component[k];
        return nk.includes(normTarget) && !nk.includes('option') && (val || val === 0 || val === '0');
    });
    if (fuzzyKey) return component[fuzzyKey];
    
    if (normTarget === 'rimsize' || normTarget === 'diameter' || normTarget === 'size') {
        return component['Rim Size'] || component.size || component.diameter || '';
    }
    if (normTarget === 'holecount' || normTarget === 'spokecount' || normTarget === 'holes') {
        return component['Hole Count'] || component['Spoke Count'] || component.holes || '';
    }

    if (normTarget.includes('weight')) return component['Weight G (p)'] || component['Weight G (v)'] || component.weight || '';
    
    if (normTarget === 'wheelspecposition') return component['Wheel Spec Position'] || '';
    if (normTarget === 'rimerd') return component['Rim Erd'] || component.rim_erd || '';
    
    // Shopify ID Normalization for UI & Discovery
    if (normTarget === 'shopifyproductid' || normTarget === 'productid') {
       return component.shopify_product_id || component['Product ID'] || component.id || component.ID || '';
    }
    if (normTarget === 'shopifyvariantid' || normTarget === 'variantid') {
       return component.shopify_variant_id || component['Variant ID'] || '';
    }

    return '';
  }, []);

  const getComponentValidation = React.useCallback((component, tab) => {
    if (!component) return { isValid: true, missingFields: [] };
    const missing = [];
    const required = [...(MANDATORY_FIELDS[tab] || [])];
    const hubType = getComponentValue(component, 'Hub Type');
    const spokeType = getComponentValue(component, 'Spoke Type');
    const lacingPolicy = getComponentValue(component, 'Hub Lacing Policy');

    if (tab === 'hubs') {
       if (hubType === 'J-Bend') { 
          ['Hub Flange Diameter Left', 'Hub Flange Diameter Right', 'Hub Flange Offset Left', 'Hub Flange Offset Right', 'Hub Spoke Hole Diameter'].forEach(f => {
             if (!required.includes(f)) required.push(f);
          });
       }
       if (hubType === 'Straight Pull') {
          ['Hub SP Offset Spoke Hole Left', 'Hub SP Offset Spoke Hole Right'].forEach(f => { if (!required.includes(f)) required.push(f); });
       }
       if (hubType === 'Straight Pull' || hubType === 'Hook Flange' || lacingPolicy === 'Use Manual Override Field') {
          ['Hub Lacing Cross Left', 'Hub Lacing Cross Right'].forEach(f => { if (!required.includes(f)) required.push(f); });
          if (!required.includes('Hub Lacing Policy')) required.push('Hub Lacing Policy');
          const leftCross = getComponentValue(component, 'Hub Lacing Cross Left');
          const rightCross = getComponentValue(component, 'Hub Lacing Cross Right');
          if (leftCross === rightCross && leftCross !== '' && leftCross !== null) {
              if (!required.includes('Hub Manual Cross Value')) required.push('Hub Manual Cross Value');
          }
       }
    }
    
    if (tab === 'spokes' && spokeType === 'Berd') {
       const idx = required.indexOf('Spoke Cross Section Area Mm2');
       if (idx > -1) required.splice(idx, 1);
    }
    
    required.forEach(field => {
      if (field.toLowerCase().includes('weight g')) {
          const pVal = getComponentValue(component, 'Weight G (p)');
          const vVal = getComponentValue(component, 'Weight G (v)');
          const genericVal = getComponentValue(component, 'weight');
          if (!pVal && !vVal && !genericVal) {
             missing.push('Weight (P) or (V)');
          }
          return;
      }
      
      const val = getComponentValue(component, field);
      if ((val === undefined || val === null || String(val).trim() === '') && val !== 0 && val !== '0') {
        missing.push(field);
      }
    });

    return { isValid: missing.length === 0, missingFields: missing };
  }, [getComponentValue]);


  // --- UTILITIES (Logic) ---

  const fetchRules = async (passToUse) => {
    const auth = passToUse || password;
    if (!auth) return;
    setLoading(true);
    try {
      const res = await fetch('/api/get-rules', { headers: { 'x-dashboard-auth': auth } });
      if (res.ok) { 
        const data = await res.json();
        setRules(data || []);
        localStorage.setItem('loam_ops_auth', auth);
        const logoRes = await fetch('/api/get-logos', { headers: { 'x-dashboard-auth': auth } });
        const logoData = await logoRes.json();
        setVendorLogos(logoData.savedLogos || []);
        setIsAuthorized(true); 
        fetch('/api/get-metafield-definitions').then(r => r.json()).then(d => {
           if (d.success && d.optionsDict) setMetafieldOptionsMap(d.optionsDict);
        }).catch(e => console.error("Meta def sync err", e));
      } else {
        showNotification("❌ Dashboard Login Failed", 'error');
      }
    } catch (e) { 
      showNotification("❌ Critical Error: " + e.message, 'error');
    }
    setLoading(false);
  };

  const fetchComponentLibrary = async () => {
      setLoading(true);
      try {
          const auth = password || localStorage.getItem('loam_ops_auth');
          if (!auth) return;
          const cb = Date.now();
          const res = await fetch(`/api/components?cb=${cb}`, { headers: { 'x-dashboard-auth': auth } });
          if (res.ok) {
              const data = await res.json();
              const hydrated = {};
              Object.keys(data).forEach(tab => {
                  const rawList = data[tab] || [];
                  const seenRids = new Set();
                  const hydratedList = rawList.map((item, idx) => {
                       const baseId = item.id || item.ID || item.shopify_product_id || item['Product ID'];
                       const name = item.Name || item.name || item.title || "NoName";
                       const vendor = item.Vendor || item.vendor || item.Brand || item.brand || "NoVendor";
                       const specKeys = Object.keys(item).filter(k => !['_rid', '_rawIdx', '_editIdx', '_isNew', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID'].includes(k)).sort();
                       const specs = specKeys.map(k => `${k}:${item[k]}`).join('|');
                       const hash = `${name}_${vendor}_${specs}`.toLowerCase().replace(/[^a-z0-9]/g, '');
                       
                       let rid = item._rid;
                       // If RID is numeric (looks like a Shopify ID), prioritize the internal hash for separation
                       if (!rid || /^\d+$/.test(String(rid))) {
                          rid = `rid_${hash}`;
                       }

                       if (seenRids.has(rid)) {
                          rid = `${rid}_${idx}`;
                       }
                       seenRids.add(rid);

                       return { ...item, shopify_product_id: baseId, _rid: rid, _rawIdx: idx };
                   });
                  
                  hydrated[tab] = hydratedList;
              });
              
              setComponentData(hydrated);
              setComponentsLoaded(true);
          }
      } catch (e) { console.error('Fetch Component Error: ', e); }
      setLoading(false);
  };

  // --- LIFECYCLE EFFECTS (Restored) ---

  // 1. Auth Bootloader (Persisted Login)
  useEffect(() => {
    const savedAuth = localStorage.getItem('loam_ops_auth');
    const envAuth = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD;
    const auth = envAuth || savedAuth;
    
    if (auth) {
      setPassword(auth);
      fetchRules(auth);
    }
  }, []);

  // 2. Component Library Data Fetcher
  useEffect(() => {
    const auth = password || localStorage.getItem('loam_ops_auth');
    if (auth && activeTab === 'component_library' && !componentsLoaded) {
      fetchComponentLibrary();
    }
  }, [password, componentsLoaded, activeTab]);

  // 3. Periodic Data Refresh (Registry Sync)
  useEffect(() => {
    if (!isAuthorized) return;
    const interval = setInterval(() => {
      fetchRules();
    }, 120000); // 2 minutes
    return () => clearInterval(interval);
  }, [isAuthorized]);

  const saveComponentChanges = React.useCallback(async (newArray, tabOverride = null) => {
    const tab = tabOverride || componentTab;
    if (!tab) {
        showNotification("Save Error: No category selected", "error");
        return false;
    }
    const sanitizedArray = newArray.map(item => {
      const { tags, Tags, _rawIdx, _editIdx, ...rest } = item;
      return rest;
    });
    setComponentSaving(true);
    try {
      const auth = password || localStorage.getItem('loam_ops_auth');
      console.log(`[Persistence Debug] Attempting SAVE: Tab=${tab}, Items=${sanitizedArray.length}, AuthPresent=${!!auth}`);
      const res = await fetch('/api/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
        body: JSON.stringify({ [tab]: sanitizedArray })
      });
      console.log(`[Persistence Debug] ${tab.toUpperCase()} SAVE Status: ${res.status} ${res.statusText}`);
      if (res.ok) {
        // Transition items: strip _isNew flag now that they are successfully committed
        const transitionedArray = newArray.map(item => {
           const { _isNew, ...rest } = item;
           return rest;
        });
        setComponentData(prev => ({ ...prev, [tab]: transitionedArray })); 
        setIsComponentDrawerOpen(false);
        setEditingComponent(null);
        setConfirmedFields([]);
        showNotification(`${tab.toUpperCase()} data saved successfully!`, 'success');
        setComponentSaving(false);
        return true;
      } else {
        const err = await res.json();
        showNotification("Save Failed: " + (err.error || "Unknown error"), 'error');
        setComponentSaving(false);
        return false;
      }
    } catch (e) { 
      showNotification("Network error while saving components.", 'error'); 
      setComponentSaving(false);
      return false;
    }
   }, [componentTab, password, showNotification]);

   const fetchComponentHistory = React.useCallback(async () => {
     setLoadingHistory(true);
     try {
       const auth = password || localStorage.getItem('loam_ops_auth');
       const res = await fetch(`/api/component-history?tab=${componentTab}`, {
         headers: { 'x-dashboard-auth': auth }
       });
       if (res.ok) {
         const data = await res.json();
         setComponentHistory(data);
         setShowHistoryModal(true);
       } else {
         showNotification("Failed to fetch history", 'error');
       }
     } catch (e) {
       showNotification("History Error", 'error');
     } finally {
       setLoadingHistory(false);
     }
   }, [componentTab, password, showNotification]);

   const handleCommitBatchSave = React.useCallback(async () => {
     const tab = componentTab;
     const unsaved = gridUnsavedChanges[tab] || {};
     const added = gridAddedRows[tab] || [];
     const currentData = [...(componentData[tab] || [])];
     
     // 1. Build the updated array
     let updatedArray = currentData.map((item, idx) => {
       const rid = getComponentUniqueId(item, idx);
       if (unsaved[rid]) return { ...item, ...unsaved[rid] };
       return item;
     });
     
     // 2. Map over added rows
     const finalAdded = added.map((item, idx) => {
         const rid = item._rid; 
         if (rid && unsaved[rid]) return { ...item, ...unsaved[rid] };
         return item;
     });
     
     if (finalAdded.length > 0) updatedArray = [...updatedArray, ...finalAdded];
     
     // 3. Instead of saving, show the review modal!
     if (Object.keys(unsaved).length === 0 && finalAdded.length === 0) {
        showNotification("No changes to save", "info");
        return;
     }

     setStagedUpdatedArray(updatedArray);
     setShowReviewModal(true);
   }, [componentTab, gridUnsavedChanges, gridAddedRows, componentData, getComponentUniqueId, showNotification]);

   const handleFinalConfirmSave = React.useCallback(async () => {
      setShowReviewModal(false);
      const success = await saveComponentChanges(stagedUpdatedArray, componentTab);
      if (success) {
        setGridUnsavedChanges(prev => ({ ...prev, [componentTab]: {} }));
        setGridAddedRows(prev => ({ ...prev, [componentTab]: [] }));
        setStagedUpdatedArray(null);
      }
   }, [componentTab, stagedUpdatedArray, saveComponentChanges]);

   const handleDiscoverVariantIds = React.useCallback(async () => {
      setIsDiscoveringVariants(true);
      const tab = componentTab;
      const items = componentData[tab] || [];
      
      // --- NEW: Selection-Aware Discovery ---
      let candidates = [];
      const selectedForTab = items.filter((item, idx) => selectedComponents.includes(item._rid || getComponentUniqueId(item, idx)));

      if (selectedForTab.length > 0) {
         // User has selected specific rows -> process them regardless of if they have IDs
         const hasExisting = selectedForTab.some(item => getComponentValue(item, 'shopify_variant_id'));
         if (hasExisting) {
            if (!confirm(`You have selected ${selectedForTab.length} components. Some already have Shopify Variant IDs. Should we re-link and potentially OVERWRITE them?`)) {
               setIsDiscoveringVariants(false);
               return;
            }
         }
         candidates = selectedForTab;
      } else {
         // Fallback to missing ID discovery
         candidates = items.filter(item => {
            const pid = getComponentValue(item, 'shopify_product_id');
            const vid = getComponentValue(item, 'shopify_variant_id');
            return pid && /^\d+$/.test(String(pid)) && !vid;
         });
      }
      
      if (candidates.length === 0) {
         showNotification("No components found matching Discovery criteria. (Select rows to Force Re-Link or ensure Product IDs are present).", "info");
         setIsDiscoveringVariants(false);
         return;
      }

     const uniqueProductIds = [...new Set(candidates.map(c => getComponentValue(c, 'shopify_product_id')))];
     const proposals = [];
     const auth = password || localStorage.getItem('loam_ops_auth');

     try {
       for (const pid of uniqueProductIds) {
         const res = await fetch(`/api/get-product-variants?productId=${pid}`, {
           headers: { 'x-dashboard-auth': auth }
         });
         if (!res.ok) continue;
         const { variants, title } = await res.json();
         
         // --- FIX: Create a pool of available variants to ensure 1-to-1 matching ---
         let localVariantPool = [...variants];
         const componentsForPid = candidates.filter(c => getComponentValue(c, 'shopify_product_id') === pid);
         
         for (const comp of componentsForPid) {
            console.group(`[Discovery] Scanning: ${comp.Name || 'Unnamed Component'}`);
            
            // MATCHING ENGINE (Category-Aware)
            let matchIdx = -1;
            const match = localVariantPool.find((v, idx) => {
               const norm = (val) => String(val || "").toLowerCase().replace(/["'\\]/g, '').trim();
               const vOpts = Object.values(v.options).map(norm);
               
               // 1. RIM LOGIC: Size + Hub Count
               if (tab === 'rims') {
                  const cSize = norm(getComponentValue(comp, 'Rim Size'));
                  const cHoles = norm(getComponentValue(comp, 'Hole Count')).replace(/\D/g, '');
                  
                  const sizeMatch = vOpts.some(vo => vo.includes(cSize));
                  const holeMatch = vOpts.some(vo => vo.replace(/\D/g, '') === cHoles);
                  if (sizeMatch && holeMatch) { matchIdx = idx; return true; }
               }
               
               // 2. HUB LOGIC: Spoke Count Only (First Color)
               if (tab === 'hubs') {
                  const cHoles = norm(getComponentValue(comp, 'Hole Count')).replace(/\D/g, '');
                  const holeMatch = vOpts.some(vo => vo.replace(/\D/g, '') === cHoles);
                  if (holeMatch) { matchIdx = idx; return true; }
               }

               // 3. SPOKE LOGIC: "-" Length Variant
               if (tab === 'spokes') {
                  const lengthMatch = vOpts.some(vo => vo === '-');
                  if (lengthMatch) { matchIdx = idx; return true; }
               }

               // 4. NIPPLE LOGIC: First Available
               if (tab === 'nipples') {
                  { matchIdx = idx; return true; }
               }

               return false;
            });

            if (match) {
               console.log("✅ MATCH FOUND (Uniqueness Guaranteed):", match.title, "ID:", match.id);
               proposals.push({
                  rid: comp._rid || comp.id,
                  name: comp.Name || comp.Vendor || 'Unknown',
                  productTitle: title,
                  variantTitle: match.title,
                  newVariantId: match.id,
                  fullGid: match.full_id
               });
               
               // Remove this variant from the pool so it can't be claimed by another row
               if (matchIdx !== -1) localVariantPool.splice(matchIdx, 1);
            } else {
               console.log("❌ NO AVAILABLE MATCH. Remaining Options in Pool:", localVariantPool.map(v => v.title));
            }
            console.groupEnd();
         }
       }
       
       if (proposals.length === 0) {
          showNotification("Scanned Shopify but found 0 matches for these component specs.", "warning");
       } else {
          setProposedVariantUpdates(proposals);
          setShowVariantSyncModal(true);
       }
     } catch (e) {
       showNotification("Discovery Error: " + e.message, "error");
     } finally {
       setIsDiscoveringVariants(false);
     }
   }, [componentTab, componentData, password, showNotification]);

   const applyVariantDiscovery = () => {
      const tab = componentTab;
      const updates = {};
      proposedVariantUpdates.forEach(p => {
         updates[p.rid] = { ...updates[p.rid], shopify_variant_id: p.newVariantId };
      });
      
      setGridUnsavedChanges(prev => ({
         ...prev,
         [tab]: { ...(prev[tab] || {}), ...updates }
      }));
      
      setShowVariantSyncModal(false);
      showNotification(`Applied ${proposedVariantUpdates.length} proposed Variant IDs to the grid! Review and Sync to save permanently.`, "success");
   };

  const handleAddNewRow = (count = 1) => {
    const added = gridAddedRows[componentTab] || [];
    const newRows = Array.from({ length: count }).map((_, i) => ({
      _rid: `new_${Date.now()}_${i}`,
      Name: 'New Component',
      Vendor: '',
      _isNew: true
    }));
    setGridAddedRows(prev => ({
      ...prev,
      [componentTab]: [...newRows, ...added]
    }));
    showNotification(`Added ${count} blank row(s)`, 'success');
  };

  const handleGridEdit = React.useCallback((rowId, colKey, newValue) => {
    // Validation: Check if this column is a dropdown and if the value is allowed
    const options = DROPDOWN_OPTIONS[colKey] || DROPDOWN_OPTIONS[formatColumnTitle(colKey)];
    if (options && newValue !== '' && !options.includes(newValue)) {
       showNotification(`Invalid option for ${colKey}: "${newValue}"`, 'error');
       return;
    }

    setGridUnsavedChanges(prev => {
      const tabChanges = prev[componentTab] || {};
      const rowChanges = tabChanges[rowId] || {};
      return {
        ...prev,
        [componentTab]: { ...tabChanges, [rowId]: { ...rowChanges, [colKey]: newValue } }
      };
    });
  }, [componentTab, formatColumnTitle, showNotification]);

   const getComponentTabColumns = React.useCallback((tab) => {
     const rawData = componentData[tab] || [];
     const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx'];
     const allKeys = new Set();
     rawData.forEach(row => Object.keys(row).forEach(k => { if (!excludeKeys.includes(k)) allKeys.add(k); }));
     const specCols = Array.from(allKeys);
     const order = componentColumnOrder?.[tab];
     if (order && Array.isArray(order)) {
       specCols.sort((a, b) => {
         const aIdx = order.indexOf(a);
         const bIdx = order.indexOf(b);
         if (aIdx === -1 && bIdx === -1) return 0;
         if (aIdx === -1) return 1;
         if (bIdx === -1) return -1;
         return aIdx - bIdx;
       });
     }
     return ['Vendor', 'Name', ...specCols];
   }, [componentData, componentColumnOrder]);

   const applyPastedData = React.useCallback((tsvData, startRowId, startColKey, currentChanges) => {
     const rows = tsvData.split(/\r?\n/).filter(r => r.trim() !== '');
     const gridRows = rows.map(r => r.split('\t'));
     const allCols = getComponentTabColumns(componentTab);
     const startColIndex = allCols.indexOf(startColKey);
     const visibleData = (componentData[componentTab] || []).map((item, idx) => ({ ...item, _rid: getComponentUniqueId(item, idx) }));
     const startRowIndex = visibleData.findIndex(r => r._rid === startRowId);
     
     if (startRowIndex === -1 || startColIndex === -1) return currentChanges;

     const newChanges = { ...currentChanges };
     const tabChanges = { ...(newChanges[componentTab] || {}) };
     let skipCount = 0;

     gridRows.forEach((rowCells, rOffset) => {
       const targetRow = visibleData[startRowIndex + rOffset];
       if (!targetRow) return;
       const rid = targetRow._rid;
       const rowChanges = { ...(tabChanges[rid] || {}) };
       rowCells.forEach((cellVal, cOffset) => {
         const colKey = allCols[startColIndex + cOffset];
         if (!colKey) return;
         const val = cellVal.trim();
         const options = DROPDOWN_OPTIONS[colKey] || DROPDOWN_OPTIONS[formatColumnTitle(colKey)];
         if (options && val !== '' && !options.includes(val)) {
            skipCount++;
            return;
         }
         rowChanges[colKey] = val;
       });
       tabChanges[rid] = rowChanges;
     });
     newChanges[componentTab] = tabChanges;
     
     if (skipCount > 0) {
        showNotification(`Paste complete. ${skipCount} invalid dropdown values skipped.`, 'error');
     }
     return newChanges;
   }, [componentTab, componentData, getComponentUniqueId, formatColumnTitle, showNotification, getComponentTabColumns]);

   const handleBulkPaste = React.useCallback(() => {
     if (clipboardValue === null || selectedCells.length === 0) return;
     
     const allCols = getComponentTabColumns(componentTab);
     const parsedCells = selectedCells.map(c => {
       const [rowId, colKey] = c.split('|');
       const rowIdx = (componentData[componentTab] || []).findIndex((item, idx) => getComponentUniqueId(item, idx) === rowId);
       const colIdx = allCols.indexOf(colKey);
       return { rowId, colKey, rowIdx, colIdx };
     }).filter(c => c.rowIdx !== -1 && c.colIdx !== -1);

     if (parsedCells.length === 0) return;
     parsedCells.sort((a,b) => (a.rowIdx - b.rowIdx) || (a.colIdx - b.colIdx));
     const startCell = parsedCells[0];

     setGridUnsavedChanges(prev => {
        if (clipboardValue.includes('\t') || clipboardValue.includes('\n')) {
          return applyPastedData(clipboardValue, startCell.rowId, startCell.colKey, prev);
        }
        const newChanges = { ...prev };
        const tabChanges = { ...(newChanges[componentTab] || {}) };
        let skipCount = 0;
        selectedCells.forEach(cellId => {
          const [rowId, colKey] = cellId.split('|');
          const options = DROPDOWN_OPTIONS[colKey] || DROPDOWN_OPTIONS[formatColumnTitle(colKey)];
          if (options && clipboardValue !== '' && !options.includes(clipboardValue)) {
             skipCount++;
             return;
          }
          const rowChanges = { ...(tabChanges[rowId] || {}) };
          rowChanges[colKey] = clipboardValue;
          tabChanges[rowId] = rowChanges;
        });
        newChanges[componentTab] = tabChanges;
        if (skipCount > 0) showNotification(`${skipCount} values were incompatible and skipped.`, 'error');
        return newChanges;
     });
   }, [componentTab, clipboardValue, selectedCells, applyPastedData, getComponentTabColumns, componentData, getComponentUniqueId, showNotification, formatColumnTitle]);

  const toggleComponentSelection = React.useCallback((rowId, e, list = []) => {
    const isShift = e && (e.shiftKey || (e.nativeEvent && e.nativeEvent.shiftKey));
    
    if (isShift && lastCheckedComponentRef.current && list.length > 0) {
        const currentIdx = list.findIndex(r => (r._rid || getComponentUniqueId(r)) === rowId);
        const lastIdx = list.findIndex(r => (r._rid || getComponentUniqueId(r)) === lastCheckedComponentRef.current);
        
        if (currentIdx !== -1 && lastIdx !== -1) {
            const start = Math.min(currentIdx, lastIdx);
            const end = Math.max(currentIdx, lastIdx);
            const rangeIds = list.slice(start, end + 1).map(r => r._rid || getComponentUniqueId(r));
            
            setSelectedComponents(prev => {
                const combined = new Set([...prev, ...rangeIds]);
                return [...combined];
            });
            lastCheckedComponentRef.current = rowId;
            return;
        }
    }

    setSelectedComponents(prev => 
      prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId]
    );
    lastCheckedComponentRef.current = rowId;
  }, [getComponentUniqueId]);

  const handleRemoveAddedRow = React.useCallback((rid) => {
    setGridAddedRows(prev => ({
        ...prev,
        [componentTab]: prev[componentTab].filter(r => r._rid !== rid)
    }));
  }, [componentTab]);

  const handleDeleteComponent = React.useCallback(async (item) => {
      console.log("[Delete Debug] Row Clicked:", item);
      const rowId = item._rid || getComponentUniqueId(item);
      const isNew = !!item._isNew;
      console.log(`[Delete Debug] ID=${rowId}, isNew=${isNew}`);
      
      if (isNew) {
          console.log("[Delete Debug] Calling handleRemoveAddedRow for:", rowId);
          handleRemoveAddedRow(rowId);
          return;
      }

      const name = item.Name || item.name || item.title || "Unknown";
      if (!confirm(`Delete ${name}? This cannot be undone.`)) return;

      const rawData = componentData[componentTab] || [];
      const updatedArray = rawData.filter(i => {
          const rid = i._rid || getComponentUniqueId(i);
          return rid !== rowId;
      });

      const success = await saveComponentChanges(updatedArray, componentTab);
      if (success) {
          showNotification(`Successfully deleted ${name}`, 'success');
      } else {
          showNotification(`Failed to delete ${name}`, 'error');
      }
  }, [componentTab, componentData, saveComponentChanges, handleRemoveAddedRow, getComponentUniqueId, showNotification]);

   const handleGridPaste = React.useCallback((e, startRowId, startColKey) => {
     const tsvData = e.clipboardData.getData('text');
     setGridUnsavedChanges(prev => applyPastedData(tsvData, startRowId, startColKey, prev));
   }, [applyPastedData]);

  const handleEditComponent = (comp, idx) => {
    let componentToEdit = comp;
    if (comp._isNew) {
        const added = gridAddedRows[componentTab] || [];
        const found = added.find(r => r._rid === comp._rid);
        if (found) componentToEdit = found;
    }
    setEditingComponent({ ...componentToEdit, _editIdx: idx });
    setIsDuplicateMode(false);
    setConfirmedFields([]);
    setIsComponentDrawerOpen(true);
  };

  const handleDuplicateComponent = React.useCallback((component) => {
    const newComp = { ...component };
    if (newComp.Name) newComp.Name += " (Copy)"; 
    if (componentTab === "nipples") newComp["Option 1 Name"] = "Type"; 
    else if (componentTab === "hubs") newComp["Hub Pairing Policy"] = "None";
    else if (newComp.name) newComp.name += " (Copy)";
    else if (newComp.title) newComp.title += " (Copy)";
    if (newComp.id) delete newComp.id;
    if (newComp.ID) delete newComp.ID;
    setEditingComponent(newComp);
    setIsDuplicateMode(true);
    setConfirmedFields([]); 
    setIsComponentDrawerOpen(true);
  }, [componentTab]);

  // --- CORE HOOKS ---

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('loamops_grid_unsaved_v1');
      if (saved) setGridUnsavedChanges(JSON.parse(saved));
      const savedRows = sessionStorage.getItem('loamops_grid_added_v1');
      if (savedRows) setGridAddedRows(JSON.parse(savedRows));
    } catch(e) {}
  }, []);

  useEffect(() => {
    sessionStorage.setItem('loamops_grid_unsaved_v1', JSON.stringify(gridUnsavedChanges));
  }, [gridUnsavedChanges]);

  useEffect(() => {
    sessionStorage.setItem('loamops_grid_added_v1', JSON.stringify(gridAddedRows));
  }, [gridAddedRows]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const hasChanges = Object.keys(gridUnsavedChanges).some(tab => Object.keys(gridUnsavedChanges[tab]).length > 0);
      const hasNewRows = Object.keys(gridAddedRows).some(tab => gridAddedRows[tab].length > 0);
      if (hasChanges || hasNewRows) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [gridUnsavedChanges, gridAddedRows]);

  const spokePolish = (val) => {
    if (!val) return val;
    return val;
  };

  useEffect(() => {
     try {
       const saved = localStorage.getItem('loamops_cols');
       if (saved) setComponentColumnOrder(JSON.parse(saved));
       const savedWidths = localStorage.getItem('loamops_widths');
       if (savedWidths) setComponentColumnWidths(JSON.parse(savedWidths));
     } catch(e) {}
  }, []);

  const startResizing = React.useCallback((e, col) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(col);
    setStartX(e.pageX);
    setStartWidth(componentColumnWidths[col] || 150);
  }, [componentColumnWidths]);

  useEffect(() => {
    if (!resizingCol) return;
    const onMouseMove = (e) => {
      const delta = e.pageX - startX;
      setComponentColumnWidths(prev => ({ ...prev, [resizingCol]: Math.max(50, startWidth + delta) }));
    };
    const onMouseUp = () => {
      setResizingCol(null);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizingCol, startX, startWidth]);

  useEffect(() => {
    if (Object.keys(componentColumnWidths).length > 0) {
      localStorage.setItem('loamops_widths', JSON.stringify(componentColumnWidths));
    }
  }, [componentColumnWidths]);

  useEffect(() => {
     if (showMetaEditModal && selectedLabProducts.length === 0) setMetaEditTab('variant');
  }, [showMetaEditModal, selectedLabProducts.length]);
  const handleDragStart = React.useCallback((col) => setDraggedColumn(col), []);
  const handleDragOver = React.useCallback((e) => e.preventDefault(), []);
  const handleDrop = React.useCallback((targetCol) => {
    if (!draggedColumn || draggedColumn === targetCol) return;
    const activeList = componentData[componentTab] || [];
    const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx'];
    const rawColumns = Object.keys(activeList[0] || {}).filter(k => !excludeKeys.includes(k));
    let currentCols = componentColumnOrder[componentTab] || rawColumns;
    const srcIdx = currentCols.indexOf(draggedColumn);
    const tgtIdx = currentCols.indexOf(targetCol);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const newCols = [...currentCols];
    newCols.splice(srcIdx, 1);
    newCols.splice(tgtIdx, 0, draggedColumn);
    const newOrderMap = { ...componentColumnOrder, [componentTab]: newCols };
    setComponentColumnOrder(newOrderMap);
    localStorage.setItem('loamops_cols', JSON.stringify(newOrderMap));
    setDraggedColumn(null);
  }, [draggedColumn, componentData, componentTab, componentColumnOrder]);

  const uniqueVendors = React.useMemo(() => {
    if (!componentTab || !componentData[componentTab]) return [];
    const activeList = componentData[componentTab];
    const vends = activeList.map(item => item.Vendor || item.vendor || item.Brand || item.brand).filter(v => typeof v === 'string' && v.trim() !== '');
    return [...new Set(vends)].sort((a,b) => a.localeCompare(b));
  }, [componentData, componentTab]);

  const finalFilteredList = React.useMemo(() => {
    if (!componentTab || !componentData[componentTab]) return [];
    
    const activeList = componentData[componentTab].map((item, idx) => ({ ...item, _rawIdx: idx }));
    const addedRows = gridAddedRows[componentTab] || [];
    const combinedList = [...activeList, ...addedRows];

    let preFilteredList = componentVendorFilter === 'All' 
      ? combinedList 
      : combinedList.filter(item => {
          const v = item.Vendor || item.vendor || item.Brand || item.brand;
          return v === componentVendorFilter;
      });

    if (showMissingOnly) {
      preFilteredList = preFilteredList.filter(item => !getComponentValidation(item, componentTab).isValid);
    }

    if (showMismatchesOnly) {
      preFilteredList = preFilteredList.filter(item => {
        const rid = item._rid || getComponentUniqueId(item);
        return syncMismatches[rid] && syncMismatches[rid].length > 0;
      });
    }

    return [...preFilteredList].sort((a,b) => {
      if (a._isNew && !b._isNew) return -1;
      if (!a._isNew && b._isNew) return 1;
      
      const vA = (a.Vendor || a.vendor || a.Brand || a.brand || "").trim();
      const vB = (b.Vendor || b.vendor || b.Brand || b.brand || "").trim();
      
      if (vA === "" && vB !== "") return -1;
      if (vA !== "" && vB === "") return 1;

      const aN = (a.Name || a.name || a.title || "Unknown").toLowerCase();
      const bN = (b.Name || b.name || b.title || "Unknown").toLowerCase();
      return aN.localeCompare(bN);
    });
  }, [componentData, componentTab, gridAddedRows, componentVendorFilter, showMissingOnly, getComponentValidation, getComponentUniqueId]);

  const handleCreateNewComponent = React.useCallback((tab) => {
    const activeList = componentData[tab] || [];
    const firstItem = activeList[0] || {};
    const findKey = (search) => {
      const normSearch = search.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
      const found = Object.keys(firstItem).find(k => k.toLowerCase().replace(/\s+/g, '').replace(/_/g, '') === normSearch);
      return found || search;
    };
    let newComp = { [findKey('Vendor')]: componentVendorFilter !== 'All' ? componentVendorFilter : '' };
    if (tab === 'rims') {
      newComp = { ...newComp, [findKey('Option 1 Name')]: 'Size', [findKey('Option 2 Name')]: 'Spoke Count', [findKey('Wheel Spec Position')]: '', [findKey('Rim Size')]: '29"', [findKey('Rim ERD')]: '', [findKey('Weight G')]: '' };
    } else if (tab === 'nipples') {
      newComp = { ...newComp, [findKey('Option 1 Name')]: 'Type', [findKey('Option 1 Value')]: '' };
    } else if (tab === 'hubs') {
      newComp = { ...newComp, [findKey('Option 1 Name')]: 'Spoke Count', [findKey('Option 2 Name')]: 'Spacing', [findKey('Wheel Spec Position')]: '', [findKey('Brake Interface')]: 'Centerlock', [findKey('Hub Type')]: 'J-Bend', [findKey('Hub Pairing Policy')]: 'None' };
    } else if (tab === 'spokes') {
        newComp = { ...newComp, [findKey('Option 1 Name')]: 'Color', [findKey('Option 2 Name')]: 'Size', [findKey('Spoke Type')]: 'J-Bend' };
    }
    setEditingComponent(newComp);
    setIsDuplicateMode(false);
    setConfirmedFields([]);
    setIsComponentDrawerOpen(true);
  }, [componentData, componentVendorFilter]);

  const toggleFieldConfirmation = React.useCallback((key) => {
    setConfirmedFields(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, []);

  const syncTags = async () => {
    setLoading(true);
    try {
      const auth = localStorage.getItem('loam_ops_auth');
      const res = await fetch('/api/import-catalog', { method: 'POST', headers: { 'x-dashboard-auth': auth, 'Content-Type': 'application/json' } });
      if (res.ok) { showNotification("✅ Catalog Tags Synced Successfully!"); fetchRules(); }
      else { const err = await res.json(); showNotification("❌ Sync Failed: " + (err.error || "Unknown Error"), 'error'); }
    } catch (e) { showNotification("❌ Sync Failed: " + e.message, 'error'); }
    setLoading(false);
  };

  const handleCheckboxClick = (index, ruleId, e) => {
    if (e.shiftKey && lastCheckedIndex.current !== null && lastCheckedIndex.current !== index) {
      const start = Math.min(lastCheckedIndex.current, index);
      const end = Math.max(lastCheckedIndex.current, index);
      const rangeIds = paginatedRules.slice(start, end + 1).map(r => r.id);
      setSelectedRules(prev => {
        const newSelection = [...prev];
        rangeIds.forEach(id => { if (!newSelection.includes(id)) newSelection.push(id); });
        return newSelection;
      });
    } else {
      setSelectedRules(prev => prev.includes(ruleId) ? prev.filter(id => id !== ruleId) : [...prev, ruleId]);
    }
    lastCheckedIndex.current = index;
  };

  const handleBulkDelete = React.useCallback(async () => {
    if (selectedComponents.length === 0) return;
    if (!confirm("Delete " + selectedComponents.length + " component(s)? This cannot be undone.")) return;
    const rawData = componentData[componentTab] || [];
    const updatedArray = rawData.filter((item, idx) => !selectedComponents.includes(getComponentUniqueId(item, idx)));
    setComponentSaving(true);
    await saveComponentChanges(updatedArray);
    setSelectedComponents([]);
    setComponentSaving(false);
  }, [selectedComponents, componentData, componentTab, getComponentUniqueId, saveComponentChanges]);

  const handleOpenMassEdit = React.useCallback(() => {
     const activeList = componentData[componentTab] || [];
     const selectedItems = activeList.filter((item, i) => selectedComponents.includes(getComponentUniqueId(item, i)));
    
     const initialValues = {};
     if (selectedItems.length > 0) {
       const keys = Array.from(new Set(selectedItems.flatMap(item => Object.keys(item))));
       keys.forEach(key => {
         const uniqueValues = new Set(selectedItems.map(item => {
            const val = item[key];
            return (val === null || val === undefined) ? '' : val;
         }));
         if (uniqueValues.size === 1) {
           initialValues[key] = Array.from(uniqueValues)[0];
         }
       });
     }
     setBulkEditComponent(initialValues);
     setIsBulkEditDrawerOpen(true);
   }, [componentData, componentTab, selectedComponents, getComponentUniqueId]);

  const handleBulkEdit = React.useCallback(async () => {
    if (Object.keys(bulkEditComponent).length === 0 || selectedComponents.length === 0) return;
    
    setComponentSaving(true);
    const activeArray = [...(componentData[componentTab] || [])];
    
    // Filter out any empty strings from bulkEditComponent to prevent accidental clearing
    const validEdits = {};
    Object.entries(bulkEditComponent).forEach(([k, v]) => {
       if (v !== undefined && v !== null && v !== '') {
          validEdits[k] = v;
       }
    });

    if (Object.keys(validEdits).length === 0) {
       showNotification("No changes to apply", 'error');
       setComponentSaving(false);
       return;
    }

    const updatedArray = activeArray.map((item, i) => {
       const rowId = getComponentUniqueId(item, i);
       if (selectedComponents.includes(rowId)) {
          return { ...item, ...validEdits };
       }
       return item;
    });

    const success = await saveComponentChanges(updatedArray);
    if (success) {
      setIsBulkEditDrawerOpen(false);
      setSelectedComponents([]);
      setBulkEditComponent({});
      showNotification(`Successfully updated ${selectedComponents.length} components`);
    } else {
      showNotification("Failed to apply batch updates", 'error');
    }
    setComponentSaving(false);
  }, [bulkEditComponent, selectedComponents, componentData, componentTab, getComponentUniqueId, saveComponentChanges, showNotification]);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/get-sync-logs', { headers: { 'x-dashboard-auth': password } });
      if (res.ok) setSyncLogs(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchAbandonedBuilds = async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch('/api/get-abandoned-builds', { headers: { 'x-dashboard-auth': password } });
      if (res.ok) {
        const data = await res.json();
        setAbandonedBuilds(data.builds || []);
      }
    } catch (e) { console.error(e); }
    setInsightsLoading(false);
  };

  const syncCatalogFull = async () => {
    if (!confirm("Update Entire Catalog? This will sync all Tags, Technical Specs, and Metafield Definitions from Shopify.")) return;
    setLoading(true);
    try {
      const res1 = await fetch('/api/import-catalog', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password } });
      const d1 = await res1.json();
      await fetch('/api/get-metafield-definitions', { headers: { 'x-dashboard-auth': password } });
      showNotification(`Sync Complete. Imported/Updated ${d1.count} variants.`);
      fetchRules();
    } catch (e) { showNotification("Sync Failed: " + e.message, 'error'); }
    setLoading(false);
  };

  const runManualAuditReport = async () => {
    if (!confirm("Trigger Manual Data Audit & Abandoned Build Email Report?")) return;
    setLoading(true);
    try {
      const res = await fetch('/api/run-daily-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password } });
      const data = await res.json();
      showNotification("Status: " + data.message);
    } catch (e) { showNotification("Failed to run audit.", 'error'); }
    setLoading(false);
  };

  const updateRule = async (id, updates) => {
    setLoading(true);
    try {
      const res = await fetch('/api/update-rule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ id, updates }) });
      if (res.ok) { setEditingRule(null); fetchRules(); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const deleteRule = async (id) => {
    if (!confirm("⚠️ PERMANENT ACTION: Remove this item from the Registry?")) return;
    await fetch('/api/delete-rule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ id }) });
    fetchRules();
  };

  const toggleAutoSync = async (id, currentState) => {
    await fetch('/api/update-rule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ id, updates: { auto_update: !currentState } }) });
    fetchRules();
  };

  const openDupModal = (product) => {
    setDupSourceProduct(product);
    setDupOptions({ newTitle: `${product.title.split('(')[0].trim()} (CLONE)`, includeMedia: true, includeInventory: true, status: 'ACTIVE' });
    setShowDupModal(true);
  };

  const executeDuplication = async () => {
    if (!dupSourceProduct) return;
    setLoading(true);
    try {
      const res = await fetch('/api/duplicate-product', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ productId: `gid://shopify/Product/${dupSourceProduct.shopify_product_id}`, options: dupOptions }) });
      const data = await res.json();
      if (res.ok) { showNotification("✅ " + data.message); setShowDupModal(false); fetchRules(); }
      else { showNotification("❌ Error: " + data.error, 'error'); }
    } catch (e) { console.error(e); showNotification("❌ Critical Error during duplication.", 'error'); }
    setLoading(false);
  };

  const bulkSetAutoSync = async (state) => {
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ id, updates: { auto_update: state } }) })));
      fetchRules(); setSelectedRules([]);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const executeBulkEdit = async () => {
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ id, updates: { vendor_url: bulkEditUrl } }) })));
      setShowBulkEditModal(false); setBulkEditUrl(''); fetchRules(); setSelectedRules([]);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkDelete = async () => {
    if (!confirm(`⚠️ PERMANENT ACTION: Delete ${selectedRules.length} items from the Registry?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/delete-rule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ id }) })));
      setSelectedRules([]); fetchRules();
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkIgnore = async () => {
    if (!confirm(`⚠️ PERMANENT DESTRUCTIVE ACTION: Do you want to tag these ${selectedRules.length} items to be permanently ignored in Shopify and purged from this Registry?`)) return;
    setLoading(true);
    try {
      const productIds = [...new Set(selectedRules.map(id => rules.find(r => r.id === id)?.shopify_product_id).filter(Boolean))];
      await fetch('/api/ignore-product', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ product_ids: productIds }) });
      setSelectedRules([]); fetchRules();
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkApprovePrices = async () => {
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates: { needs_review: false } })
      })));
      await runSelectiveSync(selectedRules, true, true);
      showNotification(`Prices Approved and Pushed to Shopify for ${selectedRules.length} items.`);
    } catch(e) { console.error(e); showNotification('Error approving prices.', 'error'); }
    setLoading(false);
  };

  const bulkSetPriceAdjust = async () => {
    const input = prompt(`Set Price Adjustment Factor for ${selectedRules.length} selected items.\n\nExamples: 0.95 = 5% discount, 0.99 = 1% discount, 1.0 = vendor MSRP\n\nEnter new factor:`);
    if (!input) return;
    const factor = parseFloat(input);
    if (isNaN(factor) || factor <= 0 || factor > 2) { alert('Invalid factor. Must be between 0.01 and 2.0.'); return; }
    if (!confirm(`Apply factor ${factor} to ${selectedRules.length} items?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates: { price_adjustment_factor: factor } })
      })));
      showNotification(`Price adjustment set to ${factor} for ${selectedRules.length} items. Syncing changes...`);
      await runSelectiveSync(selectedRules, true, false);
      fetchRules();
      setSelectedRules([]);
    } catch(e) { console.error(e); showNotification('Error updating price adjustment.', 'error'); }
    setLoading(false);
  };

  const bulkSetCompareAt = async () => {
    if (!confirm(`Set Shopify Compare-At price to the Memory (Base) price for ${selectedRules.length} selected items?\n\nThis writes directly to your Shopify store.`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/bulk-compare-at', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ ruleIds: selectedRules })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Done! ${data.updated} variants updated.`);
        fetchRules();
      } else {
        showNotification('Failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch(e) { console.error(e); showNotification('Network error.', 'error'); }
    setLoading(false);
  };

    const handleAuditShopifySync = async () => {
       const tabData = componentData[componentTab] || [];
       const candidates = tabData.filter(c => getComponentValue(c, 'shopify_product_id') && getComponentValue(c, 'shopify_variant_id'));
       
       if (candidates.length === 0) {
          showNotification("No linked components in this tab to audit.", 'info');
          return;
       }

       setIsAuditing(true);
       const newMismatches = { ...syncMismatches };
       let scanned = 0;
       let mismatchCount = 0;

       try {
           const auth = localStorage.getItem('loam_ops_auth');
           console.group("🚀 Shopify Sync Audit Started");
           console.log("Total Candidates:", candidates.length);
           
           // Group by Product ID for batching
           const grouped = candidates.reduce((acc, c) => {
              const pid = getComponentValue(c, 'shopify_product_id');
              if (!acc[pid]) acc[pid] = [];
              acc[pid].push(c);
              return acc;
           }, {});

           for (const [pid, comps] of Object.entries(grouped)) {
              console.group(`📦 Auditing Product ID: ${pid}`);
              const res = await fetch(`/api/get-product-variants?productId=${pid}`, {
                 headers: { 'x-dashboard-auth': auth }
              });
              if (!res.ok) {
                 console.error("Failed to fetch Shopify variants for PID:", pid);
                 console.groupEnd();
                 continue;
              }
              
              const data = await res.json();
              console.log("Product Title:", data.title);
              console.log("Product Metafields:", data.metafields);
              const shopifyVariants = data.variants || [];

              for (const comp of comps) {
                 // Use getComponentValue for the name to avoid "Unnamed" logs
                 const name = getComponentValue(comp, 'Name') || getComponentValue(comp, 'title') || 'Unknown Component';
                 console.group(`🔍 Item: ${name}`);
                 
                 const vid = String(getComponentValue(comp, 'shopify_variant_id'));
                 const sVariant = shopifyVariants.find(v => String(v.id) === vid);
                 
                 if (!sVariant) {
                    console.warn("Could not find matching variant in Shopify for VID:", vid);
                    console.groupEnd();
                    continue;
                 }

                 console.log("Found Shopify Variant:", sVariant.title);
                 console.log("Variant Metafields Count:", sVariant.metafields?.length || 0);

                 scanned++;
                 const compMismatches = [];
                 const rid = comp._rid || comp.id;

                 // --- NEW: Registry-Driven Strict Audit (No Guessing) ---
                 metafieldRegistry.forEach(regField => {
                    // 1. Get value from Grid (Explicitly using the Column Label)
                    const cValRaw = comp[regField.label];
                    if (cValRaw === undefined) return; // Field was not found in this component's data

                    const cVal = String(cValRaw || "").trim();
                    let shopifyVal = null;
                    let source = "metafield";

                    // 2. Get value from Shopify (Explicitly using the Registry Key)
                    if (regField.target === 'variant') {
                       shopifyVal = sVariant.metafields?.find(m => m.key === regField.key)?.value;
                    } else {
                       shopifyVal = data.metafields?.find(m => m.key === regField.key)?.value;
                    }

                    // 3. Fallback: If metafield is empty, check Shopify Variant Options (for Constants like Position/Size)
                    if (!shopifyVal && regField.target === 'variant') {
                       // Position/Size are often variant options
                       const optionValue = Object.entries(sVariant.options || {}).find(([optName, optVal]) => 
                          optName.toLowerCase().includes(regField.key.replace(/_/g, ' ')) || 
                          regField.label.toLowerCase().includes(optName.toLowerCase())
                       )?.[1];
                       
                       if (optionValue) {
                          shopifyVal = optionValue;
                          source = "option";
                       }
                    }

                    // 4. Special Handling: Wheel Spec Position (Hardcoded strict map)
                    if (regField.key === 'wheel_spec_position' && !shopifyVal) {
                       shopifyVal = sVariant.options?.Position || sVariant.options?.['Wheel Spec Position'] || sVariant.wheel_spec_position;
                       if (shopifyVal) source = "special_prop";
                    }

                    // 5. Strict Normalization and Comparison
                    const normalize = (v) => {
                       if (v === null || v === undefined || v === "") return "";
                       // If numerical, strip trailing zeros (580.0 -> 580)
                       const n = parseFloat(v);
                       if (!isNaN(n)) return String(n);
                       // Otherwise, lowercase and trim
                       return String(v).toLowerCase().trim();
                    };

                    const ncVal = normalize(cVal);
                    const nsVal = normalize(shopifyVal);

                    if (ncVal !== nsVal) {
                       console.log(`❌ MISMATCH on [${regField.label}] (${source})`);
                       console.log(`   Grid: "${cVal}" (Norm: "${ncVal}")`);
                       console.log(`   Shop: "${shopifyVal}" (Norm: "${nsVal}")`);
                       compMismatches.push(regField.label);
                    }
                 });

                 if (compMismatches.length > 0) {
                    newMismatches[rid] = compMismatches;
                    mismatchCount++;
                 } else {
                    delete newMismatches[rid];
                 }
                 console.groupEnd();
              }
              console.groupEnd();
           }
           console.groupEnd();

          setSyncMismatches(newMismatches);
          showNotification(`Audit Complete. Scanned: ${scanned}. Mismatches: ${mismatchCount}.`, mismatchCount > 0 ? 'warning' : 'success');
       } catch (e) {
          console.error(e);
          showNotification("Audit failed: " + e.message, 'error');
       }
       setIsAuditing(false);
    };

  const handleAutoImport = async () => {
    const input = prompt("Enter Vendor Name ('Berd'), a specific Shopify Product ID ('7615286575192'), or 'ALL' for a full scan:");
    if (!input) return;

    setLoading(true);
    try {
      const isAll = input.toUpperCase() === 'ALL';
      const isProductId = /^\d+$/.test(input.trim());
      
      const payload = {
        vendor: (!isAll && !isProductId) ? input.trim() : null,
        productId: isProductId ? input.trim() : null
      };

      const res = await fetch('/api/import-catalog', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Success: Enrolled ${data.count} variants.`);
        fetchRules(password); 
      } else {
        showNotification("Import failed: " + (data.error || "Check Vercel Logs"), 'error');
      }
    } catch (e) {
      showNotification("Network Error: Could not reach the server.", 'error');
    }
    setLoading(false);
  };

  const runManualSync = async () => {
    if (!confirm("Run live price sync now? This will check all vendors and update Shopify.")) return;
    setLoading(true);
    try {
      const res = await fetch('/api/sync', { 
        headers: { 'x-dashboard-auth': password } 
      });
      if (res.ok) {
        showNotification("Full Sync Complete!");
        fetchRules(password);
      } else {
        showNotification("Sync failed. Error code: " + res.status, 'error');
      }
    } catch (e) { showNotification("Sync failed to connect.", 'error'); }
    setLoading(false);
  };

  const runSelectiveSync = async (ruleIds, quiet = false, forceApprove = false) => {
    if (!ruleIds || ruleIds.length === 0) return;
    if (!quiet) {
      const msg = ruleIds.length === 1 ? "Run live sync for this item?" : `Run live sync for ${ruleIds.length} selected items?`;
      if (!confirm(msg)) return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ ruleIds, force_approve: forceApprove })
      });
      if (res.ok) {
        if (!quiet) showNotification("Selective Sync Complete!");
        fetchRules(); // Refresh data
        if (ruleIds.length === 1 && !quiet) {
            setSelectedRules(prev => prev.filter(id => id !== ruleIds[0]));
        } else {
            setSelectedRules([]);
        }
      } else {
        const errorData = await res.json();
        showNotification("Sync failed: " + (errorData.error || res.status), 'error');
      }
    } catch (e) { showNotification("Sync failed to connect.", 'error'); }
    setLoading(false);
  };

  const runLabSync = () => {
    const idsFromProducts = rules.filter(r => selectedLabProducts.includes(String(r.shopify_product_id))).map(r => r.id);
    const idsFromVariants = rules.filter(r => selectedLabVariants.includes(String(r.shopify_variant_id))).map(r => r.id);
    const allIds = [...new Set([...idsFromProducts, ...idsFromVariants])];
    runSelectiveSync(allIds);
    if (allIds.length > 0) {
      setSelectedLabProducts([]);
      setSelectedLabVariants([]);
    }
  };

  const syncFieldToFamily = async (product, fieldKey, value) => {
    const reg = metafieldRegistry.find(m => m.key === fieldKey);
    if (!reg) return;
    
    const productVariants = allUniqueRules.filter(r => r.shopify_product_id === product.shopify_product_id);
    const variantIds = productVariants.map(v => v.shopify_variant_id);
    
    if (!confirm(`Sync ${reg.label} value "${value}" to all ${variantIds.length} variants in "${product.title}"?`)) return;
    
    setLoading(true);
    try {
      const auth = localStorage.getItem('loam_ops_auth');
      const res = await fetch('/api/bulk-update-metafields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
        body: JSON.stringify({ 
          ids: variantIds, 
          metafields: [{ namespace: 'custom', key: fieldKey, value, type: reg.type }], 
          targetType: 'ProductVariant' 
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to sync fields");
      }

      showNotification(`Synchronized ${reg.label} across product family.`);
      fetchRules();
    } catch (e) {
      console.error(e);
      showNotification("Error: " + e.message, 'error');
    }
    setLoading(false);
  };

  const saveBulkMetafields = async () => {
    const validEntries = Object.entries(metaEditFields).filter(([_, val]) => val !== undefined && val !== '' && val !== '_CONFLICT_');
    
    const productFields = validEntries.map(([key, val]) => ({ key, val, reg: metafieldRegistry.find(m => m.key === key) }))
      .filter(f => f.reg && f.reg.target === 'product')
      .map(f => ({ namespace: 'custom', key: f.key.replace('product_', ''), value: f.val, type: f.reg.type }));

    const variantFields = validEntries.map(([key, val]) => ({ key, val, reg: metafieldRegistry.find(m => m.key === key) }))
      .filter(f => f.reg && f.reg.target === 'variant')
      .map(f => ({ namespace: 'custom', key: f.key.replace('variant_', ''), value: f.val, type: f.reg.type }));
    
    if (productFields.length === 0 && variantFields.length === 0) return;
    setLoading(true);
    try {
      const auth = localStorage.getItem('loam_ops_auth');
      if (selectedLabProducts.length > 0 && productFields.length > 0) {
        await fetch('/api/bulk-update-metafields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
          body: JSON.stringify({ ids: selectedLabProducts, metafields: productFields, targetType: 'Product' })
        });
      }
      if (selectedLabVariants.length > 0 && variantFields.length > 0) {
        await fetch('/api/bulk-update-metafields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
          body: JSON.stringify({ ids: selectedLabVariants, metafields: variantFields, targetType: 'ProductVariant' })
        });
      }
      setShowMetaEditModal(false);
      setMetaEditFields({});
      setSelectedLabProducts([]);
      setSelectedLabVariants([]);
      alert("Mass Metafield Sync Complete.");
    } catch (e) {
      console.error(e);
      alert("Error syncing metafields.");
    }
    setLoading(false);
  };

  const openMetafieldEditor = async () => {
    setMetaEditFields({});
    setShowMetaEditModal(true);
    
    const targetProductIds = new Set(selectedLabProducts);
    selectedLabVariants.forEach(vId => {
      const p = allUniqueRules.find(r => String(r.shopify_variant_id) === String(vId));
      if (p) targetProductIds.add(String(p.shopify_product_id));
    });
    
    if (targetProductIds.size > 0) {
      setLoading(true);
      try {
        const promises = Array.from(targetProductIds).map(id => 
          fetch('/api/get-live-metafields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: id })
          }).then(r => r.json())
        );
        const results = await Promise.all(promises);
        
        const valueMap = {};
        const trackValue = (key, val) => {
          if (!valueMap[key]) valueMap[key] = new Set();
          if (val !== null && val !== undefined && val !== '') {
            let cleanVal = String(val);
            if (cleanVal.startsWith('[') && cleanVal.endsWith(']')) {
              try {
                const parsed = JSON.parse(cleanVal);
                if (Array.isArray(parsed) && parsed.length > 0) cleanVal = String(parsed[0]);
              } catch(e) {}
            }
            valueMap[key].add(cleanVal === 'true' ? true : cleanVal === 'false' ? false : cleanVal);
          }
        };

        results.forEach(data => {
          if (!data.success) return;
          if (data.productMetafields && selectedLabProducts.length > 0) {
            data.productMetafields.forEach(m => {
              const reg = metafieldRegistry.find(r => r.key === `product_${m.key}` || r.key === m.key);
              if (reg) trackValue(reg.key, m.value);
            });
          }
          if (data.variantsMetafields) {
             const vKeys = selectedLabVariants.length > 0 
                ? Object.keys(data.variantsMetafields).filter(vId => selectedLabVariants.some(id => String(id) === String(vId))) 
                : Object.keys(data.variantsMetafields);
             vKeys.forEach(vId => {
               const vData = data.variantsMetafields[vId];
               if (vData) {
                 vData.forEach(m => {
                   const reg = metafieldRegistry.find(r => r.key === `variant_${m.key}` || r.key === m.key);
                   if (reg) trackValue(reg.key, m.value);
                 });
               }
             });
          }
        });

        const newFields = {};
        Object.entries(valueMap).forEach(([key, valSet]) => {
          if (valSet.size === 1) newFields[key] = Array.from(valSet)[0];
          else if (valSet.size > 1) newFields[key] = '_CONFLICT_';
        });
        
        setMetaEditFields(newFields);
      } catch(e) { console.error('Failed to pre-fill metafields', e); }
      setLoading(false);
    }
  };

  const getPrimaryCategory = (tags = []) => {
    const t = tags.map(tx => tx.toLowerCase());
    if (t.includes('rim') || t.includes('component:rim')) return 'RIM';
    if (t.includes('hub') || t.includes('component:hub')) return 'HUB';
    if (t.includes('spoke') || t.includes('component:spoke')) return 'SPOKE';
    if (t.includes('nipple') || t.includes('component:nipple')) return 'NIPPLE';
    if (t.includes('valvestem') || t.includes('component:valvestem')) return 'VALVESTEM';
    if (t.includes('accessory')) return 'ACCESSORY';
    return null;
  };

  const getActiveLabCategory = () => {
    if (selectedLabProducts.length > 0) {
      const p = allUniqueRules.find(r => r.shopify_product_id === selectedLabProducts[0]);
      return p ? getPrimaryCategory(p.tags) : null;
    }
    if (selectedLabVariants.length > 0) {
      const p = allUniqueRules.find(r => r.shopify_variant_id === selectedLabVariants[0]);
      return p ? getPrimaryCategory(p.tags) : null;
    }
    return null;
  };

  const toggleLabProduct = (productId) => {
    const product = allUniqueRules.find(r => r.shopify_product_id === productId);
    if (!product) return;
    const cat = getPrimaryCategory(product.tags);
    const activeCat = getActiveLabCategory();
    if (activeCat && cat !== activeCat && (!selectedLabProducts.some(id => String(id)===String(productId)))) {
       setSelectedLabVariants([]);
       setSelectedLabProducts([String(productId)]);
    } else {
       setSelectedLabProducts(prev => prev.some(id => String(id)===String(productId)) ? prev.filter(id => String(id)!==String(productId)) : [...prev, String(productId)]);
    }
  };

  const lastCheckedVariantRef = useRef(null);

  const toggleLabVariant = (variantId, e, linearVariants = null) => {
    const variant = allUniqueRules.find(r => String(r.shopify_variant_id) === String(variantId));
    if (!variant) return;
    const cat = getPrimaryCategory(variant.tags);
    const activeCat = getActiveLabCategory();

    const isShift = e && (e.shiftKey || (e.nativeEvent && e.nativeEvent.shiftKey));
    if (isShift && lastCheckedVariantRef.current && linearVariants) {
      const idx = linearVariants.findIndex(v => String(v.shopify_variant_id) === String(variantId));
      const lastIdx = linearVariants.findIndex(v => String(v.shopify_variant_id) === String(lastCheckedVariantRef.current));
      if (idx !== -1 && lastIdx !== -1) {
         const start = Math.min(idx, lastIdx);
         const end = Math.max(idx, lastIdx);
         const rangeIds = linearVariants.slice(start, end + 1).map(v => String(v.shopify_variant_id));
         setSelectedLabVariants(prev => {
            const combined = new Set([...prev, ...rangeIds]);
            return [...combined];
         });
         lastCheckedVariantRef.current = String(variantId);
         return;
      }
    }

    if (activeCat && cat !== activeCat && (!selectedLabVariants.some(id => String(id)===String(variantId)))) {
       setSelectedLabProducts([]);
       setSelectedLabVariants([String(variantId)]);
    } else {
       setSelectedLabVariants(prev => prev.some(id => String(id)===String(variantId)) ? prev.filter(id => String(id)!==String(variantId)) : [...prev, String(variantId)]);
    }
    lastCheckedVariantRef.current = String(variantId);
  };

  const bulkIgnoreLab = async () => {
    if (selectedLabProducts.length === 0) return;
    if (!confirm(`⚠️ Are you sure you want to hide ${selectedLabProducts.length} items from the Product Lab?`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/bulk-update-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ productIds: selectedLabProducts, addTag: 'lab-ignore' })
      });
      if (res.ok) {
        setSelectedLabProducts([]);
        fetchRules(password);
      } else {
        alert("Bulk ignore failed.");
      }
    } catch (e) {
      console.error(e);
      alert("Bulk ignore error.");
    }
    setLoading(false);
  };

  const addNewMetafield = (initialCategory) => {
    const label = prompt(`Enter Label for new Metafield (e.g. 'Rim Width'):`);
    if (!label) return;
    const key = prompt(`Enter technical key (e.g. 'rim_width'):`, label.toLowerCase().replace(/\s+/g, '_'));
    if (!key) return;
    const target = confirm(`Is this a Variant metafield? (Cancel for Product metafield)`) ? 'variant' : 'product';
    
    setMetafieldRegistry(prev => [
      ...prev,
      { 
        key: key.replace('custom.',''), 
        label, 
        categories: [initialCategory], 
        target, 
        type: 'single_line_text_field' 
      }
    ]);
  };

  const removeMetafield = (key) => {
    if (!confirm(`⚠️ Delete '${key}' from registry permanently?`)) return;
    setMetafieldRegistry(prev => prev.filter(m => m.key !== key));
  };

  const handleLogoUpdate = async (vendorName, url) => {
    const auth = localStorage.getItem('loam_ops_auth');
    setSavingLogo(vendorName);
    try {
      const res = await fetch('/api/update-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
        body: JSON.stringify({ name: vendorName, logo_url: url })
      });
      if (res.ok) {
        setVendorLogos(prev => {
          const existing = prev.find(l => l.name === vendorName);
          if (existing) return prev.map(l => l.name === vendorName ? { ...l, logo_url: url } : l);
          return [...prev, { name: vendorName, logo_url: url }];
        });
      }
    } catch (e) { console.error(e); }
    setTimeout(() => setSavingLogo(null), 1000);
  };
  
  const toggleVendor = (name) => {
    setSelectedVendors(prev => 
      prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]
    );
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white font-sans">
        <div className="max-w-md w-full text-center">
          <div className="h-20 mb-12 flex justify-center"><img src="/logo.png" alt="LoamLabs" className="h-full object-contain" /></div>
          <div className="bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-800 shadow-2xl">
            <input type="password" placeholder={loading ? "VERIFYING..." : "ACCESS KEY"} className="w-full bg-zinc-950 border border-zinc-700 p-5 rounded-2xl mb-4 text-center text-xl tracking-widest outline-none font-mono" onKeyDown={(e) => e.key === 'Enter' && fetchRules()} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={() => fetchRules()} className="w-full bg-white text-black font-black p-5 rounded-2xl uppercase tracking-tighter hover:scale-[1.02] transition-all flex items-center justify-center gap-2">{loading && <Loader2 className="animate-spin" size={20} />} Start Session</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <aside className="w-64 bg-black text-zinc-400 p-6 hidden md:flex flex-col border-r border-zinc-800 fixed h-full z-20">
        <div className="mb-12">
          <img src="/logo.png" alt="LoamLabs" className="h-10 mb-4 object-contain opacity-100" />
          <div className="font-black italic text-xl text-white tracking-tighter uppercase">Ops Dashboard</div>
        </div>
        <nav className="space-y-1 flex-grow">
          <SidebarLink icon={<Package size={18}/>} label="Vendor Watcher" active={activeTab === 'vendors'} onClick={() => setActiveTab('vendors')} />
          <SidebarLink icon={<RefreshCcw size={18}/>} label="BTI Sync" active={activeTab === 'bti_sync'} onClick={() => setActiveTab('bti_sync')} />
          <SidebarLink 
            icon={<Beaker size={18}/>} 
            label="Product Lab" 
            active={activeTab === 'product_lab'} 
            onClick={() => { setActiveTab('product_lab'); setShowDiscrepancyDropdown(false); }} 
            badge={totalDiscrepancies > 0 ? totalDiscrepancies : null}
            badgeOnClick={(e) => {
               e.stopPropagation();
               setShowDiscrepancyDropdown(!showDiscrepancyDropdown);
            }}
          />
          {showDiscrepancyDropdown && discrepancyProducts.length > 0 && (
             <div className="absolute left-[240px] top-40 w-80 bg-black border border-zinc-800 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.1)] p-4 z-[100] animate-in fade-in zoom-in duration-200">
                <div className="border-b border-zinc-800 pb-3 mb-3">
                   <h3 className="text-white font-black uppercase tracking-tighter text-sm italic">Data Integrity</h3>
                   <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">{totalDiscrepancies} Fragmented Product Families</p>
                </div>
                <div className="max-h-80 overflow-y-auto no-scrollbar space-y-2">
                   {discrepancyProducts.map(dp => {
                      const dpNameBase = dp.title.split(' - ')[0].split('(')[0].trim();
                      return (
                        <button 
                           key={dp.shopify_product_id}
                           onClick={() => {
                              setActiveTab('product_lab');
                              setLabCategory('all');
                              setLabSearch(dpNameBase);
                              setLabDiscrepancyOnly(true);
                              setShowDiscrepancyDropdown(false);
                           }}
                           className="w-full text-left p-3 hover:bg-zinc-900 rounded-xl transition-all group border border-transparent hover:border-zinc-800"
                        >
                           <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-black text-red-400 uppercase tracking-widest leading-none group-hover:text-red-300">{dp.vendor_name || 'LoamLabs'}</span>
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                           </div>
                           <div className="text-xs font-bold text-zinc-300 truncate group-hover:text-white transition-colors">{dp.title}</div>
                        </button>
                      );
                   })}
                </div>
             </div>
          )}
          <SidebarLink icon={<BarChart size={18}/>} label="Insights & Analytics" active={activeTab === 'insights'} onClick={() => { setActiveTab('insights'); fetchAbandonedBuilds(); }} />
          <SidebarLink icon={<ShieldCheck size={18}/>} label="Shop Health" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} />
          <SidebarLink icon={<Database size={18}/>} label="Component Library" active={activeTab === 'component_library'} onClick={() => setActiveTab('component_library')} />
        </nav>
        <div className="relative mt-auto border-t border-zinc-800 pt-6">
           {showUserMenu && (
             <div className="absolute bottom-full left-0 w-full mb-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
                <button onClick={() => { fetchLogs(); setShowLogsModal(true); setShowUserMenu(false); }} className="w-full p-4 flex items-center gap-3 text-zinc-400 hover:bg-zinc-800 hover:text-white font-bold text-xs uppercase transition-all border-b border-zinc-800"><History size={16}/> View Sync Logs</button>
                <button onClick={() => { setActiveTab('admin'); setShowUserMenu(false); }} className="w-full p-4 flex items-center gap-3 text-zinc-400 hover:bg-zinc-800 hover:text-white font-bold text-xs uppercase transition-all border-b border-zinc-800"><Settings size={16}/> Settings</button>
                <button onClick={() => { localStorage.removeItem('loam_ops_auth'); window.location.reload(); }} className="w-full p-4 flex items-center gap-3 text-red-500 hover:bg-red-500/10 font-bold text-xs uppercase transition-all"><LogOut size={16}/> End Session</button>
             </div>
           )}
           <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900 transition-all">
              <div className="flex items-center gap-3 text-white"><div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-black text-xs uppercase">A</div><span className="text-xs font-bold uppercase">Admin</span></div>
              <ChevronUp size={14} className={showUserMenu ? 'rotate-180' : ''}/>
           </button>
        </div>
      </aside>

      <main className="flex-grow ml-64 p-6 md:p-12 overflow-auto min-h-screen">
        
        {activeTab === 'vendors' ? (
          <>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Registry</h1>
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                  Viewing {filteredRules.length} of {rules.length} Total Registry Items
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleAutoImport} disabled={loading} title="Finds unmonitored vendor products on Shopify and pulls them into the system" className="bg-zinc-200 text-zinc-800 p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-zinc-300 transition-all disabled:opacity-50 shadow-sm">
                  {loading ? <Loader2 className="animate-spin" size={14} /> : <Package size={14} />} Auto Import
                </button>

                <button onClick={runManualSync} disabled={loading} title="Forces an immediate scrape to synchronize all prices and inventory with Distributor sites" className="bg-orange-500 text-white p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-orange-600 transition-all shadow-lg">
                  <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Run Live Sync
                </button>

                <button onClick={() => fetchRules()} title="Downloads the latest state from your central Supabase dashboard" className="bg-white border-2 border-zinc-200 p-3 px-4 rounded-xl hover:border-black transition-all shadow-sm text-zinc-400">
                  <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
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
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Auto-Update Filter</label>
              </div>
              <div className="flex items-center gap-2 mb-8">
                <div className="flex flex-wrap gap-2 flex-1 items-center">
                <button 
                  onClick={() => setSyncFilter('all')} 
                  className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${syncFilter === 'all' ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                >
                  All Items
                </button>
                <button 
                  onClick={() => setSyncFilter('on')} 
                  className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'on' ? 'bg-green-600 text-white border-green-700 shadow-lg shadow-green-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                >
                  <Zap size={14} /> Syncing (True)
                </button>
                <button 
                  onClick={() => setSyncFilter('off')} 
                  className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'off' ? 'bg-zinc-600 text-white border-zinc-700 shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                >
                  <ZapOff size={14} /> Paused (False)
                </button>
                <button 
                  onClick={() => setSyncFilter('sale')} 
                  className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'sale' ? 'bg-amber-500 text-white border-amber-500/30 shadow-lg shadow-amber-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                >
                   Drastic Sales (10%+)
                </button>
                <button 
                  onClick={() => setSyncFilter('oos')} 
                  className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'oos' ? 'bg-red-600 text-white border-red-700 shadow-lg shadow-red-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                >
                   <AlertCircle size={14} /> Out of Stock
                </button>
                <button 
                  onClick={() => setSyncFilter('review')} 
                  className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${syncFilter === 'review' ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg shadow-indigo-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                >
                   <AlertCircle size={14} /> Review Required
                </button>
                </div>
                <div className="relative flex-shrink-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
                  <input type="text" placeholder="Search Registries..." value={registrySearch} onChange={(e) => setRegistrySearch(e.target.value)} className="pl-9 pr-8 py-2 w-52 rounded-xl border-2 border-zinc-100 text-xs font-bold outline-none focus:border-black transition-all placeholder:text-zinc-300 placeholder:font-bold placeholder:italic" />
                  {registrySearch && <button onClick={() => setRegistrySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600"><X size={12} /></button>}
                </div>
              </div>
            </div>


            {selectedRules.length > 0 && (
              <div className="fixed bottom-6 left-[calc(16rem+1.5rem)] right-6 z-50 bg-black text-white p-4 rounded-[1.5rem] flex items-center justify-between shadow-2xl border border-zinc-800" style={{animation: 'slideUp 0.3s ease-out'}}>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => setSelectedRules([])} className="text-zinc-500 hover:text-white transition-colors"><X size={16} /></button>
                  <div className="font-bold text-sm tracking-widest uppercase italic border-r border-zinc-800 pr-6 mr-1">
                    {selectedRules.length} Selected
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <button onClick={() => bulkSetAutoSync(true)} className="flex items-center gap-2 text-[10px] font-black uppercase text-green-400 hover:text-green-300 transition-colors bg-green-950/30 px-3 py-2 rounded-xl"><Zap size={14} /> Enable Auto-Sync</button>
                  <button onClick={() => bulkSetAutoSync(false)} className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-400 hover:text-white transition-colors bg-zinc-900 px-3 py-2 rounded-xl"><ZapOff size={14} /> Disable Auto-Sync</button>
                  <div className="w-px h-6 bg-zinc-800 hidden sm:block"></div>
                  <button onClick={bulkSetPriceAdjust} className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors bg-blue-950/30 px-3 py-2 rounded-xl"><DollarSign size={14} /> Set Price Adjust</button>
                  <button onClick={bulkSetCompareAt} className="flex items-center gap-2 text-[10px] font-black uppercase text-purple-400 hover:text-purple-300 transition-colors bg-purple-950/30 px-3 py-2 rounded-xl"><Tag size={14} /> Set Compare-At → Base</button>
                  <div className="w-px h-6 bg-zinc-800 hidden sm:block"></div>
                  <button onClick={() => runSelectiveSync(selectedRules)} className="flex items-center gap-2 text-[10px] font-black uppercase text-white hover:text-green-400 transition-colors bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-700"><RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> Sync Selected Items</button>
                  <div className="w-px h-6 bg-zinc-800 hidden sm:block"></div>
                  <button onClick={() => setShowBulkEditModal(true)} className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-400 hover:text-amber-300 transition-colors bg-amber-950/30 px-3 py-2 rounded-xl"><Edit size={14} /> Mass Edit URL</button>
                  <div className="w-px h-6 bg-zinc-800 hidden sm:block"></div>
                  <button onClick={bulkDelete} className="flex items-center gap-2 text-[10px] font-black uppercase text-red-500/60 hover:text-red-400 transition-colors px-3 py-2"><Trash2 size={14} /> Delete Selected</button>
                  <button onClick={bulkIgnore} className="flex items-center gap-2 text-[10px] font-black uppercase text-white hover:text-red-400 transition-colors bg-red-600 px-3 py-2 rounded-xl"><ShieldAlert size={14} /> Ignore & Purge Product(s)</button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-sm border border-zinc-200 overflow-hidden text-sm">
              <table className="w-full text-left">
                <thead className="bg-zinc-100 border-b text-[10px] uppercase font-black text-zinc-500 tracking-widest font-mono">
                  <tr>
                    <th className="p-6 pr-0 w-4">
                      <input type="checkbox" className="w-4 h-4 rounded text-black focus:ring-black cursor-pointer" onChange={(e) => {
                        if (e.target.checked) setSelectedRules(filteredRules.map(r => r.id));
                        else setSelectedRules([]);
                      }} checked={selectedRules.length === filteredRules.length && filteredRules.length > 0} />
                    </th>
                    <th className="p-6 italic tracking-tighter">
                      <div className="flex items-center gap-2">
                        Registry Item
                        <div className="group/legend relative">
                          <Info size={12} className="text-zinc-300 hover:text-zinc-600 transition-colors cursor-help" />
                          <div className="absolute left-0 top-full mt-2 hidden group-hover/legend:block w-72 bg-black text-white text-[10px] p-4 rounded-xl z-50 shadow-2xl border border-zinc-700 leading-relaxed">
                            <div className="text-zinc-400 mb-2 uppercase font-black tracking-widest">Row Color Legend</div>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500/30 border border-red-400"></div> Review Required — margin safety triggered</div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-200 border border-amber-400"></div> Drastic Sale — vendor price 10%+ below MSRP</div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-600 border border-blue-700"></div> BTI Active — inventory deferred to BTI</div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-50 border border-red-200"></div> Missing URL — no vendor URL mapped</div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-zinc-200 border border-zinc-300"></div> Selected — currently checked</div>
                              <div className="border-t border-zinc-700 my-2"></div>
                              <div className="text-zinc-400 mb-1 uppercase font-black tracking-widest">Status Pills</div>
                              <div className="flex items-center gap-2"><span className="bg-green-100 text-green-700 text-[8px] px-2 py-0.5 rounded-full font-black">ACTIVE</span> Vendor shows in stock</div>
                              <div className="flex items-center gap-2"><span className="bg-red-100 text-red-600 text-[8px] px-2 py-0.5 rounded-full font-black">OUT OF STOCK</span> Vendor shows unavailable</div>
                              <div className="flex items-center gap-2"><span className="bg-red-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black">REVIEW</span> Needs manual review</div>
                              <div className="border-t border-zinc-700 my-2"></div>
                              <div className="text-zinc-400 mb-1 uppercase font-black tracking-widest">Price Columns</div>
                              <div>Current (Shopify) shows <span className="text-red-400">red</span> when it doesn't match the Adjusted Price</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </th>
                    <th className="p-6 text-center whitespace-nowrap" title="BTI status relative to inventory monitoring">Dist. Status</th>
                    <th className="p-6 text-center" title="Whether BTI is currently governing inventory for this variant">BTI</th>
                    <th className="p-6" title="The highest detected MSRP or High-Water-Mark price from the vendor.">Memory (Base)</th>
                    <th className="p-6" title="Target price based on Adjustment Factor (e.g. 0.99 = 1% discount).">Adjusted Price</th>
                    <th className="p-6" title="Live price on your Shopify store. Red indicates a mismatch with Adjusted Price.">Current (Shopify)</th>
                    <th className="p-6" title="The 'Was' price on Shopify. Should be >= Adjusted Price to show a sale badge.">Compare-At (Shopify)</th>
                    <th className="p-6 text-right" title="Automation controls and row actions.">Auto-Sync / Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {paginatedRules.map((rule) => {
                    const isMissingUrl = !rule.vendor_url;
                    const expectedPriceText = rule.last_price ? ((rule.last_price / 100) * (rule.price_adjustment_factor || 1.0)).toFixed(2) : '--';
                    const shopifyPriceText = rule.current_shopify_price ? (rule.current_shopify_price / 100).toFixed(2) : '--';
                    const priceMismatch = expectedPriceText !== '--' && shopifyPriceText !== '--' && expectedPriceText !== shopifyPriceText;
                    
                    const dynamicMsrp = rule.original_msrp || (rule.current_compare_at_price ? rule.current_compare_at_price / 100 : null);
                    const isDeepSale = dynamicMsrp && (dynamicMsrp - (rule.last_price / 100)) / dynamicMsrp >= 0.10;

                    return (
                      <tr key={rule.id} className={`${rule.needs_review ? 'bg-red-500/20 shadow-inner' : isDeepSale ? 'bg-amber-100/60 hover:bg-amber-100 shadow-sm shadow-amber-500/10 border-l-4 border-l-amber-500' : rule.bti_part_number ? 'bg-blue-50/70 hover:bg-blue-100' : isMissingUrl ? 'bg-red-50/50' : selectedRules.includes(rule.id) ? 'bg-zinc-100 shadow-inner' : 'hover:bg-zinc-50'} transition-colors group cursor-pointer`} onClick={(e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'DIV') { const idx = paginatedRules.findIndex(r => r.id === rule.id); handleCheckboxClick(idx, rule.id, e); }}}>
                        <td className="p-6 pr-0" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" className="w-4 h-4 rounded text-black focus:ring-black cursor-pointer pointer-events-auto" checked={selectedRules.includes(rule.id)} onClick={(e) => { const idx = paginatedRules.findIndex(r => r.id === rule.id); handleCheckboxClick(idx, rule.id, e); }} onChange={() => {}} />
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-2"><div className="font-bold text-zinc-900 text-base">{rule.title}</div>
                          {rule.last_log && <div className="group/log relative pointer-events-auto"><Info size={14} className="text-zinc-300 hover:text-black transition-colors cursor-help" /><div className="absolute left-0 bottom-full mb-2 hidden group-hover/log:block w-64 bg-black text-white text-[10px] p-3 rounded-xl z-50 shadow-2xl font-mono leading-relaxed border border-zinc-800"><div className="text-zinc-500 mb-1 uppercase font-black font-sans tracking-widest">System Log:</div>{rule.last_log}</div></div>}</div>
                          <div className="text-[10px] text-zinc-400 font-mono mt-1 truncate max-w-sm flex items-center gap-2">
                             {isMissingUrl && <AlertCircle size={10} className="text-red-400"/>}
                             {rule.vendor_url || 'No URL mapped - Action Required'}
                          </div>
                        </td>
                        <td className="p-6 text-center">
                          {rule.needs_review ? <span className="bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-full animate-pulse uppercase tracking-tighter whitespace-nowrap">Review Required</span> : rule.last_availability ? <span className="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase italic whitespace-nowrap">Active</span> : <span className="bg-red-100 text-red-600 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter whitespace-nowrap">Out of Stock</span>}
                        </td>
                        <td className="p-6 text-center text-xs">
                          {rule.bti_inventory_active ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase italic shadow-sm">BTI Active</span>
                              {rule.bti_part_number && <span className="text-[7px] font-mono text-blue-400 font-bold">{rule.bti_part_number}</span>}
                            </div>
                          ) : rule.bti_part_number ? (
                            <div className="flex flex-col items-center gap-1 opacity-60">
                              <span className="bg-zinc-100 text-zinc-500 text-[8px] font-black px-2 py-0.5 rounded-full uppercase italic border border-zinc-200">Linked</span>
                              <span className="text-[7px] font-mono text-zinc-400 font-bold">{rule.bti_part_number}</span>
                            </div>
                          ) : (
                            <span className="text-zinc-200 text-[10px] font-bold">—</span>
                          )}
                        </td>
                        <td className="p-6 font-mono font-bold text-lg text-zinc-700">
                          {rule.last_price ? `$${(rule.last_price / 100).toFixed(2)}` : '--'}
                        </td>
                        <td className="p-6 font-mono font-bold text-lg text-blue-600">
                          {expectedPriceText !== '--' ? `$${expectedPriceText}` : '--'}
                        </td>
                        <td className="p-6 font-mono font-bold text-lg">
                          {shopifyPriceText !== '--' ? (
                            <div className={priceMismatch ? "text-red-700 bg-red-50 inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-red-200 shadow-sm" : "text-zinc-600 px-3 py-1"}>
                               ${shopifyPriceText}
                               {priceMismatch && (
                                 <div className="group/price relative inline-block ml-1">
                                   <AlertCircle size={14} className="hover:text-red-900 transition-colors cursor-help" />
                                   <div className="absolute right-0 bottom-full mb-2 hidden group-hover/price:block w-48 bg-black text-white text-[10px] p-2.5 rounded-xl z-50 shadow-2xl leading-relaxed font-sans font-normal border border-zinc-800">
                                      <div className="text-zinc-400 mb-1 uppercase font-black tracking-widest">Price Mismatch</div>
                                      The price in Shopify does not match the computed Adjusted Price (${expectedPriceText}).
                                   </div>
                                 </div>
                               )}
                            </div>
                          ) : '--'}
                        </td>
                        <td className="p-6 font-mono font-bold text-lg text-zinc-400">
                          {rule.current_compare_at_price ? `$${(rule.current_compare_at_price / 100).toFixed(2)}` : '--'}
                        </td>
                         <td className="p-6 flex justify-end items-center gap-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
                           <button onClick={() => runSelectiveSync([rule.id])} title="Sync this item now" className="p-2 bg-zinc-100 hover:bg-black hover:text-white text-zinc-400 rounded-lg transition-all"><RefreshCcw size={14} /></button>
                           <button onClick={() => toggleAutoSync(rule.id, rule.auto_update)} className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${rule.auto_update ? 'bg-black justify-end shadow-inner' : 'bg-zinc-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md"></div></button>
                           <button onClick={() => setEditingRule(rule)} className="bg-zinc-100 hover:bg-black hover:text-white text-zinc-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all">Edit</button>
                          <button onClick={() => deleteRule(rule.id)} className="text-zinc-300 hover:text-red-500 transition-colors "><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRules.length > visibleCount && (
                <div className="p-12 text-center bg-zinc-50 border-t border-zinc-100">
                    <button onClick={() => setVisibleCount(visibleCount + 100)} className="bg-white border-2 border-zinc-200 px-8 py-4 rounded-2xl font-black uppercase italic text-xs hover:border-black transition-all shadow-sm">Load More ({filteredRules.length - visibleCount} remaining)</button>
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'bti_sync' ? (
          <>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">BTI Sync Management</h1>
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                  Managing Shopify Metafields for Distributor Integration
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => fetchRules()} className={`bg-blue-50 text-blue-700 p-3 px-6 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 border border-blue-100 shadow-sm hover:bg-blue-100 transition-all ${loading ? 'opacity-50' : ''}`} disabled={loading}>
                  <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> Distributor Feed Active
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

              <div className="flex items-center justify-between mb-4 mt-10">
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Metafield Assignment Filter</label>
              </div>
              <div className="flex items-center justify-between mb-8">
                <div className="flex flex-wrap gap-2 flex-1">
                  <button 
                    onClick={() => setBtiSyncFilter('all')} 
                    className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all ${btiSyncFilter === 'all' ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                  >
                    All Products
                  </button>
                  <button 
                    onClick={() => setBtiSyncFilter('has')} 
                    className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${btiSyncFilter === 'has' ? 'bg-blue-600 text-white border-blue-700 shadow-lg shadow-blue-500/30 scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                  >
                    <Package size={14} /> Managed (Has BTI #)
                  </button>
                  <button 
                    onClick={() => setBtiSyncFilter('none')} 
                    className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase transition-all flex items-center gap-2 ${btiSyncFilter === 'none' ? 'bg-zinc-600 text-white border-zinc-700 shadow-lg scale-105' : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}
                  >
                    <RefreshCcw size={14} /> Unassigned (No BTI #)
                  </button>
                </div>
                <div className="relative flex-shrink-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
                  <input type="text" placeholder="Search BTI items..." value={btiSearch} onChange={(e) => setBtiSearch(e.target.value)} className="pl-9 pr-8 py-2 w-52 rounded-xl border-2 border-zinc-100 text-xs font-bold outline-none focus:border-black transition-all placeholder:text-zinc-300 placeholder:font-bold placeholder:italic" />
                  {btiSearch && <button onClick={() => setBtiSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600"><X size={12} /></button>}
                </div>
              </div>
            </div>

            {(() => {
              const filteredRules = rules.filter(rule => {
                const matchesVendor = selectedVendors.length === 0 || selectedVendors.includes(rule.vendor_name);
                const matchesSyncFilter = btiSyncFilter === 'all' || (btiSyncFilter === 'has' ? !!rule.bti_part_number : !rule.bti_part_number);
                const searchMatch = !btiSearch || rule.title.toLowerCase().includes(btiSearch.toLowerCase()) || (rule.bti_part_number && rule.bti_part_number.toLowerCase().includes(btiSearch.toLowerCase()));
                return matchesVendor && matchesSyncFilter && searchMatch;
              }).sort((a, b) => a.title.localeCompare(b.title));

              return (
                <div className="bg-white rounded-[2.5rem] border border-zinc-200 shadow-xl overflow-hidden mb-12">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-zinc-100 border-b text-[10px] uppercase font-black text-zinc-500 tracking-widest font-mono">
                      <tr>
                        <th className="p-6 italic tracking-tighter">Product / Variant</th>
                        <th className="p-6 italic tracking-tighter">BTI Part Number</th>
                        <th className="p-6 italic tracking-tighter text-center">Status</th>
                        <th className="p-6 italic tracking-tighter text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {filteredRules.slice(0, visibleCount).map((rule) => {
                        const isBTI = !!rule.bti_part_number;
                        return (
                          <tr key={rule.id} className={`group transition-all hover:bg-zinc-50/50 ${isBTI ? 'bg-blue-50/30' : 'bg-white'}`}>
                            <td className="p-6">
                              <div className="font-black text-sm text-zinc-900 group-hover:text-black transition-colors">{rule.title}</div>
                              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight mt-0.5">{rule.vendor_name}</div>
                            </td>
                            <td className="p-6">
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border font-mono font-bold text-xs ${isBTI ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-zinc-100 text-zinc-400 border-zinc-200 italic'}`}>
                                 {rule.bti_part_number || 'none_assigned'}
                              </div>
                            </td>
                            <td className="p-6 text-center">
                               {isBTI ? (
                                 <span className="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase italic whitespace-nowrap">Distributor Sync Active</span>
                               ) : (
                                 <span className="bg-zinc-100 text-zinc-400 text-[9px] font-black px-3 py-1 rounded-full uppercase italic whitespace-nowrap">Manual Inventory Only</span>
                               )}
                            </td>
                            <td className="p-6 text-right">
                               <button onClick={() => setEditingRule(rule)} className="bg-white hover:bg-black hover:text-white text-zinc-600 border border-zinc-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm">Manage BTI Settings</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredRules.length > visibleCount && (
                    <div className="p-12 text-center bg-zinc-50 border-t border-zinc-100">
                        <button onClick={() => setVisibleCount(visibleCount + 100)} className="bg-white border-2 border-zinc-200 px-8 py-4 rounded-2xl font-black uppercase italic text-xs hover:border-black transition-all shadow-sm">Load More ({filteredRules.length - visibleCount} remaining)</button>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        ) : activeTab === 'product_lab' ? (
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
                      <th className="p-6">Product Family (A-Z)</th>
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
                                    <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full font-black text-[9px] uppercase italic animate-pulse cursor-help border border-red-200">⚠️ Discrepancy</span>
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
                                  <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full font-black text-[9px] uppercase italic border border-green-100">✓ Healthy</span>
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
                                   <div className="divide-y divide-zinc-50 border-x border-zinc-100 mx-6 mb-6 rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50">
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
        ) : activeTab === 'insights' ? (
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic">Operational Insights</h1>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1 italic tracking-[0.2em]">Customer Behavior & Catalog Health</p>
                </div>
                <button onClick={runManualAuditReport} disabled={loading} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-lg">
                  <Activity size={14}/> Run Daily Audit & Reports
                </button>
              </div>

              <div className="grid grid-cols-3 gap-8 mb-12">
                 <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Tracked Abandoned Builds</div>
                    <div className="text-5xl font-black italic tracking-tighter">{abandonedBuilds.length}</div>
                    <p className="text-[10px] text-zinc-400 mt-2">Captured in the last 24 hours</p>
                 </div>
                 <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Negative Inventory</div>
                    <div className="text-5xl font-black italic tracking-tighter text-red-500">{rules.filter(r => r.last_availability === false && r.last_price > 0).length}</div>
                    <p className="text-[10px] text-zinc-400 mt-2">Active items with 0 stock</p>
                 </div>
                 <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-sm">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Catalog Health</div>
                    <div className="text-5xl font-black italic tracking-tighter text-green-500">98%</div>
                    <p className="text-[10px] text-zinc-400 mt-2">Registry Coverage Score</p>
                 </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-zinc-200 shadow-xl overflow-hidden">
                 <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                    <h3 className="font-black uppercase italic tracking-tight flex items-center gap-2"><History size={18}/> Abandoned Build Activity</h3>
                    <button onClick={fetchAbandonedBuilds} className="p-2 text-zinc-400 hover:text-black transition-colors"><RefreshCcw size={16} className={insightsLoading ? 'animate-spin' : ''}/></button>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                       <thead>
                          <tr className="border-b border-zinc-100 italic">
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Time</th>
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Build Type</th>
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Customer</th>
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Subtotal</th>
                             <th className="p-6 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Components</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-zinc-50">
                          {abandonedBuilds.length === 0 ? (
                             <tr><td colSpan="5" className="p-12 text-center text-zinc-400 font-bold italic">No abandoned builds captured recently.</td></tr>
                          ) : abandonedBuilds.map((build, i) => (
                             <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="p-6 text-xs text-zinc-500 font-mono italic">{new Date(build.capturedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                                <td className="p-6"><span className="px-3 py-1 bg-zinc-100 rounded-full text-[10px] font-black uppercase">{build.buildType}</span></td>
                                <td className="p-6">
                                   <div className="text-xs font-bold">{build.visitor?.isLoggedIn ? `${build.visitor.firstName} ${build.visitor.lastName}` : 'Anonymous Visitor'}</div>
                                   <div className="text-[10px] text-zinc-400 font-mono">{build.visitor?.email || build.visitor?.anonymousId?.slice(0,8)}</div>
                                </td>
                                <td className="p-6 text-xs font-black italic">${((build.subtotal || 0)/100).toFixed(2)}</td>
                                <td className="p-6 flex flex-wrap gap-2 max-w-sm">
                                   {(build.components?.front || []).concat(build.components?.rear || []).slice(0,4).map((c, ci) => (
                                      <div key={ci} className="text-[8px] bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded uppercase font-black text-zinc-400">{c.type}: {c.name.slice(0,15)}...</div>
                                   ))}
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
        ) : activeTab === 'admin' ? (
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
        ) : activeTab === 'audit' ? (
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
        ) : activeTab === 'component_library' ? (
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
                            const rid = c._rid || getComponentUniqueId(c);
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
                     <div className="mb-8 p-8 bg-white border border-zinc-100 rounded-[2rem] shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
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

                            <div className="border-l border-zinc-100 pl-8">
                               <div className="flex items-center justify-between mb-4">
                                 <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">Data Integrity Filters</label>
                               </div>
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
                          {isDuplicateMode && (
                             <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl">
                                <div className="flex items-center gap-3 text-amber-900 mb-2 font-black uppercase italic text-xs">
                                   <ShieldAlert size={16}/> Safety Protocol Active
                                </div>
                                <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-widest">
                                   You are duplicating a component. Please manually verify and confirm each entry in the checklist below to unlock the save button.
                                </p>
                             </div>
                          )}

                          <div className="grid gap-6">
                             {/* BASIC FIELDS */}
                             <div className="space-y-4 mb-10">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500/60 block italic">Primary Identity</label>
                                {[
                                   { label: 'Display Name', key: 'Name' },
                                   { label: 'Vendor / Brand', key: 'Vendor' }
                                ].map(field => (
                                   <div key={field.key} className="flex gap-4">
                                      <div className="flex-grow">
                                         <div className="text-[9px] font-black uppercase text-zinc-500/60 mb-1 ml-1 tracking-widest">{field.label}{(field.key === 'Name' || field.key === 'Vendor') && <span className="text-red-500 ml-1 font-bold">*</span>}</div>
                                         <input 
                                            type="text" 
                                            value={getComponentValue(editingComponent, field.key)}
                                            onChange={(e) => setEditingComponent({...editingComponent, [field.key]: e.target.value})}
                                             className={`w-full p-4 rounded-xl outline-none border-2 transition-all font-bold text-sm ${(field.key === 'Name' || field.key === 'Vendor') && (String(getComponentValue(editingComponent, field.key)).trim() === '') ? 'bg-red-50 border-red-200 focus:border-red-500' : 'bg-zinc-50 border-transparent focus:border-black'}`}
                                         />
                                      </div>
                                      {isDuplicateMode && (
                                         <button 
                                            onClick={() => toggleFieldConfirmation(field.key)}
                                            className={`p-4 rounded-xl border-2 transition-all ${confirmedFields.includes(field.key) ? 'bg-green-500 border-green-600 text-white' : 'bg-white border-zinc-200 text-zinc-300'}`}
                                         >
                                            <ShieldCheck size={20}/>
                                         </button>
                                      )}
                                   </div>
                                ))}
                             </div>

                              {/* SHOPIFY LINKAGE SECTION */}
                              <div className="space-y-4 mb-4 bg-emerald-50/30 p-6 rounded-3xl border border-emerald-100/50">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block italic">Shopify Automation Link (Discovery)</label>
                                 <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                       <div className="text-[8px] font-black uppercase text-zinc-400 ml-1">Shopify Product ID</div>
                                       <input 
                                          type="text" 
                                          placeholder="Numeric ID only..."
                                          value={getComponentValue(editingComponent, "shopify_product_id")}
                                          onChange={(e) => setEditingComponent({...editingComponent, shopify_product_id: e.target.value})}
                                          className="w-full p-3 rounded-xl outline-none border-2 border-transparent bg-white focus:border-emerald-500 transition-all font-mono text-xs font-bold shadow-sm"
                                       />
                                    </div>
                                    <div className="space-y-1">
                                       <div className="text-[8px] font-black uppercase text-zinc-400 ml-1">Shopify Variant ID</div>
                                       <input 
                                          type="text" 
                                          placeholder="Auto-synced..."
                                          value={getComponentValue(editingComponent, "shopify_variant_id")}
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
                                   const activeList = (componentData[componentTab] || []).map((item, idx) => ({ ...item, _rawIdx: idx }));
                                   const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx'];
                                   const specFields = [...new Set(activeList.slice(0, 10).flatMap(item => Object.keys(item)))].filter(k => !excludeKeys.includes(k));
                                   
                                   return specFields.map(key => {
                                      const isMandatory = MANDATORY_FIELDS[componentTab]?.some(f => { 
                                          const nf = f.toLowerCase().replace(/[^a-z0-9]/g, ''); 
                                          const nk = key.toLowerCase().replace(/[^a-z0-9]/g, ''); 
                                          return nf === nk || nk.startsWith(nf) || nf.startsWith(nk) || nk.includes(nf) || nf.includes(nk); 
                                       });
                                      const options = DROPDOWN_OPTIONS[key] || DROPDOWN_OPTIONS[formatColumnTitle(key)] || DROPDOWN_OPTIONS[key.toLowerCase()];
                                      
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
                                                     <option value="">Select {formatColumnTitle(key)}...</option>
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
                                            {isDuplicateMode && (
                                               <div className="pt-5">
                                                  <button 
                                                     onClick={() => toggleFieldConfirmation(key)}
                                                     className={`p-4 rounded-xl border-2 transition-all ${confirmedFields.includes(key) ? 'bg-green-500 border-green-600 text-white' : 'bg-white border-zinc-200 text-zinc-300'}`}
                                                  >
                                                     <ShieldCheck size={20}/>
                                                  </button>
                                               </div>
                                            )}
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
                             const activeList = (componentData[componentTab] || []).map((item, idx) => ({ ...item, _rawIdx: idx }));
                             const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx'];
                             const requiredKeys = ['Name', 'Vendor', ...Object.keys(activeList[0] || {}).filter(k => !excludeKeys.includes(k))];
                             const allConfirmed = !isDuplicateMode || requiredKeys.every(k => confirmedFields.includes(k));
                             
                             return (
                                <button 
                                   disabled={!allConfirmed || componentSaving}
                                   onClick={() => {
                                      // Upsert logic - use _editIdx for direct slot replacement
                                        console.log("[Persistence Debug] Save Button Clicked", { _editIdx: editingComponent?._editIdx, isDuplicateMode });
                                        const activeArray = [...(componentData[componentTab] || [])];
                                        const { _editIdx, ...cleanComp } = editingComponent;
                                        
                                        let existingIdx = -1;
                                        // Enforce stable identification via _rid for the master list
                                        const targetId = editingComponent._rid;
                                        if (targetId) {
                                           existingIdx = activeArray.findIndex((item, i) => (item._rid === targetId) || (getComponentUniqueId(item, i) === targetId));
                                        } else if (_editIdx !== undefined && _editIdx >= 0 && _editIdx < activeArray.length) {
                                           // Fallback for objects missing _rid but having a valid local index context
                                           existingIdx = _editIdx;
                                        }

                                        if (existingIdx >= 0 && !isDuplicateMode) {
                                           activeArray[existingIdx] = cleanComp;
                                        } else {
                                           // Ensure new items get a stable ID immediately
                                           const newComp = { ...cleanComp, _rid: `new_${Date.now()}` };
                                           activeArray.unshift(newComp);
                                        }
                                        
                                        console.log(`[Persistence Debug] Saving Drawer Edit: ${targetId} at master index ${existingIdx}`);
                                        saveComponentChanges(activeArray).catch(err => console.error("[Persistence Error] Save failed:", err));
                                   }}
                                   className={`flex-[2] py-5 font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 ${allConfirmed && !componentSaving ? 'bg-black text-white hover:bg-zinc-800' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none'}`}
                                >
                                   {componentSaving ? <Loader2 className="animate-spin" size={16}/> : <Database size={16}/>} 
                                   {isDuplicateMode ? 'Confirm & Commit Clone' : 'Save Changes'}
                                </button>
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
                                    const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx'];
                                    const specFields = Array.from(new Set(activeList.slice(0, 10).flatMap(item => Object.keys(item)))).filter(k => !excludeKeys.includes(k));
                                    
                                    const nodes = specFields.map(key => {
                                       const isMandatory = MANDATORY_FIELDS[componentTab]?.some(f => { 
                                          const nf = f.toLowerCase().replace(/[^a-z0-9]/g, ''); 
                                          const nk = key.toLowerCase().replace(/[^a-z0-9]/g, ''); 
                                          return nf === nk || nk.startsWith(nf) || nf.startsWith(nk) || nk.includes(nf) || nf.includes(nk); 
                                       });
                                       const options = DROPDOWN_OPTIONS[key] || DROPDOWN_OPTIONS[formatColumnTitle(key)] || DROPDOWN_OPTIONS[key.toLowerCase()];
                                       
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
                                                <div className="font-mono text-[8px] truncate text-zinc-500" title={editingComponent._rid}>{editingComponent._rid || "N/A"}</div>
                                             </div>
                                             <div className="bg-zinc-50/50 p-3 rounded-xl border border-zinc-100/30">
                                                <div className="text-[7px] font-black uppercase text-zinc-400 mb-0.5">Raw Index</div>
                                                <div className="font-mono text-[8px] text-zinc-500">{editingComponent._rawIdx ?? "New"}</div>
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
         ) : null}

        {((activeTab === 'product_lab' && (selectedLabProducts.length > 0 || selectedLabVariants.length > 0)) || (activeTab === 'vendors' && selectedRules.length > 0)) && (
           <div className="fixed bottom-6 left-[calc(16rem+1.5rem)] right-6 z-50 bg-black text-white p-4 rounded-[1.5rem] flex items-center justify-between shadow-2xl border border-zinc-800 animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-3 flex-shrink-0">
                <button onClick={() => { 
                   if (activeTab === 'vendors') setSelectedRules([]);
                   else { setSelectedLabProducts([]); setSelectedLabVariants([]); }
                }} className="text-zinc-500 hover:text-white transition-colors"><X size={16} /></button>
                <div className="font-bold text-sm tracking-widest uppercase italic border-r border-zinc-800 pr-6 mr-1">
                  {activeTab === 'vendors' ? selectedRules.length : (selectedLabProducts.length + selectedLabVariants.length)} Selected
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {/* Product Lab Actions */}
                {activeTab === 'product_lab' && <button title="Opens a modal to globally edit metafield components for selected assets" onClick={openMetafieldEditor} className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors bg-blue-950/30 px-4 py-2.5 rounded-xl"><Edit size={14} /> Edit Metafields</button>}
                {activeTab === 'product_lab' && <div className="w-px h-6 bg-zinc-800"></div>}

                {/* Vendor Watcher Actions */}
                {activeTab === 'vendors' && <button title="Changes the .json URL the engine scrapes to find this products vendor data" onClick={() => setShowBulkEditModal(true)} className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors bg-blue-950/30 px-4 py-2.5 rounded-xl"><Edit size={14} /> Set Vendor URL</button>}
                {activeTab === 'vendors' && <button title="Clears 'Needs Review' safety flags and forcefully pushes these prices up/down into Shopify" onClick={bulkApprovePrices} className="flex items-center gap-2 text-[10px] font-black uppercase text-green-400 hover:text-green-300 transition-colors bg-green-950/30 px-4 py-2.5 rounded-xl border border-green-900/50 shadow-lg"><CheckCircle size={14} /> Approve & Push Prices</button>}
                {activeTab === 'vendors' && <div className="w-px h-6 bg-zinc-800"></div>}
                
                {activeTab === 'vendors' && <button title="Set a raw markup factor (e.g. 1.05 = 5% margin increase above MSRP)" onClick={bulkSetPriceAdjust} className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-400 hover:text-amber-300 transition-colors bg-amber-950/30 px-4 py-2.5 rounded-xl">Price Factor</button>}
                {activeTab === 'vendors' && <button title="Overrides the Shopify 'compare-at' value to equal the current cached MSRP, showing a sale badge" onClick={bulkSetCompareAt} className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-400 hover:text-amber-300 transition-colors bg-amber-950/30 px-4 py-2.5 rounded-xl">Compare-At = MSRP</button>}
                {activeTab === 'vendors' && <div className="w-px h-6 bg-zinc-800"></div>}

                {/* Sync selected */}
                <button title="Triggers the live sync scraper immediately to update caching and shopify status if allowed." onClick={() => { activeTab === 'vendors' ? runSelectiveSync(selectedRules) : runLabSync(); }} className="flex items-center gap-2 text-[10px] font-black uppercase text-white hover:text-green-400 transition-colors bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-700 shadow-lg"><RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> Sync Selected Items</button>
                
                {activeTab === 'product_lab' && <div className="w-px h-6 bg-zinc-800"></div>}
                {activeTab === 'product_lab' && <button title="Permanently ignores these items from the Lab tools" onClick={bulkIgnoreLab} className="flex items-center gap-2 text-[10px] font-black uppercase text-white hover:text-red-400 transition-colors bg-red-600 px-5 py-2.5 rounded-xl shadow-lg shadow-red-500/20"><ShieldAlert size={14} /> Ignore & Purge Family</button>}

                {activeTab === 'vendors' && <div className="w-px h-6 bg-zinc-800"></div>}
                {activeTab === 'vendors' && <button title="Disables Auto-Update and permanently removes these from future syncs" onClick={bulkIgnore} className="flex items-center gap-2 text-[10px] font-black uppercase text-white hover:text-red-400 transition-colors bg-red-600 px-5 py-2.5 rounded-xl bg-opacity-30"><ShieldAlert size={14} /> Disable Watch</button>}
                {activeTab === 'vendors' && <button title="Irreversibly deletes these sync rules entirely from Supabase" onClick={bulkDelete} className="flex items-center gap-2 text-[10px] font-black uppercase text-white hover:text-red-400 transition-colors bg-orange-700 px-5 py-2.5 rounded-xl">Destroy</button>}
              </div>
           </div>
        )}

        {showMetaEditModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
             <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden text-sm border border-zinc-200 animate-in zoom-in-95 font-sans">
                <div className="p-8 border-b flex justify-between items-center bg-zinc-50">
                   <div>
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter">Metafield Mass-Editor</h3>
                      <p className="text-[10px] font-black uppercase text-zinc-400 mt-1 italic tracking-widest font-sans">Overwriting {selectedLabProducts.length} Families & {selectedLabVariants.length} Variants</p>
                   </div>
                   <button onClick={() => setShowMetaEditModal(false)} className="p-2 hover:bg-zinc-200 rounded-full transition-all"><X size={24}/></button>
                </div>
                <div className="flex gap-4 border-b border-zinc-100 px-8 pt-6 bg-zinc-50">
                    <button onClick={() => setMetaEditTab('variant')} className={`px-6 py-3 font-black text-[10px] uppercase tracking-widest transition-all ${metaEditTab === 'variant' ? 'text-black border-b-2 border-black -mb-[1px] bg-white rounded-t-xl shadow-[0_-4px_10px_rgba(0,0,0,0.02)]' : 'text-zinc-400 hover:text-zinc-600'}`}>Variant Settings</button>
                    {selectedLabProducts.length > 0 && <button onClick={() => setMetaEditTab('product')} className={`px-6 py-3 font-black text-[10px] uppercase tracking-widest transition-all ${metaEditTab === 'product' ? 'text-black border-b-2 border-black -mb-[1px] bg-white rounded-t-xl shadow-[0_-4px_10px_rgba(0,0,0,0.02)]' : 'text-zinc-400 hover:text-zinc-600'}`}>Product Settings</button>}
                 </div>
                 <div className="p-8 max-h-[60vh] overflow-y-auto bg-white grid grid-cols-2 gap-8">
                   {(() => {
                         const uniqueSelectedTags = new Set();
                         if (selectedLabProducts.length > 0) {
                            const p = allUniqueRules.find(r => String(r.shopify_product_id) === String(selectedLabProducts[0]));
                            if (p) (p.tags||[]).forEach(t => uniqueSelectedTags.add(t.toLowerCase()));
                         }
                         if (selectedLabVariants.length > 0) {
                            const p = allUniqueRules.find(r => String(r.shopify_variant_id) === String(selectedLabVariants[0]));
                            if (p) (p.tags||[]).forEach(t => uniqueSelectedTags.add(t.toLowerCase()));
                         }

                         const activeCategories = [];
                         const ts = Array.from(uniqueSelectedTags);
                         if (ts.includes('rim') || ts.includes('component:rim')) activeCategories.push('RIM');
                         if (ts.includes('hub') || ts.includes('component:hub')) activeCategories.push('HUB');
                         if (ts.includes('spoke') || ts.includes('component:spoke')) activeCategories.push('SPOKE');
                         if (ts.includes('nipple') || ts.includes('component:nipple')) activeCategories.push('NIPPLE');
                         if (ts.includes('valvestem') || ts.includes('component:valvestem')) activeCategories.push('VALVESTEM');
                         if (ts.includes('accessory') || ts.includes('component:accessory')) activeCategories.push('ACCESSORY');

                      return ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY']
                        .filter(cat => activeCategories.length === 0 || activeCategories.includes(cat))
                        .map(cat => {
                           const productFields = metafieldRegistry.filter(m => m.categories.includes(cat) && m.target === 'product');
                           const variantFields = metafieldRegistry.filter(m => m.categories.includes(cat) && m.target === 'variant');
                           
                           if (productFields.length === 0 && variantFields.length === 0) return null;
                           
                           const renderField = (m) => {
                             const realKey = m.key.replace(/^(product_|variant_)/, '');
                             const dynamicOptions = metafieldOptionsMap[realKey] || metafieldOptionsMap[m.key];
                             const isBool = m.type === 'boolean' || dynamicOptions === 'boolean';
                             const hasOptions = (m.options && m.options.length > 0) || (Array.isArray(dynamicOptions) && dynamicOptions.length > 0);
                             const mappedOptions = hasOptions ? (dynamicOptions || m.options) : [];

                             return (
                             <div key={m.key}>
                                <div className="flex items-center gap-2 mb-1.5">
                                   <label className="text-[11px] font-black uppercase text-zinc-500 tracking-widest">{m.label}</label>
                                   {metaEditFields[m.key] === '_CONFLICT_' && <span className="text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md shadow-sm border border-amber-200">Mixed</span>}
                                </div>
                                <div className="relative">
                                    {metaEditFields[m.key] === '_CONFLICT_' && (
                                       <div className="absolute inset-[2px] z-10 flex items-center justify-center bg-zinc-100/90 backdrop-blur-[1px] rounded-[10px] border border-dashed border-zinc-300 group">
                                          <button className="bg-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm border border-zinc-200 hover:border-black transition-all flex items-center gap-2 text-zinc-500 hover:text-black hover:bg-zinc-100 group-hover:scale-105" onClick={() => setMetaEditFields({...metaEditFields, [m.key]: ''})}>
                                             🔒 Unlock to Override
                                          </button>
                                       </div>
                                    )}
                                    {isBool ? (
                                       <select
                                         value={metaEditFields[m.key] !== undefined && metaEditFields[m.key] !== '_CONFLICT_' ? String(metaEditFields[m.key]) : ''}
                                         onChange={e => setMetaEditFields({...metaEditFields, [m.key]: e.target.value === '' ? undefined : e.target.value === 'true'})}
                                         className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 outline-none focus:border-black transition-all font-bold text-sm"
                                       >
                                         <option value="">-- No Change --</option>
                                         <option value="true">True (Yes)</option>
                                         <option value="false">False (No)</option>
                                       </select>
                                    ) : hasOptions ? (
                                       <select
                                         value={(metaEditFields[m.key] !== '_CONFLICT_' ? String(metaEditFields[m.key]) : '') || ''}
                                         onChange={e => setMetaEditFields({...metaEditFields, [m.key]: e.target.value})}
                                         className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 outline-none focus:border-black transition-all font-bold text-sm"
                                       >
                                         <option value="">-- No Change --</option>
                                         {mappedOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                       </select>
                                    ) : (
                                       <input 
                                         type="text" 
                                         placeholder="Leave blank to keep existing..."
                                         className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 outline-none focus:border-black transition-all font-bold text-sm placeholder:text-zinc-300 placeholder:italic"
                                         value={(metaEditFields[m.key] !== '_CONFLICT_' ? metaEditFields[m.key] : '') || ''}
                                         onChange={(e) => setMetaEditFields({...metaEditFields, [m.key]: e.target.value})}
                                       />
                                    )}
                                </div>
                             </div>
                             );
                           };

                           return (
                             <div key={cat} className="space-y-6">
                                <div className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] mb-4 italic px-2">{cat.replace('VALVESTEM','VALVE STEM')}</div>
                                
                                {metaEditTab === 'product' && productFields.length > 0 && (
                                   <div className="space-y-4">
                                      {productFields.map(m => renderField(m))}
                                   </div>
                                )}

                                {metaEditTab === 'variant' && variantFields.length > 0 && (
                                   <div className="space-y-4">
                                      {variantFields.map(m => renderField(m))}
                                   </div>
                                )}
                             </div>
                           );
                        });
                   })()}
                </div>
                <div className="p-8 bg-zinc-50 border-t flex justify-end gap-3">
                   <button onClick={() => setShowMetaEditModal(false)} className="px-6 py-3 rounded-xl font-black uppercase text-[10px] text-zinc-400 hover:text-black transition-all tracking-widest italic">Cancel</button>
                   <button onClick={saveBulkMetafields} className="bg-black text-white px-10 py-3 rounded-xl font-black uppercase text-[10px] shadow-xl hover:bg-zinc-800 transition-all flex items-center gap-2 tracking-widest italic">
                     {loading ? <RefreshCcw className="animate-spin" size={14}/> : <ShieldCheck size={14}/>}
                     {loading ? 'Syncing...' : 'Commit Batch Updates'}
                   </button>
                </div>
             </div>
          </div>
        )}

        {showDupModal && dupSourceProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden text-sm border border-zinc-800 animate-in fade-in zoom-in-95">
              <div className="p-6 border-b flex justify-between items-center bg-zinc-50">
                <h3 className="text-xl font-black uppercase italic tracking-tighter">Clone Architect</h3>
                <button onClick={() => setShowDupModal(false)}><X size={20}/></button>
              </div>
              <div className="p-8 space-y-6">
                 <div>
                    <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">New Product Title</label>
                    <input 
                      type="text" 
                      className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" 
                      value={dupOptions.newTitle} 
                      onChange={(e) => setDupOptions({...dupOptions, newTitle: e.target.value})} 
                      placeholder="Enter new product title..."
                    />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Status</label>
                      <select 
                        className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all appearance-none"
                        value={dupOptions.status}
                        onChange={(e) => setDupOptions({...dupOptions, status: e.target.value})}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="DRAFT">DRAFT</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                    </div>
                    <div className="flex flex-col justify-center gap-3 pt-4">
                       <label className="flex items-center gap-3 cursor-pointer group">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded-lg border-2 border-zinc-200 text-black focus:ring-black"
                            checked={dupOptions.includeMedia}
                            onChange={(e) => setDupOptions({...dupOptions, includeMedia: e.target.checked})}
                          />
                          <span className="text-[10px] font-black uppercase text-zinc-500 group-hover:text-black transition-colors">Include Media</span>
                       </label>
                       <label className="flex items-center gap-3 cursor-pointer group">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded-lg border-2 border-zinc-200 text-black focus:ring-black"
                            checked={dupOptions.includeInventory}
                            onChange={(e) => setDupOptions({...dupOptions, includeInventory: e.target.checked})}
                          />
                          <span className="text-[10px] font-black uppercase text-zinc-500 group-hover:text-black transition-colors">Include Inventory</span>
                       </label>
                    </div>
                 </div>

                 <div className="pt-4">
                    <button 
                      onClick={() => executeDuplication()}
                      disabled={loading || !dupOptions.newTitle}
                      className="w-full bg-black text-white p-5 rounded-2xl font-black uppercase italic tracking-tight hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100"
                    >
                      {loading ? <Loader2 className="animate-spin" size={20}/> : <Plus size={20}/>}
                      {loading ? 'Cloning Engine Running...' : 'Execute Duplication'}
                    </button>
                    <p className="text-[9px] text-zinc-400 text-center mt-4 uppercase font-bold tracking-widest">Variant Metafields will be migrated automatically</p>
                 </div>
              </div>
            </div>
          </div>
        )}

        {editingRule && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden text-sm border border-zinc-800 animate-in fade-in zoom-in-95">
              <div className="p-6 border-b flex justify-between items-center bg-zinc-50">
                <h3 className="text-xl font-black uppercase italic tracking-tighter">Edit Configuration</h3>
                <button onClick={() => setEditingRule(null)}><X size={20}/></button>
              </div>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Internal Title</label>
                  <input type="text" className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.title} onChange={(e) => setEditingRule({...editingRule, title: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Vendor Product URL</label>
                  <input type="text" className="w-full p-4 bg-zinc-100 rounded-xl font-mono text-xs outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.vendor_url || ''} onChange={(e) => setEditingRule({...editingRule, vendor_url: e.target.value})} />
                </div>
                {editingRule.last_log && editingRule.last_log.includes('Link:') && (
                  <div>
                    <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">LoamLabs Store URL</label>
                    <div className="flex items-center gap-2">
                       <input type="text" readOnly className="flex-grow p-4 bg-zinc-50 rounded-xl font-mono text-[10px] text-zinc-500 outline-none border-2 border-transparent" value={editingRule.last_log.split('Link:')[1].trim()} />
                       <a href={editingRule.last_log.split('Link:')[1].trim()} target="_blank" className="p-4 bg-black text-white rounded-xl hover:bg-zinc-800 transition-all"><ExternalLink size={14}/></a>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Price Adjustment</label>
                        <input 
      type="number" 
      step="0.0001" 
      className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" 
      value={editingRule.price_adjustment_factor ?? ''} 
      placeholder="1.0"
      onChange={(e) => setEditingRule({...editingRule, price_adjustment_factor: e.target.value === '' ? null : e.target.value})} 
    />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Safety Threshold</label>
                        <input type="number" step="0.01" className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.price_drop_threshold || 0.20} onChange={(e) => setEditingRule({...editingRule, price_drop_threshold: e.target.value})} />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">OOS Reminder (Days)</label>
                        <input type="number" step="1" min="1" className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black transition-all" value={editingRule.oos_reminder_days ?? 20} onChange={(e) => setEditingRule({...editingRule, oos_reminder_days: parseInt(e.target.value) || 20})} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">OOS Reminder</label>
                        <button onClick={() => setEditingRule({...editingRule, oos_reminder_enabled: !editingRule.oos_reminder_enabled})} className={`w-full p-4 rounded-xl font-black text-sm uppercase transition-all border-2 ${editingRule.oos_reminder_enabled !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-zinc-100 text-zinc-400 border-transparent'}`}>
                            {editingRule.oos_reminder_enabled !== false ? '✓ Enabled' : '✗ Disabled'}
                        </button>
                    </div>
                </div>
                <div className="pt-4 border-t border-zinc-100 mt-6">
                    <h4 className="text-[10px] font-black uppercase text-zinc-400 mb-4 tracking-[0.2em] italic">BTI Sync Settings</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">BTI Part Number</label>
                            <input type="text" className="w-full p-4 bg-blue-50/50 rounded-xl font-mono text-xs outline-none border-2 border-transparent focus:border-blue-400 transition-all font-bold" placeholder="bti-12345" value={editingRule.bti_part_number || ''} onChange={(e) => setEditingRule({...editingRule, bti_part_number: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">OOS Action</label>
                                <select className="w-full p-4 bg-zinc-100 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black appearance-none" value={editingRule.bti_oos_action || 'continue'} onChange={(e) => setEditingRule({...editingRule, bti_oos_action: e.target.value})}>
                                    <option value="continue">Continue Selling</option>
                                    <option value="deny">Stop Selling (Deny)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Monitoring</label>
                                <button onClick={() => setEditingRule({...editingRule, bti_monitoring_enabled: !editingRule.bti_monitoring_enabled})} className={`w-full p-4 rounded-xl font-black text-sm uppercase transition-all border-2 ${editingRule.bti_monitoring_enabled !== false ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-zinc-100 text-zinc-400 border-transparent'}`}>
                                    {editingRule.bti_monitoring_enabled !== false ? '✓ Active' : '✗ Off'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <button onClick={() => updateRule(editingRule.id, editingRule)} className="w-full bg-black text-white font-black p-5 rounded-2xl uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-xl italic">Save Changes</button>
              </div>
            </div>
          </div>
        )}
        {showBulkEditModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" style={{animation: 'fadeIn 0.2s ease-out'}}>
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-zinc-100" style={{animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'}}>
              <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <div>
                  <h2 className="text-2xl font-black uppercase italic tracking-tight">Mass Edit Rule(s)</h2>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1">Applying to {selectedRules.length} items</p>
                </div>
                <button onClick={() => setShowBulkEditModal(false)} className="p-3 bg-white hover:bg-zinc-100 rounded-2xl border border-zinc-200 transition-all text-zinc-400 hover:text-black">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest italic">Vendor URL Target</label>
                  <input type="text" className="w-full p-4 bg-zinc-100 rounded-xl font-mono text-xs outline-none border-2 border-transparent focus:border-black transition-all" value={bulkEditUrl} onChange={(e) => setBulkEditUrl(e.target.value)} placeholder="https://www.vendor.com/product/..." />
                </div>
                <button onClick={executeBulkEdit} disabled={!bulkEditUrl} className="w-full bg-black text-white font-black p-5 rounded-2xl uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-xl italic disabled:opacity-50">Apply to {selectedRules.length} Items</button>
              </div>
            </div>
          </div>
        )}
        {showLogsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" style={{animation: 'fadeIn 0.2s ease-out'}}>
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden border border-zinc-100" style={{animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'}}>
              <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <div>
                  <h2 className="text-2xl font-black uppercase italic tracking-tight">Sync History</h2>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1">Last 50 Heartbeats (30 Day Retention)</p>
                </div>
                <button onClick={() => setShowLogsModal(false)} className="p-3 bg-white hover:bg-zinc-100 rounded-2xl border border-zinc-200 transition-all text-zinc-400 hover:text-black">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-grow overflow-auto p-4 space-y-3 bg-zinc-50/30">
                {syncLogs.length === 0 ? (
                  <div className="text-center py-20 text-zinc-400 font-bold uppercase text-xs italic tracking-widest">No logs found yet...</div>
                ) : (
                  syncLogs.map((log) => (
                    <div key={log.id} className="bg-white p-5 rounded-3xl border border-zinc-100 shadow-sm flex items-center gap-4 hover:border-zinc-300 transition-all group">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                        log.status === 'success' ? 'bg-green-50 border-green-100 text-green-600' : 
                        log.status === 'error' ? 'bg-red-50 border-red-100 text-red-600' : 
                        'bg-zinc-50 border-zinc-100 text-zinc-400'
                      }`}>
                        {log.status === 'success' ? <Zap size={20} /> : log.status === 'error' ? <AlertCircle size={20} /> : <Activity size={20} />}
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black uppercase text-zinc-400 tracking-tighter italic">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                            log.status === 'success' ? 'bg-green-100 border-green-200 text-green-700' : 
                            log.status === 'error' ? 'bg-red-100 border-red-200 text-red-700' : 
                            'bg-zinc-100 border-zinc-200 text-zinc-500'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-zinc-800 line-clamp-1 group-hover:line-clamp-none transition-all">{log.message}</p>
                        {log.status !== 'error' && (
                          <div className="flex gap-4 mt-2">
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-zinc-400">
                              <span className="text-green-600">{log.updated_count || 0}</span> Updates
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-zinc-400">
                              <span className="text-red-500">{log.attention_count || 0}</span> Alerts
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-zinc-400">
                              <span className="text-orange-500">{log.stock_changes_count || 0}</span> Stock
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- DATALISTS FOR AUTO-SUGGESTION --- */}
        {Object.entries(COMPONENT_SUGGESTIONS).map(([key, options]) => (
          <datalist key={key} id={`list-${key.replace(/\s+/g, '-')}`}>
            {options.map(opt => <option key={opt} value={opt} />)}
          </datalist>
        ))}


        {/* --- COMPONENT BULK ACTION BAR --- */}
        {selectedComponents.length > 0 && activeTab === 'component_library' && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-bottom duration-500">
             <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 p-4 px-8 rounded-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.6)] flex items-center gap-10">
                <div className="flex items-center gap-4 border-r border-zinc-800 pr-10">
                   <div className="bg-blue-600 text-white p-2.5 rounded-2xl shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                      <Layers size={20} />
                   </div>
                   <div>
                      <div className="text-white font-black text-sm uppercase italic tracking-tighter leading-none">{selectedComponents.length} Selected</div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Mass Modification Engine</div>
                   </div>
                </div>

                <div className="flex items-center gap-4">
                   <button 
                     onClick={handleOpenMassEdit}
                     disabled={componentSaving}
                     className={`flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-white hover:text-black text-zinc-300 rounded-xl transition-all border border-zinc-700/50 group shadow-lg ${componentSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                   >
                      <Edit3 size={14} className="group-hover:scale-110 transition-transform"/>
                      <span className="text-[10px] font-black uppercase tracking-widest">Mass Edit Items</span>
                   </button>

                   <button 
                     onClick={handleBulkDelete}
                     disabled={componentSaving}
                     className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all border group shadow-lg ${componentSaving ? 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed' : 'bg-red-900/20 hover:bg-red-500 text-red-500 hover:text-white border-red-900/30'}`}
                   >
                      <Trash2 size={14} className="group-hover:scale-110 transition-transform"/>
                      <span className="text-[10px] font-black uppercase tracking-widest">Move to Trash</span>
                   </button>

                   <div className="w-1 h-8 bg-zinc-800 mx-2"></div>

                   <button 
                     onClick={() => setSelectedComponents([])}
                     className="px-6 py-3 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors hover:bg-zinc-800 rounded-xl"
                   >
                      Dismiss
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* --- NOTIFICATION TOAST --- */}
        {notification && (
           <div className={`fixed top-6 right-6 z-[200] p-4 rounded-2xl shadow-2xl border animate-in slide-in-from-top-4 duration-300 flex items-center gap-3 ${notification.type === 'error' ? 'bg-red-50 border-red-100 text-red-900' : 'bg-black text-white border-zinc-800'}`}>
              {notification.type === 'error' ? <ShieldAlert size={18} className="text-red-500" /> : <CheckCircle size={18} className="text-green-400" />}
              <div className="text-[10px] font-black uppercase tracking-widest">{notification.msg}</div>
              <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70 transition-opacity"><X size={14}/></button>
           </div>
        )}
               {/* --- SPREADSHEET BATCH SAVE BAR --- */}
         {(() => {
            const hasUnsaved = Object.keys((gridUnsavedChanges || {})[componentTab] || {}).length > 0;
            const hasAdded = ((gridAddedRows || {})[componentTab] || []).length > 0;
            if (!hasUnsaved && !hasAdded) return null;

            return (
               <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[160] animate-in slide-in-from-bottom duration-500">
                  <div className="bg-black text-white border border-zinc-800 p-4 px-10 rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex items-center gap-12 border-2 border-primary/20">
                     <div className="flex items-center gap-5 border-r border-zinc-800 pr-12">
                        <div className="bg-zinc-900 p-3 rounded-2xl relative">
                           <RefreshCcw size={22} className="text-primary animate-pulse" />
                           <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] font-black flex items-center justify-center border-2 border-black border-red-500">!</div>
                        </div>
                        <div>
                           <div className="font-black text-lg uppercase italic tracking-tighter leading-none">Unsaved Library Changes</div>
                           <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Pending Batch Sync to GitHub</div>
                        </div>
                     </div>

                     <div className="flex items-center gap-4">
                        <button 
                           onClick={handleCommitBatchSave}
                           disabled={componentSaving}
                           className={`flex items-center gap-3 px-10 py-4 bg-white text-zinc-900 rounded-2xl font-black uppercase text-xs tracking-[0.1em] transition-all hover:scale-105 active:scale-95 shadow-xl disabled:opacity-50 disabled:grayscale`}
                        >
                           {componentSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={18} />}
                           Commit Changes to Main
                        </button>
                        <button 
                           onClick={() => {
                              if (confirm("DISCARD ALL UNSAVED SPREADSHEETING EDITS? This will wipe your draft.")) {
                                 setGridUnsavedChanges(prev => ({ ...prev, [componentTab]: {} }));
                                 setGridAddedRows(prev => ({ ...prev, [componentTab]: [] }));
                              }
                           }}
                           className="px-6 py-4 text-zinc-500 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-colors"
                        >
                           Discard Draft
                        </button>
                     </div>
                  </div>
               </div>
            );
         })()}
       </main>
       {/* --- REVIEW CHANGES MODAL --- */}
       <ReviewChangesModal 
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          onConfirm={handleFinalConfirmSave}
          changes={gridUnsavedChanges[componentTab] || {}}
          originalData={componentData[componentTab] || []}
          addedRows={gridAddedRows[componentTab] || []}
          category={componentTab}
       />

       {/* --- HISTORY MODAL --- */}
       {showHistoryModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden border border-zinc-100">
             <div className="p-8 border-b flex justify-between items-center bg-zinc-50/50">
               <div>
                 <h2 className="text-2xl font-black uppercase italic tracking-tighter">Commit History</h2>
                 <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{componentTab} Database Timeline</p>
               </div>
               <button onClick={() => setShowHistoryModal(false)} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm"><X/></button>
             </div>
             <div className="flex-grow overflow-y-auto p-8 space-y-4">
               {componentHistory.length === 0 ? (
                 <div className="text-center py-12 text-zinc-300 italic font-bold">No history found for this file.</div>
               ) : componentHistory.map((c, idx) => (
                 <a 
                   key={idx} 
                   href={c.url} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="block p-5 rounded-3xl border border-zinc-100 hover:border-zinc-300 hover:shadow-lg transition-all group"
                 >
                   <div className="flex justify-between items-start mb-2">
                     <span className="text-[10px] font-black uppercase bg-zinc-900 text-white px-2 py-1 rounded-md tracking-tighter">#{c.sha.slice(0, 7)}</span>
                     <span className="text-[10px] font-bold text-zinc-400">{new Date(c.date).toLocaleDateString()} {new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   </div>
                   <p className="text-sm font-bold text-zinc-800 group-hover:text-black transition-colors">{c.message}</p>
                   <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-50">
                     <div className="w-5 h-5 bg-zinc-100 rounded-full flex items-center justify-center text-[8px] font-bold">{c.author[0]}</div>
                     <span className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">{c.author}</span>
                   </div>
                 </a>
               ))}
             </div>
             <div className="p-8 border-t bg-zinc-50/50">
               <button onClick={() => setShowHistoryModal(false)} className="w-full py-4 bg-black text-white font-bold rounded-[1.5rem] hover:bg-zinc-800 transition-all uppercase tracking-widest text-xs">Close Logs</button>
             </div>
           </div>
         </div>
       )}

       {/* --- VARIANT SYNC MODAL --- */}
       {showVariantSyncModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-zinc-100">
             <div className="p-8 border-b flex justify-between items-center bg-emerald-50/50">
               <div>
                 <h2 className="text-2xl font-black uppercase italic tracking-tighter">Variant Matcher</h2>
                 <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Shopify Auto-Detection Results</p>
               </div>
               <button onClick={() => setShowVariantSyncModal(false)} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm"><X/></button>
             </div>
             
             <div className="flex-grow overflow-y-auto p-8 border-b border-zinc-50">
                <div className="bg-emerald-50 p-4 rounded-2xl mb-6 text-xs text-emerald-800 font-bold border border-emerald-100 flex items-center gap-3">
                   <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center"><CheckCircle size={16}/></div>
                   Successfully matched {proposedVariantUpdates.length} items using Specs-to-Options mapping.
                </div>

                <div className="space-y-3">
                   {proposedVariantUpdates.map((p, idx) => (
                      <div key={idx} className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex items-center justify-between group hover:border-emerald-200 transition-all">
                         <div className="flex-grow">
                            <div className="text-[10px] font-black uppercase text-zinc-400 mb-1">{p.productTitle}</div>
                            <div className="text-sm font-black italic">{p.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                               <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-tight">Match: {p.variantTitle}</span>
                               <span className="text-[9px] font-bold text-zinc-400">ID: {p.newVariantId}</span>
                            </div>
                         </div>
                         <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Zap size={16} className="text-emerald-500"/>
                         </div>
                      </div>
                   ))}
                </div>
             </div>

             <div className="p-8 border-t bg-zinc-50/50 flex gap-4">
               <button onClick={() => setShowVariantSyncModal(false)} className="flex-grow py-4 bg-white border border-zinc-200 text-zinc-600 font-bold rounded-[1.5rem] hover:bg-zinc-100 transition-all uppercase tracking-widest text-xs">Discard Matches</button>
               <button onClick={applyVariantDiscovery} className="flex-grow py-4 bg-emerald-600 text-white font-bold rounded-[1.5rem] hover:bg-emerald-700 transition-all uppercase tracking-widest text-xs shadow-xl shadow-emerald-500/20">Apply IDs to Grid</button>
             </div>
           </div>
         </div>
       )}

    </div>
  );
}
