// Insights / health-recommendation engine.
// Philosophy (memory: feedback_suggestions_dial.md):
//   - quiet by default, structural multi-axis suppression
//   - per-rule:   minObservations (per meter), minPopulationSize (whole DB)
//   - per-tenant: suggestionThreshold (0-100, fire only if confidence ≥ this)
//   - per-meter:  baselineStatus (establishing → developing → established)
// Recommendations are wired but never fire for v0; we earn the right to speak
// per-meter as datasets mature.

export type Severity = "info" | "watch" | "warn" | "alert";

export type BaselineStatus = "establishing" | "developing" | "established";

export interface MeterMaturity {
  meterId: string;
  qualifyingObservations: number; // non-wet-down, accepted, post-cleanup provings
  baselineStatus: BaselineStatus;
  provingsToBaseline: number;     // how many more before we leave 'establishing'
}

export interface ProvingObservation {
  // Minimal slice the rules need; populated either from CSV import or
  // from Energy Cal's own proving runs.
  meterId: string;
  productId: string | null;
  datePerformed: Date;
  mf: number;
  cmf: number | null;
  repeatabilityPct: number | null;
  priorDeviationPct: number | null;
  passed: boolean;
  isWetDown: boolean;
  excluded: boolean;
}

export interface PopulationStats {
  // Aggregate stats across the database for population-level rules.
  // E.g. "drift faster than the population p95" needs the population p95.
  totalProvings: number;
  byMeterModel: Record<string, { count: number; medianDriftPctPerDay: number }>;
}

export interface RuleContext {
  meterId: string;
  meterModel?: string;
  history: ProvingObservation[]; // chronological, oldest → newest
  population: PopulationStats;
  tenantSuggestionThreshold: number; // 0-100; quiet at high values
}

export interface RuleEmit {
  severity: Severity;
  title: string;       // plain-English headline a non-expert can act on
  body: string;        // 1-2 sentence explanation
  recommendation: string; // what to do
  confidence: number;  // 0-100 — rule's own self-assessment
}

export interface Rule {
  id: string;
  description: string;
  minObservations: number;     // min qualifying provings on THIS meter
  minPopulationSize: number;   // min provings across the DB before rule may fire
  evaluate: (ctx: RuleContext) => RuleEmit | null;
}

export interface Suggestion {
  ruleId: string;
  meterId: string;
  severity: Severity;
  title: string;
  body: string;
  recommendation: string;
  confidence: number;
}
