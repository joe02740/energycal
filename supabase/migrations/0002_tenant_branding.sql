-- 0002 — Tenant branding + suggestions-engine config
-- Lifts multi-tenant work forward from "v1" to active scope.
-- Each row in `companies` IS a tenant (a proving company licensing Energy Cal).
-- Customers (Sprague, Irving, Global) live one level inside a tenant.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Branding + per-tenant config
-- ---------------------------------------------------------------------------
-- branding shape (forward-compatible without schema churn):
--   {
--     display_name?: string,
--     accent_color?: string,           // CSS color, applied as --primary override
--     logo_url?: string,
--     contact_email?: string,
--     default_assumptions?: {
--       throughput_gal_day?: number,   // for $-impact analytics defaults
--       price_per_gal?: number
--     }
--   }
alter table companies
  add column if not exists branding jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Suggestions / health-engine dials (per-tenant)
-- ---------------------------------------------------------------------------
-- suggestion_threshold: 0-100. A rule fires only if its computed confidence
-- ≥ this value. Default high (85) so v0 stays quiet. Turn DOWN per tenant
-- as their dataset matures, never globally.
alter table companies
  add column if not exists suggestion_threshold numeric not null default 85
    check (suggestion_threshold >= 0 and suggestion_threshold <= 100);

-- min_provings_for_baseline: a meter is "establishing" until it has at
-- least N qualifying provings (non-wet-down, accepted, post-cleanup).
-- Default 5 — three for repeatability sanity + buffer. Per tenant so a
-- shop with strict customers can demand more before claims.
alter table companies
  add column if not exists min_provings_for_baseline int not null default 5
    check (min_provings_for_baseline >= 1);

-- ---------------------------------------------------------------------------
-- 3. Seed Quorum's branding + thresholds
-- ---------------------------------------------------------------------------
update companies
   set branding = jsonb_build_object(
     'display_name',  'Quorum Calibration',
     'accent_color',  '#0ea5e9',
     'contact_email', 'measurement@quorumcal.example',
     'default_assumptions', jsonb_build_object(
       'throughput_gal_day', 100000,
       'price_per_gal',      2.00
     )
   )
 where id = '00000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 4. Seed a demo tenant so we can verify isolation in dev / show white-label
-- ---------------------------------------------------------------------------
-- Only the migration-time seed; real demo data flows through application code.
insert into companies (id, name, branding, suggestion_threshold, min_provings_for_baseline)
values (
  '00000000-0000-0000-0000-000000000002',
  'Demo Lab',
  jsonb_build_object(
    'display_name',  'Demo Lab (white-label preview)',
    'accent_color',  '#a855f7',
    'contact_email', 'demo@example.com',
    'default_assumptions', jsonb_build_object(
      'throughput_gal_day', 50000,
      'price_per_gal',      2.50
    )
  ),
  85, 5
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Index for the tenant resolver
-- ---------------------------------------------------------------------------
-- Most lookups will hit by id (UUID PK already indexed). Add a partial index
-- for "find by display_name slug" if/when subdomain routing lands.
-- (No-op for now; left as a comment for the next migration.)
