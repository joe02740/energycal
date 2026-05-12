# Energy Cal — Calculation Engine Reference

**Purpose:** the equations, constants, and citations the engine implements. Every formula in `src/lib/calc/*.ts` should map back to a numbered section here. If a value in the code doesn't match this doc, one of them is wrong — fix the doc or the code, never both silently.

**Conventions:**
- Temperatures in °F unless noted; conversions: `T_R = T_F + 459.67`, `T_C = (T_F − 32) × 5/9`, `T_K = T_C + 273.15`.
- Pressures in psig (operating) or psia (absolute); `P_psia = P_psig + 14.696` at 1 atm.
- Densities in kg/m³ unless noted; API gravity ↔ relative density at 60°F per equations below.
- Base temperature: 60°F (15.56°C, 519.67°R). Base pressure: 0 psig (atmospheric, equilibrium vapor pressure for products with EVP > 0).

---

## 1. Density and API gravity at 60°F

**API gravity → relative density (specific gravity) at 60/60°F:**
```
SG_60 = 141.5 / (131.5 + API_60)
```

**Relative density → API gravity:**
```
API_60 = 141.5 / SG_60 − 131.5
```

**Density (kg/m³) at 60°F → relative density:**
```
SG_60 = ρ_60_kg_m3 / 999.012
```
(999.012 kg/m³ is the density of water at 60°F per API MPMS Ch 11.5.)

**Notes:**
- "Observed density" = density measured at observed (live) temperature. To use it in CTL, convert to base density at 60°F (iteratively — see §2 below).
- "Base density" = ρ at 60°F. If the tech entered ρ_60 directly (PROVEit's `Density Type = Base RHO60`), no iteration needed.

---

## 2. CTL — Correction for Temperature on Liquid (API MPMS Ch 11.1, 2004 revision)

CTL converts an observed volume at observed temperature to volume at base temperature. The 2004 revision uses thermal expansion coefficients α_60(ρ_60) computed from product-group K-coefficients, **not** lookup tables. Lookup tables (Tables 5/6, 23/24, 53/54) are derivatives of the equations.

### 2.1 Thermal expansion coefficient at 60°F

```
α_60 = K0 / ρ_60² + K1 / ρ_60 + K2
```

Where ρ_60 is base density in kg/m³ and K0, K1, K2 are product-group constants (see §2.3 below).

### 2.2 CTL formula

```
CTL = exp(−α_60 × ΔT × (1 + 0.8 × α_60 × ΔT))
```

Where:
- `ΔT = T_obs_F − 60` (in °F; the formula's α_60 is per-°F when K-constants are the °F set)
- API MPMS 11.1-2004 publishes K-constants in two sets: one for SI input (kg/m³, °C) and one for customary (lb/gal, °F). For an engine using kg/m³ + °F, the °C K-constants apply but ΔT must be converted: `ΔT_C = ΔT_F × 5/9`.

**Energy Cal's choice:** internal calc in **kg/m³ + °C** (the scientifically clean form), with input/output adapters for °F at the boundary. That way the K-coefficients used are the published 11.1-2004 SI values verbatim.

Restated for the SI path:
```
α_60 = K0 / ρ_60² + K1 / ρ_60 + K2          (per °C)
ΔT_C = (T_obs_F − 60) × 5/9
CTL = exp(−α_60 × ΔT_C × (1 + 0.8 × α_60 × ΔT_C))
```

### 2.3 K-coefficients by product group (API MPMS 11.1-2004, SI)

These are the canonical 2004 K-values for the listed product groups. Source: API MPMS Ch 11.1 (2004) Table 1 and §11.1.6 (also reproduced in GPA TP-27 and ASTM D1250-04).

| Product group              | K0           | K1         | K2           | Density range (kg/m³ at 60°F) |
|---|---|---|---|---|
| **Crude oil (Table 6A)**    | 341.0957     | 0.0000     | 0.0000       | 610.5 – 1075.0                |
| **Refined products — gasoline (Table 6B subset)** | 346.4228 | 0.4388 | 0.0000 | 653.0 – 770.0                 |
| **Refined products — jet/distillate** | 594.5418 | 0.0000 | 0.0000   | 770.0 – 788.0                 |
| **Refined products — diesel/heating oil** | 186.9696 | 0.4862 | 0.0000 | 788.0 – 839.0                |
| **Refined products — fuel oils** | 186.9696 | 0.4862 | 0.0000   | 839.0 – 1075.0                |
| **Lube oils (Table 6C)**    | 0.0         | 0.34878    | 0.00000      | 800.9 – 1163.5                |
| **Generalized refined (Table 6B blanket)** — for products that don't fit a sub-group | 103.8720 | 0.2701 | 0.00000034478 | 653.0 – 1075.0 |

**Ethanol (anhydrous & denatured fuel ethanol, API MPMS 11.3.3 / ASTM D4806):** uses a different formulation — temperature-density correlation per ASTM D4052 plus the 11.3.3 correction. **Not implemented in v0**; products mapped to `ethanol` group will throw `"Ethanol CTL not yet implemented — use 11.3.3"` until added.

**Biodiesel (B100, API MPMS 11.1 amendment 2 / ASTM D6751):** B100 has its own α_60 formulation; blends interpolate. **Not implemented in v0**.

**LPG/NGL (API MPMS 11.2.4 / GPA TP-27, Table 24E):** different equations entirely (uses compressibility-temperature joint correction). **Not implemented in v0.**

### 2.4 When the tech enters observed density (RHOobs)

If `density_type = observed_rho_obs`, ρ_60 is unknown and we must solve for it iteratively:

1. Guess `ρ_60 = ρ_obs` (initial).
2. Compute `α_60` from §2.1, `CTL` from §2.2.
3. Refine `ρ_60 = ρ_obs / CTL`.
4. Repeat until `|Δρ_60| < 0.01 kg/m³` (typically 2–4 iterations).

Engine implementation: `iterateBaseDensity()` returns `{ rho60, ctl, iterations }`.

### 2.5 Hydrometer correction (optional)

When `hydrometer_correction = true` and density was read from a glass hydrometer at observed temperature, the hydrometer's own glass expands and the density reading needs a small correction per ASTM E100 / API MPMS 9.1:

```
ρ_corrected = ρ_observed × (1 − γ × ΔT_C)
```

Where γ = 0.000023 /°C (cubical expansion of soda-lime glass). This adjusts the density *before* CTL is applied. v0 implements this only when the flag is set.

---

## 3. CPL — Correction for Pressure on Liquid (API MPMS Ch 11.2.1, 2004)

CPL adjusts volume for the compressibility of the liquid under operating pressure vs. equilibrium vapor pressure (Pe).

### 3.1 CPL formula

```
CPL = 1 / (1 − F × (P − Pe))
```

Where:
- `P` = operating pressure (psig) at the meter or prover
- `Pe` = equilibrium vapor pressure (psig) of the product at the operating temperature; from the product table, 0 for atmospheric products
- `F` = compressibility factor (per psi), from §3.2

### 3.2 Compressibility factor F (API MPMS 11.2.1)

For crude and refined products at observed conditions:

```
F = exp(−1.9947 + 0.00013427 × T_F + (793920 + 2326 × T_F) / ρ_60²) × 1e−6
```

Where:
- `T_F` is the liquid temperature in °F (meter or prover side)
- `ρ_60` is base density in kg/m³

Result has units of 1/psi.

**Range:** valid for ρ_60 ∈ [638, 1074] kg/m³ and T ∈ [−50, 350]°F. Outside, throw `"CPL out of MPMS 11.2.1 valid range"`.

### 3.3 NGL/LPG variant (API MPMS 11.2.2)

Different F equation. **Not in v0.**

### 3.4 CPLo — CPL at observed conditions

For the "observed pressure correction back to flowing conditions" column PROVEit shows as `CPLo`, F is computed at the observed *density* (not base), but the formula structure is identical. v0 stores both:
- `cpl_meter` / `cpl_prover` — at base density (used in CCF)
- `cpl_observed` — at observed density (informational, matches PROVEit's display)

---

## 4. CTS — Correction for Thermal expansion of Steel (Ball/SVP only, API MPMS Ch 12.2)

```
CTS = 1 + Gc × (Tp_F − Tb_F)
```

Where:
- `Gc` = cubical thermal expansion coefficient of the prover material, per °F
- `Tp_F` = prover temperature (operating)
- `Tb_F` = certified/base temperature (typically 60°F)

**Material constants (per °F):**

| Material              | Gc (cubical, /°F)     | Source                        |
|---|---|---|
| Carbon steel          | 1.86 × 10⁻⁵          | API MPMS 12.2 Table A-1       |
| 304 Stainless Steel   | 2.88 × 10⁻⁵          | API MPMS 12.2 Table A-1       |
| 316 Stainless Steel   | 2.65 × 10⁻⁵          | API MPMS 12.2 Table A-1       |
| Invar                 | 0.18 × 10⁻⁵          | API MPMS 12.2 Table A-1       |

The PROVEit screenshot showed `Gc = 0.0000288 /°F` for 304 SS — matches §4 above.

---

## 5. CPS — Correction for Pressure on Steel (Ball/SVP only, API MPMS Ch 12.2)

```
CPS = 1 + (Pp_psig × ID_in) / (E_psi × WT_in)
```

Where:
- `Pp_psig` = prover operating pressure (gauge)
- `ID_in` = pipe internal diameter (inches)
- `WT_in` = pipe wall thickness (inches)
- `E_psi` = modulus of elasticity of the prover material (psi)

**Modulus of elasticity (psi):**

| Material              | E (psi)       |
|---|---|
| Carbon steel          | 30,000,000   |
| 304 Stainless Steel   | 28,000,000   |
| 316 Stainless Steel   | 28,000,000   |
| Invar                 | 21,000,000   |

PROVEit screenshot: `Elasticity = 28000000 psi` for 304 SS — matches.

---

## 6. Per-pass meter factor

### 6.1 Ball prover (API MPMS Ch 12.2)

Notation matches PROVEit columns:
```
IVm   = Pulses_pass / KF_nominal              ; Indicated Volume of meter (pre-correction)
ISVm  = IVm × CCFm                             ; Indicated Standard Volume of meter
GSVp  = BPV × CCFp                             ; Gross Standard Volume of prover
IMF   = GSVp / ISVm                            ; Indicated Meter Factor (per pass)
```

Where:
```
CCFm  = CTLm × CPLm                            ; meter side correction
CCFp  = CTSp × CPSp × CTLp × CPLp              ; prover side correction
```

`Pulses_pass` is NUMERIC — fractional under `pulse_mode = interpolated`.

### 6.2 Can/Tank prover (API MPMS Ch 4.4 / Bay 1 Arm 1 form)

```
F = A × D × E   ; Net prover at base   = TankReading × CTS_can × CTL_prover
J = G × I       ; Net meter at base    = MeteredAmount × CTL_meter (× CPL_meter if non-atmospheric)
N = F / J       ; Per-pass meter factor (= IMF in PROVEit terms)
```

Pressure correction (CPLm) applies only when the meter is at non-atmospheric pressure; a downstream-of-loading-arm meter typically has Pm ≈ 0 psig and CPLm ≈ 1.0.

### 6.3 Wet-down and exclusion

- The first pass after a meter or product change is the **wet-down** (`is_wet_down = true`). Captured but excluded from repeatability/consistency/MF averaging.
- Manually-excluded passes (`excluded = true`) are also dropped from MF averaging.
- Both are still stored and printed on the certificate (greyed out, with reason).

---

## 7. Run-level aggregation

### 7.1 MF (this run)

Per `meter.mf_calc_method`:

| Method                  | Formula                                                      |
|---|---|
| `avg_meter_factor`     | `mean(IMF_pass for pass in non-excluded non-wet-down)`     |
| `weighted_by_volume`   | `sum(IMF × ISVm) / sum(ISVm)`                                |
| `weighted_by_pulses`   | `sum(IMF × Pulses) / sum(Pulses)`                            |

PROVEit's screenshot shows `MF Calc. Method = Avg. Meter Factor` so `avg_meter_factor` is the v0 default.

### 7.2 CMF (composite, persisted to the meter)

`CMF` is the meter's *running* factor — the value the K-factor write-back uses. Behavior:

- If this is the first proving for the meter, `CMF = MF`.
- If `mf_calc_method = avg_meter_factor`, `CMF` is recomputed per the PROVEit convention: rolling average of the last N proving MFs (where N is meter-configurable, default 1 = "use this run's MF only"). Energy Cal stores `mf_set = CMF` at submission.

### 7.3 MA, KF, CKF

```
MA  = 1 / MF                              ; Meter Accuracy
KF_new = KF_present × CMF                 ; new K-factor written back to the meter
CKF = KF_present × CMF                    ; same value; "composite" K-factor for trending
```

PROVEit's screenshot shows MF = 0.9994, MA = 1.0006, CMF = 0.9994, KF = 240.1, CKF = 240.1. With KF_present pulled off the meter at run start, the KF_new for the next run becomes the present KF. Loop is closed.

### 7.4 Repeatability

```
Repeatability_pct = ((MF_pass_max − MF_pass_min) / MF_pass_min) × 100
```

Computed across non-excluded non-wet-down passes only. Profile threshold `repeatability_tolerance_pct` gates `repeatabilityPassed`.

### 7.5 Uncertainty (PROVEit reports it; v0 captures the value but doesn't compute it)

PROVEit shows `Uncertainty 0.019%` on the gold-standard run. This appears to be a per-pass standard-deviation-derived metric. v0 stores the field but doesn't compute — set to `null` and add `// TODO uncertainty per ASME MFC-9M / ISO 5168` until we hand-derive it. Acceptable: the field is informational, no acceptance check uses it.

---

## 8. Acceptance gates

### 8.1 Repeatability

`repeatabilityPassed = repeatability_pct ≤ profile.repeatability_tolerance_pct`

### 8.2 Consistency

Of the last `consistency_runs_max` non-wet-down passes, at least `consistency_runs_required` must pass repeatability. PROVEit shows `3 of 3` on the gold-standard meter — strict.

### 8.3 Prior Deviation

```
prior_dev_pct = |MF − previous.MF| / previous.MF × 100
priorPassed   = prior_dev_pct ≤ profile.prior_deviation_max_pct
```

`previous` selection per profile flags:
- `prior_deviation_product_dependent = true` → must be same `product_id`
- `prior_deviation_use_failed_provings = false` → skip voided/failed runs
- `prior_deviation_use_cutoff_date = true` → only consider provings within the meter's `prove_frequency_days` window

If no eligible prior exists, `priorPassed = null` and the check is skipped (not failed).

### 8.4 Historical Deviation

```
hist_dev_pct = |MF − mean(last N MFs)| / mean(...) × 100
historicalPassed = hist_dev_pct ≤ profile.historical_deviation_max_pct
```

N = `profile.historical_deviation_n_previous`. Same eligibility rules as Prior.

### 8.5 Baseline Deviation

```
baseline_dev_pct = |MF − baseline.MF| / baseline.MF × 100
baselinePassed   = baseline_dev_pct ≤ profile.baseline_deviation_max_pct
```

`baseline` is the most recent proving on the same meter (and same product, if `product_dependent`) with `is_baseline = true`.

### 8.6 Irving-style strict repeatability (profile flag)

When `irving_style_repeatability = true`, additionally require:
- Two consecutive non-wet-down passes with `MF_pass ∈ [0.9995, 1.0005]`
- `|MF_pass_n − MF_pass_n+1| ≤ 0.0005`
- `mean(MF_pass_n, MF_pass_n+1)` within `0.0010` of `previous.MF`

If any of these fail, set `repeatabilityPassed = false` and add a warning citing which clause tripped.

### 8.7 Overall pass

```
passed = repeatabilityPassed
       AND consistencyPassed
       AND (priorPassed === null OR priorPassed === true)
       AND (historicalPassed === null OR historicalPassed === true)
       AND (baselinePassed === null OR baselinePassed === true)
```

Disabled checks → `null` → don't drag the verdict down.

---

## 9. Canonical JSON for the data hash

Per RFC 8785 (JSON Canonicalization Scheme):
- Object keys sorted lexicographically (UTF-16 code unit order)
- No whitespace
- Numbers serialized per ECMAScript `Number.prototype.toString()` (RFC 8785 §3.2.2.3)
- Strings UTF-8, escaped per RFC 8259

Hash = `HMAC-SHA-256(server_key, canonical_json(submission))`. Key is server-side only; never sent to the client.

---

## 10. Engine module map

```
src/lib/calc/
  REFERENCE.md           ← this file
  types.ts               ← ProductGroup, MeterType, ProverType, PassResult, ProvingRunResult
  density.ts             ← API↔ρ↔SG conversions, hydrometer correction, iterateBaseDensity
  ctl.ts                 ← §2 — K-coefficients table + α_60 + CTL
  cpl.ts                 ← §3 — F factor + CPL + CPLo
  cts.ts                 ← §4 — material lookup + CTS
  cps.ts                 ← §5 — CPS
  ccf.ts                 ← composes CCFm, CCFp
  meterFactor.ts         ← §6, §7 — per-pass and run-level aggregation, MF/CMF/MA/KF/CKF
  repeatability.ts       ← §7.4 — already started
  acceptance.ts          ← §8 — all four gates + Irving-style
  canonicalJson.ts       ← §9 — RFC 8785 serializer (small subset sufficient for our payloads)
  hash.ts                ← §9 — HMAC wrapper (server-only entry point)
  __fixtures__/
    qc3-large-2026-05-02.ts ← gold-standard 3-run from PROVEit screenshot
    bay-1-arm-1.ts          ← Irving Portsmouth can-prover reference
```

Each `*.ts` file references its REFERENCE.md section in a top-of-file comment. If a future change makes them disagree, CI fails.

---

## 11. Open questions parked here for now (not blocking v0 calc)

- Ethanol/biodiesel/LPG CTL — defer to v0.5 after first dogfood.
- Uncertainty calculation — placeholder `null`; revisit once v0 has real proving history to validate against.
- Composite MF rolling-window N — currently default 1, but real PROVEit configs may average across N runs; verify with Joe before ship.
- Mass-mode proving (`proving_mode = mass`) — out of v0 scope.
