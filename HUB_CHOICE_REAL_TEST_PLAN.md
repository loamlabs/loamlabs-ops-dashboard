# Hub-choice tool: the throwaway REAL test (one draft, then undo). NOT RUN.

Written by Backend 2, 2026-11-05, for branch `hub-choice`. Nothing below has been done. It needs Jerry to type exactly **`RUN HUB CHOICE LIVE TEST`**.
Everything is a DRAFT product that is deleted at the end; the only live thing touched, for a few minutes, is the rim's rule list (appended, then restored byte for byte).

## What this test proves (and what the fake-store tests cannot)
1. `productCreate` with two `productOptions` at Admin API 2025-01 makes a DRAFT with one starting variant.
2. `productVariantsBulkCreate` with `optionValues` (which creates the new option values), `price`, `inventoryPolicy`, `inventoryItem.tracked` and variant `metafields` in one call, for 11 more variants.
3. `productVariantsBulkUpdate` sets the first variant's price, policy and metafields.
4. The two variant metafields (`build_components`, `build_variant_recipe`) are stored and read back unchanged, and their definitions are accepted.
5. 12 rules appended to one rim's `custom.pre_configured_wheel_rules` in one write with `compareDigest`, the old rules byte-identical, then restored by undo.
6. `productDelete` removes the variants and their metafields.
7. Read paging (`getPartProduct`, `readBackHub`) on real data.

## Preconditions (all must be true; stop if not)
- [ ] The Supabase tables of `SIGNATURE_TOOL_TABLES.sql` exist (they do since 2026-11-03). `SIGNATURE_PRICE_BASIS.sql` is NOT needed for this test and stays unrun.
- [ ] `custom.build_variant_recipe` exists as a **variant** metafield definition (type json) (Agent C creates it; with Storefront access if the page will read it). If it does not exist yet the write still works (the type is sent) but the page cannot read it; say so in the result.
- [ ] Backend 1's `data/hub_choice_spoke_lengths.csv` has been regenerated with the e*thirteen **Sidekick Pro** front (the table in the repo was calculated with the plain Sidekick front: the tool drops those variants with `LENGTHS_FOR_OTHER_PARTS` until it is regenerated). For the test it is fine to run without e*thirteen.
- [ ] Agent C's catalogue (or a hand-written setup) names the real ids: the Reserve 30|DH rim variants (29" 32h and 27.5" 32h), the Sapim Race builder variant `Black / -` of the **54-variant product 9737461760307**, the black brass nipple variant, and the hub product ids per spacing.
- [ ] The scheduled build guard is **not** about to run: it runs live at 14:35 and 19:30 UTC and it includes DRAFT masters. Start the test at least 20 minutes before a slot and finish before it (the whole test is about 10 minutes). If the guard did run while the draft existed it would only switch the out-of-stock e*thirteen variants off on the draft and write `build_guard_state` there; undo deletes the draft anyway, but check the result.
- [ ] Nobody edits the Reserve 30|DH rim product in Shopify admin during the test.
- [ ] Quiet window is NOT required (draft only), but do not run it during an order rush.

## Method (same as the first tool's real test on 2026-11-03)
The real tool code (`planHubChoice`, `createBuild`, `undoRun` from the `hub-choice` branch) is run **from Backend 2's machine** against the real store and real Supabase with a one-time key, so no dashboard secret has to be shared and nothing is deployed. The HTTP routes and the page are NOT exercised by this test (they are covered by the fake-store handler tests); they are exercised later, after the branch is merged and deployed, with a plan (no create).

## Steps
1. **Save the "before" evidence** (read-only): the rim's current `custom.pre_configured_wheel_rules` text and its sha256 (`data/hubtest_rim_BACKUP.json`), the list of products tagged `loamlabs-build` (10 masters), and the guard dry run output (`data/hubtest_guard_before.txt`).
2. **Plan** the throwaway: name `TEST DELETE ME Reserve 30|DH Mullet`, the real setup and length table. Save `data/hubtest_PLAN.json`. Expect: no blockers; 12 variants (15 with Onyx); the dropped list explained; per-variant prices; 12 new rules; `bytesAfter` well under 131,072. If a blocker appears: stop, do not create.
3. **Check the plan against Agent C's matrix**: prices differ from `data/hub_choice_matrix.csv` by the assembly difference (the tool uses the builder's table, Agent C's matrix used $80 per wheel for every hub); the colour lists (Project321 at spacing C is Black and Silver); the lengths. Stop on any surprise you cannot explain.
4. **Create** (`belowFloorOk` only if the plan says some variants are below the floor and Jerry accepts it). Expect HTTP-style result `ok`, `verified: true`, `variantCount` = the plan's, rim rules `N to N+12`. Save `data/hubtest_CREATED_readback.json`.
5. **Read back independently** (a second, separate read, not the tool's own): status DRAFT, `publishedAt` empty, tags exactly `loamlabs-build`, template `loamlabs-build`, in no collection, options `Axle spacing` and `Hub model` with the planned values, N variants with the planned option pairs and prices, policy CONTINUE, tracked, quantity 0, `build_components` and `build_variant_recipe` present on each, `build_guard_state` and `build_guard_off` empty, `seo.hidden` = 1, **no** `custom.freehub` or `custom.freehub_variant_map` at product level, shared `build_recipe` has no hub rows and `brakeStyle` 6-Bolt. Check one variant's `build_variant_recipe` against the contract (`hubModel`, `spacing`, `ruleName`, `frontHub`, `rearHub`, `hubColors`, `freehubs`, `freehubVariantMap`) and that its `ruleName` exists on the rim with `masterVariantGid` = that variant.
6. **Guard dry run** on the draft (read-only, `node run-build-guard-locally.js`, no `--live`): it must list the new variants as guarded builds (DRAFT is included) and decide only what the data says (the e*thirteen variants are out of stock today). Save `data/hubtest_guard_dryrun.txt`. This also proves the paging and grouped email lines against real data.
7. **Undo** (typed `UNDO <runId>`): the rim's rule text equals the saved backup (same sha256), the draft is gone (status lookup null), the run is `undone`, no lock rows left, the master count is back to 10. Save `data/hubtest_UNDO_proof.json`.
8. **Report**: what worked, what did not, the exact errors; entry in `seo-audit/ADMIN_CHANGES_UNDO.md` for the run.

## Abort rules
Any mismatch in step 5 or 6: stop creating anything else and run step 7 at once. If undo reports `ROLLBACK_INCOMPLETE`, do not retry blindly: the run record in Supabase names the rim and the saved old rules text; restore that rim by hand first, then delete the draft in admin.

## If something at the Shopify API level fails
- `productCreate` refuses `productOptions` or the first variant: fall back to `productSet` (one call that creates the product, options and variants, up to its variant limit). That is a code change in `lib/signature-build/hub/shopify.js` only.
- `productVariantsBulkCreate` refuses variant metafields: create the variants first, then write the two metafields with `metafieldsSet` in batches of 25.
- A write succeeded but the read-back differs (Shopify re-formats JSON): the tool compares JSON by content, so only a real difference fails.

## Not covered by this test
The storefront (the page's option picker, the Customize link, `hubPriceCents` matching, the price cache above 250 ids), the real order webhook with a hub-choice master line (Backend 1 checked it on fake orders), and Active/published behaviour (nothing is ever activated).

## Update 2026-11-05 (stage 2 prep): what is ready and the proposed time
Ready: the variant metafield definition `custom.build_variant_recipe` exists (json, storefront PUBLIC_READ); Backend 1's length table was regenerated at 19:38 with the Sidekick Pro front (so e*thirteen is no longer dropped); Agent C's catalogue exists and the adapter reads it; the four setups are in `agent-prompts\data\hub_choice_setups\` and the four dry-run plans show no blockers.
Use `setup_reserve-30-dh-mullet.json` renamed to `TEST DELETE ME Reserve 30|DH Mullet` for the throwaway (it is the product that appends 15 rules to a live rim; the rim is restored byte for byte by undo).
Still needed: Jerry's typed phrase and a time. Proposed: **Friday Nov 6, 17:00 to 17:40 UTC (12:00 to 12:40 pm EST)**: more than 2 hours after the 14:35 UTC guard and the Watcher (about 14:00 to 15:00 UTC), and 2 hours before the BTI cron window (any minute from 19:00 to 19:59 UTC on Vercel Hobby) and the 19:30 UTC guard. An alternative is 21:00 to 23:00 UTC (4 to 6 pm EST).
