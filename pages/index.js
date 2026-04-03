import React, { useState, useEffect, useRef } from 'react';
import { RefreshCcw, Search, Package, ShieldCheck, ShieldAlert, Plus, X, Info, Image as ImageIcon, Loader2, LogOut, ChevronUp, ChevronDown, ChevronRight, Trash2, AlertCircle, Zap, ZapOff, DollarSign, Tag, History, Activity, Beaker, Edit3, Edit, Settings, ExternalLink, BarChart, Database, CheckCircle } from 'lucide-react';

export default function OpsDashboard() {
  const [editingRule, setEditingRule] = useState(null);
  const [activeTab, setActiveTab] = useState('vendors');
  const [rules, setRules] = useState([]);
  const [vendorLogos, setVendorLogos] = useState([]);
  const [password, setPassword] = useState('');
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
  const [componentTab, setComponentTab] = useState('rims');
  const [componentVendorFilter, setComponentVendorFilter] = useState('All');
  const [componentColumnOrder, setComponentColumnOrder] = useState({});
  const [draggedColumn, setDraggedColumn] = useState(null);

  useEffect(() => {
     try {
       const saved = localStorage.getItem('loamops_cols');
       if (saved) setComponentColumnOrder(JSON.parse(saved));
     } catch(e) {}
  }, []);

  useEffect(() => {
     if (showMetaEditModal && selectedLabProducts.length === 0) setMetaEditTab('variant');
  }, [showMetaEditModal, selectedLabProducts.length]);
  const [metaEditFields, setMetaEditFields] = useState({});
  const [metafieldRegistry, setMetafieldRegistry] = useState([
    // VARIANT METAFIELDS
    { key: 'inventory_alert_threshold', label: 'Inventory Alert Threshold', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'integer' },
    { key: 'hub_manual_cross_value', label: 'Hub Manual Cross Value', categories: ['HUB'], target: 'variant', type: 'decimal' },
    { key: 'weight_g', label: 'Weight (Variant)', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'decimal' },
    { key: 'weight', label: 'Weight (Variant Aliased)', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'variant', type: 'decimal' },
    { key: 'length_adjust_mm', label: 'Length Adjust mm', categories: ['SPOKE'], target: 'variant', type: 'decimal' },
    { key: 'wheel_spec_position', label: 'Position', categories: ['HUB'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'wheel_spec_brake_interface', label: 'Brake Interface', categories: ['HUB'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'wheel_spec_hub_spacing', label: 'Hub Spacing', categories: ['HUB'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'wheel_spec_rim_size', label: 'Rim Size', categories: ['RIM'], target: 'variant', type: 'single_line_text_field', isConstant: true },
    { key: 'rim_erd', label: 'Rim ERD', categories: ['RIM'], target: 'variant', type: 'decimal', isConstant: true },
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

    // PRODUCT METAFIELDS
    { key: 'product_weight_g', label: 'Weight (Product)', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'decimal' },
    { key: 'included_valve_variant_id', label: 'Included Valve Variant ID', categories: ['VALVESTEM'], target: 'product', type: 'single_line_text_field' },
    { key: 'integrated_hub_name', label: 'Integrated Hub Name', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'google_shopping_link', label: 'Google Shopping Canonical Link', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'url' },
    { key: 'preconfigured_wheel_rules', label: 'Pre-configured Wheel Rules', categories: ['RIM', 'HUB'], target: 'product', type: 'json' },
    { key: 'spoke_hub_interface', label: 'Spoke Hub Interface', categories: ['HUB', 'SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'price_adjustment_percentage', label: 'Price Adjustment Percentage', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'integer' },
    { key: 'model', label: 'Model', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    { key: 'pairing_key', label: 'Pairing Key', categories: ['RIM', 'HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'rim_depth_mm', label: 'Rim Depth mm', categories: ['RIM'], target: 'product', type: 'decimal' },
    { key: 'optional_addon_gids', label: 'Optional Addon GIDs', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    { key: 'lead_time_days', label: 'Lead Time Days', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'integer' },
    { key: 'accessory_category', label: 'Accessory Category', categories: ['ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    { key: 'acc_display_columns', label: 'Accessory Display F/R Columns', categories: ['ACCESSORY'], target: 'product', type: 'boolean' },
    { key: 'acc_unit_desc', label: 'Accessory Unit Description', categories: ['ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    { key: 'acc_requires_gid', label: 'Accessory Requires GID', categories: ['ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    { key: 'acc_excludes_if_gid', label: 'Accessory Excludes if GID Present', categories: ['ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    { key: 'freehub_type', label: 'Freehub', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'freehub_variant_map', label: 'Freehub Variant Map', categories: ['HUB'], target: 'product', type: 'json' },
    { key: 'hidden_from_seo', label: 'Hidden from SEO', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'integer' },
    { key: 'spoke_diameter_spec', label: 'Spoke Diameter Spec', categories: ['SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'out_of_stock_action', label: 'Out of Stock Action', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'single_line_text_field' },
    { key: 'inventory_monitoring', label: 'Inventory Monitoring Enabled', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'boolean' },
    { key: 'rim_compatible_nipples', label: 'Rim Compatible Nipple Types', categories: ['RIM'], target: 'product', type: 'single_line_text_field' },
    { key: 'spoke_model_group', label: 'Spoke Model Group', categories: ['SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'spoke_cross_section_mm2', label: 'Spoke Cross Section Area mm2', categories: ['SPOKE'], target: 'product', type: 'decimal' },
    { key: 'rim_target_tension_kgf', label: 'Rim Target Tension (kgf)', categories: ['RIM'], target: 'product', type: 'integer' },
    { key: 'hub_type', label: 'Hub Type', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'hub_lacing_policy', label: 'Hub Lacing Policy', categories: ['HUB'], target: 'product', type: 'single_line_text_field' },
    { key: 'rim_washer_policy', label: 'Rim Washer Policy', categories: ['RIM'], target: 'product', type: 'single_line_text_field' },
    { key: 'rim_spoke_hole_offset', label: 'Rim Spoke Hole Offset', categories: ['RIM'], target: 'product', type: 'decimal' },
    { key: 'nipple_washer_thickness', label: 'Nipple Washer Thickness', categories: ['NIPPLE'], target: 'product', type: 'decimal' },
    { key: 'spoke_type', label: 'Spoke Type', categories: ['SPOKE'], target: 'product', type: 'single_line_text_field' },
    { key: 'hub_hole_diameter', label: 'Hub Spoke Hole Diameter', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_flange_offset_right', label: 'Hub Flange Offset Right', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_flange_offset_left', label: 'Hub Flange Offset Left', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_flange_diameter_right', label: 'Hub Flange Diameter Right', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'hub_flange_diameter_left', label: 'Hub Flange Diameter Left', categories: ['HUB'], target: 'product', type: 'decimal' },
    { key: 'vendor_logo', label: 'Vendor Logo', categories: ['RIM', 'HUB', 'SPOKE', 'NIPPLE', 'VALVESTEM', 'ACCESSORY'], target: 'product', type: 'file_reference_field' }
  ]);
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  const lastCheckedIndex = useRef(null);

  const getDiscrepancies = (variants) => {
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
  };

  const getVariantGroupKey = (variant, product) => {
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
  };

  const getProductGroupedDiscrepancies = (product, productVariants) => {
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
      setSelectedRules(prev =>
        prev.includes(ruleId) ? prev.filter(id => id !== ruleId) : [...prev, ruleId]
      );
    }
    lastCheckedIndex.current = index;
  };

  // --- DISCREPANCY NOTIFICATION LOGIC ---
  const labGroups = React.useMemo(() => {
    return rules.reduce((acc, rule) => {
      const productId = rule.shopify_product_id;
      if (!acc[productId]) acc[productId] = { ...rule, variantCount: 0 };
      acc[productId].variantCount++;
      return acc;
    }, {});
  }, [rules]);

  const discrepancyProducts = React.useMemo(() => {
    return Object.values(labGroups).filter(group => {
      const groupVariants = rules.filter(r => String(r.shopify_product_id) === String(group.shopify_product_id));
      if (groupVariants.length <= 1) return false;

      // Group variants by differentiator (e.g. Size for rims)
      const subGroups = groupVariants.reduce((acc, v) => {
        const gk = getVariantGroupKey(v, group);
        if (!acc[gk]) acc[gk] = [];
        acc[gk].push(v);
        return acc;
      }, {});

      // A product has a discrepancy if ANY sub-group has internal mismatches
      return Object.values(subGroups).some(variantsInGroup => {
        return Object.keys(getDiscrepancies(variantsInGroup)).length > 0;
      });
    });
  }, [labGroups, rules, metafieldRegistry]);

  const totalDiscrepancies = discrepancyProducts.length;

  useEffect(() => {
    const savedPass = localStorage.getItem('loam_ops_auth');
    if (savedPass) { setPassword(savedPass); fetchRules(savedPass); }
  }, []);

  const fetchComponentLibrary = async () => {
      setLoading(true);
      try {
          const res = await fetch('/api/components', { headers: { 'x-dashboard-auth': password } });
          const data = await res.json();
          if (res.ok) setComponentData(data);
      } catch (e) { console.error('Fetch Component Error: ', e); }
      setLoading(false);
  };
  
  useEffect(() => {
     if (activeTab === 'component_library' && componentData.hubs.length === 0) {
         fetchComponentLibrary();
     }
  }, [activeTab]);

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

        // Sync metadata choices silently
        fetch('/api/get-metafield-definitions').then(r => r.json()).then(d => {
           if (d.success && d.optionsDict) setMetafieldOptionsMap(d.optionsDict);
        }).catch(e => console.error("Meta def sync err", e));
        
      } else {
        const err = await res.json();
        alert("❌ Dashboard Error: " + (err.error || "Login Failed"));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

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
      // 1. Sync Catalog (Tags + Metafields)
      const res1 = await fetch('/api/import-catalog', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password } 
      });
      const d1 = await res1.json();
      
      // 2. Sync Metafield Definitions (Options)
      await fetch('/api/get-metafield-definitions', { headers: { 'x-dashboard-auth': password } });
      
      alert(`Sync Complete. Imported/Updated ${d1.count} variants.`);
      fetchRules();
    } catch (e) { alert("Sync Failed: " + e.message); }
    setLoading(false);
  };

  const runManualAuditReport = async () => {
    if (!confirm("Trigger Manual Data Audit & Abandoned Build Email Report?")) return;
    setLoading(true);
    try {
      const res = await fetch('/api/run-daily-tasks', { 
        method: 'POST',
        headers: { 'x-dashboard-auth': password } 
      });
      const data = await res.json();
      alert("Status: " + data.message);
    } catch (e) { alert("Failed to run audit."); }
    setLoading(false);
  };


  const updateRule = async (id, updates) => {
    setLoading(true);
    try {
      const res = await fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates })
      });
      if (res.ok) {
        setEditingRule(null);
        fetchRules();
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const deleteRule = async (id) => {
    if (!confirm("⚠️ PERMANENT ACTION: Remove this item from the Registry?")) return;
    await fetch('/api/delete-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
      body: JSON.stringify({ id })
    });
    fetchRules();
  };

  const toggleAutoSync = async (id, currentState) => {
    await fetch('/api/update-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
      body: JSON.stringify({ id, updates: { auto_update: !currentState } })
    });
    fetchRules();
  };

  const syncTags = async () => {
    setLoading(true);
    try {
      const auth = localStorage.getItem('loam_ops_auth');
      const res = await fetch('/api/import-catalog', { 
        method: 'POST',
        headers: { 
          'x-dashboard-auth': auth,
          'Content-Type': 'application/json'
        } 
      });
      if (res.ok) {
        alert("✅ Catalog Tags Synced Successfully!");
        fetchRules();
      } else {
        const err = await res.json();
        alert("❌ Sync Failed: " + (err.error || "Unknown Error"));
      }
    } catch (e) { alert("❌ Sync Failed: " + e.message); }
    setLoading(false);
  };

  const openDupModal = (product) => {
    setDupSourceProduct(product);
    setDupOptions({
      newTitle: `${product.title.split('(')[0].trim()} (CLONE)`,
      includeMedia: true,
      includeInventory: true,
      status: 'ACTIVE'
    });
    setShowDupModal(true);
  };

  const executeDuplication = async () => {
    if (!dupSourceProduct) return;
    setLoading(true);
    try {
      const res = await fetch('/api/duplicate-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ 
          productId: `gid://shopify/Product/${dupSourceProduct.shopify_product_id}`,
          options: dupOptions
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert("✅ " + data.message + "\nNew Handle: " + data.newHandle);
        setShowDupModal(false);
        fetchRules(); 
      } else {
        alert("❌ Error: " + data.error);
      }
    } catch (e) {
      console.error(e);
      alert("❌ Critical Error during duplication.");
    }
    setLoading(false);
  };

  const bulkSetAutoSync = async (state) => {
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates: { auto_update: state } })
      })));
      fetchRules();
      setSelectedRules([]);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const executeBulkEdit = async () => {
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates: { vendor_url: bulkEditUrl } })
      })));
      setShowBulkEditModal(false);
      setBulkEditUrl('');
      fetchRules();
      setSelectedRules([]);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkDelete = async () => {
    if (!confirm(`⚠️ PERMANENT ACTION: Delete ${selectedRules.length} items from the Registry?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/delete-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id })
      })));
      setSelectedRules([]);
      fetchRules();
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkIgnore = async () => {
    if (!confirm(`⚠️ PERMANENT DESTRUCTIVE ACTION: Do you want to tag these ${selectedRules.length} items to be permanently ignored in Shopify and purged from this Registry?`)) return;
    setLoading(true);
    try {
      const productIds = [...new Set(selectedRules.map(id => rules.find(r => r.id === id)?.shopify_product_id).filter(Boolean))];
      await fetch('/api/ignore-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ product_ids: productIds })
      });
      setSelectedRules([]);
      fetchRules();
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const bulkApprovePrices = async () => {
    if (!confirm(`Are you sure you want to approve manual price changes for ${selectedRules.length} items and PUSH them to Shopify?\n\nThis will permanently clear their "Needs Review" flags.`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedRules.map(id => fetch('/api/update-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-auth': password },
        body: JSON.stringify({ id, updates: { needs_review: false } })
      })));
      await runSelectiveSync(selectedRules, true, true);
      alert(`Prices Approved and Pushed to Shopify for ${selectedRules.length} items.`);
    } catch(e) { console.error(e); alert('Error approving prices.'); }
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
      alert(`Price adjustment set to ${factor} for ${selectedRules.length} items. Syncing changes...`);
      await runSelectiveSync(selectedRules, true, false);
      fetchRules();
      setSelectedRules([]);
    } catch(e) { console.error(e); alert('Error updating price adjustment.'); }
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
        alert(`Done! ${data.updated} variants updated.${data.errors > 0 ? ` ${data.errors} errors.` : ''}`);
        fetchRules();
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch(e) { console.error(e); alert('Network error.'); }
    setLoading(false);
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
        alert(`Success: Enrolled ${data.count} variants.`);
        fetchRules(password); 
      } else {
        alert("Import failed: " + (data.error || "Check Vercel Logs"));
      }
    } catch (e) {
      alert("Network Error: Could not reach the server.");
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
        alert("Full Sync Complete!");
        fetchRules(password);
      } else {
        alert("Sync failed. Error code: " + res.status);
      }
    } catch (e) { alert("Sync failed to connect."); }
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
        if (!quiet) alert("Selective Sync Complete!");
        fetchRules(); // Refresh data
        if (ruleIds.length === 1 && !quiet) {
            setSelectedRules(prev => prev.filter(id => id !== ruleIds[0]));
        } else {
            setSelectedRules([]);
        }
      } else {
        const errorData = await res.json();
        alert("Sync failed: " + (errorData.error || res.status));
      }
    } catch (e) { alert("Sync failed to connect."); }
    setLoading(false);
  };

  const runLabSync = () => {
    const idsFromProducts = rules.filter(r => selectedLabProducts.includes(String(r.shopify_product_id))).map(r => r.id);
    const idsFromVariants = rules.filter(r => selectedLabVariants.includes(String(r.shopify_variant_id))).map(r => r.id);
    const allIds = [...new Set([...idsFromProducts, ...idsFromVariants])];
    runSelectiveSync(allIds);
    // Note: runSelectiveSync will clear selectedRules, but we need to clear lab selections too
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

      alert(`Synchronized ${reg.label} across product family.`);
      fetchRules();
    } catch (e) {
      console.error(e);
      alert("Error: " + e.message);
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
    
    // Multi-fetch prepopulator
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

  // 1. Unified variable name to prevent the crash
  const visibleVendorNames = [...new Set(rules.map(r => r.vendor_name).filter(Boolean))].sort();

  // Global Deduplication: Ensure each variant only appears once
  const uniqueRulesMap = new Map();
  rules.forEach(r => {
     if (!uniqueRulesMap.has(r.shopify_variant_id)) uniqueRulesMap.set(r.shopify_variant_id, r);
  });
  const allUniqueRules = Array.from(uniqueRulesMap.values());

  // 2. Sorting: Alphabetical by Vendor, then by Product Title
  const filteredRules = allUniqueRules.filter(r => {
    if (!r) return false;
    const normalize = (str) => String(str || "").toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
    
    // Search is universal
    const searchString = normalize(registrySearch);
    const searchTokens = searchString ? searchString.split(' ').filter(Boolean) : [];
    const searchMatch = searchTokens.length === 0 || searchTokens.every(token => 
       normalize(r.title).includes(token) || normalize(r.vendor_name).includes(token)
    );

    const vendorMatch = selectedVendors.length === 0 || 
      selectedVendors.some(v => normalize(v) === normalize(r.vendor_name));

    const itemTags = Array.isArray(r.tags) ? r.tags.map(t => t.toLowerCase()) : [];
    
    if (activeTab === 'bti_sync') {
      if (itemTags.includes('bti-sync-ignore')) return false;
      let btiMatch = true;
      if (btiSyncFilter === 'has') btiMatch = !!r.bti_part_number;
      if (btiSyncFilter === 'none') btiMatch = !r.bti_part_number;
      return searchMatch && btiMatch && vendorMatch;
    }

    // Default 'vendors' tab logic
    if (activeTab === 'vendors' && itemTags.includes('watcher-ignore')) return false;
    
    let syncMatch = true;
    if (syncFilter === 'on') syncMatch = r.auto_update === true;
    if (syncFilter === 'off') syncMatch = r.auto_update === false;
    if (syncFilter === 'review') syncMatch = r.needs_review === true;
    if (syncFilter === 'sale') {
      const msrp = r.original_msrp || 0;
      const price = (r.last_price || 0) / 100;
      syncMatch = msrp > 0 && (msrp - price) / msrp >= 0.10;
    }
    if (syncFilter === 'oos') syncMatch = r.last_availability === false;
    
    return searchMatch && syncMatch && vendorMatch;
  }).sort((a, b) => {
    const vendorA = String(a.vendor_name || "");
    const vendorB = String(b.vendor_name || "");
    const vendorSort = vendorA.localeCompare(vendorB);
    if (vendorSort !== 0) return vendorSort;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  const paginatedRules = filteredRules.slice(0, visibleCount);

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
            {/* --- REGISTRY HEADER --- */}
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

            {/* --- VENDOR FILTER BAR --- */}
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
            
            {/* --- SYNC CONFIG FILTER BAR --- */}
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
                    <th className="p-6 text-center whitespace-nowrap">Dist. Status</th>
                    <th className="p-6 text-center">BTI</th>
                    <th className="p-6">Memory (Base)</th>
                    <th className="p-6">Adjusted Price</th>
                    <th className="p-6">Current (Shopify)</th>
                    <th className="p-6">Compare-At (Shopify)</th>
                    <th className="p-6 text-right">Auto-Sync / Actions</th>
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
                          <button onClick={() => deleteRule(rule.id)} className="text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
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
            {/* --- BTI REGISTRY HEADER --- */}
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

            {/* --- BTI FILTER BAR --- */}
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

            {/* --- BTI TABLE --- */}
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
             
             {/* --- VENDOR FILTER BAR --- */}
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
             
             {/* --- COMPONENT CATEGORY FILTER --- */}
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
                            else {
                                // Select all currently filtered products
                            }
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
                    {/* Grouping variants into Product rows (Respecting Vendor Filter + Tag Filter + Sorting) */}
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
                                                                <button onClick={(e) => { e.stopPropagation(); setEditingRule(variant); }} className="opacity-0 group-hover:opacity-100 p-2 text-zinc-400 hover:text-black transition-all bg-white rounded-lg border border-zinc-100 flex items-center gap-2 ml-4">
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
                               className="w-full p-4 bg-zinc-50 rounded-xl outline-none border-2 border-transparent focus:border-black transition-all font-mono text-xs"
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
        ) : null}

        {/* --- COMPONENT LIBRARY TAB --- */}
        {activeTab === 'component_library' && (
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
               <div className="flex items-center justify-between mb-8">
                   <div>
                       <h1 className="text-4xl font-black tracking-tight text-zinc-900 uppercase italic mb-2">Component Library</h1>
                       <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest leading-relaxed max-w-2xl">
                           Manage the master specification JSON database directly. Changes here will commit directly to the Unified Calculator Repository via GitHub API.
                       </p>
                   </div>
                   <button onClick={() => {}} className="bg-black text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-zinc-800 transition-all shadow-xl flex items-center gap-2">
                      <Plus size={16}/> New Component
                   </button>
               </div>

               <div className="mb-10">
                 <div className="flex gap-4 mb-8 border-b-2 border-zinc-100 pb-2">
                    {['rims', 'hubs', 'spokes', 'nipples'].map(tab => (
                       <button 
                          key={tab} 
                          onClick={() => { setComponentTab(tab); setComponentVendorFilter('All'); }} 
                          className={`px-6 py-3 font-black text-[10px] uppercase tracking-widest transition-all ${componentTab === tab ? 'text-black border-b-2 border-black -mb-[10px] bg-zinc-100 rounded-t-xl' : 'text-zinc-400 hover:text-zinc-600'}`}
                       >
                          {tab} ({componentData[tab]?.length || 0})
                       </button>
                    ))}
                 </div>
                 
                 {/* VENDOR FILTERS OVERRIDE FOR COMPONENTS */}
                 {(() => {
                    const activeList = componentData[componentTab] || [];
                    if (activeList.length === 0) return null;
                    const vends = activeList.map(item => item.Vendor || item.vendor || item.Brand || item.brand).filter(v => typeof v === 'string' && v.trim() !== '');
                    const uniqueVendors = [...new Set(vends)].sort((a,b) => a.localeCompare(b));
                    
                    if (uniqueVendors.length === 0) return null;

                    return (
                      <div className="mb-8">
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
                              <button key={v} onClick={() => setComponentVendorFilter(v)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all ${componentVendorFilter === v ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm scale-[1.02]' : 'bg-white text-zinc-500 border-zinc-100 hover:border-zinc-300'}`}>
                                <span className="text-[10px] font-bold uppercase tracking-tight">{v}</span>
                              </button>
                           ))}
                         </div>
                      </div>
                    )
                 })()}
                 
                 {/* DYNAMIC DATA GRID */}
                 <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
                    {(() => {
                        const activeList = componentData[componentTab] || [];
                        if (activeList.length === 0) return (
                           <div className="p-12 text-center">
                              <Loader2 className="animate-spin text-zinc-300 mx-auto mb-4" size={32}/>
                              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Fetching JSON Data</p>
                           </div>
                        );
                        
                        const filteredList = componentVendorFilter === 'All' 
                           ? activeList 
                           : activeList.filter(item => (item.Vendor || item.vendor || item.Brand || item.brand) === componentVendorFilter);
                           
                        // Build dynamic headers based on the first item
                        const excludeKeys = ['Name', 'name', 'title', 'Title', 'Vendor', 'vendor', 'Brand', 'brand', 'Tags', 'tags'];
                        const rawColumns = Object.keys(activeList[0] || {}).filter(k => !excludeKeys.includes(k));
                        
                        let columns = componentColumnOrder[componentTab] || [];
                        const colCheck = columns.filter(c => rawColumns.includes(c));
                        if (colCheck.length !== rawColumns.length) {
                           columns = rawColumns;
                        }

                        const formatColumnTitle = (title) => {
                            let clean = title.replace(/^Metafield:\s*custom\./i, '');
                            clean = clean.replace(/^Variant Metafield:\s*custom\./i, '');
                            clean = clean.replace(/\[.*?\]/g, '');
                            clean = clean.replace(/_/g, ' ');
                            return clean.trim().replace(/\b\w/g, l => l.toUpperCase());
                        };

                        const handleDragStart = (col) => setDraggedColumn(col);
                        const handleDragOver = (e) => e.preventDefault();
                        const handleDrop = (targetCol) => {
                           if (!draggedColumn || draggedColumn === targetCol) return;
                           const currentCols = [...columns];
                           const srcIdx = currentCols.indexOf(draggedColumn);
                           const tgtIdx = currentCols.indexOf(targetCol);
                           currentCols.splice(srcIdx, 1);
                           currentCols.splice(tgtIdx, 0, draggedColumn);
                           const newOrderMap = { ...componentColumnOrder, [componentTab]: currentCols };
                           setComponentColumnOrder(newOrderMap);
                           localStorage.setItem('loamops_cols', JSON.stringify(newOrderMap));
                           setDraggedColumn(null);
                        };
                        
                        return (
                           <div className="overflow-x-auto max-h-[600px] relative scrollbar-thin">
                             <table className="w-full text-left text-sm whitespace-nowrap select-none">
                               <thead className="bg-zinc-50 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                                  <tr>
                                     <th className="p-4 px-6 font-black text-[10px] uppercase text-zinc-400 tracking-widest bg-zinc-50 z-20 top-0 left-0 sticky">Name</th>
                                     {columns.map(col => (
                                        <th 
                                           key={col} 
                                           draggable
                                           onDragStart={() => handleDragStart(col)}
                                           onDragOver={handleDragOver}
                                           onDrop={() => handleDrop(col)}
                                           className="p-4 font-black text-[10px] uppercase text-zinc-400 tracking-widest cursor-grab active:cursor-grabbing hover:bg-zinc-100 transition-colors"
                                        >
                                           {formatColumnTitle(col)}
                                        </th>
                                     ))}
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-zinc-100">
                                  {filteredList.map((row, i) => {
                                     const shopifyId = row['Product ID'] || row['product_id'] || row['ID'];
                                     return (
                                     <tr key={row.id || i} className="hover:bg-zinc-50/50 transition-colors group cursor-pointer" onClick={() => { /* Edit Modal Trigger goes here */ }}>
                                        <td className="p-4 px-6 text-xs border-r border-zinc-50 sticky left-0 bg-white group-hover:bg-zinc-50/50 min-w-[200px] truncate max-w-[300px]">
                                           <div className="font-bold text-black flex items-center justify-between">
                                              <span>{row.Name || row.name || row.title || row.Title || 'Unknown'}</span>
                                              {shopifyId && (
                                                <a href={`https://admin.shopify.com/store/loamlabs/products/${shopifyId}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open in Shopify Admin" className="p-1.5 rounded-lg bg-zinc-50 border border-zinc-100 hover:bg-black hover:text-white hover:border-black text-zinc-400 transition-all flex-shrink-0 ml-2">
                                                   <ExternalLink size={10} />
                                                </a>
                                              )}
                                           </div>
                                           <div className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mt-0.5">{row.Vendor || row.vendor || row.Brand || row.brand || ''}</div>
                                        </td>
                                        {columns.map(col => {
                                           const val = row[col];
                                           return (
                                              <td key={col} className="p-4 text-xs font-medium text-zinc-600">
                                                 {typeof val === 'object' ? JSON.stringify(val) : String(val === null || val === undefined ? '' : val)}
                                              </td>
                                           );
                                        })}
                                     </tr>
                                     )
                                  })}
                                  {filteredList.length === 0 && (
                                     <tr><td colSpan={columns.length + 1} className="p-12 text-center text-zinc-400 font-bold italic">No components match this filter.</td></tr>
                                  )}
                               </tbody>
                             </table>
                           </div>
                        );
                    })()}
                 </div>
               </div>
           </div>
        )}

        {/* --- UNIVERSAL FLOATING BAR --- */}
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
      </main>
    </div>
  );
}

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
