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

## 🔄 Sync Engine & Arbitration (Stabilized Mar 2026)
- **Arbitration Logic**: Vendor Watcher handles **Price Authority** even when items are Out-of-Stock (OOS) at the vendor. **Inventory Authority** is deferred to BTI ONLY when vendor is OOS.
- **Authority Reclamation**: Sync engine automatically toggles the `inventory_monitoring_enabled` Shopify metafield. It reclaims authority (sets to `false`) immediately when an item returns to stock at the vendor.
- **OOS Pricing**: Prices are updated for OOS items to ensure MSRP/MAP compliance even during backorders.
- **Selective Sync**: API supports `ruleIds` for targeted refreshes of individual or bulk-selected items.
- **Transparency**: Granular rule-level logging is surfaced in Vercel logs (`[RULE: ID]`) and scraping errors (403/404) are stored in the `last_log` field in Supabase.

## 🛡️ Security & Integrity (Implemented Mar 2026)
- **Row Level Security (RLS)**: Enabled on `watcher_rules` and `vendor_logos` to prevent unauthorized access.
- **Table Cleanup**: Resolved mismatched table references (confirmed logo table is `vendor_logos`, not `vendor_watcher_logos`).

## 🚀 Future Roadmap
### **Phase 1: Visibility & Cleanup**
1. **BTI Status Column**: Add `inventory_monitoring_enabled` visibility to the Registry UI.
2. **Scraper Resilience**: Implement rotating `User-Agent` headers or proxy support to bypass OneUp 403 blocks.
3. **Database unique Constraint**: Execute `ALTER TABLE watcher_rules ADD CONSTRAINT unique_variant_id UNIQUE (shopify_variant_id);`.

### **Phase 2: Product Lab Intelligence**
1. **Variant Metafield Consistency Check**: Automated audit for "constant" fields (Position, Brake, Spacing) across product families. Highlight discrepancies and add a "Discrepancy Filter".

### **Phase 3: Component API Integration**
1. **Component Management Tab**: Create a dashboard interface to manage `loamlabs-component-api` data (GitHub-backed JSON) directly.
2. **Shopify-Database Sync**: Link Shopify product IDs to component specs and implement an audit/sync tool to ensure Hub/Rim dimensions match between the store and the calculator database.

---
*Created on 2026-03-21 to preserve context for future development.*
