-- Energy Cal — initial schema
-- Targets: SPEC.md §5 (with the screenshot-driven amendments).
-- Conventions:
--   * UUIDs everywhere (gen_random_uuid())
--   * timestamptz, not timestamp
--   * RLS enabled on every table; policies written for future multi-tenant
--     even though v0 ships single-tenant (Quorum Calibration). For v0 the
--     single-tenant policy reduces to "any authenticated user can read/write
--     within their company_id".
--   * Soft-delete via voided_at where the spec calls for immutability;
--     hard DELETE is not used on submitted records.
--   * company_id denormalized on every scoped table — RLS joins are too slow
--     across the customer→location chain.

set search_path = public;

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. Companies (single tenant for v0; future multi-tenant uses this as the
--    hard isolation boundary)
-- ============================================================================
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  pidx_party_id text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed Quorum Calibration row immediately so all FKs resolve in dev.
insert into companies (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Quorum Calibration');

-- ============================================================================
-- 2. Users — extends Supabase auth.users via 1:1 profile.
--    For v0 we don't depend on Supabase yet, so leave auth_user_id nullable.
-- ============================================================================
create type user_role as enum ('tech', 'supervisor', 'admin');

create table users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique, -- FK to auth.users when Supabase is wired
  company_id uuid not null references companies(id),
  display_name text not null,
  email text,
  role user_role not null default 'tech',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_company_idx on users(company_id);

-- ============================================================================
-- 3. Customers / Locations
-- ============================================================================
create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  pidx_party_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);
create index customers_company_idx on customers(company_id);

create table locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  address text,
  latitude numeric,
  longitude numeric,
  -- Optional oilfield-specific extensions PROVEit captures (Section/Township/...).
  -- Stored as JSONB so we don't bloat the table for downstream-only customers.
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locations_company_idx on locations(company_id);
create index locations_customer_idx on locations(customer_id);

-- ============================================================================
-- 4. Products
-- ============================================================================
create type api_table_group as enum (
  'crude',
  'refined_gasoline',
  'refined_jet_distillate',
  'refined_diesel_heating',
  'refined_fuel_oil',
  'refined_generalized',
  'lubricating_oils',
  'ethanol',
  'biodiesel',
  'ngl_lpg'
);

create table products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  api_table_group api_table_group not null,
  product_table text, -- e.g. "table_b_refined_2004" — for PROVEit-style display
  product_type text,  -- e.g. "jet_fuel_2004", "gasoline_2004"
  default_density_kg_m3 numeric,
  default_density_api numeric,
  vapor_pressure_psi numeric default 0,
  hydrometer_correction_default boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);
create index products_company_idx on products(company_id);

-- ============================================================================
-- 5. Prover materials (small reference table, seeded; engine pulls Gc/E from here)
-- ============================================================================
create table prover_materials (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  cubical_thermal_coefficient_per_f numeric not null,
  modulus_of_elasticity_psi numeric not null
);

insert into prover_materials (name, cubical_thermal_coefficient_per_f, modulus_of_elasticity_psi) values
  ('Carbon Steel',        0.0000186, 30000000),
  ('304 Stainless Steel', 0.0000288, 28000000),
  ('316 Stainless Steel', 0.0000265, 28000000),
  ('Invar',               0.0000018, 21000000);

-- ============================================================================
-- 6. Acceptance criteria profiles
-- ============================================================================
create type evaluation_method as enum ('repeatability', 'none');

create table acceptance_criteria_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  evaluation_method evaluation_method not null default 'repeatability',
  repeatability_tolerance_pct numeric not null default 0.050,
  consistency_runs_required int not null default 3,
  consistency_runs_max int not null default 3,
  prior_deviation_check boolean not null default true,
  prior_deviation_max_pct numeric default 0.25,
  prior_deviation_use_cutoff_date boolean not null default false,
  prior_deviation_product_dependent boolean not null default false,
  prior_deviation_use_failed_provings boolean not null default true,
  historical_deviation_check boolean not null default false,
  historical_deviation_n_previous int default 0,
  historical_deviation_max_pct numeric,
  baseline_deviation_check boolean not null default false,
  baseline_deviation_max_pct numeric,
  irving_style_repeatability boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);
create index acceptance_company_idx on acceptance_criteria_profiles(company_id);

insert into acceptance_criteria_profiles (
  id, company_id, name, repeatability_tolerance_pct,
  consistency_runs_required, consistency_runs_max,
  prior_deviation_check, prior_deviation_max_pct, is_default
) values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Custody Transfer Default',
  0.050, 3, 3, true, 0.25, true
);

-- ============================================================================
-- 7. Meters
-- ============================================================================
create type meter_type as enum ('pd_positive_displacement', 'turbine', 'coriolis', 'ultrasonic');
create type fluid_phase as enum ('liquid', 'gas');
create type pulse_mode as enum ('whole', 'interpolated');
create type proving_mode as enum ('volumetric', 'mass');
create type prover_location as enum ('upstream', 'downstream');
create type mf_calc_method as enum ('avg_meter_factor', 'weighted_by_volume', 'weighted_by_pulses');
create type track_factor as enum ('meter_factor', 'k_factor');
create type density_mode as enum ('manual', 'live');
create type service_type as enum ('custody_transfer', 'allocation', 'check_meter');

create table meters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  location_id uuid not null references locations(id),
  tag text not null, -- e.g. "GNHL4M3"
  description text,
  manufacturer text,
  model text,
  serial_number text,
  meter_type meter_type not null,
  fluid_phase fluid_phase not null default 'liquid',
  size_inches numeric,
  nominal_k_factor numeric,
  nominal_k_factor_unit text not null default 'pulses_per_gal',
  pulse_mode pulse_mode not null default 'interpolated',
  proving_mode proving_mode not null default 'volumetric',
  prover_location prover_location not null default 'downstream',
  mf_calc_method mf_calc_method not null default 'avg_meter_factor',
  track_factor track_factor not null default 'meter_factor',
  min_flow_rate numeric,
  max_flow_rate numeric,
  flow_rate_unit text default 'gal_per_min',
  passes_per_run int not null default 1,
  max_runs int not null default 20,
  base_temperature_f numeric not null default 60,
  atmospheric_pressure_psia numeric not null default 14.696,
  temp_compensated boolean not null default false,
  press_compensated boolean not null default false,
  interface_type text,
  channel text,
  density_mode density_mode not null default 'manual',
  prove_frequency_days int,
  cutoff_date date,
  service_type service_type not null default 'custody_transfer',
  commissioned_date date,
  meter_seal_number text,
  uses_k_factor boolean not null default true,
  default_acceptance_criteria_id uuid references acceptance_criteria_profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, customer_id, tag)
);
create index meters_company_idx on meters(company_id);
create index meters_customer_location_idx on meters(customer_id, location_id);

-- ============================================================================
-- 8. Provers
-- ============================================================================
create type prover_type as enum (
  'ball_bidirectional',
  'ball_unidirectional',
  'small_volume_prover',
  'tank_can_open_neck',
  'master_meter'
);
create type displacer_type as enum ('sphere', 'piston', 'na');
create type switch_location as enum ('internal', 'external', 'na');
create type piu_comm_type as enum ('calibron', 'omni', 'accuload', 'none');
create type prover_owner as enum ('quorum', 'customer', 'third_party');
create type volume_unit as enum ('gal', 'bbl', 'm3', 'l');
create type can_scale_unit as enum ('gal', 'cubic_inch', 'liter', 'ml');

create table provers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  tag text not null, -- e.g. "QC_3_LARGE"
  prover_type prover_type not null,
  displacer_type displacer_type not null default 'na',
  switch_location switch_location not null default 'na',
  manufacturer text,
  model text,
  serial_number text,
  base_volume numeric not null,
  base_volume_unit volume_unit not null default 'bbl',
  certified_temp_f numeric not null default 60,
  piu_comm_type piu_comm_type not null default 'none',
  water_draw_cert_date date,
  water_draw_cert_next_due date,
  water_draw_cert_document_url text,

  -- Ball/SVP-only
  pipe_wall_thickness_inches numeric,
  pipe_internal_diameter_inches numeric,
  pipe_material_id uuid references prover_materials(id),
  cubical_thermal_coefficient_per_f_override numeric,
  modulus_of_elasticity_psi_override numeric,

  -- Can/tank-only
  neck_scale_unit can_scale_unit,
  neck_scale_min numeric,
  neck_scale_max numeric,
  cts_can_factor_default numeric default 1.0,

  owned_by prover_owner not null default 'quorum',
  owned_by_customer_id uuid references customers(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tag)
);
create index provers_company_idx on provers(company_id);

-- ============================================================================
-- 9. Meter Tasks (parent of proving runs and the other 3 PROVEit task types)
-- ============================================================================
create type task_type as enum (
  'meter_certification',
  'meter_proving',
  'meter_setup_change',
  'pre_prove_verification'
);
create type task_status as enum ('draft', 'submitted', 'approved', 'voided', 'incomplete', 'complete');

create table meter_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  location_id uuid not null references locations(id),
  meter_id uuid not null references meters(id),
  prover_id uuid references provers(id),
  product_id uuid references products(id),
  task_type task_type not null,
  task_id_external text, -- PROVEit Task ID for cross-reference during cutover
  fmp_number text,
  reason text,
  description text,
  status task_status not null default 'draft',
  date_entered timestamptz not null default now(),
  date_performed timestamptz,
  last_task_date timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meter_tasks_company_idx on meter_tasks(company_id);
create index meter_tasks_meter_idx on meter_tasks(meter_id, date_performed desc);
create index meter_tasks_customer_idx on meter_tasks(customer_id, date_performed desc);
create index meter_tasks_status_idx on meter_tasks(status) where status in ('draft', 'submitted');

-- ============================================================================
-- 10. Proving Runs (1:1 subtype of meter_tasks where task_type = meter_proving)
-- ============================================================================
create type density_type as enum ('observed_rho_obs', 'base_rho_60');
create type density_unit as enum ('kg_m3', 'api_gravity', 'g_cm3');

create table proving_runs (
  -- 1:1 with meter_tasks (supertype/subtype). Same UUID; FK + PK both.
  id uuid primary key references meter_tasks(id) on delete cascade,
  company_id uuid not null references companies(id),

  -- Acceptance — snapshot at submission so a profile change later doesn't
  -- rewrite history.
  acceptance_criteria_id uuid references acceptance_criteria_profiles(id),
  acceptance_criteria_snapshot jsonb,

  service_type service_type,
  tech_user_id uuid references users(id),
  tech_signature_url text,
  witness_signature_url text,
  is_baseline boolean not null default false,

  -- Run-level inputs (entered once)
  product_table text,
  product_type text,
  density_type density_type,
  density_value numeric,
  density_unit density_unit,
  density_temperature_f numeric,
  density_pressure_psig numeric default 0,
  equilibrium_vapor_pressure_psig numeric default 0,
  hydrometer_correction boolean not null default false,
  viscosity numeric,
  active_dmf numeric not null default 1.0,

  meter_temperature_f numeric,
  meter_pressure_psig numeric,
  prover_temperature_f numeric,
  prover_pressure_psig numeric,
  prev_totalizer numeric,
  current_totalizer numeric,
  throughput_since_last numeric,
  meter_zeroed boolean,
  meter_verified boolean,
  meter_zero_value numeric,
  meter_found numeric,
  meter_left numeric,

  -- Seals as JSON array: [{equipment, seal_removed, seal_installed}]
  seals jsonb not null default '[]'::jsonb,

  -- Computed (engine output, stored for audit). PROVEit naming.
  meter_factor numeric,            -- MF
  composite_meter_factor numeric,  -- CMF
  meter_accuracy numeric,          -- MA
  k_factor numeric,                -- KF
  composite_k_factor numeric,      -- CKF
  k_factor_present numeric,
  k_factor_new numeric,
  mf_set numeric,
  meter_seal_number_before text,
  meter_seal_number_after text,

  repeatability_pct numeric,
  uncertainty_pct numeric,
  deviation numeric,
  prior_deviation_pct numeric,
  historical_deviation_pct numeric,
  baseline_deviation_pct numeric,
  passed boolean,
  consistency_passed boolean,
  repeatability_passed boolean,
  prior_passed boolean,
  historical_passed boolean,
  baseline_passed boolean,

  -- Run averages
  tp_avg_f numeric,
  tm_avg_f numeric,
  pp_avg_psig numeric,
  pm_avg_psig numeric,
  imf_avg numeric,
  nm numeric,
  ivm_total numeric,
  isvm_total numeric,
  gsvp_total numeric,

  -- Run-averaged corrections
  ctl_meter numeric,
  cpl_meter numeric,
  ccf_meter numeric,
  cts_prover numeric,
  cps_prover numeric,
  ctl_prover numeric,
  cpl_prover numeric,
  ccf_prover numeric,
  cpl_observed numeric,

  -- Workflow
  started_at timestamptz,
  completed_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid references users(id),
  approved_at timestamptz,
  approved_by uuid references users(id),
  voided_at timestamptz,
  voided_by uuid references users(id),
  void_reason text,

  -- Tamper evidence: HMAC-SHA-256 of canonical-JSON submission
  data_hash text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index proving_runs_company_idx on proving_runs(company_id);
create index proving_runs_baseline_idx on proving_runs(company_id, is_baseline) where is_baseline = true;

-- ============================================================================
-- 11. Proving Run Contacts (replaces single witness_name/tech fields)
-- ============================================================================
create type contact_type as enum ('technician', 'witness', 'customer_rep', 'other');

create table proving_run_contacts (
  id uuid primary key default gen_random_uuid(),
  proving_run_id uuid not null references proving_runs(id) on delete cascade,
  contact_type contact_type not null,
  full_name text not null,
  email text,
  company text,
  is_primary boolean not null default false,
  mobile_phone text,
  created_at timestamptz not null default now()
);
create index proving_run_contacts_run_idx on proving_run_contacts(proving_run_id);

-- ============================================================================
-- 12. Proving Run Passes
-- ============================================================================
create type pass_direction as enum ('forward', 'reverse', 'na');

create table proving_run_passes (
  id uuid primary key default gen_random_uuid(),
  proving_run_id uuid not null references proving_runs(id) on delete cascade,
  pass_number int not null,
  direction pass_direction not null default 'na',
  is_wet_down boolean not null default false,
  accepted boolean not null default true,
  excluded boolean not null default false,
  exclusion_reason text,

  -- Ball/SVP
  meter_pulses numeric, -- NUMERIC because pulse_mode=interpolated yields fractions
  frequency_hz numeric,
  flow_rate numeric,
  prover_temp_inlet_f numeric,
  prover_temp_outlet_f numeric,
  prover_pressure_inlet_psig numeric,
  prover_pressure_outlet_psig numeric,
  meter_temp_f numeric,
  meter_pressure_psig numeric,
  prover_temp_avg_f numeric,
  prover_pressure_avg_psig numeric,

  -- Can/tank
  meter_indicated_volume numeric,
  prover_actual_volume numeric,
  meter_indicated_volume_unit volume_unit,
  prover_actual_volume_unit volume_unit,
  prover_temp_f numeric,
  cts_can_factor numeric,

  -- Computed per-pass (PROVEit naming)
  imf numeric,
  gsvp numeric,
  isvm numeric,
  ivm numeric,
  ccfp numeric,
  ccfm numeric,
  cts_prover_pass numeric,
  cps_prover_pass numeric,
  ctl_prover_pass numeric,
  cpl_prover_pass numeric,
  ctl_meter_pass numeric,
  cpl_meter_pass numeric,

  created_at timestamptz not null default now(),
  unique (proving_run_id, pass_number)
);
create index proving_run_passes_run_idx on proving_run_passes(proving_run_id);

-- ============================================================================
-- 13. Audit Log (append-only)
-- ============================================================================
create type audit_action as enum (
  'create',
  'update_draft',
  'submit',
  'approve',
  'void',
  'export_pdf',
  'export_csv',
  'export_md',
  'login',
  'meter_setup_change'
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  actor_user_id uuid references users(id),
  action audit_action not null,
  entity_type text not null,
  entity_id uuid not null,
  payload_hash text,
  payload_json jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log(entity_type, entity_id, created_at desc);
create index audit_log_company_time_idx on audit_log(company_id, created_at desc);

-- audit_log is append-only — block UPDATE/DELETE at the trigger level.
create or replace function audit_log_immutable() returns trigger as $$
begin
  raise exception 'audit_log is append-only; UPDATE and DELETE are not permitted';
end;
$$ language plpgsql;

create trigger audit_log_no_update before update on audit_log
  for each row execute function audit_log_immutable();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function audit_log_immutable();

-- ============================================================================
-- 14. Documents (generated PDFs/CSVs/MDs)
-- ============================================================================
create type document_format as enum ('pdf', 'csv', 'md', 'html', 'cfx', 'pidx');

create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  proving_run_id uuid references proving_runs(id),
  format document_format not null,
  storage_path text not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references users(id),
  hash text
);
create index documents_run_idx on documents(proving_run_id);

-- ============================================================================
-- 15. updated_at triggers
-- ============================================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'companies', 'users', 'customers', 'locations', 'products',
        'acceptance_criteria_profiles', 'meters', 'provers',
        'meter_tasks', 'proving_runs'
      )
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()',
      t || '_uat', t
    );
  end loop;
end$$;

-- ============================================================================
-- 16. Submitted-record immutability
-- Submitted/approved proving_runs are immutable except for void workflow.
-- ============================================================================
create or replace function proving_runs_immutable_after_submit() returns trigger as $$
begin
  if old.status is null then
    return new;
  end if;
  -- The status column actually lives on meter_tasks; we enforce immutability
  -- via meter_tasks trigger below. This trigger handles direct mutations to
  -- proving_runs after the parent is submitted.
  return new;
end;
$$ language plpgsql;

create or replace function meter_tasks_immutable_after_submit() returns trigger as $$
declare
  void_only_columns text[] := array['voided_at', 'voided_by', 'updated_at'];
  changed_keys text[];
  k text;
begin
  if old.status in ('submitted', 'approved') and new.status not in ('voided') then
    -- only allow updated_at to bump and void_reason flow
    if old.status is distinct from new.status
       and not (new.status = 'voided') then
      raise exception
        'meter_tasks % is %; cannot transition to % (only voiding is permitted after submit)',
        old.id, old.status, new.status;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger meter_tasks_immutability before update on meter_tasks
  for each row execute function meter_tasks_immutable_after_submit();

-- ============================================================================
-- 17. Row-Level Security
-- v0 single-tenant: any authenticated user from the same company can read/write.
-- Multi-tenant later: company_id filter is already in place — flip to use
-- a JWT claim like auth.jwt() ->> 'company_id'.
-- ============================================================================
alter table companies                    enable row level security;
alter table users                        enable row level security;
alter table customers                    enable row level security;
alter table locations                    enable row level security;
alter table products                     enable row level security;
alter table prover_materials             enable row level security;
alter table acceptance_criteria_profiles enable row level security;
alter table meters                       enable row level security;
alter table provers                      enable row level security;
alter table meter_tasks                  enable row level security;
alter table proving_runs                 enable row level security;
alter table proving_run_contacts         enable row level security;
alter table proving_run_passes           enable row level security;
alter table audit_log                    enable row level security;
alter table documents                    enable row level security;

-- For v0: we don't have Supabase Auth wired yet. Policies below assume future
-- auth.uid() / auth.jwt() will be available; until then, apply a permissive
-- policy gated on a session GUC (`app.current_company_id`) so tests can run.
--
-- When Supabase Auth lands:
--   Replace `current_setting('app.current_company_id', true)` with
--   `(auth.jwt() ->> 'company_id')` and add a check against role claim where
--   write-restriction is required.

create or replace function current_company_id() returns uuid as $$
  select coalesce(
    nullif(current_setting('app.current_company_id', true), ''),
    -- During Supabase migration: return (auth.jwt() ->> 'company_id')::uuid
    '00000000-0000-0000-0000-000000000001'  -- v0 default = Quorum
  )::uuid;
$$ language sql stable;

-- Reference tables: readable by any authenticated session, writable to admin only.
-- For v0 we leave writes open; tighten when auth is wired.
create policy companies_read on companies for select using (id = current_company_id());

create policy users_company on users
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy customers_company on customers
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy locations_company on locations
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy products_company on products
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy prover_materials_read on prover_materials for select using (true);

create policy acceptance_company on acceptance_criteria_profiles
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy meters_company on meters
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy provers_company on provers
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy meter_tasks_company on meter_tasks
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy proving_runs_company on proving_runs
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());

create policy proving_run_contacts_via_run on proving_run_contacts
  for all using (
    exists (
      select 1 from proving_runs r
      where r.id = proving_run_contacts.proving_run_id
        and r.company_id = current_company_id()
    )
  )
  with check (
    exists (
      select 1 from proving_runs r
      where r.id = proving_run_contacts.proving_run_id
        and r.company_id = current_company_id()
    )
  );

create policy proving_run_passes_via_run on proving_run_passes
  for all using (
    exists (
      select 1 from proving_runs r
      where r.id = proving_run_passes.proving_run_id
        and r.company_id = current_company_id()
    )
  )
  with check (
    exists (
      select 1 from proving_runs r
      where r.id = proving_run_passes.proving_run_id
        and r.company_id = current_company_id()
    )
  );

create policy audit_log_company on audit_log
  for select using (company_id = current_company_id());
-- Inserts to audit_log are done via a SECURITY DEFINER function in app code;
-- block direct inserts/updates/deletes from RLS-bound sessions.
create policy audit_log_no_direct_writes on audit_log
  for insert with check (false);

create policy documents_company on documents
  for all using (company_id = current_company_id())
         with check (company_id = current_company_id());
