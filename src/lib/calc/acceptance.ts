// REFERENCE.md §8 — acceptance gates

export interface AcceptanceCriteriaProfile {
  evaluationMethod: "repeatability" | "none";
  repeatabilityTolerancePct: number;
  consistencyRunsRequired: number;
  consistencyRunsMax: number;
  priorDeviationCheck: boolean;
  priorDeviationMaxPct: number | null;
  priorDeviationProductDependent: boolean;
  priorDeviationUseFailedProvings: boolean;
  priorDeviationUseCutoffDate: boolean;
  historicalDeviationCheck: boolean;
  historicalDeviationNPrevious: number;
  historicalDeviationMaxPct: number | null;
  baselineDeviationCheck: boolean;
  baselineDeviationMaxPct: number | null;
  irvingStyleRepeatability: boolean;
}

export interface PriorProving {
  mf: number;
  productId?: string | null;
  voidedOrFailed?: boolean;
}

export interface BaselineProving {
  mf: number;
  productId?: string | null;
}

export interface AcceptanceInputs {
  profile: AcceptanceCriteriaProfile;
  mf: number;
  imfPasses: number[]; // non-wet-down, non-excluded
  productId?: string | null;
  prior?: PriorProving | null;
  historical?: PriorProving[];
  baseline?: BaselineProving | null;
}

export interface AcceptanceResult {
  passed: boolean;
  repeatabilityPassed: boolean;
  repeatabilityPct: number;
  consistencyPassed: boolean;
  priorPassed: boolean | null;
  priorDeviationPct: number | null;
  historicalPassed: boolean | null;
  historicalDeviationPct: number | null;
  baselinePassed: boolean | null;
  baselineDeviationPct: number | null;
  warnings: string[];
}

function repeatabilityOf(imfPasses: number[]): number {
  if (imfPasses.length < 2) return 0;
  const min = Math.min(...imfPasses);
  const max = Math.max(...imfPasses);
  return ((max - min) / min) * 100;
}

function eligiblePrior(p: AcceptanceInputs): PriorProving | null {
  if (!p.prior) return null;
  if (p.profile.priorDeviationProductDependent && p.prior.productId !== p.productId) {
    return null;
  }
  if (!p.profile.priorDeviationUseFailedProvings && p.prior.voidedOrFailed) {
    return null;
  }
  return p.prior;
}

function eligibleHistorical(p: AcceptanceInputs): PriorProving[] {
  const all = p.historical ?? [];
  return all.filter((h) => {
    if (p.profile.priorDeviationProductDependent && h.productId !== p.productId) {
      return false;
    }
    if (!p.profile.priorDeviationUseFailedProvings && h.voidedOrFailed) {
      return false;
    }
    return true;
  });
}

export function evaluateAcceptance(p: AcceptanceInputs): AcceptanceResult {
  const warnings: string[] = [];
  const profile = p.profile;

  // 8.1 Repeatability
  const repeatabilityPct = repeatabilityOf(p.imfPasses);
  let repeatabilityPassed = repeatabilityPct <= profile.repeatabilityTolerancePct;

  // 8.6 Irving-style strict — applied after the basic repeatability gate
  if (profile.irvingStyleRepeatability) {
    const allInBand = p.imfPasses.every((mf) => mf >= 0.9995 && mf <= 1.0005);
    if (!allInBand) {
      repeatabilityPassed = false;
      warnings.push("Irving rule: at least one pass MF outside [0.9995, 1.0005]");
    }
    if (p.imfPasses.length >= 2) {
      for (let i = 1; i < p.imfPasses.length; i++) {
        if (Math.abs(p.imfPasses[i] - p.imfPasses[i - 1]) > 0.0005) {
          repeatabilityPassed = false;
          warnings.push(
            `Irving rule: |MF_${i} − MF_${i + 1}| > 0.0005`,
          );
          break;
        }
      }
    }
    if (p.prior && p.imfPasses.length >= 2) {
      const last2Avg =
        (p.imfPasses[p.imfPasses.length - 1] + p.imfPasses[p.imfPasses.length - 2]) / 2;
      if (Math.abs(last2Avg - p.prior.mf) > 0.0010) {
        repeatabilityPassed = false;
        warnings.push("Irving rule: avg of last 2 passes outside ±0.0010 of previous MF");
      }
    }
  }

  // 8.2 Consistency: of the last consistencyRunsMax non-wet-down passes,
  // at least consistencyRunsRequired must pass repeatability individually.
  // For v0 we treat "passing repeatability" at pass-level as: this pass's
  // MF is within tolerance of the run's mean MF.
  const lastN = p.imfPasses.slice(-profile.consistencyRunsMax);
  const meanLastN = lastN.length
    ? lastN.reduce((a, b) => a + b, 0) / lastN.length
    : 0;
  const passingCount = lastN.filter(
    (mf) =>
      Math.abs(mf - meanLastN) / meanLastN * 100 <=
      profile.repeatabilityTolerancePct,
  ).length;
  const consistencyPassed = passingCount >= profile.consistencyRunsRequired;

  // 8.3 Prior Deviation
  let priorPassed: boolean | null = null;
  let priorDeviationPct: number | null = null;
  if (profile.priorDeviationCheck && profile.priorDeviationMaxPct != null) {
    const prior = eligiblePrior(p);
    if (prior) {
      priorDeviationPct = (Math.abs(p.mf - prior.mf) / prior.mf) * 100;
      priorPassed = priorDeviationPct <= profile.priorDeviationMaxPct;
    }
  }

  // 8.4 Historical Deviation
  let historicalPassed: boolean | null = null;
  let historicalDeviationPct: number | null = null;
  if (profile.historicalDeviationCheck && profile.historicalDeviationMaxPct != null) {
    const hist = eligibleHistorical(p).slice(0, profile.historicalDeviationNPrevious);
    if (hist.length > 0) {
      const histMean = hist.reduce((s, h) => s + h.mf, 0) / hist.length;
      historicalDeviationPct = (Math.abs(p.mf - histMean) / histMean) * 100;
      historicalPassed = historicalDeviationPct <= profile.historicalDeviationMaxPct;
    }
  }

  // 8.5 Baseline Deviation
  let baselinePassed: boolean | null = null;
  let baselineDeviationPct: number | null = null;
  if (profile.baselineDeviationCheck && profile.baselineDeviationMaxPct != null) {
    const baseline = p.baseline ?? null;
    if (baseline) {
      baselineDeviationPct = (Math.abs(p.mf - baseline.mf) / baseline.mf) * 100;
      baselinePassed = baselineDeviationPct <= profile.baselineDeviationMaxPct;
    }
  }

  // 8.7 Overall pass — null (skipped) doesn't drag verdict down
  const passed =
    repeatabilityPassed &&
    consistencyPassed &&
    (priorPassed === null || priorPassed) &&
    (historicalPassed === null || historicalPassed) &&
    (baselinePassed === null || baselinePassed);

  return {
    passed,
    repeatabilityPassed,
    repeatabilityPct,
    consistencyPassed,
    priorPassed,
    priorDeviationPct,
    historicalPassed,
    historicalDeviationPct,
    baselinePassed,
    baselineDeviationPct,
    warnings,
  };
}
