// Conservative rule set for v0.
// Every rule's confidenceFn is calibrated low so v0 stays SILENT in practice
// (tenant.suggestionThreshold default = 85; rules return ≤ 80 as a rule of thumb).
// We turn the dial up per-tenant once we have a calibrated baseline.
// See REFERENCE: feedback_suggestions_dial.md

import type { Rule, RuleContext, RuleEmit } from "./types";

// Helper: average drift between consecutive provings (not wet-down, not excluded)
function consecutiveDeltas(ctx: RuleContext): number[] {
  const xs: number[] = [];
  const valid = ctx.history.filter((o) => !o.isWetDown && !o.excluded);
  for (let i = 1; i < valid.length; i++) {
    xs.push(valid[i].mf - valid[i - 1].mf);
  }
  return xs;
}

// ---------------------------------------------------------------------------
// Rule: drift since last proving exceeds typical drift for this meter
// ---------------------------------------------------------------------------
const driftFasterThanUsual: Rule = {
  id: "drift_faster_than_usual",
  description:
    "MF deviation from previous proving exceeds this meter's own historical median drift.",
  minObservations: 5,
  minPopulationSize: 0, // self-comparison only
  evaluate: (ctx): RuleEmit | null => {
    const deltas = consecutiveDeltas(ctx).map((d) => Math.abs(d));
    if (deltas.length < 4) return null;
    const latest = deltas[deltas.length - 1];
    const previous = deltas.slice(0, -1).sort((a, b) => a - b);
    const median = previous[Math.floor(previous.length / 2)];
    if (median <= 0) return null;
    const ratio = latest / median;
    if (ratio < 1.5) return null;
    // Confidence scales with how unusual the drift is, capped low for v0.
    const confidence = Math.min(75, 40 + (ratio - 1.5) * 15);
    return {
      severity: ratio >= 3 ? "warn" : "watch",
      title: "Drift since last proving is larger than usual for this meter.",
      body: `Latest MF change is ${(latest * 100).toFixed(3)}% — about ${ratio.toFixed(1)}× this meter's typical drift between visits.`,
      recommendation:
        "Investigate before next proving — check for product change, flow regime change, or seal integrity.",
      confidence,
    };
  },
};

// ---------------------------------------------------------------------------
// Rule: prior deviation outside acceptance, even though run passed repeatability
// ---------------------------------------------------------------------------
const priorDeviationCloseCall: Rule = {
  id: "prior_deviation_close_call",
  description:
    "Latest proving's deviation from the previous MF is high enough to warrant attention.",
  minObservations: 2,
  minPopulationSize: 0,
  evaluate: (ctx): RuleEmit | null => {
    const valid = ctx.history.filter((o) => !o.isWetDown && !o.excluded);
    if (valid.length < 2) return null;
    const latest = valid[valid.length - 1];
    if (latest.priorDeviationPct == null) return null;
    const dev = Math.abs(latest.priorDeviationPct);
    if (dev < 0.2) return null;
    return {
      severity: dev >= 0.5 ? "warn" : "watch",
      title: "Prior deviation is large — meter has drifted between visits.",
      body: `Deviation from previous MF: ${dev.toFixed(2)}%.`,
      recommendation:
        "Consider tightening the proving cadence for this meter to catch drift earlier.",
      confidence: Math.min(70, 30 + dev * 60),
    };
  },
};

// ---------------------------------------------------------------------------
// Rule: time since last proving exceeds typical interval
// ---------------------------------------------------------------------------
const cadenceStretched: Rule = {
  id: "cadence_stretched",
  description:
    "Days since last proving exceeds the meter's own historical median interval.",
  minObservations: 4,
  minPopulationSize: 0,
  evaluate: (ctx): RuleEmit | null => {
    const valid = ctx.history.filter((o) => !o.isWetDown && !o.excluded);
    if (valid.length < 4) return null;
    const intervals: number[] = [];
    for (let i = 1; i < valid.length; i++) {
      const ms = valid[i].datePerformed.getTime() - valid[i - 1].datePerformed.getTime();
      intervals.push(ms / (1000 * 60 * 60 * 24));
    }
    const last = intervals[intervals.length - 1];
    const sorted = intervals.slice(0, -1).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (!median || last < median * 1.4) return null;
    return {
      severity: "info",
      title: "Cadence stretched — you've gone longer than usual without a proving.",
      body: `Last interval: ${last.toFixed(0)} days. Typical: ${median.toFixed(0)} days.`,
      recommendation:
        "If the meter is high-throughput, schedule a reproof; the longer the gap, the more product is flowing under an unverified factor.",
      confidence: 50,
    };
  },
};

// ---------------------------------------------------------------------------
// Rule: meter drifts faster than the population (model + product cohort)
// ---------------------------------------------------------------------------
const outlierVsPopulation: Rule = {
  id: "outlier_vs_population",
  description:
    "Meter's drift rate is meaningfully faster than the same model+product population.",
  minObservations: 6,
  minPopulationSize: 50, // need a real population before claiming "outlier"
  evaluate: (ctx): RuleEmit | null => {
    if (!ctx.meterModel) return null;
    const popStat = ctx.population.byMeterModel[ctx.meterModel];
    if (!popStat || popStat.count < 30) return null;
    const valid = ctx.history.filter((o) => !o.isWetDown && !o.excluded);
    if (valid.length < 6) return null;
    const intervals: number[] = [];
    const drifts: number[] = [];
    for (let i = 1; i < valid.length; i++) {
      const days =
        (valid[i].datePerformed.getTime() - valid[i - 1].datePerformed.getTime()) /
        (1000 * 60 * 60 * 24);
      if (days > 0) {
        intervals.push(days);
        drifts.push(Math.abs(valid[i].mf - valid[i - 1].mf) / days);
      }
    }
    if (drifts.length === 0) return null;
    const meterDriftPctPerDay =
      drifts.reduce((a, b) => a + b, 0) / drifts.length;
    if (meterDriftPctPerDay <= popStat.medianDriftPctPerDay * 2) return null;
    return {
      severity: "watch",
      title: "Drifts faster than other meters of the same model and product.",
      body: `This meter loses ${(meterDriftPctPerDay * 100).toFixed(4)}%/day on average — about ${(meterDriftPctPerDay / popStat.medianDriftPctPerDay).toFixed(1)}× the typical rate for ${ctx.meterModel}.`,
      recommendation:
        "Possible early indicator of mechanical wear; flag for inspection at next visit.",
      confidence: 65,
    };
  },
};

// ---------------------------------------------------------------------------
// Rule: repeatability has been quietly degrading
// ---------------------------------------------------------------------------
const repeatabilityDegrading: Rule = {
  id: "repeatability_degrading",
  description:
    "Repeatability is trending up over the last several provings even though all passed.",
  minObservations: 5,
  minPopulationSize: 0,
  evaluate: (ctx): RuleEmit | null => {
    const valid = ctx.history
      .filter((o) => !o.isWetDown && !o.excluded && o.repeatabilityPct != null)
      .slice(-5);
    if (valid.length < 5) return null;
    const reps = valid.map((o) => o.repeatabilityPct!);
    // Simple linear-fit-style trend: compare first half avg to second half avg.
    const half = Math.floor(reps.length / 2);
    const firstAvg = reps.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondAvg = reps.slice(half).reduce((a, b) => a + b, 0) / (reps.length - half);
    if (secondAvg < firstAvg * 1.3) return null;
    return {
      severity: "watch",
      title: "Repeatability is trending worse over recent provings.",
      body: `Average repeatability moved from ${firstAvg.toFixed(3)}% to ${secondAvg.toFixed(3)}% across the last 5 provings.`,
      recommendation:
        "Watch for valve seat wear, prover detector switch drift, or product changes; not yet a fail but worth a closer look.",
      confidence: 55,
    };
  },
};

export const RULES: Rule[] = [
  driftFasterThanUsual,
  priorDeviationCloseCall,
  cadenceStretched,
  outlierVsPopulation,
  repeatabilityDegrading,
];
