# Alpina stock from Hoss (README)

**What it does.** Every 3 days a small job signs in to Hoss Active Sports Group (Jerry's Alpina distributor), reads the 8 Alpina spoke product pages, and decides which of our Alpina variants may be sold. An Alpina spoke Hoss does not have in stock is turned to **sold out** (inventory policy DENY); when Hoss has it again it goes back to **continue selling** (CONTINUE). Prices are never touched. Nothing here deletes anything.

**Where it runs.** On Jerry's UGREEN NAS (Docker, home IP), not on Vercel (datacenter IPs get blocked, the 5 to 10 second pacing does not fit a serverless time limit, and it keeps the Hoss login off Vercel). The code is plain Node (`lib/alpina-hoss*.js`), no new package. It needs `.env` values: `HOSS_LOGIN_USER`, `HOSS_LOGIN_PASSWORD` (Jerry sets them himself), `SHOPIFY_SHOP_NAME`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` (the app the other hand-run commands use), `RESEND_API_KEY`, `REPORT_EMAIL` (alerts).

## The rule (as built)
| Variant | Orderable (CONTINUE) when | Otherwise |
|---|---|---|
| Retail bundle (8 products `alpina-<model>-<hub>-spokes`; options Color / Length / Spoke Count 14, 18, 20, 26, 30, 34, 38) | Hoss stock for that model + hub type + color + length is **>= the bundle size** | DENY (shows sold out) |
| Builder-part length variant (7 hidden products `alpina-<extralight or ultralight>-<round or aero>-<hub>`, options Color / Length) | Hoss stock is **>= THRESHOLD** (config `--threshold` or `ALPINA_THRESHOLD`, default **32**) | DENY |
| The "-" placeholder variant of a builder product (it carries the price) | never touched | |
| Anything with no Hoss row, or a Hoss value that could not be read (unknown) | never touched ("unmatched" / "unknown" are listed in every report) | |
"Out of stock" and "on backorder" count as 0. Matching key: model (Extralite/Extralight, Ultralite/Ultralight, Round/Aero) + hub type (J-bend/straight-pull) + color + length in mm (+ the bundle size for retail).

## Safety (all built in, all tested)
- **Baseline first.** Until Jerry approves, every run is a BASELINE: it reads, plans, emails the proposal and writes nothing (`state.json` `baselineApproved: false`). The first write run is `--apply --approve-baseline --limit <the number you reviewed>`; later runs just use `--apply`.
- **One reading is enough** to turn a variant off (the safe direction); turning it back on also needs one reading, only when the page passes its sanity checks (Jerry, Nov 22: no two-run confirmation with a 3-day gap).
- **Flip cap:** at most 5% of the matched variants (about 446), never fewer than 40, change state in one run. Over the cap = nothing is written and an email says so (`--limit N` raises it for one run).
- **Never close a whole product on one run;** a product whose orderable share would fall to under 3%, or more than 30 points since the last accepted reading (kept in `state.json`), is held and reported.
- **All or nothing:** if any of the 8 pages fails or does not parse (fewer than 90% of its known variant count, or more than 20% unreadable stock values), the whole run changes nothing.
- **Undo file first** (`alpina_undo_<date>.json`), changes written one product at a time (batches of 100), every product **read back**; a mismatch or write error stops the run and emails. Undo: `node lib/alpina-hoss-undo.js <undo file>`.
- **Polite reader:** user agent `LoamLabsStockReader/1.0 (+info@loamlabsusa.com)`; fetches robots.txt itself and stops if a path it needs is disallowed for it (the `*` group applies); 8 product pages + login + robots.txt, one at a time, **5 to 10 seconds apart**; the only form it submits is the login form; never touches the cart; never clicks.
- **Stops at** the first 403, 429, captcha / "verify you are human" / challenge page, login failure or redirect loop, lost session, or a page that does not parse; at most one retry (network error or a 5xx); then **one alert email** (Resend) with the reason; stock is left as it was.

## Schedule and manual runs
- **Interval:** `ALPINA_INTERVAL_DAYS` (default **3**). The scheduler calls the command **daily at 5:40 am EST (10:40 UTC)** with `--scheduled`; the command skips itself unless 3 days have passed since the last attempt. 5:40 am is before the 9:00 am Watcher run and far from the 2:00 to 3:00 pm BTI sync and 7:00 to 7:45 pm windows. (Calling it daily and letting the interval decide avoids "every 3rd day of the month" gaps at month ends.)
- **Scheduled command (container cron):** `node lib/alpina-hoss-cli.js --live-read --apply --scheduled --out /data/alpina --state /data/alpina/state.json`
- **Manual run any time (read and plan only):** `node lib/alpina-hoss-cli.js --live-read --force --out /data/alpina`
- **Manual run that writes:** add `--apply` (after the baseline approval).
- **Dry run on saved pages (no Hoss, writes nothing):** `node lib/alpina-hoss-cli.js --saved "C:\...\hoss-pages" --out "C:\...\alpina_out"`; add `--store store.json` to use a saved copy of the store instead of reading Shopify.

## Files it writes (in `--out`)
`alpina_baseline_<date>.txt` or `alpina_apply_<date>.txt` (the report), `alpina_proposals_<date>.json`, `hoss_readings_<date>.json` (what Hoss showed), `alpina_undo_<date>.json`, `alpina_stopped_<date>.txt` (a stopped run), `state.json`.

## Tests
`node --test tests/alpina-hoss.test.js`: 27 tests, built on 8 made-up Hoss-style pages (fake SKUs and stock numbers in the same shape and variant counts as the real pages; made by tests/fixtures/alpina/make-fake-fixtures.js) and a copy of our 8,918 Alpina variants; the fetch layer runs against a local mock site. No real site is touched.

## Jerry's decisions (Nov 22) recorded
- **Builder threshold is 32** (the most spokes one build can need of a single length: a 32h rim). `ALPINA_THRESHOLD` / `--threshold` change it.
- **Standalone command, approved exception.** Jerry approved this job as a standalone command instead of a Vendor Watcher rule. It is an exception to "Vendor Watcher alone controls continue-selling at zero stock" and it applies to **Alpina spoke variants only** (the 8 retail bundle products and the 7 hidden builder-part products). Nothing else in the store is ever written by it.
- **No new product.** There is no Extralite Round Straight-Pull builder product and none is planned. The builder products cover only 256 to 306 mm; that gap is accepted for now. **Default for Agent B's Step 3 length check** (Jerry can overrule): a build whose length has no variant on the builder product is **"cannot be checked"**: not blocked and not confirmed, and no message is shown.
- NAS setup: `docs/ALPINA_NAS_SETUP.md` (click by click) and `docker/alpina/` (compose file, job script, optional Dockerfile, `.env.example`).

## Saved pages mode (Nov 22 night, the NAS default)
Hoss's login has a Cloudflare human check, and a program must not get around it, so the NAS job does **not** sign in. `ALPINA_SOURCE=pages` (the NAS default) makes it read the 8 product pages Jerry saves by hand into `/data/pages` (NAS folder `docker/alpina/data/pages`): `lib/alpina-hoss-pages.js` identifies each page by its title, uses the newest file per page, refuses anything older than `ALPINA_PAGES_MAX_AGE_DAYS` (default 4, by file date), a missing, half-saved or unparseable page (all-or-nothing), and for the 5:40 am check skips quietly unless all 8 pages are newer than the last read and different from it; one alert email when the pages have grown too old. `--live-read` still exists in the code, but with `ALPINA_SOURCE=pages` it refuses to run. Commands: `--pages <folder>` (add `--scheduled`, `--force`, `--apply` as before) and `--pages-status`. Everything after the read is unchanged. Click path: `docs/ALPINA_NAS_SETUP.md`.

## Chrome helper (Nov 22 night)
To avoid saving the 8 pages by hand, a small Chrome extension in Jerry's own signed-in Chrome (tools/alpina-chrome-helper) loads the 8 product pages every 2 to 3 days and sends the stock numbers (prices removed) to a receiver inside the NAS container (lib/alpina-hoss-receiver.js, port 8765, token), which writes the same page files the saved-pages mode reads. It never logs in, never touches cookies or passwords, and stops at any login page, check, 403 or 429 (one alert email, stays stopped until Jerry resumes). Install steps: docs/ALPINA_CHROME_HELPER.md.
