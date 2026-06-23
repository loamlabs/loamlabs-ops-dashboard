# Master Notes: LoamLabs Ops Dashboard (Current Context)

## 🚨 STRICT AGENT DIRECTIVES: MODULE ISOLATION
**CRITICAL INSTRUCTION FOR ALL AI AGENTS:**
1. **Never Break Unrelated Projects:** When working on one specific feature or tool within this dashboard (e.g., adding a vendor to Vendor Watcher), you MUST NOT modify, refactor, or touch code belonging to an unrelated project (e.g., the Component Library).
2. **Isolated Architecture:** The tools in this repository (Vendor Watcher, BTI Sync, Component Library, Insights) are intentionally built to run separately. A bug or change in one should *never* cascade and break another. Maintain this strict separation of concerns.
3. **Building New Tools:** If requested to build a completely new tool (for example, a price comparison tool that simulates wheel builds against competitors), it MUST be built entirely separately from the existing tools. Do not entangle new experimental features with stable, production modules.

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

## 🔄 Sync Engine & Arbitration (Stabilized Mar/June 2026)
- **Arbitration Logic (The "Golden Rule")**: Vendor Watcher handles **Price Authority** even when items are Out-of-Stock (OOS) at the vendor. **Inventory Authority** is deferred to BTI ONLY when vendor is OOS.
- **BTI Price Loop Prevention**: A guard exists to prevent infinite loops between Watcher and BTI. If the vendor is OOS *and* BTI is active (`bti_inventory_active === true`), Vendor Watcher defers to BTI for pricing to prevent the scripts from reverting each other's adjustments.
- **BTI Hand-Off Protocol**: When Watcher forces an override to reclaim control from BTI, the `custom.bti_part_number` metafield is wiped in Shopify so BTI ignores the product. The product remains marked as "LINKED" in Watcher to allow safe restoration of the BTI number if the vendor goes OOS again in the future.
- **Authority Reclamation**: Sync engine automatically toggles the `inventory_monitoring_enabled` Shopify metafield. It reclaims authority (sets to `false`) immediately when an item returns to stock at the vendor.
- **OOS Pricing**: Prices are updated for OOS items to ensure MSRP/MAP compliance even during backorders.
- **Selective Sync**: API supports `ruleIds` for targeted refreshes of individual or bulk-selected items.
- **Unified Sync Action**: "Sync to Family" button synchronizes metafields directly to Shopify via GraphQL and immediately upserts `watcher_rules` in Supabase to eliminate manual refresh steps.
- **Scraper Resilience & Caching**: Implements User-Agent rotation to bypass vendor blocks. Includes in-memory caching for dynamic multi-fetch workflows (like the `e*thirteen` driver/surcharge logic) to prevent 429 Rate Limit crashes from repetitive sequential lookups.

## 📊 Operational Insights (New)
- **Abandoned Builds**: Captures unfinished wheel builds directly from the Shopify theme (via `/api/log-abandoned-build`) and surfaces them in a dedicated insights table while retaining essential email alerts.
- **Health Indicators**: System-wide dashboard components to streamline identifying discrepancies or scraping degradation.

## 🛡️ Security & Integrity (Implemented Mar 2026)
- **Row Level Security (RLS)**: Enabled on `watcher_rules` and `vendor_logos` to prevent unauthorized access.
- **Table Constraints**: `UNIQUE` constraint strictly enforced directly on `shopify_variant_id`.

## 🚀 Future Roadmap
### **Phase 4: Component Library Architecture**
The Component Library is a GitHub-backed engineering database that lives within the dashboard, allowing for direct management of the unified calculator JSON (`rims.json`, `hubs.json`, etc.).
- **Identity Migration (Name ⮕ Title)**: The system standardized on **"Title"** as the primary identity key to align with Shopify sources. The "Name" field has been fully retired and mapped to "Title" in the UI.
- **Passive Stability Architecture**: Implemented a non-destructive "Translation Layer". The dashboard respects technical JSON headings (e.g., `wheel_spec_position`, `rim_erd`) as the absolute source of truth while providing clean, human-readable labels in the spreadsheet UI.
- **Data Integrity Protection**: Edits in the grid are "Source-Aware"—they write back to the original technical key in the JSON, ensuring the backend files remain compatible with existing engineering calculators.
- **Mandatory Validation**: Enforces "Ready-to-Build" data integrity. Missing fields (Title, Vendor, Position, Option Names/Values) are highlighted with red row backgrounds in the library.
- **UI UX**: Implemented horizontal scrolling for wide spec sheets, zebra-stripping for readability, and high-contrast labels.
- **Safe Sync Engine**: Harmonized the sync logic across all buttons. Both the "Sync Audit" and "Sync Selected" handlers use the same "Golden Rule" (registry-driven comparisons and robust normalization) to ensure consistent, bloat-free updates.

### **Phase 6: The Spreadsheet Engine (Implemented Apr 2026)**
The Component Library has been transformed into a high-performance, modular spreadsheet interface to handle large engineering datasets without UI lag.
- **Modular Component**: All grid-specific logic (rendering, navigation, cell editing) is encapsulated in `components/ComponentLibraryGrid.js`.
- **Excel-Style Interaction**: 
  - **Navigation**: Full support for Arrow keys, Tab (move right/next row), and Enter (move down/submit edit).
  - **Inline Editing**: Double-click or press Enter/Space to activate high-performance `EditableCell` components.
- **Data Architecture Fixes**:
  - **Vendor & Title Resolution**: Decentralized identity mapping ensures the grid always resolves `Vendor` and `Title` regardless of variations in the underlying JSON schema.
  - **Unique Row Identity**: All rows now use a persistent `_rid` identifier ensuring visual uniqueness. This eliminates the "ghost selection" bug where multiple rows would highlight simultaneously for duplicate products.
  - **One-Click Discard**: Hardened the Discard Draft functionality to clear all unsaved state, added rows, and selection contexts across all tabs in a single operation.
- **Persistence Layer**: Spreadsheet edits are tracked in `sessionStorage` (`loamops_grid_unsaved_v1`) to prevent data loss on accidental refreshes, and are persisted to GitHub via a floating batch-save UI.

### **Phase 7: Importer & Multi-Edit Stabilization (Implemented Apr 2026)**
The Component Library engine has been hardened to handle bulk operations and automated data ingestion from external storefronts.
- **Smart Variant Deduplication**: The Shopify Product Importer specifically identifies "Color", "Finish", and "Surface" options. It groups variants by their core technical specifications and only imports a single representative variant per specification group. This prevents the library from being flooded with redundant color rows.
- **Nuclear Null-Safety**: Implemented a comprehensive safety layer across the library's state engine. Every mapping, filter, and sorting operation (including selection contexts) is protected by existence checks. This resolved the critical "Application Error" crashes during multi-selection and mass-edit operations.
- **Stable Mass Editing**: Hardened the multi-selection context to use persistent RID (Registry ID) tracking. This ensures that mass-edit operations reliably target the correct objects even when filters or sorts are active in the background.

### **Phase 8: Data Normalization & High-Velocity Cloning (Implemented Apr 2026)**
The Component Library has reached its "Final Form" as a normalized, high-velocity engineering database.
- **Metadata Sanitization**: Implemented an "Auto-Sanitization" pipeline. Redundant/Deprecated technical keys (Weight, Rim Size, ERD, Position) are automatically stripped from JSON objects on save, keeping the engineering calculators lean.
- **Smart Specification Sourcing**: Rim Size dropdowns (`Option1 Value`) are now dynamically linked to Shopify Metafield validation definitions. This ensures future-proof data entry that perfectly matches storefront requirements without manual dashboard updates.
- **Rapid Duplication Workflow**:
  - **Grid Cloning**: Instant one-click duplication directly from the spreadsheet action column.
  - **"Save & Clone" Workflow**: A specialized emerald-colored button in the Edit Drawer allows for sequential creation (e.g., saving a 28h version and immediately opening a clone for the 32h version).
- **Refined Validation Logic**:
  - **Conditional Mandatory Fields**: Smarter "OR" validation f
  
  or weight. Red mandatory indicators automatically clear if *either* the Variant or Product weight metafield is populated.
  - **Streamlined Security**: Removed the manual "Safety Protocol" confirmation checklist for cloning to optimize for workflow speed, while maintaining robust backend identity mapping.

### **Phase 9: Hub Section Remediation & Stabilization (Implemented Apr 2026)**
The Hubs category has been stabilized with refined identity mapping and UI improvements.
- **Identity Integrity**: Resolved the "Ghost Duplication" bug by implementing `_rawIdx` absolute mapping. Edits and saves now reliably update existing records regardless of grid filtering or sorting states.
- **Shopify Sync Hydration**: Fixed the "Refresh" synchronization failure. The edit drawer now performs real-time state hydration during Shopify product refreshes, ensuring URLs and specifications are updated immediately in the UI.
- **Refined Hub Taxonomy**:
  - **Option1 Value**: Converted to a free-text input for Hubs to facilitate spoke count entries (e.g., "28h", "32h") without Rim-centric dropdown restrictions.
  - **Hub Type**: Updated the taxonomy to prioritize "Classic Flange" over legacy "J-Bend" terminology.

### **Phase 10: Hub Data Normalization & Schema Alignment (Implemented Apr 2026)**
The Hub category has been fully aligned with the technical Shopify schema to ensure data consistency.
- **Schema Standardization**: Converted all Hub specification labels (e.g., "Hub Type", "Hub Flange Diameter") to their technical Shopify equivalents (e.g., "Metafield: custom.hub_type [single_line_text_field]") in the registry and grid.
- **ProductURL Alignment**: Reverted the Product URL key to `ProductURL` (no space) to match the master JSON record requirements.
- **Synchronized Validation**: Updated the mandatory field enforcement engine to support the new technical labels, maintaining data integrity during high-velocity edits.
- **Importer Hardening**: The Shopify Product Sync engine now produces Hub data that is 100% compatible with existing spreadsheet columns, preventing duplicate column creation.

### **Phase 11: Sync Hydration for New Components (Implemented Apr 2026)**
The Component Library now features an instant review workflow for new component imports.
- **Drawer Hydration**: When syncing a Shopify Product ID inside a blank "New Component" drawer, the drawer immediately populates with the imported data instead of remaining blank.
- **Multi-Variant Handling**: For products with multiple variants, the first variant is loaded into the drawer for immediate review, while the rest are staged in the background queue.
- **Save Flow Integrity**: Saving the hydrated variant from the drawer commits it directly to the database and removes it from the staging queue, preventing duplicate entries.

---
*Updated April 29, 2026 to reflect Sync Hydration and RLS Security Fix.*
