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

## 🔄 Sync & Import Logic
- **Sync (`/api/sync`)**: Compares vendor prices with Shopify. It **does not** overwrite manual settings.
- **Import (`/api/import-catalog`)**: Pulls metadata (tags, BTI numbers) from Shopify.
  - **CRITICAL**: The import script is explicitly blocked from overwriting `auto_update` (Auto-Sync status) and `price_adjustment_factor`.
  - **Deduplication**: Uses `upsert` on `shopify_variant_id`. *Note: Ensure your database has a UNIQUE constraint on this column to prevent identical rows.*

## 🐛 Resolved Critical Issues
- **Settings Resets**: Fixed an issue where syncing the catalog reverted "Auto-Sync" to OFF.
- **Duplication Crash**: Fixed a ❌ error during duplication caused by undefined `newProduct` objects in the response.
- **Ghosting/Duplicates**: Implemented UI-level deduplication in `index.js` to ensure each variant ID only appears once, even if the DB contains duplicates.

## 🚀 Future Roadmap
1. **Negative Inventory Reporting**: Identify products with oversell conditions.
2. **Deep Audit**: Automated checks for missing metafields or engineering data in Shopify.
3. **Database Cleanup**: Run `ALTER TABLE watcher_rules ADD CONSTRAINT unique_variant_id UNIQUE (shopify_variant_id);` to ensure DB-level data integrity.

---
*Created on 2026-03-21 to preserve context for future development.*
