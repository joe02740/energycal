// Pure evaluator. Filters rules by:
//   1. meter maturity (need ≥ rule.minObservations qualifying provings)
//   2. population size  (need ≥ rule.minPopulationSize total provings)
//   3. tenant threshold (rule.confidence must be ≥ tenantSuggestionThreshold)
// Returns suggestions in severity-then-confidence order.

import type {
  BaselineStatus,
  MeterMaturity,
  PopulationStats,
  ProvingObservation,
  Rule,
  Suggestion,
} from "./types";
import { RULES } from "./registry";

const SEVERITY_RANK: Record<Suggestion["severity"], number> = {
  alert: 4,
  warn: 3,
  watch: 2,
  info: 1,
};

export interface EvaluateInput {
  meterId: string;
  meterModel?: string;
  history: ProvingObservation[];
  population: PopulationStats;
  tenantSuggestionThreshold: number;
  minProvingsForBaseline: number;
  rules?: Rule[];
}

export function deriveMaturity(
  history: ProvingObservation[],
  minProvingsForBaseline: number,
  meterId: string,
): MeterMaturity {
  const qualifying = history.filter(
    (o) => !o.isWetDown && !o.excluded && o.passed,
  ).length;
  let status: BaselineStatus;
  if (qualifying < minProvingsForBaseline) status = "establishing";
  else if (qualifying < minProvingsForBaseline * 2) status = "developing";
  else status = "established";
  return {
    meterId,
    qualifyingObservations: qualifying,
    baselineStatus: status,
    provingsToBaseline: Math.max(0, minProvingsForBaseline - qualifying),
  };
}

export function evaluate(input: EvaluateInput): {
  maturity: MeterMaturity;
  suggestions: Suggestion[];
} {
  const rules = input.rules ?? RULES;
  const maturity = deriveMaturity(
    input.history,
    input.minProvingsForBaseline,
    input.meterId,
  );

  // Establishing meters NEVER receive suggestions — that's the feature.
  if (maturity.baselineStatus === "establishing") {
    return { maturity, suggestions: [] };
  }

  const qualifying = input.history.filter((o) => !o.isWetDown && !o.excluded).length;
  const popSize = input.population.totalProvings;

  const ctx = {
    meterId: input.meterId,
    meterModel: input.meterModel,
    history: input.history,
    population: input.population,
    tenantSuggestionThreshold: input.tenantSuggestionThreshold,
  };

  const suggestions: Suggestion[] = [];
  for (const rule of rules) {
    if (qualifying < rule.minObservations) continue;
    if (popSize < rule.minPopulationSize) continue;
    const emit = rule.evaluate(ctx);
    if (!emit) continue;
    if (emit.confidence < input.tenantSuggestionThreshold) continue;
    suggestions.push({
      ruleId: rule.id,
      meterId: input.meterId,
      severity: emit.severity,
      title: emit.title,
      body: emit.body,
      recommendation: emit.recommendation,
      confidence: emit.confidence,
    });
  }

  // 'developing' meters only receive the highest-confidence rules (≥ 70).
  // Established meters receive everything that passed the tenant threshold.
  const filtered =
    maturity.baselineStatus === "developing"
      ? suggestions.filter((s) => s.confidence >= 70)
      : suggestions;

  filtered.sort((a, b) => {
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sev !== 0) return sev;
    return b.confidence - a.confidence;
  });

  return { maturity, suggestions: filtered };
}
