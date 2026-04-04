# Master Notes: LoamLabs Ops Dashboard (Current Context)

## 🏗️ Architecture Overview
The dashboard is a Next.js application designed to bridge Shopify product data with external vendor pricing via Scraping and BTI matching.

- **Stack**: React (Frontend), Supabase (PostgreSQL Database), Shopify GraphQL Admin API.
- **Primary Table**: `watcher_rules` houses all synchronized product variants.
- **Auth**: Header-based password authentication (`x-dashboard-auth`).

## 🏷️ Standardized Ignore Tag System
Control product visibility per-tab using Shopify tags:
- `watcher-ignore`: Hides product from the main **Vendor Watcher** Registry and skips it during background syncs.
- `bti-sync-ignore`: Hides product from the **BTI Sync** management tab.
- `lab-ignore`: Hides product from the **Product Lab** (Cloning tab).

## 🧪 Product Lab (Cloning Tool)
- **Grouping**: Unlike other tabs, the Lab groups variants into "Product Families" using `shopify_product_id`.
- **Search**: Supports real-time titles/vendor search.
- **Wheel Sets**: Uses the `handbuilt` tag to surface finished wheelsets.
- **Bulk Actions**: supports "Ignore & Purge" which applies the `lab-ignore` tag via `/api/bulk-update-tags`.
- **Data Integrity Audit**: "Group-Aware" discrepancy engine audits variant metafield consistency across families (handling subset variations like rim size or hub hole count) and surfaces mismatches in a global notification center.

## 🔄 Sync Engine & Arbitration (Stabilized Mar 2026)
- **Arbitration Logic**: Vendor Watcher handles **Price Authority** even when items are Out-of-Stock (OOS) at the vendor. **Inventory Authority** is deferred to BTI ONLY when vendor is OOS.
- **Authority Reclamation**: Sync engine automatically toggles the `inventory_monitoring_enabled` Shopify metafield. It reclaims authority (sets to `false`) immediately when an item returns to stock at the vendor.
- **OOS Pricing**: Prices are updated for OOS items to ensure MSRP/MAP compliance even during backorders.
- **Selective Sync**: API supports `ruleIds` for targeted refreshes of individual or bulk-selected items.
- **Unified Sync Action**: "Sync to Family" button synchronizes metafields directly to Shopify via GraphQL and immediately upserts `watcher_rules` in Supabase to eliminate manual refresh steps.
- **Scraper Resilience**: Implements User-Agent rotation to bypass vendor blocks.

## 📊 Operational Insights (New)
- **Abandoned Builds**: Captures unfinished wheel builds directly from the Shopify theme (via `/api/log-abandoned-build`) and surfaces them in a dedicated insights table while retaining essential email alerts.
- **Health Indicators**: System-wide dashboard components to streamline identifying discrepancies or scraping degradation.

## 🛡️ Security & Integrity (Implemented Mar 2026)
- **Row Level Security (RLS)**: Enabled on `watcher_rules` and `vendor_logos` to prevent unauthorized access.
- **Table Constraints**: `UNIQUE` constraint strictly enforced directly on `shopify_variant_id`.

## 🚀 Future Roadmap
### **Phase 4: Component API Integration**
1. **Component Management Tab**: Create a dashboard interface to manage `loamlabs-component-api` data (GitHub-backed JSON) directly from within the Ops Dashboard.
2. **Shopify-Database Spec Sync**: Link Shopify product IDs to component specs and implement an audit/sync tool to ensure Hub/Rim dimensions perfectly match between the store and the unified calculator database.

---
*Updated March 2026 to reflect Data Integrity and Operational Consolidation stabilization.*
