// See REFERENCE.md §10 for module map.

export type ProductGroup =
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

export type ProverMaterial =
  | "carbon_steel"
  | "ss_304"
  | "ss_316"
  | "invar";

export type DensityUnit = "kg_m3" | "api_gravity" | "g_cm3";

export type DensityType = "observed_rho_obs" | "base_rho_60";

export type MfCalcMethod = "avg_meter_factor" | "weighted_by_volume" | "weighted_by_pulses";

export type PulseMode = "whole" | "interpolated";

export interface PassInput {
  passNumber: number;
  isWetDown: boolean;
  excluded: boolean;
  exclusionReason?: string;

  // Ball/SVP path
  meterPulses?: number;
  proverTempF?: number;
  proverPressurePsig?: number;
  meterTempF?: number;
  meterPressurePsig?: number;

  // Can/tank path
  meterIndicatedVolume?: number;
  proverActualVolume?: number;
  ctsCanFactor?: number;
}

export interface PassResult {
  passNumber: number;
  isWetDown: boolean;
  excluded: boolean;
  imf: number;
  ivm: number;
  isvm: number;
  gsvp: number;
  ccfm: number;
  ccfp: number;
  ctlMeter: number;
  cplMeter: number;
  ctsProver: number;
  cpsProver: number;
  ctlProver: number;
  cplProver: number;
}

export interface ProvingRunResult {
  // Headline factors (PROVEit names)
  mf: number;
  cmf: number;
  ma: number;
  kf: number | null;
  ckf: number | null;
  kfNew: number | null;

  // Run-level averages
  tpAvgF: number;
  tmAvgF: number;
  ppAvgPsig: number;
  pmAvgPsig: number;
  imfAvg: number;

  // Aggregates
  nm: number;
  ivmTotal: number;
  isvmTotal: number;
  gsvpTotal: number;

  // Run-averaged corrections
  ctlMeter: number;
  cplMeter: number;
  ccfMeter: number;
  ctsProver: number;
  cpsProver: number;
  ctlProver: number;
  cplProver: number;
  ccfProver: number;
  cplObserved: number;

  // Acceptance
  repeatabilityPct: number;
  uncertaintyPct: number | null;
  deviation: number | null;
  priorDeviationPct: number | null;
  historicalDeviationPct: number | null;
  baselineDeviationPct: number | null;
  passed: boolean;
  consistencyPassed: boolean;
  repeatabilityPassed: boolean;
  priorPassed: boolean | null;
  historicalPassed: boolean | null;
  baselinePassed: boolean | null;

  passResults: PassResult[];
  warnings: string[];
}

// Range-check error type — engine throws when inputs fall outside MPMS validity.
export class CalcRangeError extends Error {
  readonly section: string;
  constructor(section: string, message: string) {
    super(`[${section}] ${message}`);
    this.name = "CalcRangeError";
    this.section = section;
  }
}
