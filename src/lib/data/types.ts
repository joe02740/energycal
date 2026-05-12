// Domain types used by the data layer + UI.
// These mirror the Supabase schema (supabase/migrations/0001_initial.sql)
// closely but stay framework-agnostic so they can be backed by Dexie (offline)
// or Supabase (online) interchangeably.

export type ApiTableGroup =
  | "crude"
  | "refined_gasoline"
  | "refined_jet_distillate"
  | "refined_diesel_heating"
  | "refined_fuel_oil"
  | "refined_generalized"
  | "lubricating_oils"
  | "ethanol"
  | "biodiesel"
  | "ngl_lpg";

export type MeterType =
  | "pd_positive_displacement"
  | "turbine"
  | "coriolis"
  | "ultrasonic";

export type ProverType =
  | "ball_bidirectional"
  | "ball_unidirectional"
  | "small_volume_prover"
  | "tank_can_open_neck"
  | "master_meter";

export type ProverMaterial = "Carbon Steel" | "304 Stainless Steel" | "316 Stainless Steel" | "Invar";

// Every tenant-scoped row carries companyId (the tenant boundary).
// Repository methods filter by current tenant; the UI never sees cross-tenant data.

export interface Customer {
  id: string;
  companyId: string;
  name: string;
}

export interface Location {
  id: string;
  companyId: string;
  customerId: string;
  name: string;
  address?: string;
}

export interface Product {
  id: string;
  companyId: string;
  name: string;
  apiTableGroup: ApiTableGroup;
  productType?: string;
  defaultDensityApi?: number;
  vaporPressurePsi?: number;
}

export interface Meter {
  id: string;
  companyId: string;
  customerId: string;
  locationId: string;
  tag: string;
  description?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  meterType: MeterType;
  sizeIn?: number;
  nominalKFactor: number;
  pulseMode: "whole" | "interpolated";
  mfCalcMethod: "avg_meter_factor" | "weighted_by_volume" | "weighted_by_pulses";
  trackFactor: "meter_factor" | "k_factor";
  baseTempF: number;
  atmosphericPressurePsia: number;
}

export interface Prover {
  id: string;
  companyId: string;
  tag: string;
  proverType: ProverType;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  baseVolume: number;
  baseVolumeUnit: "gal" | "bbl" | "m3" | "l";
  certifiedTempF: number;
  pipeInternalDiameterIn?: number;
  pipeWallThicknessIn?: number;
  material?: ProverMaterial;
  piuCommType?: "calibron" | "omni" | "accuload" | "none";
}

// A historical proving record. Imports from FieldApps land here; native
// Energy Cal provings will too once we wire submit-persistence. The schema
// matches the calc engine's PROVEit-named outputs so dashboards & insights
// rules read the same shape regardless of source.
export interface ProvingRecord {
  id: string;
  companyId: string;
  source: "fieldapps" | "energycal" | "manual" | "import-other";

  meterId: string;
  customerId: string;
  locationId: string;
  productId: string | null;

  datePerformed: string; // ISO; null-equivalent dates filtered out at parse time
  taskId?: string;
  status?: string;
  username?: string;

  // Headline factors (PROVEit names)
  mf: number | null;
  cmf: number | null;
  ma: number | null;
  kf: number | null;
  ckf: number | null;
  repeatabilityPct: number | null;
  uncertaintyPct: number | null;
  priorDeviationPct: number | null;
  priorDeviationPassed: boolean | null;
  passed: boolean | null;

  // Run-averaged corrections
  ctlMeter: number | null;
  cplMeter: number | null;
  ccfMeter: number | null;
  ctlProver: number | null;
  cplProver: number | null;
  ccfProver: number | null;

  density: number | null;
  densityTempF: number | null;
  baseDensity: number | null;
  avgFlowRate: number | null;

  // Run table preserved as JSON; per-pass details stay queryable but
  // we don't model every pivoted column in TS.
  runs: Array<Record<string, unknown>>;
}

export interface AcceptanceProfile {
  id: string;
  companyId: string;
  name: string;
  repeatabilityTolerancePct: number;
  consistencyRunsRequired: number;
  consistencyRunsMax: number;
  priorDeviationCheck: boolean;
  priorDeviationMaxPct: number | null;
}
