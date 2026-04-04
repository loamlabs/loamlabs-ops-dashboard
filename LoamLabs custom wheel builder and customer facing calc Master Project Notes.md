LoamLabs Custom Bicycle Wheel Builder and Customer Facing Spoke Length Calculator - Master Project Notes (v4.2 - Detailed & Actionable)


1.0 Core V3 Architecture & Strategy
The V3 architecture is LIVE. Its core strategy is a unified product model designed to overcome Shopify's 100-variant limit for complex components like hubs.
1.1. Unified Hub Products: Each hub model (e.g., Onyx Vesper Rear - Boost) is a single, public-facing Shopify product.
Variants: Standard Shopify variants are used only for Color and Spoke Count.
Inventory: The base product's inventory tracks the hub body itself.
1.2. "Phantom" Freehub Options (The Core V3 Solution): Freehub selections, inventory, and pricing are managed via a system of metafields and separate, linked products.
custom.freehub (Product Metafield): A List of text values on each rear hub product that defines its available freehub options (e.g., ["Shimano HG", "SRAM XD", "Campy", "N3W"]). The builder's JavaScript reads this list to validate user selections and handle "Gray-out" logic.
Linked "Component Freehub Products": Separate, non-public Shopify products are created for each unique freehub component (e.g., "Onyx Vesper Freehub Component").
Variants & Pricing: These products have variants for each freehub type (e.g., "XD", "HG"), with each variant having its own price and tracked inventory.
Publishing: They are published to the "Online Store" channel to be accessible to the cart API but are hidden from storefront collections and search.
custom.freehub_variant_map (Product Metafield): A JSON metafield on the base hub product. It provides the critical link, mapping a freehub option name (e.g., "SRAM XD") to the specific Shopify GID of the corresponding "Component Freehub Product" variant.
1.3. Foundational Data & Intelligent Filtering Logic:
Product Tags: component:hub, component:rim, etc., remain the primary method for identifying buildable items.
Product Metafields: custom.wheel_spec_model (for grouping) and custom.pairing_key (for front/rear pairing) are essential.
Variant Metafields: custom.wheel_spec_brake_interface (Choice List), custom.rim_erd, etc., are used for detailed specification filtering and backend calculations.
Primary Filter (Brake Style): custom.wheel_spec_brake_interface is the authoritative filter for Rim and Hub isolation.
"Assume Disc" Logic: To maintain compatibility with a vast library of existing parts, variants with no value selected or "6-Bolt/Centerlock" values are treated as standard "Disc" components.
"Rim Brake" Isolation: If "Rim Brake" is selected in Step 2, the builder strictly filters for variants where this metafield explicitly contains the string "Rim Brake." Rims marked as Rim Brake are hidden from Disc builds unless the user opts-in via a toggle.
String Normalization: The engine (both Frontend and Backend) utilizes a normalization helper (clean()) to strip all non-numeric characters from Spoke Count inputs. This ensures that a Shopify value of "28" or "28 hole" correctly matches a UI button labeled "28h."
String Normalization (Clean Helper): To prevent mismatches between Shopify data and UI buttons, the system uses a clean() utility. This strips all non-numeric characters from Spoke Count strings, ensuring that a variant metafield containing "28 hole" or "28" is correctly recognized by a UI button labeled "28h."
String Normalization (Clean Helper): ...now also includes normalizeSpacing() to ensure axle standards like "12x148mm" and "12×148mm" (multiplication sign) are treated as identical matches during discovery and filtering.
1.4. Direct Sales on Product Pages (V3 Hub Logic):
Objective: To allow direct sales of hubs with the V3 freehub selection logic, ensuring correct bundling, pricing, and inventory management without a separate builder interface.
Implementation: A custom product page template is used. The logic is self-contained within a script at the bottom of the main section, which hijacks the standard snippets/buy-buttons.liquid functionality.
Dynamic Price Injection: The script uses the Storefront GraphQL API to fetch both price and compareAtPrice for the selected "phantom" freehub component. It calculates the total for both the selling price and the "regular" (strikethrough) price on the fly. This ensures that when a hub is on sale, adding a more expensive freehub updates both the sale price and the crossed-out original price correctly.
Inventory & State: It checks the inventory of both the base hub (from Liquid) and the freehub (from GraphQL). If either is out of stock, the button text updates to "Special Order".
Cart Action: When "Add to Cart" is clicked, the default form submission is prevented. The script performs a multi-item AJAX request, adding both the base hub (with the _Freehub_Type property) and the specific Component Freehub Product variant to the cart, linked by a unique _bundle_id.
Associated Files: templates/product.v3-hub.json, sections/main-product-v3-hub.liquid.
1.5 Hybrid Headless Architecture (Twin-Engine Strategy):
The V4.1 architecture evolved into a 'Twin-Engine' approach to support high interactivity and AI features.
1.5.1 Split Stack Strategy:
Transactional Engine (Shopify): Handles product inventory, checkout security, and order management. Uses the Standard Liquid Theme for core pages.
Experiential Engine (Next.js 14 on Vercel): Handles the AI 'Shop Tech' Agent and server-side state management for the Builder. Utilizes the App Router and React Server Components (RSC).
1.5.2 Tech Stack & Data Flow:
State Persistence: Upstash Redis is used for low-latency, connectionless storage of ephemeral 'Saved Build' states.
AI Orchestration: Vercel AI SDK (3.3+) manages the streaming chat interface.
Security: API keys (OpenAI, Anthropic) are managed via server-side environment variables on Vercel, never exposed to the client.
2.0 Main Builder Functionality & User Flow
The builder is a multi-step, single-page application that uses background data fetching and real-time geometric validation.
Associated Core Files:
assets/variant-builder.js: The core JavaScript engine.
sections/variant-builder-template.liquid: The HTML structure and spec-row definitions.
assets/variant-builder.css: The stylesheet, including state-driven animations for loaders and bubbles.
2.1 Step 1: Initial Selections & Riding Style
Category Logic: Users select a riding style (MTB, Gravel/Road, or Hybrid).
Hybrid: Gr/Rd/Mtb Mode: Selecting "Hybrid" unlocks "Open Specification" mode. This overrides data-riding-style button attributes in Step 2, rendering all available axle and size options simultaneously and expanding the Rim fetch logic to retrieve the entire component:rim catalog regardless of style tags.
Customer-Supplied Components: Users can opt to supply their own rims or hubs. This triggers a confirmation modal with shipping instructions and programmatically selects a "$0.00 Your Own Component" placeholder in Step 3 via the applyCustomerSuppliedSelections function.
2.2 Step 2: Discovery-Based Specs (Overhaul v5.0)
Step 2 has evolved from a static selection row into a dynamic discovery engine.
Dynamic Spoke Discovery (Co-dependency Rule): The generateDynamicSpokeButtons function enforces a Rim + Hub match requirement. A spoke count button (e.g., 20h) is only generated if the system discovers at least one Rim AND at least one Hub with that specific count for the current position. This prevents "dead ends" in Step 3 where a user might select a spoke count supported by a hub but not by any rims in the library
Availability-Aware Counters (Split Bubbles): Buttons feature real-time availability bubbles in the top-right corner.
Blue (Rim) Bubbles: Displayed on Wheel Size buttons.
Purple (Hub) Bubbles: Displayed on Hub Spacing buttons.
"Hypothetical Path" Logic: The updateSpecAvailabilityCounters function calculates "future availability." It shows how many products would be available in Step 3 if the user were to click that specific button, respecting all other currently selected specs.
Pulsing Loaders: To prevent user alarm during the 6-7 second background data fetch, bubbles display as pulsing gray pills (is-loading class) until the Shopify GraphQL response is cached.
Gravel/Road Smart Sync: For "Gravel / Road" riding styles, the builder enforces symmetry and cross-standard protection:
Axle Symmetry: Selecting a front axle standard (e.g., 12x100mm) automatically selects the matching rear standard (12x142mm).
Brake/Axle Bridge: Selecting a QR axle (9x100 Front or 10x130 Rear) automatically forces the Brake Style to "Rim Brake." Conversely, selecting a Thru-Axle standard (12mm) will deselect "Rim Brake" to prevent invalid configurations.
2.2.1 Co-dependent Spoke Discovery
The builder enforces a "Matching Pair" rule for discovery. A spoke count button (e.g., 20h) is only generated if the system finds at least one Rim and one Hub in the library sharing that count for that position.
2.3 Step 3: Component Selection & Workspace
Step 3 acts as an interactive engineering workspace.
Blink-Free Refresh: Updates triggered by the "Quick Spec Adjuster" top bar pass an isRefreshing: true flag to the showStep(3) function. This suppresses the full-screen whiteout, allowing the component lists to update "in-place" for a premium app feel.
Global MSW Toggle: Located within the Rim vendor dropdown, a "Machined Sidewall" checkbox ("Include Rim Brake options") allows Disc build users to opt-in to see Rim Brake rims (for aesthetic silver-sidewall builds).
Logic Persistence: This toggle is global. Checking it in the Front position automatically checks it for the Rear and triggers a refresh of both positions.
Intelligent Gating:
Freehub Gray-out: Freehub selection buttons in Step 2 utilize "Gray-out" logic. If a specific combination of specs results in 0 compatible hubs that support a body (e.g., Campy), the button is disabled (is-unavailable).
Validation Blockade: The "Next: Components" button is disabled if any selected spec results in a 0 availability bubble, forcing the user to resolve the engineering conflict before proceeding.
Advanced Hub-Spoke Compatibility: The updateHubSpokeCompatibilityUI function performs real-time interface validation. It cross-references hub_type tags (Straight Pull, J-Bend, Hook Flange) against spoke interface types to prevent invalid pairings (e.g., J-Bend spokes on a Hook Flange hub). If a clash is detected, the incompatible component is grayed out with a contextual tooltip explaining the requirement.
Smart Add-on Availability: The Add-on Modal intelligently manages inventory to prevent "dead-end" selections.
Auto-Defaulting: When opened, the modal skips out-of-stock variants and automatically selects the first available availableForSale variant.
Visual Feedback: Out-of-stock options within the dropdown are programmatically appended with (Out of Stock) text.
Hard Lock: The "Add to Build" button is strictly disabled (is-disabled) and the price text is highlighted in red (is-unavailable-text) if an out-of-stock variant is manually selected.
2.4 Analytics & State Persistence
Abandonment Tracking: Uses the fetch(keepalive) method to send a lightweight build-state packet to a Vercel analytics collector if a user completes all mandatory selections but leaves the page without adding to cart.
Cloud State (Redis): Uses Upstash Redis for high-intent traffic to store builds as JSON blobs with a 30-day TTL. Restoration is handled via /api/get-build?load={id}.
2.5 Live Estimated Wheel Weight & Lacing Engine
2.5.1 Real-Time Calculation: Orchestrates Front and Rear weights independently on every component change, allowing for accurate tracking of "Mullet" or mismatched builds.
2.5.2 Intelligent Lacing Determination: The getEstimatedCrossPattern function dynamically determines the pattern for weight and length calculations based on the following priority sequence:
Priority 1: Manual Override: Checks custom.hub_lacing_policy. If set to "Use Manual Override Field," it pulls the value from custom.hub_manual_cross_value. If that field is blank (>0 check fails), it proceeds to the next priority.
Priority 2: Front Rim Brake Threshold: If the position is "Front" and Brake Style is "Rim Brake," the engine defaults to Radial (0-cross) lacing ONLY IF the spoke count is 24h or less.
Priority 3: Manufacturer Safety Fallback: If a Rim Brake front build has 28h, 32h, or 36h, the engine bypasses the Radial default and calculates based on the geometric maximum (e.g., 3-cross) to adhere to manufacturer warranty requirements (e.g., Hope RS4).
Priority 4: Standard Defaults: For all other builds, it applies policy rules (e.g., Force 2-Cross for 28h) or calculates the maximum geometrically possible cross pattern.
2.5.3 Calculation Portability: Uses helper functions ported from spoke-calculator.js (calculateGeometricSpokeLength, extrapolateSpokeWeight) to adjust base spoke weights (260mm reference) to the calculated geometric length.
2.6 Financing & Value Visualization
Affirm Integration: A React useEffect hook listens for totalPrice changes and manually triggers window.affirm.ui.refresh() to update monthly payment estimates instantly.
Value UI: The 'ValueStack' component displays 'Total Component Value' (MSRP + $100 Labor) with a strikethrough vs. the LoamLabs build price to emphasize savings and the value of handbuilt precision.
2.7 Predictive Data Fetching
To eliminate Step 2 lag, triggerEarlyComponentFetches() is invoked the moment a Riding Style is selected in Step 1. This allows the 170+ hubs to download in the background while the user is still on the first screen.

3.0 Cart, Accessories & Order Flow
3.1 Cart Structure & Data Packaging
The Custom Wheel Builder uses a "Placeholder" product model to represent a complex multi-item build as a single entity in the Shopify backend while maintaining component-level granularity for the buyer.
Placeholder Model: The entire build is represented by a "Custom Wheel Build Placeholder" product.
The  A crucial hidden line-item property contains a full JSON string of the buildState. This JSON is required for:
Re-editing: Allowing the customer to click "Edit" in the cart to return to the builder with all selections hydrated.
Backend Processing: Providing the "Recipe" for the automated spoke length calculator.
Slimming Logic (Hybrid State Packaging): To bypass Shopify’s character limits on line-item properties, the packageBuildDataForCart function "slims" the JSON. It preserves human-readable titles, SKU, and prices but strips heavy metadata like image URLs, product tags, and pairing keys.
Associated Files: assets/cart.js, sections/main-cart-items.liquid, snippets/main-cart-item-row.liquid.
3.1.1 Pre-Cart Build Check (The "Engineering Review"):
Trigger: Invoked upon clicking "Add to Cart" for "Wheel Set" build types.
Valve Stem Symmetry: Checks if one wheel has a valve stem selected while the other is empty.
Paired Add-on Validation: Utilizes custom.pairing_key to identify upgrades (e.g., Bearing Kits) that are intended to be pairs. If the base hubs/rims are a matching pair and an add-on with a pairing key is selected for only one side, a warning is generated.
Exception Logic: Unique add-ons without a pairing key (e.g., DT Swiss Ratchet upgrades) are ignored by the symmetry check.
UX Intervention: Displays a "Review Your Build" modal. The "Go Back & Fix" action utilizes a "Snap-to-Conflict" logic, automatically scrolling the viewport to the first inconsistent component subsection and applying a flash-highlight animation.
3.2 Integrated & Virtual Item Sanitization
To support "Integrated Wheels" (like Reserve Infinity) and free components, the cart packaging logic includes a sanitization filter:
Virtual Components: Components marked with isVirtual: true (Integrated Hubs/Spokes/Nipples) are programmatically removed from the line-items array before the AJAX submission. This ensures the Shopify order only contains physical products with valid IDs, preventing API checkout errors.
Included Components: Items marked isIncluded: true (such as free valves) are similarly sanitized to ensure a clean checkout payload.
3.3 Cart Page Display & Visual Bundling
Visual Grouping: The assets/cart.js script identifies items belonging to a build via the _BuildID property and visually "nests" them under the main placeholder.
V3 Hub Bundling: Hub/Freehub pairs created on V3 product pages are visually bundled using a _bundle_id.
Atomic Removal: The CartRemoveButton logic is enhanced to detect these IDs. Clicking "Remove" on any part of a bundle triggers a script that deletes every item sharing that _bundle_id or _BuildID simultaneously, preventing orphaned components from remaining in the cart.
3.4 Post-Purchase Accessories Journey
The Funnel: Upon adding a build to the cart, users are redirected to /pages/accessories?build_id=xxxxxx.
Local State Hydration: The accessories page fetches build specifications from localStorage to display only compatible accessories (e.g., specific rim tapes for the chosen rim width or specific rotors for the hub brake style).
Edit-Mode Validation: If a main build is edited in the cart, a sessionStorage flag (ll_main_build_edited_) is set. On the next cart view, the revalidateAccessoryBundlesAgainstMainBuilds logic runs. It performs an AJAX call to remove any accessories that are no longer compatible with the modified main build and triggers a notification to the customer.
3.5 Customer-Supplied Components Flow
Data Flagging: If a user selects "Using Your Own Components" in Step 1, the cart placeholder receives a _Customer_Parts_Confirmed: "true" property.
Email Communication: The Order Confirmation email template contains Liquid logic ({% if property.first == '_Customer_Parts_Confirmed' %}) that triggers a prominent "Action Required" box with specific shipping instructions and an inspection disclaimer.
3.6 Gated Discount Incentive (Account Funnel)
Objective: To drive customer account creation by gating the automatic 10% discount behind a login.
Detection: sections/variant-builder-template.liquid uses Liquid ({% if customer %}) to render a global JS object: window.loamlabs.customer = { isLoggedIn: true/false }.
The Incentive Box: For anonymous users, the updateBuildSummary function calculates the potential savings (Gross Total * 0.10) and renders a "Login to Apply Discount" CTA. This link redirects to the Shopify login page with a return_url that brings the user back to their build in Step 3.
3.7 Theme-Level Security & CSP
To allow the frontend to securely send build data to the Vercel-hosted analytics and Redis endpoints, a domain whitelist is added to the top of layout/theme.liquid:
Code: {%- assign shopify_additional_csp_connect_srcs = "https://loamlabs-data-audit.vercel.app" -%}. This whitelists the domain for the connect-src directive in the theme's Content Security Policy.
3.8 Back in Stock Notifications (State-Driven CSS Logic)
This system replaces the standard Shopify "Sold Out" state with an interactive demand-capture tool.
Core Strategy: To eliminate "flicker" and race conditions, the system uses State-Driven CSS. Liquid inspects the variant inventory on page load and adds a data-product-form-state attribute (in-stock, special-order, or sold-out) to the <product-form> element.
Dynamic Visibility: A CSS <style> block uses these data attributes to toggle the display of purchase buttons vs. the notification button.
Client-Side Reactivity: A JavaScript observer hooks into the PUB_SUB_EVENTS.variantChange event. When a new color or spoke count is selected, the script re-calculates the state and updates the data-product-form-state attribute, letting CSS handle the layout shift instantly.
Data Collection: Clicking "Notify Me" opens a modal. Submitting the form sends the email and variantId to the backend collector (See Section 4.8).

4.0 Backend Automation & Tooling (Internal)
These tools are managed in separate GitHub repositories and operate as independent microservices triggered by Shopify Webhooks or Cron Jobs.
4.1. Project-Specific Authentication (2026 Pivot):
While legacy microservices utilize permanent shpat_ tokens, the Vendor Watcher project has pivoted to the OAuth 2.0 Client Credentials Flow to align with Shopify's 2026 security mandates.
Source Repo: loamlabs-spoke-automation
Trigger: orders/create and orders/cancelled Shopify webhooks.
Process: On order creation, the function parses the build recipe from the hidden _build property, fetches engineering metafields for the specific variants, and calculates precise spoke lengths.
Refactored "Single Source of Truth": The core math (calculateSpokeLength, calculateBerdFinalLength, etc.) is housed in a shared library at _lib/calculator.js. This ensures the production webhook and the internal test harness always produce identical results.
Logic Specifics:
Steel vs. Berd: Supports both steel elongation formulas and Berd-specific hub constants/tension compensation.
Radial Logic (v5.0): The engine is programmed to automatically assume Radial (0-cross) lacing for Front Rim Brake builds unless a custom.hub_lacing_policy override is found on the hub variant.
Berd Mechanical Puller Bias: Applies a -2mm deduction to standard Polylight spokes (accounting for tool stretch) but applies a +1mm offset for PolylightX models (detected via title string matching) per manufacturer guidelines.
Inventory Action: Uses the GraphQL Admin API to deduct (or restock) the exact quantity of the corresponding "Length Variant" (e.g., "Sapim Race / Black / 290mm") from Shopify’s tracked stock.
Output: Sends a detailed HTML engineering report via Resend and appends a comprehensive technical note to the Shopify order.
Mechanism: The service stores SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET. At runtime, the service performs a POST request to the Shopify OAuth endpoint to retrieve a short-lived session token. This architecture serves as the prototype for future migrations of the Spoke Automation and Inventory Monitor tools.
4.1.2 Rim Brake Lacing Logic (v5.1): The backend calculation engine mirrors the frontend threshold logic. It automatically assigns 0-cross (Radial) to Front Rim Brake orders with 24h or fewer spokes. For counts of 28h+, it defaults to crossed lacing to protect hub warranties. This ensures the automated inventory system pulls the correct (shorter) spoke lengths for radial builds.
4.2. Consolidated Task Runner & Data Audit Tool (The "Master Cron")
Source Repo: loamlabs-data-audit
Trigger: A single daily Vercel Cron Job (Maintaining Free Tier Compliance).
Process: To stay within Vercel’s free tier limits (Max 2 Cron Jobs), a master script (run-daily-tasks.js) executes multiple sub-tasks in sequence.
Task A (Weekly Data Audit): Scans all products for correct publishing status and required engineering metafields.
Task B (Daily Abandoned Build Report): Retrieves the abandoned_builds list from Upstash Redis and clears the key.
Task C (Daily Vendor Watcher Sync):
Logic: Invokes the loamlabs-vendor-watcher logic.
Action: Fetches vendor JSON data, performs "Highest Price" attribute matching, and executes Shopify REST API price updates for any rows where auto_update is enabled.
Outcome: Consolidates all results into a single rich-HTML "Daily Shop Health" email via Resend, preventing multiple emails and conserving Vercel invocation limits.
4.3. Live Distributor (BTI) Inventory & Pricing Sync
Source Repo: loamlabs-bti-sync
Trigger: Daily Vercel Cron Job.
Hybrid API Strategy: To maximize reliability, the script uses the GraphQL API for bulk-fetching all variant data but performs all write operations (price, cost, inventory policy) using the REST Admin API.
Stability Logic: Switched to REST for updates due to version instability in GraphQL productVariantUpdate mutations. The @shopify/shopify-api version is pinned (v9.3.2) and initialized to a stable version ('2024-04').
Rate Limit Handling: To prevent HttpThrottlingError, the script iterates sequentially with a programmatic 550ms pause between variants.
Process: Syncs Shopify variants with a custom.bti_part_number against the BTI feed, applying price adjustments based on the custom.price_adjustment_percentage metafield.
Discovery: GraphQL is used for high-efficiency bulk-fetching of variant metadata.
Write Operations: All price, cost, and inventory policy updates are performed via the REST Admin API (v2024-04+). This bypasses version instability in GraphQL productVariantUpdate mutations and ensures precise execution of the 550ms rate-limit pause to prevent HttpThrottlingError.
4.3.1. Unified Pricing Strategy (The "Sale Gap" Rule):
To maintain "On Sale" badges for SEO (Google Shopping) and Storefront UI, all synchronization engines (BTI Sync and Vendor Watcher) must adhere to the Sale Preservation Protocol:
Detection: Before updating a variant, the engine calculates the delta between the current Shopify price and compare_at_price.
Execution: If a vendor price shift is detected, the engine increments the price to the new target and simultaneously increments the compare_at_price by the previously calculated delta.
Result: This ensures that if an item was "Save $5.00" before the sync, it remains "Save $5.00" after the sync, regardless of the price increase.
4.3.2. Sequential Rate Limiting:
To prevent HttpThrottlingError, all write operations (REST Admin API) must iterate sequentially with a programmatic 550ms pause between variant updates.
4.4. Automated Low-Stock Inventory Alerts
Source Repo: loamlabs-inventory-monitor
Trigger: orders/create and orders/cancelled webhooks.
Logic: Uses Upstash Redis for short-term memory. It scans all spoke products and sends a cumulative report only if the list of low-stock SKUs has changed since the last alert, preventing notification fatigue. It also increments/decrements a custom.historical_order_count metafield to track component popularity.
4.5. Automated Berd Spoke Logic Auditing
Source Repo: loamlabs-berd-audit
Architecture: A Node.js/Express server running on a local PC, triggered by a weekly Windows Task Scheduler job.
Process: Fetches the raw HTML of the official Berd Calculator, extracts their internal calculation script, and performs a text-based diff against a "golden reference" copy (reference-logic.js). This alerts LoamLabs if the manufacturer changes their recommended lengths.
4.6. Automated Abandoned Build Analytics
Objective: To capture component popularity data for builds that reach Step 3 but are never added to the cart.
Workflow:
Frontend: assets/variant-builder.js listens for the beforeunload event. If isBuildSignificant() is true, it sends a slimmed build state using fetch(keepalive).
Collector: A Vercel function (log-abandoned-build.js) receives the packet and pushes it to an Upstash Redis list.
Reporter: The daily Cron job (Section 4.2) sends a formatted HTML email summarizing these builds, distinguishing between logged-in customers and anonymous UUIDs.
4.7. Internal Spoke Calculator Test Harness
Objective: A secure interface for staff to test the calculation engine manually.
Access Control: Wrapped in a Liquid conditional ({% if customer.tags contains 'staff_builder' %}) on a dedicated Shopify page.
Connectivity: Sends geometric data to a secure Vercel endpoint (api/test-calculator.js) which requires a secret key in the x-internal-secret header. It shares the _lib/calculator.js library with the production webhook.
4.8. Automated Back in Stock Notification System
Source Repo: loamlabs-inventory-monitor
Part A (Collector): An incoming POST request from the product page (Section 3.8) pushes the customer's email into a Redis list keyed by variantId.
Part B (Notifier): Triggered by a Shopify inventory_level/update webhook.
Verifies the available quantity is > 0.
Uses a GraphQL query to retrieve public-facing product details (image, handle, title).
Retrieves the email list from Redis and sends a single rich HTML email to all subscribers via Resend.
Deletes the Redis key to ensure no duplicate notifications are sent.
4.9. Automated Inventory Mirroring
Source File: api/handle-inventory-update.js within loamlabs-inventory-monitor.
Trigger: inventory_levels/update webhook.
Search Strategy: If a variant has a custom.inventory_sync_key, the script extracts the first three words of the product title to perform a broad search for siblings. It then performs an in-memory filter to find items with the exact same sync key and matches their quantities instantly, bypassing metafield indexing delays.
4.10. Klaviyo Liquid Logic Corrections
Process: Fixed rendering errors in the 'Placed Order' event templates.
Implementation: Replaced legacy array iteration with robust Liquid loops: {% for item in event.extra.line_items %}. Included a specific conditional to suppress the title "Default Title" for single-variant items while ensuring the spec-heavy titles of custom builds are preserved for the customer.


Yes, paste this updated version over the entire 4.11 entry. It accurately reflects the "Archive" and "New Issue Trigger" logic we just finalized.

4.11 Automated Negative Inventory (Oversell) Audit
Source Repo: loamlabs-data-audit
Trigger: Integrated into the Daily Master Cron job (run-daily-tasks.js).
Objective: To identify and report all variants across the entire catalog that have fallen into negative inventory (oversold or data error).
Intelligent Reporting & Snooze Logic (7-Day Rotation):
Trigger: An email report is only dispatched if the system detects a new negative inventory issue (one not seen in the last 7 days).
Memory: Uses Upstash Redis to track reported variants via oversell_reported:{variant_id} keys with a 7-day TTL.
Snoozed Archive: If an email is triggered by a new issue, the report will include a "Persisting Issues" section at the bottom. This section lists all currently "snoozed" negative items, providing a comprehensive shop health overview without causing daily notification fatigue.
Data Retrieval: Uses a high-efficiency GraphQL filter inventory_total:<0 combined with a strict JavaScript validator to ensure only truly negative items (excluding exactly 0) are processed.
Output: A formatted HTML email via Resend featuring "New" vs. "Persisting" issues, including:
Product Title & Variant Name.
SKU & Current Negative Quantity (highlighted in red).
Direct Admin Link: A deep link to the specific Shopify Variant inventory page for 1-click correction.

5.0 Customer-Facing Spoke Calculator
A standalone, high-performance web application designed for professional wheel builders and enthusiasts. It is architected for speed and data security.
Associated Core Files:
assets/spoke-calculator.js: The core JavaScript engine.
assets/spoke-calculator.css: The stylesheet, including specialized print-media directives.
Embedded within a dedicated Shopify page template.


5.1 Data Architecture (Decoupled & Secure)
To protect proprietary data and ensure sub-second load times, the calculator is decoupled from the live Shopify API.
Source of Truth: Component data is sourced from an optimized JSON file (ll-component-database.json) generated from a master Google Sheet.
Security: The JSON is hosted on a private Vercel project. A serverless function performs a "Referer Check," granting access only to requests originating from the loamlabsusa.com domain.
State Compression: Uses the LZString library to compress the full calculator state into a short URL hash, allowing users to save and share builds without a database account.
5.2 Core UX & Calculation Logic
Flexible Entry Point: Users can begin a build from any component (Rim, Hub, or Spoke Count) without sequential locking.
Live Search Dropdowns: Integrates the Choices.js library to provide a fast, searchable interface for large vendor and model lists.
Guided Selection: The checkAndEnableCrossPatterns function keeps lacing options disabled until the minimum required geometric data (ERD/PCD) is present.
Calculations: Uses definitive engineering formulas for length and stretch.
Berd PolylightX Logic: Implements a specific +1mm length adjustment for PolylightX models to account for material stretch characteristics, overriding standard Berd puller-deduction logic.
Predictive Spoke Tension: To make "Tension Ratio" tangible, the runCalculationsForPosition function uses a user-defined "Target Maximum Tension" (default 120kgF) to predict the final real-world tension in kilograms-force (kgF) for both sides of the wheel.


5.3 Paired Hub Hole Support
Logic Extension: A "Paired Hub Holes" toggle and "Paired-holes Angle" input appear for relevant spoke counts (24h or less).
Correction Factor: The calculation engine applies a trigonometric correction factor based on the provided angle to ensure spoke lengths remain accurate for paired-hole hub geometries.
State Awareness: checkIfResultsAreStale flags results for recalculation if the paired-hole angle is modified.
5.4 Wheel Geometry Visualization Engine
The "Visualize Wheel" feature renders a to-scale, interactive 2D diagram via an HTML <canvas> element.
Perspective Awareness: The engine reconfigures perspective based on position. Rear wheels show Drive Side Up; Front wheels show Disc Side Up (physically flipping the model).
Geometric Accuracy: The diagram is drawn to scale using ERD and PCD inputs. The calculateFlangeGeometries function uses the paired-hole angle to physically reposition spoke holes in the hub diagram.
Advanced Interlacing: A multi-pass "Master Painter" algorithm draws spokes in four layers (far trailing, near trailing, far leading, near leading).
Interlacing Illusion: A dynamic "patch" of the leading spoke color is painted over the trailing spoke at the final cross, creating a realistic weave effect for 2x, 3x, and 4x patterns.


View Flipping: A "Flip View" button toggles the isViewFlipped state, allowing builders to see the lacing pattern from the opposite side of the wheel.
5.5 Professional Print Functionality
The calculator features a "Smart Print" button that morphs based on calculation state (Single Wheel vs. Wheelset).
Core Architecture: The handlePrintVisualizerClick function programmatically constructs a new, self-contained HTML document in a separate window to ensure a clean, UI-free output.
The Printable Worksheet: A data-focused summary for use as a builder’s bench reference. Includes a Geometric Data table showing Bracing Angle, Geometric Length, Spoke Stretch, and Rim Entry Angle.
The Visualizer Printout: A landscape-formatted snapshot of the <canvas> wheel drawing.
State Preservation: The print script iterates through all inputs and explicitly sets the checked HTML attribute on cloned panels to ensure user selections (like checkboxes) are accurately rendered in the browser's print dialog.
Color Accuracy: Utilizes print-color-adjust: exact to force browsers to render custom UI styles (e.g., brand-specific purple accents) in the final hard copy.

6.0 Step 3 UX Enhancement: Interactive Spec Adjuster (Phase 1)
6.1 Objective
This feature resolves a core point of user friction by removing the need for a user to "commit" to technical specifications like Spoke Count or Brake Style in Step 2. It evolves Step 3 into a dynamic workspaces where specs can be adjusted as the user discovers different component availability.
6.2 Core Strategy
The builder uses the initial selections from Step 2 to generate the first view of Step 3. However, the user is provided with a low-friction method for changing these "soft specs" directly within the Step 3 interface. This promotes a discovery-based journey rather than a sequential one.
6.3 Pillar 1: "Grayed-Out But Selectable" Component Cards
Status: Designated as Phase 2 (Deferred).
Concept: The groundwork is laid to show products that are incompatible with current specs but allow the user to select them, which would then trigger an automatic update of the master specs (e.g., selecting a 32h rim would automatically update the hub search to 32h).
6.4 Pillar 2: "Quick Spec Adjuster" Bar (Implemented)
Functionality: A persistent UI element is positioned at the top of the Step 3 view, displaying "soft specs" as interactive buttons.
Adjuster Options: Includes Front Spoke Count, Brake Style, and Rear Spoke Count.
Dynamic Range: The Spoke Count buttons now include 36h (v5.0 update) and are automatically populated based on the discovery logic.
Contextual Visibility:
Rim Brake Logic: If a user is on a Rim Brake build "track," the Brake Style adjuster row is programmatically hidden to prevent invalid standard clashing.
Layout: Uses a three-column layout (front-spec-adjusters, center-spec-adjusters, rear-spec-adjusters).
Associated Logic: The renderQuickSpecAdjusters function dynamically populates these controls based on the current buildState.
6.5 Core Technical Method: The "Simulated User Action" Engine
This method avoids the complexity of a separate filtering engine by re-using the robust logic that governs the transition from Step 2 to Step 3.
Trigger Logic: Clicking an adjuster button updates the buildState and programmatically invokes the updateSpecAndRefreshStep3 function.
Blink-Free Surgical Refresh:
The  To prevent the jarring "flash" of a full-screen whiteout, the adjuster passes an isRefreshing: true flag to showStep(3).
Overlay Suppression: showStep detects this flag and suppresses the builder-step3-refresh-overlay. Individual component subsections display their own "Loading..." indicators instead, resulting in a premium, seamless UI transition.
"Smart Swap" for Hubs: When a user changes the Brake Style (e.g., 6-Bolt to Centerlock) via the adjuster, the attemptSmartHubSwap helper identifies the current hub's base model and color by parsing the product title. It then searches the cache for a compatible variant of the same model and color, seamlessly swapping it into the build to preserve the user's aesthetic choice across standards.
6.6 Global Component Persistence
"Sticky" Selection: The pre-selection logic in showStep(3) attempts to preserve the exact variant color even if the spoke count changes. It follows a prioritized fallback: Exact Match -> Color-Preserving fallback -> First Available compatible variant.
Auto-Pairing Integration: Adjustments made in the Quick Adjuster trigger the handleAutoPairing function, ensuring that changing a spec on one wheel (like Spoke Count) automatically searches for and selects the matching partner on the opposite wheel if a pairing key exists.
6.7 Preservation of Core Functionality
This "Simulated User Action" approach preserves all state-dependent features. Save/Resume, Cart Editing, and lead-time calculations continue to function accurately as they all rely on the master buildState object, which remains the authoritative "source of truth" throughout the adjustment process.


7.0 Spoke Calculator: Wheel Geometry Visualization Engine
7.1 Objective
To provide users with a geometrically accurate, to-scale, and interactive 2D diagram of their calculated wheel build. This serves as a critical verification tool for builders to visualize lacing patterns, key spoke placement, and valve hole orientation before physical assembly.
7.2 Current State & Core Functionality (v18 - Final Calibration)
The visualizer is a professional-grade rendering engine utilized within the customer-facing Spoke Calculator.
7.2.1 Context-Aware Perspective & Labeling:
Rear Wheels: Rendered from the standard Drive Side (Right) Up perspective. UI labels (e.g., "Drive Side Leading," "Non-DS Trailing") and cross-pattern sliders automatically reconfigure to this view.
Front Wheels: Rendered from the standard Disc Side (Left) Up perspective. The visual model is physically flipped, and labels reconfigure to "Left Side" and "Right Side" to eliminate ambiguity.
Orientation Note: A contextual header explicitly identifies the active side and which flange is represented by solid lines (near side) vs. dashed lines (far side).
7.2.2 Geometric Accuracy & Scale:
Scaling: The diagram is drawn to an exact scale based on the user-provided ERD (Effective Rim Diameter) and PCD (Pitch Circle Diameter).
Modeling: The physical outer edge of the hub flanges and the specific rotational offsets of hub and rim holes are precisely calibrated to real-world standards.
Paired-Hole Integration: The calculateFlangeGeometries engine utilizes the Paired-hole Angle input to physically reposition spoke holes in the diagram, ensuring the visualizer accurately reflects paired-hole hub geometry.
7.2.3 Key Spoke & Valve Hole Indicators:
Key Spoke: Programmatically placed on the near (solid) flange relative to the active view (Right flange for rear, Left flange for front).
Valve Hole: Calibrated independently for front and rear views to ensure its final position is correct relative to the key spoke and lacing pattern.
7.2.4 Advanced Rendering & "Master Painter" Algorithm:
Layered Drawing: To simulate depth, a multi-pass algorithm renders spokes in four distinct layers: far trailing, near trailing, far leading, near leading.
Interlacing Illusion (The Weave): For 2x, 3x, and 4x patterns, the engine performs a final rendering pass where a thick "patch" of the leading spoke’s color is painted over the trailing spoke at the final intersection. This creates a realistic, dynamic weave effect that updates instantly as sliders are moved.
7.2.5 Specialized Print Architecture:
Self-Contained Document: The handlePrintVisualizerClick function programmatically constructs a new HTML document in a separate window. This prevents UI clutter and ensures a predictable output.
Canvas Snapshot: Captures the live state of the <canvas> as a static PNG image for high-resolution inclusion in the document.
State Preservation (Form Controls): The script iterates through all checkboxes and radio buttons in the live UI and explicitly sets the checked HTML attribute on the cloned document. This is more robust than relying on live DOM properties, ensuring the printout reflects the user’s visibility choices.
Forced Color Rendering: The print-specific CSS utilizes -webkit-print-color-adjust: exact and print-color-adjust: exact to force browsers to render brand-specific colors (e.g., purple accents) in the final system print dialog.
7.2.6 Interactive View Flipping:
Mirror Logic: A "Flip View" button toggles a boolean isViewFlipped flag.
Rotational Adjustments: For flipped rear views, a manual rotation offset (REAR_FLIPPED_ROTATION_ADJUST_HOLES) is applied to the hub-and-spoke assembly to ensure the flipped view is a perfect mirror of the default perspective.
Dynamic UI Re-labeling: The updateVisualizerContext function re-titles the modal and swaps slider labels (Near Side vs. Far Side) to maintain user orientation during the flip.
7.3 Future Development Roadmap
7.3.1 Tier 1 (Game-Changer Features):
Live Angle Visualization: Triggered by hovering over data points (e.g., Bracing Angle) in the sidebar; the diagram will draw specific geometric lines to visually represent that metric.
Hub Type-Specific Drawings: Expanding drawWheel to support unique subroutines for Straight Pull and Hook Flange hub geometries.
7.3.2 Tier 2 (Polish & Advanced UX):
Hover Tooltips: Mouse-over events on specific spokes will highlight the spoke path and display a tooltip with its precise geometric length.
"Build Step" Animation: Sequenced buttons that animate the lacing process, showing the order in which spokes should be installed.

8.0 Future Upgrades Roadmap
8.1 Tier 1: Core Professional Features (High Priority)
These features are essential for achieving competitive parity with professional-grade tools like Freespoke and SpokeCalc.io.
8.1.1 Feature: User-Specific Component "Bench"
Objective: To allow registered builders to save manually measured component dimensions to a personal, persistent library.
Strategic Importance: High. This is a primary driver for user account creation. It transforms the tool from a one-time utility into a persistent "builder’s workbench."
Implementation Requirements:
Shopify customer authentication integration.
A backend database (e.g., Supabase or Upstash Redis) to store user-keyed JSON objects.
Frontend logic to merge "Bench" items into Vendor/Model dropdowns with a distinct visual indicator (e.g., a "Personal" badge).
8.1.2 Feature: Engineering-Level Geometric Data & Tension Visualization
Objective: To provide deeper analytical data and make the abstract "Tension Ratio" metric actionable.
Engineering Metrics: The logic will be expanded to calculate "Rim Wrap Angle" and "Flange Exit Angle" to help builders identify potential spoke-head fatigue points.
Predictive Spoke Tension (Status: COMPLETED):
Logic: The runCalculationsForPosition function now utilizes a user-defined Target Maximum Tension (kgF) (Default: 120) to calculate the predicted final tension for both sides.
UI: Displayed in a "Key Metrics" grid, allowing builders to instantly see the real-world tension balance (e.g., 120kgF Right / 78kgF Left).
8.1.3 Feature: Spoke Head Clearance Calculation
Objective: To perform a 3D trigonometric interference check that detects if the heads of J-bend spokes from opposite flanges will physically collide at the hub.
Strategic Importance: High. This provides "failure prevention" that builds massive trust with professional builders.
Implementation: Requires adding "Flange Thickness" to the hub database. Shortest-distance calculations will be rendered in the Geometric Data panel; clearance of 0mm or less triggers a "Physical Conflict" warning.
8.2 Tier 2: Enhanced User Experience & Specialized Standards (Medium Priority)
8.2.1 Feature: Frame/Hub Offset Calculation
Objective: To support non-centered wheel builds, such as Cannondale AI (6mm offset) or specialized fatbike frames.
Implementation: An optional "Frame Offset (mm)" input will programmatically adjust the effective flange offsets before the final length formulas are executed.
8.2.2 Feature: Torque Transfer Metrics
Objective: To provide insight into the wheel’s efficiency in handling pedaling and braking forces.
Calculations:
Lacing Angle = crossPattern * (360 / spokesPerSide)
Tangent Angle = 90 - Lacing Angle
Lever Arm = (PCD / 2) * sin(TangentAngle)
Benefit: This acts as an educational tool that demonstrates why 3-cross patterns are superior for high-torque applications compared to 1-cross or radial patterns.
8.2.3 Feature: "Lite" vs. "Pro" Mode Toggle
Objective: To simplify the UI for casual users by hiding advanced metrics (Wrap Angle, Tangent Angle, Lever Arm) behind a toggle, while keeping them available for experts.
8.3 Tier 3: Niche Use Cases & Global Geometric Control (Low Priority)
8.3.1 Feature: "Free Format" / Full Geometric Control
Objective: To create a true "Sandbox" mode that unlocks every parameter, including hub flange rotation relative to the opposite flange and specific rim-hole rotation.
Strategic Importance: Low volume, but establishes LoamLabs as the most technically advanced calculator on the web. Inspired by The Spoke Length Project.
8.3.2 Feature: Support for Triplet / 2:1 Lacing
Objective: To support specialty hubs (like some Campagnolo or Fulcrum models) that use twice as many spokes on the drive side as the non-drive side.
Implementation: Requires a complete overhaul of the lacing loop to handle mismatched spoke counts per side.


9.0 Pre-configured Wheel Pricing Logic in Custom Builder
Status: [COMPLETED]
9.1 Objective
To prevent price discrepancies where a customer builds a wheelset in the Custom Builder that matches an existing "off-the-shelf" product but receives a higher total price. The system programmatically recognizes these combinations and applies the lower pre-configured price while maintaining a consistent visual discount for the user.
9.2 Core Architecture (Data-Driven via Metafields)
The logic is driven by Rim-level metadata.
Trigger: Activated by a JSON metafield on Rim products: custom.preconfigured_wheel_rules.
Source of Truth: Pricing is NOT hardcoded in the JSON. Instead, the rule points to a Shopify Variant GID (masterVariantGid) of the actual pre-configured product. This ensures that if the price of the pre-configured product is changed in Shopify Admin, the Custom Builder updates automatically.
JSON Schema Example:
codeJSON
[
  {
    "name": "Reserve 40/44 with DT Swiss 180",
    "pairedRimProductId": "gid://shopify/Product/...",
    "requiredHubProductId": "gid://shopify/Product/...",
    "requiredSpokeProductId": "gid://shopify/Product/...",
    "masterVariantGid": "gid://shopify/ProductVariant/..."
  }
]


9.3 Implementation in 
9.3.1 Data Fetching & Caching:
The fetchComponentProducts query retrieves the preconfigured_wheel_rules metafield from all Rim products.
The Cache Engine: The cachePreconfiguredPrices() function executes when Step 3 loads. It identifies every unique masterVariantGid within the available rims and performs a single, high-efficiency GraphQL query to fetch their current prices. Results are stored in preconfiguredPriceCache = {} for sub-millisecond lookup.


9.3.2 Matching Logic:
The Matcher: checkForPreconfiguredMatch() identifies when the user’s specific combination of Rims, Hubs, and Spokes matches a rule in the active Rim's JSON.
Scope: This logic is strictly limited to buildType: 'Wheel Set'. Single wheel builds (Front or Rear Only) ignore these rules and utilize standard component-sum pricing.


9.3.3 Pricing & Summary Display:
The updateBuildSummary() function acts as the orchestrator for the price display.
The Valve Stem Rule: Per business rules, when a pre-configured match is detected, the price of any selected Valve Stems is programmatically excluded from the total (calculatePhysicalPreconfiguredTotal), effectively making them a free, included component.
Transparent Discount UI: To avoid misleading the customer, the system:
Calculates the "True Total" of all physical components (e.g., $2,900).
Displays this value with a strikethrough.
Displays the special rule price (e.g., $2,499) as the active price.
Renders a specific confirmation message: ✓ Pre-configured Wheel Discount Applied!. This replaces the standard LOAMLABS10 text to maintain accuracy regarding the effective discount percentage.
9.3.4 Cart Packaging:
The packageBuildDataForCart() function appends a _Preconfigured_Bundle line-item property to the placeholder product.
Fulfillment Logic: When a match is active, standard assembly service line items are omitted from the cart submission to ensure the final checkout total perfectly matches the pre-configured product price.


10.0 Customer-Facing Component Library (SEO & User Resource)
Status: [COMPLETED]
10.1 Objective
To transform the proprietary component database into a public-facing SEO engine and community resource. The goals are:
Search Dominance: Capture organic traffic for technical queries like "DT Swiss FR 560 ERD" or "Onyx Vesper PCD."
Brand Authority: Establish LoamLabs as a definitive technical authority in the custom wheel space.
User Funnel: Create a low-friction journey from information discovery (finding a component spec) to utility (using the Spoke Calculator).
10.2 Core Architecture & Strategy
The library is a standalone, dynamically generated single-page application within the Shopify ecosystem.
Source of Truth: Uses the same Vercel API endpoint (loamlabs-component-api) as the Spoke Calculator. This ensures that any update to the master rims.json or hubs.json files is instantly reflected across all public tools.
Dynamic Rendering: All content is rendered client-side. The page loads a skeleton shell, then fetches the database and builds the UI. This ensures the site remains current without manual HTML maintenance.
Routing: Hosted on a single Shopify page: /pages/wheel-component-library.
10.3 Technical Implementation Details
Associated Files:
templates/page.wheel-component-library.json
sections/wheel-component-library-template.liquid
assets/wheel-component-library.js
assets/wheel-component-library.css


Mount Point: A dedicated theme section containing a <div> with the ID wheel-component-library-main-app acts as the root for the JavaScript application.
JavaScript Processing Logic:
Grouping: The script fetches the component database and performs multi-level grouping: first by Title (to consolidate variants into unique listings) and then by Vendor.
Navigation: Generates dynamic A-Z jump-link navigation for both Rim and Hub columns independently to ensure ease of use for large data sets.
Contextual Filtering: For hub vendors that offer multiple interface types, the UI provides automatic sub-filtering (e.g., J-Bend vs. Straight Pull) that only appears when relevant.
Data Presentation: Renders component details in nested <details> accordions. When expanded, specific specs are displayed in high-readability formatted tables.
The Conversion Funnel:
Pre-Selection Hashing: Every component variant listing includes a "Use in Calculator" button.
Logic: When clicked, the button generates a direct link to the Spoke Calculator. The specific component selection is compressed into a URL hash using the LZString library.
Result: The user lands on the Spoke Calculator with the Rim or Hub already populated, drastically reducing the "work" required to begin a calculation.
10.4 Performance & Loading Optimization
Conditional Loading: The lz-string.min.js and wheel-component-library.js scripts are loaded only on the specific library template, preserving site-wide performance.
Execution Order: lz-string.min.js is loaded first without the defer attribute. This guarantees the compression library is globally available before the main application logic attempts to generate links.
Styling: A dedicated stylesheet (wheel-component-library.css) manages the grid layout, accordion animations, and jump-link aesthetics.
      
11.0 Product Page 'Build a Wheelset' Funnel
Status: [COMPLETED]
11.1 Objective
To create an intuitive user journey that captures high-intent customers on individual rim or hub pages and funnels them directly into the Custom Wheel Builder. This increases builder engagement and reduces user friction by pre-configuring technical specifications based on the starting component.
11.2 User Flow & UI
Placement: On any product page tagged with component:*, a "Ready for a Custom Build?" section appears below the main buy buttons.
Context-Aware CTA: The button text is dynamically generated (e.g., "Build a Wheelset with this Rim").
Data Handover: When clicked, the system generates a compressed data hash representing the currently selected variant and appends it to the builder URL.
Pre-populated Experience: The builder hydrates the URL hash, automatically pre-selecting the correct Riding Style, Spoke Count, Brake Style, and Axle Standards in Step 2.
11.3 Technical Implementation (Hybrid Reactive Approach)
The implementation combines server-side Liquid data with client-side reactivity to ensure 100% accuracy regardless of user interaction.
11.3.1 Snippet: 
Data Preparation: The snippet renders a hidden <script type="application/json"> block containing a full array of all product variants and their associated metadata (spoke count, position, axle standard, brake interface).
Client-Side Reactivity (MutationObserver): Because Shopify themes often swap variant data without a page refresh, the snippet utilizes a MutationObserver. It monitors the theme’s hidden variant ID input (<input name="id">).
Logic: When a user changes a variant (e.g., switches from 28h to 32h), the observer detects the ID change, looks up the metadata in the JSON block, and instantly updates the data-* attributes on the CTA button. This ensures the funnel always passes the correct specifications to the builder.
Discovery Awareness: Components added to Shopify (like ERASE or Velocity) are automatically integrated into the builder's discovery engine. As long as a matching partner (Rim for Hub, or Hub for Rim) exists with the same spoke count, the builder will automatically expose the new selection options to the user without code modifications.
V3 Hub Interaction: For rear hubs, the script includes logic to detect the currently selected freehub body by finding the :checked radio input in the _Freehub_Type_Selector property group.
11.3.2 Builder Update: "Sticky" Component Selection
The pre-selection logic within the builder's showStep(3) function is programmed to fulfill the user’s intent while maintaining logical consistency.
Priority 1 (Exact Match): The script first attempts to select the exact variant (including color) the user started with, but only if it remains compatible with the specifications finalized in Step 2.
Priority 2 (Color-Preserving Fallback): If the original variant is no longer compatible (e.g., the user changed the axle standard in Step 2), the script searches the product model for a different variant that matches the new specs while preserving the original color.
Priority 3 (Generic Fallback): If no color match is possible, the system selects the first available compatible variant of that model.
Positional Intelligence: For components like rims that can be used in either position, the logic iterates through and applies the selection to both "Front" and "Rear" slots in Step 3, fulfilling the intent to build a complete wheelset.

12.0 Hybrid Build Architecture
Status: [COMPLETED]
12.1 Objective
To support "Monster Gravel" builds and non-standard axle configurations (e.g., a road-standard 12x100mm Front hub paired with an MTB-standard 12x148mm Boost Rear hub). This requires bypassing the standard category filters that usually isolate MTB and Gravel/Road components.
12.2 Logic Gate: "Open Specification" Mode
Trigger: The architecture is unlocked when the user selects "Hybrid: Gr/Rd/Mtb" in Step 1.
Global State: Setting ridingStyle: 'hybrid' acts as a high-level override flag for the builder’s filtering and rendering functions.
12.3 Step 2: Spec Visibility & Overrides
In standard modes, the builder uses data-riding-style attributes on buttons to hide irrelevant options (e.g., hiding Boost spacing from a Road build).
The Override: The updateStep2OptionsVisibility function identifies the hybrid state and forces isVisible = true for every button in Step 2.
Result: The user is presented with every available Wheel Size (27.5", 29", 650b, 700c) and Hub Spacing standard (QR, 12mm, 15mm, Boost, SuperBoost) simultaneously, allowing for "Mullet" wheel sizes and mixed axle standards.
12.4 Expanded Database Queries
Standard queries for rims are usually filtered by style tags to keep the selection manageable.
Logic: In standard modes, fetchRimProducts injects style tags into the query (e.g., style:mtb' AND tag:'component:rim).
Hybrid Logic: When in Hybrid mode, the script strips the style requirement and fetches the entire component:rim catalog. This ensures that an MTB rim can be selected for a build using Gravel hubs, or vice versa.
12.5 Gravel/Road Axle Symmetry & standard Protection
While Hybrid mode is open, the standard Gravel / Road mode includes specialized symmetry logic to prevent invalid mixing of Rim and Disc standards.
Axle Symmetry: The setupStep2Listeners function enforces standard matching. In Gravel/Road mode, selecting a front axle standard (e.g., 12x100mm) automatically "grabs" and selects the matching rear standard (12x142mm).
Standard Bridging (QR vs. Thru-Axle):
QR Path: Selecting a QR axle (9x100mm Front or 10x130mm Rear) automatically forces the Brake Style to "Rim Brake" and selects the matching QR partner for the other wheel.
Thru-Axle Path: Selecting a Thru-Axle standard (12mm) automatically switches the build to a Disc track. It selects the symmetrical TA partner and programmatically clears "Rim Brake" from the Brake Style selection if it was previously active.
UX Benefit: This logic allows the user to switch between a Rim Brake and Disc Brake build with a single click, instantly reconfiguring all 8 spec rows to the correct defaults for that standard.

13.0 Integrated / Pre-Built Wheel Architecture (Reserve Infinity Logic)
Status: [COMPLETED]
13.1 Core Strategy (The "Master Rim" Concept)
To allow a "Factory-Built" wheel to exist alongside "Custom Handbuilt" components without breaking the builder’s validation logic, the system treats the pre-built product as a Rim.
Trigger: The logic is activated when a selected Rim product contains the tag type:integrated_wheel.
Automated State Hydration: Selecting an integrated rim triggers the applyIntegratedWheelLogic function. This programmatically fills the Hub, Spoke, and Nipple slots with "Virtual Components" to satisfy the builder’s requirements for a "complete" wheel without requiring further user selection.
13.2 Data Structure & Metafields
Integrated wheels require specific product-level metadata to function correctly:
Required Metafields:
custom.integrated_hub_name (Single Line Text): The display name for the virtual hub (e.g., "Integrated Reserve Hub").
custom.included_valve_variant_id (Single Line Text): The specific Shopify GID of the valve stem to auto-select as part of the bundle.


Unique Filtering Logic: Unlike standard rims which filter by Spoke Count, Integrated Wheels are filtered by Hub Specifications.
The Loader: loadAndFilterRimsForPosition strictly cross-references the variant’s spec_hub_spacing, spec_brake_interface, and availableFreehubs (for Rear position) against the selections made in Step 2.
Strict Freehub Check: If the user is building a Rear wheel, the integrated rim will only appear if the specific Freehub body selected in Step 2 is included in the rim product’s availableFreehubs metafield list.


13.3 Virtual Component State & UI Locking
Virtual Items: The generated Hub, Spokes, and Nipples are stored in the buildState as JSON objects with the flag isVirtual: true and a price of 0.
UI Locking: The builder adds the CSS class .is-locked-integrated to the Hub, Spoke, Nipple, and Valve Stem subsections. This grays out the area and hides "Remove" buttons to prevent the user from accidentally breaking the bundle's integrity.
Persistence & Validation Patching:
Standard validation usually deletes components if a spoke count mismatch is detected.
The attemptRevalidateComponent and loadAndFilter functions have been patched to detect the isVirtual flag on page reload or edit mode, ensuring these items are preserved even if their technical specs (like spoke count) are nominally "0."
13.4 Pricing & Cart Submission
Assembly Fee: Instead of standard wheelbuilding labor, a specific $20.00 Assembly Fee variant (gid://shopify/ProductVariant/51777290764595) is programmatically added to the build for each Integrated Wheel selected.
Discount Eligibility: Integrated wheels contribute to the total subtotal and count toward the item threshold required to trigger the automatic 10% discount.
Cart Sanitization (Fulfillment Safety): The packageBuildDataForCart function acts as a final filter. Before the AJAX request is sent to Shopify, it strips out all components marked  This ensures the final order contains only valid physical IDs (the Rim/Wheel, the Valve, and the Assembly Fee), preventing checkout errors caused by the "fake" IDs used for virtual items.

14.0 AI 'Shop Tech' Agent ("Lead Tech")
Status: [PHASE 2 - ARCHITECTURE PIVOT]
14.1 Conceptual Definition & Persona
Role: Automated "LoamLabs Lead Tech."
Persona: "The Shop Foreman." Direct, highly technical, honest, and "down to earth." He avoids corporate platitudes and marketing fluff.
Objective: To provide high-value engineering advice, real-time inventory checks, and accurate lead time calculations based on live shop data and manufacturer lead times.
Prime Directives:
Never guess inventory: Always use the provided tools to check the "Memory."
No Fluff: Provide technical data, not sales pitches.
Clarification First: If a user query is vague (e.g., "What hubs do you have?"), ask for required specifications (Position, Spoke Count, Brake Style) before searching.
14.2 Technical Architecture (The "Cached Brain" Strategy)
The Agent utilizes the Twin-Engine Strategy (Section 1.5), operating as an independent experiential engine hosted on Vercel.
14.2.1 The "Brain" (Vercel Backend):
Framework: Next.js 14 utilizing the Pages Router (pages/api/chat/index.ts).
Reasoning: The Pages Router is used specifically to enforce strict, manual control over HTTP Headers and response piping, which is required for reliable streaming of AI responses.
AI Model: gemini-flash-latest. Chosen for its speed, connection stability, and superior tool-calling (function calling) capabilities.
Safety Settings: All AI safety filters are DISABLED. This prevents "false positives" where common bicycle industry terms (e.g., "Hydra" hubs, "Killer" deals, or "Shoot" through axles) might otherwise trigger a model refusal.
The "Safety Net" (Ventriloquist): A custom fallback mechanism designed to handle "lazy" model behavior. If the AI executes a search tool but fails to summarize the result in text, the backend automatically formats the raw tool data into a direct system report, ensuring the user always receives a technical answer.
14.2.2 The "Memory" (Redis Database):
Strategy: "Flattened Inventory." Querying the Shopify API live provides a limited "Keyhole" view and poor technical filtering. Instead, the Agent queries a high-performance "Source of Truth" in Upstash Redis.
Data Structure: Complex Shopify Parent/Child relationships are converted into a flat list of searchable items.
Example: A single "Hope Pro 5" product with 50 variants is stored as 50 distinct records in Redis, each with its own technical specs (e.g., axle === '157mm').
Sync Logic:
Snapshot: A periodic Cron Job fetches all products tagged component:* to rebuild the database.
Pulse: A Webhook listener (/api/webhooks/shopify) updates individual records instantly when inventory levels or product data change in Shopify.
14.3 Data Strategy & Logic Gates
The "Flattened Master Record" aggregates data from three levels (Product, Variant, and Metafield) to allow instant technical filtering.
14.3.1 Data Schema Fields:
A. Identity: custom.wheel_spec_model (Grouping name) and custom.pairing_key.
B. Visuals: Color and Hole Count (Mapped from Shopify options).
C. Critical Specs: spec_position, spec_hub_spacing, spec_brake_interface, spec_rim_size, and internal_width_mm.
D. Engineering Data: weight_g (Variant level takes priority), Rim Geometry (ERD, Depth), and Hub Geometry (Type, Flange Diameters/Offsets, Lacing Policies).
E. Logistics: custom.lead_time_days.
14.3.2 The "Gatekeeper" Logic:
Specification Enforcement: If a user asks for "Hubs" without specifying a Position (Front/Rear), the system intercepts the query and forces the AI to ask for that detail before searching the database.
Smart Inference: Uses a hardcoded AXLE_MAP to infer position from numbers. If a user says "15x110," the Gatekeeper infers "Front" and allows the search to proceed without asking the user for Position.
14.3.3 Specialized Tooling:
Filtering Logic: Searches use pure Javascript logic against the flattened fields rather than fuzzy text matching. This solves the "Ghosting" issue where Front hubs might appear in Rear hub searches.
Lead Time Logic:
In Stock: Displays "Ready to Ship."
Special Order: Calculates a delivery window using the custom.lead_time_days plus the shop's build time (Section 2.2).
14.4 Implementation Phases
Phase 1 (Completed): Basic Agent live with Shopify API connection.
Phase 2 (Current Focus): "Cached Brain" Architecture. Finalizing the Redis Sync and Webhook infrastructure to support "God Mode" technical visibility.
Phase 3 (Roadmap):
Admin Debug Mode: Allowing staff_builder users to see the Agent's "Thought Process" and raw tool responses.
Kill Switch: A Theme Setting toggle to instantly revert to standard Shopify Chat if needed.
Product Page Funnel: Expanding the Agent to recognize the context of the individual product page it is currently on.
15.0 LoamLabs Vendor Watcher & Pricing Dashboard
15.1. Objective & Use Case
Purpose: Automate price and inventory sync from boutique vendors (e.g., Berd, Phil Wood) to Shopify Admin.
Headless OAuth 2.0 (2026 Mandate): Utilizes the CLIENT_ID and CLIENT_SECRET flow to request short-lived, high-security session tokens at runtime, bypassing legacy permanent token restrictions.
Trigger Logic: Triggered via a secure x-loam-secret handshake initiated by the loamlabs-data-audit master cron job to maintain Vercel Free-Tier compliance (2-job limit).
15.2. Scraper Engine: Surgical Attribute Matching
Unified Hub Reconciliation: Bridges the gap between LoamLabs "Base Hubs" and vendor "Hub+Freehub" bundles. The engine filters vendor JSON by Spoke Count and Position, then extracts the Highest Price among valid candidates to protect margins.
Attribute Matching: Implements a cleanNum() utility to match variants despite string discrepancies (e.g., "28h" matches "28 Spoke").
15.3. Smart Availability Logic (Physical Priority)
The "Double-Lock" Rule: The engine only executes an "Out of Stock Action" if both the vendor’s live JSON shows available: false AND LoamLabs’ Shopify inventory_quantity is 0 or less.
Inventory Override: If local physical stock exists (qty > 0), the engine ignores the vendor's OOS state.
Policy Enforcement:
Total OOS: Applies custom.out_of_stock_action (deny to hide/notify or continue for special order).
Restock Recovery: If a vendor returns to available: true, the engine forces Shopify's inventory_policy back to continue to restore the "Special Order" flow.
15.4. Sale Preservation & Margin Safety
Sale Preservation: Calculates the delta between price and compare_at_price before updating. If a vendor price shifts, both values are incremented by the same delta to preserve storefront "Sale" badges and SEO.
Margin Safety Valve: Implements a 20% price-drop threshold. If a vendor price decreases by more than this limit, the system freezes the auto-update and flags the item as "Review Required."
16.0 LoamLabs Competitor Intelligence Engine
Objective: To maintain price leadership by automatically benchmarking LoamLabs Custom Build prices against key competitors (e.g., Fanatik, Colorado Cyclist, etc.).
16.1 Shared Infrastructure: This module utilizes the same tech stack as the Vendor Watcher (Section 15.0): Next.js 14, Supabase, and Playwright.
16.2 "Build-Aware" Scraping logic:
The Challenge: Competitor builders are highly interactive. The scraper must "simulate" a user selecting specific Rims, Hubs, and Spokes to reach the final subtotal.
Strategy: Playwright scripts will be authored to navigate competitor "multi-step" builders, selecting high-volume "Benchmark Builds" (e.g., NOBL TR37 + I9 Hydra).
16.3 Data Comparison:
The Delta Check: The tool compares the competitor's final build price against the LoamLabs price for the identical configuration.
16.4 Competitive Reporting:
Results are integrated into the Daily Email Report (Section 15.3).
The Insight: Displays "Build Name | LoamLabs Price | Competitor Price | Variance (%)" to allow for rapid strategic price adjustments.
17.0 LoamLabs Ops Dashboard (The "Command Center") [UPDATED MARCH 2026]
Status: [CORE FUNCTIONALITY COMPLETED]
17.1. Infrastructure & UI Architecture
Performance: Implemented client-side pagination (50-item batches with "Load More") to maintain sub-second UI responsiveness while managing a 940+ item registry.
Navigation: Implemented a state-driven sidebar that toggles between the Vendor Watcher (Registry) and Shop Health (Data Audit) views.
Multi-Select Filtering: Replaced static buttons with a "Vendor Cloud" supporting multi-select logic. Builders can now isolate specific brands (e.g., Berd + Onyx) simultaneously.
Visual Auditing: Implemented high-contrast row highlighting. Items missing a vendor_url are tinted light red (bg-red-50) to provide an immediate visual "To-Do" list for the owner.
17.2. The "Discovery-First" Import Engine
Mass Catalog Sync: Built a recursive GraphQL scanner that bypasses Shopify's 250-item limit. It successfully scanned 1,129 items and imported 940 relevant components in a single operation.
Intelligent Noise Filtering: The engine utilizes a hardcoded EXCLUDED_TAGS array (including apparel, tires, and small components) to ensure only buildable "Engineering" parts enter the registry.
Auto-Healing Vendor Data: Implemented a background data-healing loop. If a registry item is missing its vendor name, the engine automatically fetches the official vendor from the Shopify Product ID and updates Supabase.
17.3. "God Mode" Configuration (Edit Engine)
Surgical Overrides: The Edit Modal allows for per-item overrides of Internal Titles, Vendor URLs, and Margin Safety.
Builder-Buffer Math: Integrated per-item price_adjustment_factor (Default 1.1111). This offsets the Custom Builder's automatic 10% discount, ensuring that if a vendor goes on sale, LoamLabs preserves a 35% margin gap relative to MSRP.
17.4 LoamLabs Ops Dashboard: The Central Command Engine
The Ops Dashboard is a specialized Next.js microservice designed to bridge technical engineering data with Shopify’s commercial platform. It acts as the "Brain" for all automated pricing, synchronization, and data integrity operations.

17.5 Core Modules & Functional Pillars:
- **Vendor Watcher (Section 15.0)**: Automates real-time price and inventory synchronization from boutique vendors. It features surgical attribute matching and "Sale Preservation" logic to ensure LoamLabs margins are protected even when vendor costs shift.
- **BTI Live Sync (Section 4.3)**: Handles high-volume daily synchronization of distributor-level pricing and inventory using a specialized REST-based rate-limiting engine.
- **Product Lab (The Cloning Tool)**: A high-efficiency interface for duplicating complex "Product Families." It includes a "Group-Aware" discrepancy engine that audits variant metafield consistency across thousands of items simultaneously.
- **Component Library (The Engineering DB)**: A direct interface for managing the underlying JSON spec database (`rims.json`, `hubs.json`). It enforces "Ready-to-Build" data integrity through mandatory field validation and standardized dropdowns.

17.6 Strategic Role:
The Dashboard eliminates the "Manual Data Gap." By consolidating scraping, auditing, and component management into a single authenticated UI, it allows LoamLabs to scale its component registry (currently 1,100+ items) without increasing administrative overhead. It ensures that the technical specifications used by the Spoke Calculator always match the live product data seen by customers in the Builder.

18.0 Project Context & Collaboration Guidelines
To maintain the integrity of the LoamLabs Custom Builder and ensure efficient development, all future interactions must adhere to these six pillars of collaboration:
1. The Single Source of Truth
The Master Document: The comprehensive documentation above is our definitive reference. Every prompt should begin by acknowledging this state to ensure the AI "context" is perfectly aligned with the live architecture.
Living Updates: This is a living document. When a feature is completed, the summary of that feature must be integrated into the relevant section immediately to prevent "knowledge drift."
2. Section-Based Referencing
Precision Tracking: When requesting updates or reporting bugs, reference the specific section number (e.g., "Regarding Section 13.4, the Cart Sanitization is triggering an error..."). This allows for rapid cross-referencing within the massive technical archive.
3. Non-Developer Accessibility
Clear Instructions: Since the project owner is not a developer, all technical instructions must be exceptionally clear.
File Specificity: Always specify the exact file path (e.g., assets/variant-builder.js or snippets/buy-buttons.liquid).
Copy-Paste Ready: New code must be provided in clearly marked, isolated blocks that are ready for direct insertion into the Shopify theme editor.
4. Surgical Code Updates
Avoid Overwrites: Never send back large, unchanged sections of a file.
Atomic Modifications: Provide only the specific function, variable, or CSS rule that needs to be updated. This prevents the accidental deletion of high-value legacy features or intricate logical handshakes.
5. Contextual Anchoring
The "Before & After" Rule: When updating a function, always provide the new code wrapped in a small "anchor" of existing code (the few lines before and after the change). This ensures the update is placed in the correct logical sequence and doesn't orphan existing dependencies.
6. Visual & Administrative Support
Screenshots: Visual aids (UI screenshots, console logs, or Shopify Admin settings) should be used whenever a behavior is difficult to describe in text.
Requests: The AI may request these materials at any time to verify that a logic gate (like a metafield check) is being met by the actual store data.