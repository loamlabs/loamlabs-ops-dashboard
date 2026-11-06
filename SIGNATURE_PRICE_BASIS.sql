-- SIGNATURE_PRICE_BASIS.sql
-- One small table for the Signature Build price drift report (hub-choice build, step 4).
-- NOT RUN. Jerry runs this once in Supabase > SQL Editor when told. Safe to run twice (IF NOT EXISTS).
-- It holds PRICES ONLY (no customer data). The guard run and the dashboard use the service role key; row level security is on with no policies,
-- so the public/anon key can read or write nothing. The report only ever alerts: it never changes a price in Shopify.
--
-- After running it, the drift report is switched on by setting the environment variable SIGNATURE_DRIFT_REPORT=on
-- (in the GitHub Actions ENV_FILE secret for the build guard, and in Vercel if the endpoint is used). Until then nothing reads or writes this table.

create table if not exists public.signature_price_basis (
  variant_id    text primary key,        -- the master variant (numeric id, as text)
  product_gid   text,
  title         text,
  master_price  numeric,                 -- the master's price when the basis was taken
  parts         jsonb not null,          -- { "<component variant id>": { "role": "front_hub", "price": 240, "label": "..." } }
  taken_at      timestamptz not null default now(),
  reported_sig  text,                    -- the drift already e-mailed for this basis, so the same drift is not e-mailed every day
  updated_at    timestamptz not null default now()
);

alter table public.signature_price_basis enable row level security;
