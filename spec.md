# Proving Platform — v0 Spec

**Working name:** TBD (placeholders: ProveCal, MeterFactor, Custody)
**Author:** Joe (Quorum Calibration)
**Audience:** Claude Code, building Phase 1
**Status:** v0 spec, ready to scaffold

---

## 1. Vision

A modern, browser-based, offline-capable proving and meter management platform that replaces PROVEit and the spreadsheet-driven workflows surrounding it. Built for the service-company side of the proving relationship first (calibration shops doing field work), with an architecture that extends naturally to midsize operators and eventually a measurement analytics layer for the majors.

The v0 product is "PROVEit, but pleasant to use, prettier output, runs in Chrome, doesn't need an install, works offline, owns its own data." The bar is not "more capable than PROVEit" — it is "doesn't make the field tech want to throw the laptop."

The same data spine supports later additions: agentic data enrichment (auto-build wikis on every metered asset), ML on historical meter factor trends, and an AI chat layer that can answer questions across the entire proving history. These are out of scope for v0 but the schema must accommodate them without rewrites.

---

## 2. Scope

### In scope for v0

- Authenticated multi-user web app (single-tenant: Quorum Calibration only)
- Meter records (CRUD)
- Prover records (CRUD) — both **ball/pipe provers** and **can/tank provers**
- Customer + location records (CRUD)
- Product records with API MPMS Chapter 11.1 product group classification
- Proving run entry workflow (manual entry — no serial/Modbus in v0)
- Calculation engine: CTL (API MPMS 11.1), CPL (API MPMS 11.2), meter factor (API MPMS 12.2 for ball, 4.4 for can), repeatability, consistency
- Audit trail and immutable submitted records
- PDF proving certificate generation
- CSV export of proving history
- Markdown export of individual provings
- Offline-first via service worker + IndexedDB; sync on reconnect
- Installable as Chrome PWA with its own icon

### Out of scope for v0 (deferred)

- Serial/Modbus auto-capture from prover/PIU — **v1**
- Multi-tenant (selling to other calibration companies) — **v1**
- Customer-facing portal — **v1.5**
- CFX (Flow-Cal) export — **v1.5**
- PIDX XML export — **v1.5**
- Agentic wiki builder (asset enrichment) — **v2**
- ML on MF trends and drift detection — **v2**
- AI chat support — **v2**
- DWR / time tracking module — **v2** (separate but related product, shares user table)
- OIML R117 / international standards — **v3**

### Explicit non-goals

- Do not try to support every weird oilfield signal on day one. Architecture must be ready; v0 ships with manual entry only.
- Do not try to be FLOWCAL-compatible in v0. Most customers want a PDF that says "yes meter good." That's the deliverable.
- Do not build the mobile-companion layer in v0. The Windows laptop and Android tablet running Chrome are the same UI.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript** | Mature, Vercel-native, SSR + client routes, easy PWA |
| Styling | **Tailwind CSS + shadcn/ui** | Standard, fast, looks professional out of the box |
| Backend | **Supabase** (Postgres + Auth + RLS + Storage) | Postgres under the hood = data is portable forever; RLS handles eventual multi-tenancy; auth is solved |
| Local DB | **Dexie.js** (IndexedDB wrapper) | Robust offline, syncs cleanly with Postgres |
| Service Worker | **Workbox** | Battle-tested PWA caching |
| PDF generation | **Puppeteer** server-side via Vercel function, with HTML+CSS template | Prettier output than react-pdf, easier to iterate on the design |
| State management | **Zustand** for app state, React Query for server state | Both small, both correct for this scale |
| Forms | **react-hook-form + Zod** | Type-safe validation end-to-end |
| Hosting | **Vercel** (frontend) + **Supabase Cloud** (backend) | Zero ops to start |
| Deferred (v1) | `modbus-serial` (Node) / Web Serial API (browser) for prover I/O | Already supported by Chrome on desktop and Android (148+) |

**Total monthly cost at v0 scale:** ~$0 (free tiers cover dozens of users). At ~50 active users with moderate proving volume, expect ~$25–50/month.

---

## 4. Architecture

### High-level

```
┌─────────────────────────────────────────┐
│  Chrome PWA (Windows laptop / Android)  │
│  ─ Next.js app shell (cached)            │
│  ─ React UI                              │
│  ─ Calculation engine (runs locally)     │
│  ─ Dexie / IndexedDB (offline cache)     │
│  ─ Service worker (offline shell)        │
└──────────────────┬──────────────────────┘
                   │ HTTPS (when online)
                   │ Background sync
                   ▼
┌─────────────────────────────────────────┐
│  Supabase                                │
│  ─ Postgres (system of record)           │
│  ─ Auth (email/password, magic link)     │
│  ─ RLS policies (per-company isolation)  │
│  ─ Storage (PDF artifacts)               │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Vercel serverless functions             │
│  ─ /api/pdf — Puppeteer PDF generation   │
│  ─ /api/exports — CSV, MD generation     │
│  ─ /api/audit — append-only audit writes │
└─────────────────────────────────────────┘
```

### Calculation engine principle

**The calculation engine runs entirely in the browser.** No server round-trip required to compute a meter factor. This matters because:

1. It works offline.
2. It's instant — values update as the tech types.
3. The same engine can later be invoked server-side for batch recomputation if needed.

The engine is a pure TypeScript module: `lib/calc/`. Inputs in, outputs out, no side effects. Coefficient tables (API MPMS 11.1) are embedded as JSON data files.

### Offline-first principle

Every read goes through Dexie first, falls back to Supabase. Every write goes to Dexie immediately, queues for Supabase sync. The user never waits on the network for anything except authentication.

---

## 5. Data Model

All tables include `id` (UUID), `created_at`, `updated_at`, `created_by` (UUID → users), and where applicable `voided_at` and `voided_by`. **Records that affect proving outcomes are immutable once `submitted_at` is set** — corrections happen via void + resubmit, never via UPDATE.

### `users`
Standard Supabase auth users. Extended with:
- `display_name`
- `role` (enum: `tech`, `supervisor`, `admin`)
- `company_id` (FK → companies; reserved for future multi-tenant)

### `companies`
- `name`
- `address`
- `pidx_party_id` (optional, for future PIDX exports)
- `logo_url`

(For v0: one row, "Quorum Calibration".)

### `customers`
The companies whose meters Quorum proves.
- `company_id` (the owning service company — Quorum)
- `name` (e.g., "Global Partners", "Irving Oil")
- `pidx_party_id` (optional)

### `locations`
- `customer_id`
- `name` (e.g., "Newington Terminal")
- `address`
- `latitude`, `longitude` (optional)
- `notes`

### `products`
Reference table — comes pre-seeded.
- `name` (e.g., "Gasoline (E10)", "ULSD", "Kerosene", "Crude (light sweet)", "Biodiesel B100", "Ethanol denatured")
- `api_table_group` (enum: `crude`, `refined_products`, `lubricating_oils`, `ngl_lpg`, `ethanol`, `biodiesel`, `special`)
- `default_density_kg_m3` (typical, used as form default)
- `default_density_api` (typical, used as form default)
- `vapor_pressure_psi` (optional, used in CPL where relevant)
- `notes`

### `meters`
Per the "Build a Meter" workflow.
- `customer_id`, `location_id`
- `tag` (customer-assigned ID, e.g., "M-101")
- `manufacturer`, `model`, `serial_number`
- `meter_type` (enum: `pd_positive_displacement`, `turbine`, `coriolis`, `ultrasonic`)
- `size_inches` (e.g., 4, 6, 8)
- `nominal_k_factor` (pulses per unit volume, e.g., pulses/bbl)
- `repeatability_tolerance_pct` (default 0.050 for custody, 0.25 for allocation)
- `consistency_runs_required` (e.g., 5 for crude, 3 for refined)
- `consistency_runs_max` (e.g., 5)
- `service_type` (enum: `custody_transfer`, `allocation`, `check_meter`)
- `commissioned_date`
- `notes`

### `provers`
Per the "Build a Prover" workflow. Single table, discriminated by `prover_type`.
- `prover_type` (enum: `ball_bidirectional`, `ball_unidirectional`, `small_volume_prover`, `tank_can_open_neck`, `master_meter`)
- `manufacturer`, `model`, `serial_number`
- `base_volume` (gallons or barrels — for can provers this is the calibrated tank volume; for ball provers this is the certified base prover volume between detector switches)
- `base_volume_unit` (enum: `gal`, `bbl`, `m3`, `l`)
- `water_draw_cert_date`
- `water_draw_cert_next_due`
- `water_draw_cert_document_url` (PDF stored in Supabase Storage)
- For ball provers only:
  - `wall_thickness_inches`
  - `internal_diameter_inches`
  - `material_thermal_expansion_coefficient` (default for carbon steel)
  - `material_modulus_of_elasticity` (default for carbon steel)
- For can provers only:
  - `neck_scale_unit` (enum: `gal`, `cubic_inch`, `liter`, `ml`)
  - `neck_scale_min`, `neck_scale_max`
- `owned_by` (enum: `quorum`, `customer`, `third_party`)
- `notes`

### `proving_runs`
The headline event. One per "we proved meter X with prover Y on date Z."
- `meter_id`
- `prover_id`
- `product_id`
- `customer_id`, `location_id` (denormalized for query performance and PDF generation; locked at submission)
- `status` (enum: `draft`, `submitted`, `approved`, `voided`)
- `service_type` (snapshot from meter at run time)
- `tech_user_id` (the person doing the proving)
- `witness_name` (free text — customer rep, may not be a system user)
- `witness_signature_url` (image of signature, captured on tablet)
- `tech_signature_url`
- `started_at`, `completed_at`
- `submitted_at`, `submitted_by`
- `approved_at`, `approved_by`
- `voided_at`, `voided_by`, `void_reason`
- **Inputs (entered once for the run):**
  - `meter_temperature_f`
  - `meter_pressure_psig`
  - `prover_temperature_f`
  - `prover_pressure_psig`
  - `observed_density_kg_m3` (or `observed_api_gravity` — store both, derived)
  - `observed_density_temperature_f`
- **Computed (engine output, stored for audit):**
  - `meter_factor` (the headline number)
  - `repeatability_pct`
  - `consistency_passed` (bool)
  - `repeatability_passed` (bool)
  - `ctl_meter`, `cpl_meter`, `ctl_prover`, `cpl_prover`, `cts_prover`, `cps_prover` (each correction factor stored individually)
  - `mf_set` (the meter factor that will be set on the meter going forward)
- `data_hash` (SHA-256 of all submission inputs + computed outputs — tamper detection)
- `notes`

### `proving_run_passes`
Individual passes within a run (typically 5 for ball, varies for can).
- `proving_run_id`
- `pass_number` (1, 2, 3, ...)
- `direction` (enum: `forward`, `reverse`, `na`) — bidirectional ball provers alternate
- For ball provers:
  - `meter_pulses` (integer, raw count)
  - `prover_temp_inlet_f`, `prover_temp_outlet_f`
  - `prover_pressure_inlet_psig`, `prover_pressure_outlet_psig`
  - `meter_temp_f`, `meter_pressure_psig`
- For can provers:
  - `meter_indicated_volume` (read off meter)
  - `prover_actual_volume` (read off the can scale at the meniscus)
  - `meter_indicated_volume_unit`, `prover_actual_volume_unit`
  - `meter_temp_f`, `meter_pressure_psig`
  - `prover_temp_f`
- `pass_meter_factor` (computed per-pass)
- `excluded` (bool — tech can flag a pass to exclude with reason)
- `exclusion_reason`

### `audit_log`
Append-only. Never updated, never deleted.
- `actor_user_id`
- `action` (enum: `create`, `submit`, `approve`, `void`, `update_draft`, `export_pdf`, `export_csv`, `login`)
- `entity_type` (e.g., `proving_run`, `meter`)
- `entity_id`
- `payload_hash` (hash of relevant data at time of action)
- `payload_json` (the actual data — for full forensic recovery)
- `created_at`
- `ip_address`, `user_agent`

### `documents`
Generated outputs (PDFs, CSVs, MDs). Stored in Supabase Storage.
- `proving_run_id` (nullable — some exports are multi-run)
- `format` (enum: `pdf`, `csv`, `md`, `cfx`, `pidx`)
- `storage_path`
- `generated_at`, `generated_by`
- `hash`

### Indexes (essential)

- `proving_runs(meter_id, completed_at DESC)` — "show me this meter's history"
- `proving_runs(customer_id, completed_at DESC)` — customer report
- `proving_runs(status)` — "what's pending approval"
- `meters(customer_id, location_id)`
- `audit_log(entity_type, entity_id, created_at DESC)`

### Row-Level Security (RLS)

For v0 single-tenant: enable RLS, allow any authenticated user from `company_id = quorum_uuid` to read/write within their company. Even though there's only one company, write the policies correctly now — flipping to multi-tenant later is a config change, not a rewrite.

---

## 6. Calculation Engine

This is the heart of the product and must be correct, defensible, and well-tested. All formulas reference the latest revision of the API Manual of Petroleum Measurement Standards (MPMS).

### 6.1 CTL — Correction for Temperature on Liquid (API MPMS Ch 11.1)

CTL converts an observed volume at observed temperature to volume at base temperature (60 °F / 15 °C). Implementation must use the API MPMS 11.1-2004 (or current revision) algorithms, not the deprecated 1980 tables.

**Inputs:**
- `observed_temp_f`
- `density_at_60f` (or API gravity at 60°F, derived)
- `product_group` (one of: A=crude, B=refined products, C=lube oils, D=special applications, E=NGL/LPG, ethanol, biodiesel)

**Output:**
- `ctl` (dimensionless multiplier, typically 0.95–1.05)

**Implementation:**
- Embed the MPMS 11.1 coefficient tables as JSON: `data/ctl_coefficients.json`
- Function signature:
  ```ts
  function calculateCTL(params: {
    observedTempF: number;
    densityAt60F_kgM3: number;
    productGroup: ProductGroup;
  }): { ctl: number; coefficientsUsed: string };
  ```
- Ethanol blends: use the ethanol-specific tables (CTL for denatured fuel ethanol, ASTM D4806).
- Biodiesel: use the biodiesel CTL tables (B100 has its own; blends interpolate).

### 6.2 CPL — Correction for Pressure on Liquid (API MPMS Ch 11.2)

CPL adjusts volume for the compressibility of the liquid under operating pressure vs. base pressure (0 psig equilibrium vapor pressure).

**Inputs:**
- `observed_pressure_psig`
- `equilibrium_vapor_pressure_psig` (from product table; 0 for atmospheric products)
- `temperature_f`
- `density_at_60f_kgM3`

**Output:**
- `cpl` (dimensionless multiplier, typically 0.999–1.005 at terminal pressures)

**Implementation:**
- Compute compressibility factor F per MPMS 11.2.1 (refined and crude) or 11.2.2 (NGL/LPG).
- `CPL = 1 / (1 - (P - Pe) × F)`
- Function signature:
  ```ts
  function calculateCPL(params: {
    observedPressurePsig: number;
    equilibriumVaporPressurePsig: number;
    temperatureF: number;
    densityAt60F_kgM3: number;
  }): { cpl: number; compressibilityFactor: number };
  ```

### 6.3 CTS / CPS — Steel Corrections (Ball Prover Only)

For ball/pipe provers, the prover steel itself expands with temperature and contracts/expands with pressure. These corrections apply to the *prover* base volume.

**CTS (Correction for Thermal expansion of Steel):**
```
CTS = 1 + (3α × (Tp - Tb))
```
where α is the cubical thermal expansion coefficient of the prover material (typically 1.86 × 10⁻⁵ /°F for carbon steel), Tp is prover temperature, Tb is base temperature (60°F).

**CPS (Correction for Pressure on Steel):**
```
CPS = 1 + (P × ID) / (E × WT)
```
where P is operating pressure, ID is internal diameter, E is modulus of elasticity (~30 × 10⁶ psi for carbon steel), WT is wall thickness.

Function signatures:
```ts
function calculateCTS(params: {
  proverTempF: number;
  thermalExpansionCoefficient: number; // default carbon steel
}): number;

function calculateCPS(params: {
  proverPressurePsig: number;
  internalDiameterIn: number;
  wallThicknessIn: number;
  modulusOfElasticity: number; // default carbon steel
}): number;
```

### 6.4 Meter Factor — Ball Prover (API MPMS Ch 12.2)

Per pass:
```
MF_pass = (BPV × CTS × CPS × CTLp × CPLp) / (Mu × CTLm × CPLm)
```
where:
- `BPV` = base prover volume (water-draw certified)
- `Mu` = meter uncorrected volume = `meter_pulses / nominal_k_factor`
- `CTLp`, `CPLp` = liquid corrections at prover conditions
- `CTLm`, `CPLm` = liquid corrections at meter conditions

Final MF = average of all passes that pass repeatability and consistency checks.

### 6.5 Meter Factor — Can/Tank Prover (API MPMS Ch 4.4)

Simpler — no steel correction the same way (the can is open to atmosphere, calibrated at standard conditions).

Per pass:
```
MF_pass = (Vp × CTLp) / (Vm × CTLm × CPLm)
```
where:
- `Vp` = volume read off the can scale at the meniscus (corrected for the can's calibration temp if needed)
- `Vm` = volume indicated by the meter
- Pressure correction applies only to the meter side (can is at atmospheric)

### 6.6 Repeatability

```
Repeatability = ((MF_max - MF_min) / MF_min) × 100%
```

The run passes if `Repeatability ≤ meter.repeatability_tolerance_pct`.

### 6.7 Consistency

The meter has `consistency_runs_required` (e.g., 5 for crude, 3 for refined). All required runs must pass repeatability before the run is "complete."

### 6.8 Final Output

```ts
interface ProvingRunResult {
  meterFactor: number;          // averaged across valid passes
  repeatabilityPct: number;
  consistencyPassed: boolean;
  repeatabilityPassed: boolean;
  withinTolerance: boolean;     // both checks passed
  passResults: PassResult[];
  warnings: string[];           // e.g., "MF deviation > 0.25% from previous proving"
}
```

### 6.9 Testing requirements

The calc engine MUST ship with a comprehensive test suite using known proving data. Source test cases from:
- API MPMS Ch 12.2 worked examples
- GPA TP-25/TP-27 example calculations
- Joe's previous Excel work (the "MF Set − As-Found" math is the deviation calculation; verify the engine matches)
- Synthetic edge cases (extreme temps, extreme pressures, very high/low API gravity)

Test files: `lib/calc/__tests__/`. Use Vitest. Aim for >95% line coverage on the calc engine specifically.

---

## 7. UI / UX

### Design principles

- **Field-first.** Big tap targets (44×44px minimum). Numeric inputs trigger the numeric keyboard on tablets. Sticky save state — never lose a tech's work.
- **One screen per task.** Don't make techs scroll through a 15-field form.
- **Live calculation.** As soon as enough fields are filled, the meter factor and repeatability update in real time.
- **No modal popups for normal flow.** Use side panels or full-screen drawers for detail views.
- **Color-code outcomes.** Green for pass, amber for in-tolerance-but-marginal, red for fail. Never make a tech parse numbers to know if a run is good.

### Key flows

**1. New proving run**
- Tech taps "New Proving"
- Step 1: pick customer → location → meter (autofill from history if same site as last time)
- Step 2: pick prover (filtered to "owned by Quorum" by default + "owned by this customer")
- Step 3: pick product → enter run-level conditions (density, temps, pressures)
- Step 4: pass-by-pass entry. Tech fills in pulses (or volumes for can) per pass. Engine computes `MF_pass` live. Repeatability shown after pass 2+.
- Step 5: review screen. Tech and witness sign. Submit.
- Step 6: PDF generates. Tech can email/download immediately.

**2. Build a meter**
- Multi-step wizard following the existing "Build a Meter" doc.
- Pre-fill manufacturer/model from a maintained dropdown (let users add new ones inline).
- Save partial drafts.

**3. Build a prover**
- Same pattern, branched by prover type (ball/can).
- Required fields differ by type — form adapts.
- Water-draw cert PDF upload at the end.

**4. Browse history**
- Default view: "your last 30 provings."
- Filters: meter, customer, date range, status, pass/fail.
- Click any row → full proving detail drawer with PDF re-download.

**5. Approval queue (supervisor role)**
- Provings in `submitted` status surface here.
- Supervisor reviews, approves, or rejects with reason.

### Component library

shadcn/ui as the base. Override the theme to something less generic. Lean toward serious/utilitarian over playful — this is a custody-transfer tool, not a consumer app. Dark mode is a requirement (techs work nights at terminals).

---

## 8. Audit Trail & Data Integrity

This is what makes the product defensible for custody-transfer disputes. It's also why operators will eventually pay for it.

### Rules

1. **Submitted proving runs are immutable.** No UPDATE, ever. Corrections happen via void + new submission.
2. **Every state transition is logged.** Create draft, edit draft, submit, approve, void, void-with-correction, export. All in `audit_log`.
3. **Cryptographic hash of submitted data.** When a run is submitted, compute SHA-256 over a canonical JSON serialization of inputs + outputs and store as `data_hash`. PDFs include this hash in the footer. Any tampering is detectable.
4. **Time stamps are server-generated.** Don't trust the client clock for `submitted_at`, `approved_at`. Use Postgres `now()`.
5. **Approval is a separate role.** Tech can submit, but only supervisors/admins can approve.
6. **Voided runs stay in the database forever.** Marked voided, but never deleted. PDFs of voided runs are watermarked "VOIDED."

### What this gets you

When a customer disputes a measurement, you can produce:
- The original PDF
- The audit log of who touched the record and when
- Cryptographic proof the data hasn't been altered
- The full calc trace (every correction factor, every input)

That story is the moat.

---

## 9. Offline & PWA

### Cached on first load

- App shell (HTML, JS, CSS bundles)
- All static reference data (CTL/CPL coefficient tables, product list)
- The user's recent meters (last 90 days), recent provers, recent customers/locations
- Last 30 proving runs

### Available offline

- Full read access to cached data
- Create new proving run (saved to IndexedDB with `pending_sync: true`)
- View/edit drafts
- Generate PDFs (Puppeteer needs to be online — for offline, use react-pdf as a fallback; lower quality but works)

### Sync behavior

- On reconnect, background sync pushes pending records to Supabase
- Supabase pushes back any updates from other devices
- Conflict resolution: each proving run has a client-generated UUID, so cross-device duplicates aren't possible
- Drafts edited offline merge by `updated_at` (last-write-wins is fine — drafts aren't legally meaningful)

### Install experience

- Manifest declares standalone display mode
- Icon + name configured
- Chrome will prompt "Install this app?" automatically after the user visits a few times
- Service worker registers on first load
- Updates push silently — user gets a small toast on next launch saying "Updated to version X.Y"

---

## 10. Output Formats

### PDF (primary deliverable)

Per-proving certificate, ~2 pages. Layout:
- **Page 1 header:** Quorum Cal logo, customer name, location, date, tech name, witness name
- **Meter block:** tag, manufacturer, model, serial, size, type
- **Prover block:** type, serial, base volume, water-draw cert date
- **Run conditions block:** product, density, temps, pressures
- **Pass-by-pass table:** raw inputs and computed `MF_pass` for each
- **Result block:** Final MF, repeatability %, pass/fail badges
- **Signatures block:** tech and witness, with timestamps
- **Page 2:** full computation trace — every correction factor (CTL_m, CPL_m, CTS, CPS, CTL_p, CPL_p) with the inputs that produced them
- **Footer:** `data_hash` (last 12 chars), generation timestamp, app version

Generated server-side via Puppeteer + Tailwind-styled HTML template. Stored in Supabase Storage with a UUID filename. Re-downloadable at any time.

### CSV (analyst-friendly)

Two flavors:
1. **Run-level CSV** — one row per proving run with all summary fields. For pivot tables and dashboards.
2. **Pass-level CSV** — one row per pass within a run. For deep analysis.

### Markdown (lightweight, human-readable)

Per-proving MD file. Same content as the PDF but plain text. Useful for embedding in tickets, internal docs, customer emails. Easy to diff.

### Future formats (not v0)

- **CFX** — Flow-Cal proprietary; reverse-engineered from sample files. v1.5 priority.
- **PIDX XML** — open standard, bundled v1.62 schema available. v1.5 priority.

---

## 11. Roadmap

| Version | Scope | Target |
|---|---|---|
| **v0** | Manual entry, ball + can proving, PDF/CSV/MD export, offline PWA, single-tenant Quorum Cal | First useful build |
| **v0.5** | Polish from real field use; supervisor approval queue; meter history dashboards | After 30 days of internal use |
| **v1** | Web Serial integration with Calibron PIU and OMNI/AccuLoad flow computers; multi-tenant | After PIU specs gathered + first external customer interest |
| **v1.5** | CFX export; PIDX export; customer-facing portal (read-only) | When first midsize operator engages |
| **v2** | Agentic asset-data enrichment (auto-build wikis on each meter); ML drift detection on MF trends; AI chat support | When historical data volume justifies it (~12 months in) |
| **v3** | OIML R117 / international standards; expand to gas measurement (GPA TP-25 + AGA); integration partnerships | When US market is established |

---

## 12. Phase 1 First Tasks (for Claude Code)

In order:

1. **Scaffold the Next.js project.**
   - `npx create-next-app@latest` with TypeScript, Tailwind, App Router, ESLint
   - Install: `@supabase/supabase-js`, `dexie`, `react-hook-form`, `zod`, `zustand`, `@tanstack/react-query`, `lucide-react`, `date-fns`
   - Install shadcn/ui and initialize
   - Set up Workbox for service worker (use `@serwist/next`)

2. **Set up Supabase project.**
   - Create the schema from Section 5 as a migration file (`supabase/migrations/0001_initial.sql`)
   - Enable RLS on all tables; write policies (single-tenant for now: `auth.uid() IS NOT NULL` on most reads, role-based on writes)
   - Seed the `products` table with a starter list (see below)
   - Seed a single `companies` row for Quorum Calibration

3. **Build the calculation engine first, before any UI.**
   - `lib/calc/ctl.ts`, `lib/calc/cpl.ts`, `lib/calc/cts.ts`, `lib/calc/cps.ts`, `lib/calc/meterFactor.ts`
   - Embedded coefficient tables: `lib/calc/data/ctl-refined-products.json`, `lib/calc/data/ctl-crude.json`, etc. (start with refined products only, expand)
   - Test suite using Vitest. Hand-derived test cases from API MPMS examples. Engine ships with passing tests before any UI work begins.

4. **Build the auth flow.**
   - Email/password via Supabase Auth
   - Magic link as a fallback
   - Protected layout for authenticated routes

5. **Build the Meters and Provers CRUD.**
   - List view, create form, detail view
   - Forms branched by `prover_type`
   - File upload for water-draw certs (Supabase Storage)

6. **Build the proving run wizard.**
   - Multi-step form per Section 7
   - Live calc engine wired into the pass-entry step
   - Save-as-draft works at every step
   - Submit triggers hash computation + audit log entry

7. **Build the PDF generator.**
   - HTML template under `app/api/pdf/_template.tsx`
   - Vercel function at `app/api/pdf/route.ts` that uses `@sparticuz/chromium` + `puppeteer-core` (Vercel-compatible)
   - Returns a stored URL after upload to Supabase Storage

8. **Build CSV and MD exports.**
   - Simple serverless functions, output stored alongside PDFs

9. **Wire up offline.**
   - Dexie schema mirroring Postgres tables
   - Sync layer that on connection: (a) pushes `pending_sync` writes, (b) pulls deltas from Supabase
   - Service worker caches app shell + static assets
   - PWA manifest + icons

10. **Internal dogfood.**
    - Joe and one other Quorum Cal tech use it for a week of real provings.
    - Capture feedback, iterate.

### Starter `products` seed

```sql
INSERT INTO products (name, api_table_group, default_density_kg_m3, default_density_api, vapor_pressure_psi) VALUES
  ('Gasoline (E10)',          'refined_products', 740,  60.0, 8.0),
  ('Gasoline (conventional)', 'refined_products', 735,  61.0, 9.0),
  ('ULSD (#2 Diesel)',        'refined_products', 850,  35.0, 0.0),
  ('Kerosene / Jet A',        'refined_products', 810,  43.0, 0.0),
  ('Heating Oil (#2)',        'refined_products', 855,  34.0, 0.0),
  ('Ethanol (denatured E100)', 'ethanol',          790,  47.0, 2.3),
  ('Biodiesel (B100)',        'biodiesel',        880,  29.0, 0.0),
  ('Crude (light sweet)',     'crude',            830,  39.0, 0.0),
  ('Crude (medium sour)',     'crude',            870,  31.0, 0.0),
  ('Crude (heavy)',           'crude',            930,  20.0, 0.0);
```

### Definition of "v0 done"

- Joe can log into the app on a Windows laptop or Android tablet
- Joe can build a meter and a prover from scratch
- Joe can run a proving (manual entry) for any product in the seed list, on either a ball or can prover
- The calc engine produces results that match a hand-calculated reference proving from his existing PROVEit data within ±0.0001 on the meter factor
- The PDF that comes out is something he'd be willing to hand a customer instead of the PROVEit output
- It works offline (airplane mode test on a tablet)
- Submitted runs are immutable; void/correct flow works
- Audit log shows every action

When all of those are true, v0 is done. Then go use it on real jobs.

---

## 13. Open questions for Joe

These don't block Phase 1 but should be answered before v1:

1. **Calibron PIU specs** — what protocol does it actually output? (Modbus RTU? ASCII? Serial parameters?) Need a manual page or screenshot when you're back at the truck.
2. **Who's the second user?** Confirm one supervisor + Joe + one other tech for v0. That's three accounts, three roles, enough to exercise the approval flow.
3. **Branding** — does Quorum Cal have a logo, color palette, or letterhead style we should match for the PDF?
4. **Customer list** — can you export the existing customer list from PROVEit or another internal source so we can seed it instead of typing each one?
5. **Existing meter inventory** — same question. Bulk import from CSV would be a one-day add and saves enormous data entry pain.