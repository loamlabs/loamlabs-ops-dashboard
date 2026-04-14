import React, { useState, useEffect, useRef } from 'react';
import ComponentLibraryGrid from '../components/ComponentLibraryGrid';
import ReviewChangesModal from '../components/ReviewChangesModal';
import { RefreshCcw, RefreshCw, Search, Package, ShieldCheck, ShieldAlert, Plus, X, Info, Image as ImageIcon, Loader2, LogOut, ChevronUp, ChevronDown, ChevronRight, Trash2, AlertCircle, AlertTriangle, Zap, ZapOff, DollarSign, Tag, History, Activity, Beaker, Edit3, Edit, Settings, ExternalLink, BarChart, Database, CheckCircle, Layers, Clock } from 'lucide-react';

const COMPONENT_SUGGESTIONS = {};

const DROPDOWN_OPTIONS = {
  'Wheel Spec Position': ['Front', 'Rear', 'Front/Rear'],
  'Option 1 Name': ['Size', 'Spoke Count', 'Freehub', 'Spacing', 'Color', 'Type'],
  'Option 2 Name': ['Size', 'Spoke Count', 'Freehub', 'Spacing', 'Color', 'Type'],
  'Rim Size': ['26"', '27.5"', '29"', '30"', '31"', '32"', '700c', '650b'],
  'Spoke Count': ['16h', '18h', '20h', '24h', '28h', '32h', '36h'],
  'Hub Type': ['J-Bend', 'Straight Pull', 'Hook Flange'],
  'Hub Lacing Policy': ['Standard', 'Force 2-Cross for 28h Only', 'Force 3-Cross for 28h Only', 'Force All as 2-Cross', 'Use Manual Override Field', 'None'],
  'Rim Washer Policy': ['Optional', 'Mandatory', 'Not Compatible', 'None'],
  'Spoke Type': ['J-Bend', 'Straight Pull', 'Carbon'],
  'Spoke Rounding Rule': ['Nearest', 'Even'],
  'Hub Freehub': ['Standard', 'XD', 'XDR', 'N/A']
};

const MANDATORY_FIELDS = {
  rims: ['Title', 'Vendor', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Wheel Spec Position', 'Rim Erd', 'Weight G (p)'],
  hubs: ['Title', 'Vendor', 'Option1 Name', 'Option1 Value', 'Hub Type', 'Weight G (v)', 'Wheel Spec Position'],
  spokes: ['Title', 'Vendor', 'Spoke Type', 'Spoke Cross Section Area Mm2', 'Spoke Model Group', 'Weight G (p)', 'Spoke Diameter Spec', 'Spoke Rounding Rule'],
  nipples: ['Title', 'Vendor', 'Option1 Name', 'Option1 Value', 'Weight G (p)']
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
  const [isImportingProduct, setIsImportingProduct] = useState(false);
  const [productSyncId, setProductSyncId] = useState('');
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
    { key: 'hub_manual_cross_value', label: 'Hub Manual Cross Value', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'weight_g', label: 'Variant Metafield: custom.weight_g [number_decimal]', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'decimal' },
    { key: 'length_adjust_mm', label: 'Variant Metafield: custom.length_adjust_mm [number_decimal]', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE'], target: 'variant', type: 'decimal' },
    { key: 'wheel_spec_position', label: 'Variant Metafield: custom.wheel_spec_position [single_line_text_field]', categories: ['RIM', 'HUB'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'option1', label: 'Option1 Value', categories: ['RIM'], target: 'variant', isOption: true },
    { key: 'option2', label: 'Option2 Value', categories: ['RIM'], target: 'variant', isOption: true },
    { key: 'rim_erd', label: 'Variant Metafield: custom.rim_erd [number_decimal]', categories: ['RIM'], target: 'variant', type: 'decimal', isConstant: true },
    { key: 'valve_min_rim_depth_mm', label: 'Valve Min Rim Depth mm', categories: ['VALVESTEM'], target: 'variant', type: 'integer', isConstant: true },
    { key: 'valve_max_rim_depth_mm', label: 'Valve Max Rim Depth mm', categories: ['VALVESTEM'], target: 'variant', type: 'integer', isConstant: true },
    { key: 'acc_rim_width_min', label: 'Accessory Compatible Rim Width MIN (mm)', categories: ['ACCESSORY'], target: 'variant', type: 'integer' },
    { key: 'acc_rim_width_max', label: 'Accessory Compatible Rim Width MAX (mm)', categories: ['ACCESSORY'], target: 'variant', type: 'integer' },
    { key: 'hub_sp_offset_spoke_hole_left', label: 'Hub SP Offset Spoke Hole Left', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'hub_sp_offset_spoke_hole_right', label: 'Hub SP Offset Spoke Hole Right', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'product_weight_g', label: 'Metafield: custom.weight_g [number_decimal]', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'decimal' },
    { key: 'integrated_hub_name', label: 'Integrated Hub Name', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'spoke_hub_interface', label: 'Spoke Hub Interface', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'model', label: 'Model', categories: ['RIM', 'HUB', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    // HUB SPECIFIC JSON FIELDS
    { key: 'hub_lacing_cross_left', label: 'Hub Lacing Cross Left', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'hub_lacing_cross_right', label: 'Hub Lacing Cross Right', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'hub_spoke_distribution', label: 'Hub Spoke Distribution', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_flange_diameter_left', label: 'Hub Flange Diameter Left', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_flange_diameter_right', label: 'Hub Flange Diameter Right', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_flange_offset_left', label: 'Hub Flange Offset Left', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_flange_offset_right', label: 'Hub Flange Offset Right', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_spoke_hole_diameter', label: 'Hub Spoke Hole Diameter', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_lacing_policy', label: 'Hub Lacing Policy', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'hub_type', label: 'Hub Type', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    // RIM SPECIFIC JSON FIELDS
    { key: 'nipple_washer_thickness', label: 'Metafield: custom.nipple_washer_thickness [number_decimal]', categories: ['RIM'], target: 'product', type: 'decimal' },
    { key: 'rim_spoke_hole_offset', label: 'Metafield: custom.rim_spoke_hole_offset [number_decimal]', categories: ['RIM'], target: 'product', type: 'decimal' },
    { key: 'rim_washer_policy', label: 'Metafield: custom.rim_washer_policy [single_line_text_field]', categories: ['RIM'], target: 'product', type: 'single_line_text_field' },
    { key: 'rim_target_tension_kgf', label: 'Metafield: custom.rim_target_tension_kgf [number_integer]', categories: ['RIM'], target: 'product', type: 'integer' },
    { key: 'rim_compatible_nipple_types', label: 'Metafield: custom.rim_compatible_nipple_types [list.single_line_text_field]', categories: ['RIM'], target: 'product', type: 'list.single_line_text_field' },
    // SPOKE SPECIFIC JSON FIELDS
    { key: 'spoke_type', label: 'Spoke Type', categories: ['SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'spoke_model_group', label: 'Spoke Model Group', categories: ['SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'spoke_diameter_spec', label: 'Spoke Diameter Spec', categories: ['SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'spoke_rounding_rule', label: 'Spoke Rounding Rule', categories: ['SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'spoke_cross_section_area_mm2', label: 'Spoke Cross Section Area Mm2', categories: ['SPOKE'], target: 'product', type: 'decimal' }
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
      
      const normalize = (str) => String(str || "").toLowerCase().replace(/Ã—/g, 'x').replace(/\s+/g, ' ').trim();
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
  const showNotification = React.useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  useEffect(() => {
    console.log("%cðŸš€ [SYSTEM] DASHBOARD VERSION 2.2 ACTIVE", "color: #3b82f6; font-size: 14px; font-weight: 800; padding: 4px; border: 2px solid #3b82f6; border-radius: 4px;");
    if (typeof window !== 'undefined') {
       window.__DASHBOARD_VERSION__ = "2.2-nuclear-debug";
    }
  }, []);

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
    if (item?._rid) return item?._rid;
    // Priority 2: Use native database IDs
    const baseId = item.id || item.shopify_product_id || item.ID || item['Product ID'] || item['Variant ID'];
    if (baseId) return String(baseId);
    // Priority 3: Use row index only as a last resort during initial render (this should be rare after hydration)
    const name = (item.Title || item.Name || item.name || item.title || "Unknown").trim();

    const vendor = (item.Vendor || item.vendor || item.Brand || item.brand || "Unknown").trim();
    const cleanName = `${vendor}_${name}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${cleanName}_${item._rawIdx !== undefined ? item._rawIdx : index}`;
  }, []);

  const getCleanShopifyId = React.useCallback((val) => {
    if (!val) return '';
    const str = String(val);
    return str.includes('/') ? str.split('/').pop() : str;
  }, []);

  const cleanShopifyValue = React.useCallback((v) => {
    if (v === null || v === undefined || v === "") return "";
    let val = v;
    // Handle Shopify "List" metafields (JSON array strings)
    if (typeof v === 'string' && v.startsWith('[') && v.endsWith(']')) {
       try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) return parsed; // Return the whole array for the audit engine
       } catch (e) { /* Not JSON, keep original */ }
    }
    return val;
  }, []);

  const getComponentValue = React.useCallback((component, key) => {
    if (!component) return '';
    
    // 1. Direct Match (Always prioritize the exact key in the JSON)
    if (component[key] !== undefined && component[key] !== null && String(component[key]).trim() !== '') {
       return component[key];
    }

    const normTarget = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // 2. Identity Mapping (Standardize Display for Header Columns)
    if (normTarget === 'name' || normTarget === 'displayname' || normTarget === 'title') {
       const exactName = component.Title || component.title || component.Name || component.name;
       if (exactName) return exactName;
    }
    if (normTarget === 'vendor' || normTarget === 'brand') {
       const exactVendor = component.Vendor || component.vendor || component.Brand || component.brand;
       if (exactVendor) return exactVendor;
    }
    if (normTarget === 'productid' || normTarget === 'shopifyproductid') {
       return component.shopify_product_id || component.id || component.ID || component['Product ID'] || '';
    }
    if (normTarget === 'variantid' || normTarget === 'shopifyvariantid') {
       return component.shopify_variant_id || component['Variant ID'] || '';
    }

    // 3. REGISTRY & DEEP TECHNICAL MATCHING
    // Search the registry for the target label
    const regEntry = metafieldRegistry.find(r => 
       r.label.toLowerCase().replace(/[^a-z0-9]/g, '') === normTarget ||
       r.key.toLowerCase().replace(/[^a-z0-9]/g, '') === normTarget
    );

    const keys = Object.keys(component);
    const regKey = regEntry?.key?.toLowerCase();
    
    const findInJSON = () => {
       // A. Try registry key match (e.g. "rim_erd")
       if (regKey && component[regEntry.key] !== undefined && String(component[regEntry.key]).trim() !== '') {
          return component[regEntry.key];
       }
       
       // B. Deep Parser for Technical Keys 
       // Pattern: "Metafield: custom.rim_erd [number_decimal]" OR "Variant Metafield: custom.weight_g [number_decimal]"
       const deepMatch = keys.find(k => {
          const lowerK = k.toLowerCase();
          // Skip if value is blank
          if (String(component[k]).trim() === '') return false;

          // Remove noise
          let cleanK = lowerK.replace(/variant metafield:|metafield:|custom\.|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
          
          // Match against registry key OR target label
          return (regKey && cleanK === regKey.replace(/[^a-z0-9]/g, '')) || cleanK === normTarget;
       });

       if (deepMatch) return component[deepMatch];
       return "";
    };

    const result = findInJSON();
    return (result === undefined || result === null) ? '' : result;
  }, [metafieldRegistry]);


  // --- SHARED AUDIT ENGINE ---
  // This 'Golden Rule' is shared by BOTH the Sync Audit and Sync Selected buttons
  // to ensure 100% consistency across the dashboard.
   const formatShopifyTitle = (title, category) => {
      if (!title) return '';
      let clean = title
         .replace(/Centerlock/gi, 'CL')
         .replace(/Hook Flange/gi, 'HF')
         .replace(/Straight Pull/gi, 'SP');
      
      // Smart Rim Cleaner: Only remove 'Rim' if it is the absolute final word
      // This preserves components like "Velocity A23 (Rim Brake)"
      if (category === 'rims') {
         clean = clean.replace(/\s+rim$/i, '');
      }
      
      return clean.trim();
   };

  const evaluateComponentAgainstShopify = React.useCallback((comp, shopifyVariant, tab) => {
     if (!comp || !shopifyVariant) return null;
     
     const mismatches = [];
     const proposals = {};
     const variant = shopifyVariant;
     
     const normalize = (val) => {
         const clean = String(val === 0 ? "0" : (val || "")).trim();
         if (clean === "") return "";
         
         // Only parse as float if it's a pure numeric value (prevents "700c" -> "700" bug)
         if (/^-?\d*\.?\d+$/.test(clean)) {
            const n = parseFloat(clean);
            if (!isNaN(n)) return String(n); // Standardize to clean number string (e.g. "0.70" -> "0.7")
         }
         
         return clean.toLowerCase();
      };

     const activeTabRegistry = metafieldRegistry.filter(m => 
         m.categories?.map(c => c.toLowerCase() + 's').includes(tab)
      );
     
     console.group(`[Sync Audit] Evaluating: ${comp.Title || 'Unnamed'}`);

     activeTabRegistry.forEach(m => {
        // Evaluate based on registry rule
        let shopifyVal = null;
        // --- IMPROVED: Handle Shopify Options (Size, Holes, etc) ---
        if (m.isOption) {
           shopifyVal = variant[m.key];
        } else if (m.target === 'variant') {
           shopifyVal = variant[m.key] || variant.metafields?.find(sm => sm.key === m.key)?.value;
        } else {
           shopifyVal = variant.product?.[m.key] || variant.product?.metafields?.find(sm => sm.key === m.key)?.value;
        }

        const cValue = getComponentValue(comp, m.label);
        const ncVal = normalize(cValue);
        let nsVal = "";
        
        if (Array.isArray(shopifyVal)) {
           const shopValsNorm = shopifyVal.map(v => normalize(v));
           nsVal = shopValsNorm.includes(ncVal) ? ncVal : (shopValsNorm[0] || "");
        } else {
           nsVal = normalize(shopifyVal);
        }

        // [FIX] Ignore mismatch if Shopify is empty/0 but Grid has data (prevents destructive wipes)
        if ((nsVal === "" || nsVal === "0") && ncVal !== "") {
           return; 
        }

        // Special handling for Hole Counts (e.g. "32H" vs "32")
        if (m.key === 'option2' && tab === 'rims' && ncVal.replace(/\D/g, '') === nsVal.replace(/\D/g, '') && nsVal !== "") {
           return; // Match!
        }

        if (ncVal !== nsVal) {
           mismatches.push(m.label);
           // Proposed value is always the Shopify value (Standardize)
           proposals[m.label] = (Array.isArray(shopifyVal) ? shopifyVal[0] : shopifyVal) || "";
        }
     });

     console.groupEnd();
     return mismatches.length > 0 ? { mismatches, proposals } : null;
  }, [metafieldRegistry, getComponentValue]);



  const unifyComponentKeys = React.useCallback((data) => {
     if (!data || typeof data !== 'object') return data;
     
     const processItem = (item) => {
        const newItem = { ...item };
        if (newItem.ID && !newItem.shopify_product_id) newItem.shopify_product_id = newItem.ID;
        if (newItem.id && !newItem.shopify_product_id) newItem.shopify_product_id = newItem.id;
        return newItem;
      };

     if (Array.isArray(data)) return data.map(processItem);
     const newData = {};
     Object.entries(data).forEach(([tab, items]) => {
        newData[tab] = Array.isArray(items) ? items.map(processItem) : items;
     });
     return newData;
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
          // Comprehensive weight check after overhaul (Supports new technical headings)
          const variantWeight = getComponentValue(component, 'Variant Metafield: custom.weight_g [number_decimal]');
          const productWeight = getComponentValue(component, 'Metafield: custom.weight_g [number_decimal]');
          const legacyWeight = getComponentValue(component, 'weight_g');

          if (!variantWeight && !productWeight && !legacyWeight && variantWeight !== 0 && productWeight !== 0) {
             missing.push('Weight (req)');
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
        showNotification("âŒ Dashboard Login Failed", 'error');
      }
    } catch (e) { 
      showNotification("âŒ Critical Error: " + e.message, 'error');
    }
    setLoading(false);
  };

  const fetchComponentLibrary = async () => {
      setLoading(true);
      try {
          const auth = password || localStorage.getItem('loam_ops_auth');
          if (!auth) return;
          console.log(`[Lifecycle] Fetching components...`);
          const cb = Date.now();
          const res = await fetch(`/api/components?cb=${cb}`, { headers: { 'x-dashboard-auth': auth } });
          if (res.ok) {
              const data = await res.json();
              console.log(`[Lifecycle] Fetch SUCCESS. Received tabs: ${Object.keys(data).join(', ')}`);
              const hydrated = {};
              Object.keys(data).forEach(tab => {
                  const rawList = data[tab] || [];
                  const seenRids = new Set();
                  const hydratedList = rawList.map((item, idx) => {
                       const baseId = item.id || item.ID || item.shopify_product_id || item['Product ID'];
                       const title = item.Title || item.title || item.Name || item.name || "NoTitle";
                       const vendor = item.Vendor || item.vendor || item.Brand || item.brand || "NoVendor";
                       const specKeys = Object.keys(item).filter(k => !['_rid', '_rawIdx', '_editIdx', '_isNew', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID'].includes(k)).sort();
                       const specs = specKeys.map(k => `${k}:${item[k]}`).join('|');
                       const hash = `${title}_${vendor}_${specs}`.toLowerCase().replace(/[^a-z0-9]/g, '');
                       
                       let rid = item?._rid;
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
              
              // JANITOR PASS: Unify ghost columns and standardise keys
              const cleanData = unifyComponentKeys(hydrated);
              setComponentData(cleanData);
              setComponentsLoaded(true);
          } else {
              console.error(`[Lifecycle] Fetch FAILED: ${res.status}`);
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
    const cleanArray = unifyComponentKeys(newArray);
    const sanitizedArray = cleanArray.map(item => {
      const { tags, Tags, _rawIdx, _editIdx, ...rest } = item;
      return rest;
    });
    setComponentSaving(true);
    try {
      const auth = password || localStorage.getItem('loam_ops_auth');
      const res = await fetch('/api/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
        body: JSON.stringify({ [tab]: sanitizedArray })
      });
      if (res.ok) {
        // Transition items: strip _isNew flag from CLEANED data
        const transitionedArray = cleanArray.map(item => {
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
         const rid = item?._rid; 
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
      // DATA SANITIZATION: Strip internal ephemeral keys before persisting to GitHub
      const cleanedArray = stagedUpdatedArray.map(item => {
          const { _rid, _isNew, _rawIdx, _editIdx, ...rest } = item;
          return rest;
      });

      const success = await saveComponentChanges(cleanedArray, componentTab);
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
      const selectedForTab = items.filter((item, idx) => item && selectedComponents.includes(item?._rid || getComponentUniqueId(item, idx)));

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

     const uniqueProductIds = [...new Set(candidates.map(c => {
         const rawId = getComponentValue(c, 'shopify_product_id');
         return getCleanShopifyId(rawId);
      }))].filter(Boolean);
     const proposals = [];
     const auth = password || localStorage.getItem('loam_ops_auth');

     try {
       for (const pid of uniqueProductIds) {
         const res = await fetch(`/api/get-product-variants?productId=${pid}`, {
           headers: { 'x-dashboard-auth': auth }
         });
         if (!res.ok) {
            console.error(`[Discovery] Shopify Error (Status ${res.status}) for Product ID: ${pid}`);
            continue;
         }
         const { variants, title } = await res.json();
         
         // --- FIX: Create a pool of available variants to ensure 1-to-1 matching ---
         let localVariantPool = [...variants];
         const componentsForPid = candidates.filter(c => getCleanShopifyId(getComponentValue(c, 'shopify_product_id')) === pid);
         
         for (const comp of componentsForPid) {
             const compTitle = getComponentValue(comp, 'Title') || comp.Title || 'Unnamed';
             console.group(`[Discovery] Scanning: ${compTitle}`);
             
             // --- BEST-FIT MATCHING ENGINE ---
             const norm = (val) => String(val || "").toLowerCase().replace(/["'\\]/g, '').trim();
             
             // 1. Identify all Technical Candidates
             const techCandidates = localVariantPool.filter(v => {
                 const vOpts = Object.values(v.options || {}).map(norm);
                 
                 if (tab === 'rims') {
                     const cSizeRaw = getComponentValue(comp, 'Rim Size');
                     const cSize = norm(cSizeRaw);
                     const cHoles = norm(getComponentValue(comp, 'Hole Count')).replace(/\D/g, '');
                     if (!cSize || !cHoles) {
                        return false;
                     }

                     const sizeMatch = vOpts.some(vo => vo === cSize || vo.replace(/\D/g, '') === cSize.replace(/\D/g, ''));
                     const holeMatch = vOpts.some(vo => vo.replace(/\D/g, '') === cHoles);
                     
                     return sizeMatch && holeMatch;
                  }
                 
                 if (tab === 'hubs') {
                    const cHolesVal = getComponentValue(comp, 'Hole Count') || getComponentValue(comp, 'Spoke Count');
                    const cHoles = norm(cHolesVal).replace(/\D/g, '');
                    if (!cHoles) return false;
                    return vOpts.some(vo => vo.replace(/\D/g, '') === cHoles);
                 }

                 if (tab === 'spokes') return vOpts.some(vo => vo === '-');
                 if (tab === 'nipples') return true;
                 return false;
             });

             if (techCandidates.length > 0) {
                // 2. Select the FIRST technical match (Color is Ignored as requested)
                const match = techCandidates[0];

                // 3. Process the Match
                let hasSpecMismatch = false;
                if (tab === 'rims') {
                   const shopErd = match.metafields?.find(m => m.key === 'rim_erd')?.value;
                   const gridErd = getComponentValue(comp, 'Rim Erd');
                   if (shopErd && gridErd) {
                      const diff = Math.abs(parseFloat(shopErd) - parseFloat(gridErd));
                      if (diff > 2) hasSpecMismatch = true;
                   }
                }

                proposals.push({
                   rid: comp?._rid || comp.id,
                   title: compTitle,
                   productTitle: title,
                   variantTitle: match.title,
                   newVariantId: match.id,
                   fullGid: match.full_id,
                   _hasSpecMismatch: hasSpecMismatch
                });
                
                // 4. Remove from pool
                const poolIdx = localVariantPool.indexOf(match);
                if (poolIdx !== -1) localVariantPool.splice(poolIdx, 1);
             } else {
                 const cSize = norm(getComponentValue(comp, 'Rim Size'));
                 const cHoles = norm(getComponentValue(comp, 'Hole Count')).replace(/\D/g, '');
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

   const handleSyncSpecsFromShopify = async () => {
     const selected = selectedComponents || [];
     if (selected.length === 0) {
        showNotification("No components selected to sync.", 'warning');
        return;
     }

     setLoading(true);
     try {
         const auth = password || localStorage.getItem('loam_ops_auth');
         const res = await fetch('/api/get-variant-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
            body: JSON.stringify({ variantIds: selected.map(rid => {
               const c = (componentData[componentTab] || []).find(x => x && (x._rid || x.id) === rid);
               return c?.shopify_variant_id || c?.['Variant ID'];
            }).filter(Boolean) })
         });

         if (res.ok) {
            const variantMap = await res.json();
            const newChanges = { ...(gridUnsavedChanges[componentTab] || {}) };
            let updatedCount = 0;

            selected.forEach(rid => {
               const comp = (componentData[componentTab] || []).find(c => c && (c._rid || c.id) === rid);
               const vid = comp?.shopify_variant_id || comp?.['Variant ID'];
               const variantData = variantMap[vid];

               if (variantData) {
                  // USE UNIFIED AUDIT ENGINE
                  const evaluation = evaluateComponentAgainstShopify(comp, variantData, componentTab);
                  if (evaluation) {
                     const rowChanges = { ...(newChanges[rid] || {}) };
                     
                     // Apply proposals from the unified engine
                     Object.entries(evaluation.proposals).forEach(([label, shopVal]) => {
                        // We must map label back to technical key for persistence
                        const regEntry = metafieldRegistry.find(r => r.label === label);
                        const techK = regEntry?.key || label;
                        const existingKeys = Object.keys(comp);
                        const finalField = existingKeys.find(k => {
                            const lowK = k.toLowerCase();
                            const lowT = techK.toLowerCase();
                            const lowL = label.toLowerCase();

                            // 1. Explicit Label Match
                            if (k === label) return true;

                            // 2. Weight Field Intelligence (Updated for Technical Labels)
                            if (lowT.includes('weight')) {
                               const isVariantLabel = lowL.includes('variant metafield');
                               const isProductLabel = lowL.includes('metafield:') && !isVariantLabel;
                               
                               if (isVariantLabel && lowK.includes('variant') && lowK.includes('weight')) return true;
                               if (isProductLabel && !lowK.includes('variant') && lowK.includes('weight')) return true;
                               
                               // If this is a weight field but failed the specialized checks above,
                               // DO NOT fall through to general matching (prevents variant -> product cross-talk)
                               return false;
                            }

                            // 3. Option Position mapping
                            if (lowT.startsWith('option')) {
                               const pos = lowT.replace('option', '');
                               if (lowK === `option${pos} value`) return true;
                            }

                            // 4. General technical match
                            return lowK === lowT || 
                                   lowK.includes(`custom.${lowT}`) || 
                                   (lowK.includes('metafield:') && lowK.includes(lowT));
                         }) || techK;


                        rowChanges[finalField] = shopVal;
                     });

                     newChanges[rid] = rowChanges;
                     updatedCount++;
                  }
                  console.groupEnd();
               }
            });

            if (updatedCount > 0) {
               setGridUnsavedChanges(prev => ({ ...prev, [componentTab]: newChanges }));
               showNotification(`Staged sync proposals for ${updatedCount} items. Review in red.`, 'success');
            } else {
               showNotification("All selected components are already in sync.", 'success');
            }
         }
     } catch (e) {
         console.error(e);
         showNotification("Sync failed: " + e.message, 'error');
     }
     setLoading(false);
   };

   const handleImportProductByID = async (productIdOverride = null) => {
      // Target ID Fallback: Arg -> State -> Editing Row
      const pidInput = productIdOverride || productSyncId || editingComponent?.shopify_product_id;

      if (!pidInput) {
         showNotification("Please enter a Shopify Product ID", "warning");
         return;
      }

      setIsImportingProduct(true);
      const auth = password || localStorage.getItem('loam_ops_auth');
      const tab = componentTab;

      try {
         const cleanPid = getCleanShopifyId(pidInput);
         const res = await fetch(`/api/get-product-variants?productId=${cleanPid}`, {
            headers: { 'x-dashboard-auth': auth }
         });

         if (!res.ok) {
            throw new Error(`Shopify API returned ${res.status}`);
         }

         const { title, handle, vendor, variants, metafields: productMetafields } = await res.json();
         
         // 1. Get Registry for current tab
         const activeRegistry = metafieldRegistry.filter(m => 
            m.categories?.map(c => c.toLowerCase() + 's').includes(tab)
         );

         // COLLISION ENGINE: Merge permanent data with currently staged/added rows
         const permanentData = componentData[tab] || [];
         const stagedData = gridAddedRows[tab] || [];
         const currentData = [...permanentData, ...stagedData].filter(Boolean);

         const newChanges = { ...(gridUnsavedChanges[tab] || {}) };
         const newAdded = [...stagedData]; // Work with currently staged list
         let importedCount = 0;
         let collisionCount = 0;

          // --- NEW: Variant Deduplication (Representative Color Only) ---
          const processedVariants = [];
          const seenSpecs = new Set();
          
          variants.forEach(v => {
             const vOpts = Object.entries(v.options || {});
             // Build signature of all non-color options
             const signature = vOpts
                .filter(([name]) => !/color|colour|finish|surface/i.test(name))
                .map(([name, val]) => `${name}:${val}`)
                .sort()
                .join('|');
             
             if (!seenSpecs.has(signature)) {
                seenSpecs.add(signature);
                processedVariants.push(v);
             }
          });

          processedVariants.forEach((v, vIdx) => {
            // Collision Check via Shopify Variant ID
            const existing = currentData.find(c => {
                const vid = String(c.shopify_variant_id || c['Variant ID'] || '');
                return vid === String(v.id);
            });
            
            if (existing) {
               // --- COLLISION RECOVERY ---
               const rid = (existing?._rid || getComponentUniqueId(existing));
               const evaluation = evaluateComponentAgainstShopify(existing, { ...v, product: { title, handle, vendor, metafields: productMetafields } }, tab);
               
               if (evaluation) {
                  const currentChanges = { ...(newChanges[rid] || {}) };
                  Object.entries(evaluation.proposals).forEach(([label, shopVal]) => {
                     const regEntry = metafieldRegistry.find(r => r.label === label);
                     const techK = regEntry?.key || label;
                     const finalField = Object.keys(existing).find(k => k.toLowerCase() === techK.toLowerCase()) || techK;
                     currentChanges[finalField] = shopVal;
                  });
                  newChanges[rid] = currentChanges;
                  collisionCount++;
               }
            } else {
               // --- NEW IMPORT ---
               const baseObj = {
                  _rid: `new_import_${Date.now()}_${vIdx}`,
                  _isNew: true,
                  Title: formatShopifyTitle(title, tab),
                  Vendor: vendor || '',
                  ProductURL: handle ? `https://loamlabsusa.com/products/${handle}` : '',
                  shopify_product_id: cleanPid,
                  shopify_variant_id: v.id,
               };

               // Initialize mandatory fields
               MANDATORY_FIELDS[tab]?.forEach(f => { if (baseObj[f] === undefined) baseObj[f] = ''; });

               // Map Options from Shopify (Consolidated Naming)
               const opts = Object.entries(v.options || {});
               if (opts[0]) {
                  baseObj['Option1 Name'] = opts[0][0];
                  baseObj['Option1 Value'] = opts[0][1];
               }
               if (opts[1]) {
                  baseObj['Option2 Name'] = opts[1][0];
                  baseObj['Option2 Value'] = opts[1][1];
               }

               // Map Metafields via Registry
               activeRegistry.forEach(m => {
                  let val = null;
                  if (m.target === 'variant') {
                     val = v[m.key] || v.metafields?.find(sm => sm.key === m.key)?.value;
                  } else {
                     val = productMetafields?.find(sm => sm.key === m.key)?.value;
                  }
                  
                  if (val !== undefined && val !== null) {
                      baseObj[m.label] = val;
                  }
               });

               // Add to the head of the staged list
               newAdded.unshift(baseObj);
               importedCount++;
            }
         });

         // --- SYNC STATE BACK TO GRID ---
         setGridAddedRows(prev => ({ ...prev, [tab]: newAdded }));
         setGridUnsavedChanges(prev => ({ ...prev, [tab]: newChanges }));

         if (importedCount > 0 || collisionCount > 0) {
            setGridAddedRows(prev => ({ ...prev, [tab]: newAdded }));
            setGridUnsavedChanges(prev => ({ ...prev, [tab]: newChanges }));
            showNotification(`Import Analysis Complete! Staged ${importedCount} new rows and detected ${collisionCount} updates for existing items. Review changes before saving.`, "success");
         } else {
            showNotification("No importable data found for this product ID.", "info");
         }
      } catch (err) {
         console.error("[Product Import Error]", err);
         showNotification(`Import Failed: ${err.message}`, "error");
      } finally {
         setIsImportingProduct(false);
      }
   };

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
      Title: 'New Component',
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
       
       // --- DATA INTEGRITY FIX ---
       // Find the technical key in the underlying object to update
       const rowData = (componentData[componentTab] || []).find(c => c && (c?._rid || c?.id) === rowId) || 
                       (gridAddedRows[componentTab] || []).find(c => c && (c?._rid || c?.id) === rowId);

       let finalKey = colKey;
       const regEntry = metafieldRegistry.find(r => r.label === colKey || r.key === colKey);
       
       if (regEntry && rowData) {
          const techK = regEntry.key;
          const existingKeys = Object.keys(rowData);
          
          // 1. Literal ColKey match (highest priority to prevent "key jumping")
          if (existingKeys.includes(colKey)) {
             finalKey = colKey;
          } else {
             // 2. Technical Discovery fallback
             finalKey = existingKeys.find(k => 
                k.toLowerCase() === techK.toLowerCase() ||
                k.toLowerCase().includes(`custom.${techK.toLowerCase()}`) ||
                (k.toLowerCase().includes('metafield:') && k.toLowerCase().includes(techK.toLowerCase()))
             ) || techK;
          }
       }

       return {
          ...prev,
          [componentTab]: {
             ...tabChanges,
             [rowId]: { ...rowChanges, [finalKey]: newValue }
          }
       };
    });
  }, [componentTab, componentData, gridAddedRows, metafieldRegistry, formatColumnTitle, showNotification]);


   const getComponentTabColumns = React.useCallback((tab) => {
     const rawData = componentData[tab] || [];
     
     // NUCLEAR BAN LIST - Everything is normalized to lowercase alphanumeric for comparison
     const BAN_LIST = [
        'Title', 'Vendor', 'Brand', 'id', 'ID', 'shopify_product_id', 'shopify_variant_id', 
        'Product ID', 'Variant ID', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx', 
        '_internal_database_id', 'RIM SIZE', 'RIM ERD', 'WEIGHT G (V)', 'Weight (V)', 'rim_size', 
        'rim_erd', 'weight_g', 'Rim Size', 'Rim Erd', 
        'Weight G (v)', 'Hole Count', 'Color', 'Rim Spoke Hole Offset', 'ProductURL',
        'historical_order_count', 'historical order count', 'Name', 'name', 'inventory_alert_threshold', 'wheel_spec_brake_interface', 'wheel_spec_hub_spacing', 'internal_width_mm', 'Brake Interface', 'Hub Spacing'
     ].map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));

     const allKeys = new Set();
     const blockedKeys = [];

     rawData.forEach((row) => {
        Object.keys(row).forEach(k => {
           const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
           if (!BAN_LIST.includes(normK)) {
              allKeys.add(k); 
           } else {
              if (!blockedKeys.includes(k)) blockedKeys.push(k);
           }
        });
     });

     let specCols = Array.from(allKeys);
     
     // Secondary Nuclear Filter: Final pass on the array
     specCols = specCols.filter(k => {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return !BAN_LIST.includes(normK);
     });


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
     return ['Vendor', 'Title', ...specCols];
   }, [componentData, componentColumnOrder]);

   const applyPastedData = React.useCallback((tsvData, startRowId, startColKey, currentChanges) => {
     const rows = tsvData.split(/\r?\n/).filter(r => r.trim() !== '');
     const gridRows = rows.map(r => r.split('\t'));
     const allCols = getComponentTabColumns(componentTab);
     const startColIndex = allCols.indexOf(startColKey);
     const visibleData = (componentData[componentTab] || []).filter(Boolean).map((item, idx) => ({ ...item, _rid: getComponentUniqueId(item, idx) }));
     const startRowIndex = visibleData.findIndex(r => r && r._rid === startRowId);
     
     if (startRowIndex === -1 || startColIndex === -1) return currentChanges;

     const newChanges = { ...currentChanges };
     const tabChanges = { ...(newChanges[componentTab] || {}) };
     let skipCount = 0;

     gridRows.forEach((rowCells, rOffset) => {
       const targetRow = visibleData[startRowIndex + rOffset];
       if (!targetRow) return;
       const rid = targetRow?._rid;
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
        const currentIdx = list.findIndex(r => (r?._rid || getComponentUniqueId(r)) === rowId);
        const lastIdx = list.findIndex(r => (r?._rid || getComponentUniqueId(r)) === lastCheckedComponentRef.current);
        
        if (currentIdx !== -1 && lastIdx !== -1) {
            const start = Math.min(currentIdx, lastIdx);
            const end = Math.max(currentIdx, lastIdx);
            const rangeIds = list.slice(start, end + 1).map(r => r?._rid || getComponentUniqueId(r));
            
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
    setGridAddedRows(prev => {
        const currentTabRows = (prev[componentTab] || []).filter(r => r && r._rid !== rid);
        return {
            ...prev,
            [componentTab]: currentTabRows
        };
    });
    // Also clear any unsaved changes for this specific RID from gridUnsavedChanges
    setGridUnsavedChanges(prev => {
        const next = { ...prev };
        if (next[componentTab] && next[componentTab][rid]) {
            const tabCopy = { ...next[componentTab] };
            delete tabCopy[rid];
            next[componentTab] = tabCopy;
        }
        return next;
    });
  }, [componentTab]);

  const handleDeleteComponent = React.useCallback(async (item) => {
      const rowId = item?._rid || getComponentUniqueId(item);
      const isNew = !!item._isNew;
      
      if (isNew) {
          handleRemoveAddedRow(rowId);
          return;
      }

      // If it's a permanent row but has staged updates, deleting it currently just reverts updates
      // The user likely wants to confirm a hard delete from the database
      const name = item.Title || item.Title || item.Name || item.name || item.title || "Unknown";
      if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;

      const rawData = componentData[componentTab] || [];
      const updatedArray = rawData.filter(i => {
          const rid = i?._rid || getComponentUniqueId(i);
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
        const found = added.find(r => r && r?._rid === comp?._rid);
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
    if (!componentTab) return [];
    const activeList = componentData[componentTab] || [];
    const addedList = gridAddedRows[componentTab] || [];
    const combined = [...activeList, ...addedList];
     const vends = combined.map(item => {
        if (!item) return null;
        const rid = item?._rid || getComponentUniqueId(item);
        const unsaved = (gridUnsavedChanges[componentTab] || {})[rid] || {};
        return unsaved.Vendor || item.Vendor || item.vendor || item.Brand || item.brand;
    }).filter(v => typeof v === 'string' && v.trim() !== '');
    return [...new Set(vends)].sort((a,b) => a.localeCompare(b));
  }, [componentData, componentTab, gridAddedRows, gridUnsavedChanges, getComponentUniqueId]);

  const finalFilteredList = React.useMemo(() => {
    if (!componentTab || !componentData[componentTab]) return [];
    
    const activeList = componentData[componentTab].map((item, idx) => ({ ...item, _rawIdx: idx }));
    const addedRows = gridAddedRows[componentTab] || [];
    // Prepend addedRows so they naturally start at the top
    const combinedList = [...addedRows, ...activeList].filter(Boolean);

    let preFilteredList = componentVendorFilter === 'All' 
      ? combinedList 
      : combinedList.filter(item => {
          const rid = item?._rid || getComponentUniqueId(item);
          const unsaved = (gridUnsavedChanges[componentTab] || {})[rid] || {};
          const v = unsaved.Vendor || item.Vendor || item.vendor || item.Brand || item.brand;
          return v === componentVendorFilter;
      });

    if (showMissingOnly) {
      preFilteredList = preFilteredList.filter(item => !getComponentValidation(item, componentTab).isValid);
    }

    if (showMismatchesOnly) {
      preFilteredList = preFilteredList.filter(item => {
        const rid = item?._rid || getComponentUniqueId(item);
        return syncMismatches[rid] && syncMismatches[rid].length > 0;
      });
    }

    return [...preFilteredList].sort((a,b) => {
      // Prioritize actual drafts (items in gridAddedRows) over database items
      // Prioritize actual drafts (items in gridAddedRows) over database items
      const isDraftA = gridAddedRows[componentTab]?.some(r => r?._rid === a?._rid);
      const isDraftB = gridAddedRows[componentTab]?.some(r => r?._rid === b?._rid);

      if (isDraftA && !isDraftB) return -1;
      if (!isDraftA && isDraftB) return 1;
      
      const vA = (a.Vendor || a.vendor || a.Brand || a.brand || "").trim();
      const vB = (b.Vendor || b.vendor || b.Brand || b.brand || "").trim();
      
      if (vA === "" && vB !== "") return -1;
      if (vA !== "" && vB === "") return 1;

      const aN = (a.Title || a.Name || a.name || a.title || "Unknown").toLowerCase();
      const bN = (b.Title || b.Name || b.name || b.title || "Unknown").toLowerCase();
      return aN.localeCompare(bN);
    });
  }, [componentData, componentTab, gridAddedRows, gridUnsavedChanges, componentVendorFilter, showMissingOnly, showMismatchesOnly, syncMismatches, getComponentValidation, getComponentUniqueId]);

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
      newComp = { ...newComp, [findKey('Option 1 Name')]: 'Spoke Count', [findKey('Option 2 Name')]: 'Spacing', [findKey('Wheel Spec Position')]: '', [findKey('Hub Type')]: 'J-Bend' };
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
      if (res.ok) { showNotification("âœ… Catalog Tags Synced Successfully!"); fetchRules(); }
      else { const err = await res.json(); showNotification("âŒ Sync Failed: " + (err.error || "Unknown Error"), 'error'); }
    } catch (e) { showNotification("âŒ Sync Failed: " + e.message, 'error'); }
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
    const updatedArray = rawData.filter((item, idx) => item && !selectedComponents.includes(getComponentUniqueId(item, idx)));
    setComponentSaving(true);
    await saveComponentChanges(updatedArray);
    setSelectedComponents([]);
    setComponentSaving(false);
  }, [selectedComponents, componentData, componentTab, getComponentUniqueId, saveComponentChanges]);

  const handleOpenMassEdit = React.useCallback(() => {
     try {
        const activeList = componentData[componentTab] || [];
        const selectedItems = activeList.filter((item, i) => item && selectedComponents.includes(getComponentUniqueId(item, i)));
       
        const initialValues = {};
        // OPTIMIZATION: If selection is very large (> 100 items), skip common-value calculation 
        // to prevent client-side "hanging" or crashes during heavy O(N*M) mapping.
        if (selectedItems.length > 0 && selectedItems.length <= 100) {
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
     } catch (err) {
        console.error("Mass Edit Activation Error:", err);
        showNotification("Failed to prepare mass edit. Try selecting fewer items.", "error");
     }
    }, [componentData, componentTab, selectedComponents, getComponentUniqueId, showNotification]);

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
    if (!confirm("âš ï¸ PERMANENT ACTION: Remove this item from the Registry?")) return;
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
      if (res.ok) { showNotification("âœ… " + data.message); setShowDupModal(false); fetchRules(); }
      else { showNotification("âŒ Error: " + data.error, 'error'); }
    } catch (e) { console.error(e); showNotification("âŒ Critical Error during duplication.", 'error'); }
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
    if (!confirm(`âš ï¸ PERMANENT ACTION: Delete ${selectedRules.length} items from the Registry?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/delete-rule', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password }, body: JSON.stringify({ id }) })));
      setSelectedRules([]); fetchRules();
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkIgnore = async () => {
    if (!confirm(`âš ï¸ PERMANENT DESTRUCTIVE ACTION: Do you want to tag these ${selectedRules.length} items to be permanently ignored in Shopify and purged from this Registry?`)) return;
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
       const tab = componentTab;
       const list = componentData[tab] || [];
       const variantIds = list.map(c => c.shopify_variant_id || c['Variant ID']).filter(Boolean);
       
        if (variantIds.length === 0) {
           showNotification("No linked components in this tab to audit.", 'info');
           setIsAuditing(false);
           return;
        }

        setIsAuditing(true);
        const newMismatches = { ...syncMismatches };
        let scanned = 0;
        let mismatchCount = 0;

       try {
           const auth = localStorage.getItem('loam_ops_auth');
           const res = await fetch('/api/get-variant-details', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': auth },
              body: JSON.stringify({ variantIds })
           });

           if (res.ok) {
              const variantMap = await res.json();
              const registry = metafieldRegistry.filter(m => 
                  m.categories?.map(c => c.toLowerCase() + 's').includes(tab)
               );
             
             list.forEach(item => {
                const rid = item?._rid || item?.id;
                const vid = item.shopify_variant_id || item['Variant ID'];
                if (!vid) return;

                const variantData = variantMap[vid];
                if (variantData) {
                   scanned++;
                   console.group(`[Sync Specs] ${item.Title || 'Unnamed'} (Variant: ${vid})`);
                   // USE UNIFIED AUDIT ENGINE
                   const evaluation = evaluateComponentAgainstShopify(item, variantData, tab);
                   if (evaluation) {
                      newMismatches[rid] = evaluation.mismatches;
                      mismatchCount++;
                   } else {
                      delete newMismatches[rid];
                   }
                }
             });
           }

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
    if (!confirm(`âš ï¸ Are you sure you want to hide ${selectedLabProducts.length} items from the Product Lab?`)) return;
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
    if (!confirm(`âš ï¸ Delete '${key}' from registry permanently?`)) return;
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
          <SidebarLink 
             icon={<Database size={18}/>} 
             label="Component Library" 
             active={activeTab === 'component_library'} 
             onClick={() => setActiveTab('component_library')} 
             badge={Object.keys(syncMismatches).length > 0 ? "!" : null}
          />
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
                  <button onClick={bulkSetCompareAt} className="flex items-center gap-2 text-[10px] font-black uppercase text-purple-400 hover:text-purple-300 transition-colors bg-purple-950/30 px-3 py-2 rounded-xl"><Tag size={14} /> Set Compare-At â†’ Base</button>
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
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500/30 border border-red-400"></div> Review Required â€” margin safety triggered</div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-200 border border-amber-400"></div> Drastic Sale â€” vendor price 10%+ below MSRP</div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-600 border border-blue-700"></div> BTI Active â€” inventory deferred to BTI</div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-50 border border-red-200"></div> Missing URL â€” no vendor URL mapped</div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-zinc-200 border border-zinc-300"></div> Selected â€” currently checked</div>
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
                            <span className="text-zinc-200 text-[10px] font-bold">â€”</span>
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
                        const normalize = (str) => String(str || "").toLowerCase().replace(/Ã—/g, 'x').replace(/\s+/g, ' ').trim();
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
                                  <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full font-black text-[9px] uppercase italic border border-green-100">âœ“ Healthy</span>
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
                                   const activeList = (componentData[componentTab] || []).map((item, idx) => ({ ...item, _rawIdx: idx }));
                                   const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'Shopify Variant ID', 'Shopify Product ID', 'shopify_variant_id', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx'];
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
                                        const targetId = editingComponent?._rid;
                                        if (targetId) {
                                           existingIdx = activeArray.findIndex((item, i) => item && ((item?._rid === targetId) || (getComponentUniqueId(item, i) === targetId)));
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
                                    const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID', 'Shopify Variant ID', 'Shopify Product ID', 'shopify_variant_id', 'tags', 'RID', 'RAWIDX', '_rid', '_rawIdx', '_isNew', '_editIdx'];
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
                                                <div className="font-mono text-[8px] truncate text-zinc-500" title={editingComponent?._rid}>{editingComponent?._rid || "N/A"}</div>
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
                                             ðŸ”’ Unlock to Override
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
                            {editingRule.oos_reminder_enabled !== false ? 'âœ“ Enabled' : 'âœ— Disabled'}
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
                                    {editingRule.bti_monitoring_enabled !== false ? 'âœ“ Active' : 'âœ— Off'}
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

                   <div className="w-px h-8 bg-zinc-800 mx-2"></div>

                   <button 
                     onClick={handleSyncSpecsFromShopify}
                     disabled={loading || componentSaving}
                     className={`flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all border border-blue-500/50 group shadow-[0_0_20px_rgba(37,99,235,0.2)] ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                   >
                      <RefreshCw size={14} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}/>
                      <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Sync From Shopify</span>
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
                              if (confirm("DISCARD ALL UNSAVED DRAFTS ACROSS ALL TABS? This cannot be undone.")) {
                                 setGridUnsavedChanges({});
                                 setGridAddedRows({ hubs: [], rims: [], spokes: [], nipples: [] });
                                 setSelectedComponents([]);
                                 setSelectedCells([]);
                                 showNotification("Draft discarded successfully.", "info");
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







