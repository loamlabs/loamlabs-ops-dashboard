-- SIGNATURE_TOOL_TABLES.sql
-- Four small tables for the Create Signature Build tool (plans, runs, locks, failed logins).
-- NOT RUN. Jerry runs this once in Supabase > SQL Editor when told. Safe to run twice (IF NOT EXISTS).
-- Only the server (service role key) uses these tables; row level security is on with no policies, so the public/anon key can read or write nothing.

create table if not exists public.signature_plans (
  plan_id     uuid primary key,
  plan_hash   text not null,
  plan        jsonb not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.signature_runs (
  run_id       uuid primary key,
  fingerprint  text not null,
  status       text not null,           -- creating | created | undone | failed | failed_incomplete
  name         text,
  product_gid  text,
  variant_gid  text,
  record       jsonb,                   -- ids written, each rim's exact old rules text + sha256 (the undo data)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- the same build cannot be created twice while a run for it is creating or created
create unique index if not exists signature_runs_active_fingerprint
  on public.signature_runs (fingerprint) where status in ('creating', 'created');

create table if not exists public.signature_locks (
  lock_key    text primary key,
  holder      text not null,
  expires_at  timestamptz not null
);

create table if not exists public.signature_auth_failures (
  id          bigserial primary key,
  client_key  text not null,
  at          timestamptz not null default now()
);
create index if not exists signature_auth_failures_key_at on public.signature_auth_failures (client_key, at);

alter table public.signature_plans         enable row level security;
alter table public.signature_runs          enable row level security;
alter table public.signature_locks         enable row level security;
alter table public.signature_auth_failures enable row level security;
