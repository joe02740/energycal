// REFERENCE.md §8

import { describe, expect, it } from "vitest";
import {
  evaluateAcceptance,
  type AcceptanceCriteriaProfile,
} from "./acceptance";

const sprague: AcceptanceCriteriaProfile = {
  evaluationMethod: "repeatability",
  repeatabilityTolerancePct: 0.05,
  consistencyRunsRequired: 3,
  consistencyRunsMax: 3,
  priorDeviationCheck: true,
  priorDeviationMaxPct: 0.25,
  priorDeviationProductDependent: false,
  priorDeviationUseFailedProvings: true,
  priorDeviationUseCutoffDate: false,
  historicalDeviationCheck: false,
  historicalDeviationNPrevious: 0,
  historicalDeviationMaxPct: null,
  baselineDeviationCheck: false,
  baselineDeviationMaxPct: null,
  irvingStyleRepeatability: false,
};

describe("acceptance gates", () => {
  it("Sprague diesel passes all checks", () => {
    const result = evaluateAcceptance({
      profile: sprague,
      mf: 1.0428,
      imfPasses: [1.04300, 1.04255, 1.04289],
      prior: { mf: 1.0431 }, // creates a Prior Dev of ~0.0288%
    });
    expect(result.passed).toBe(true);
    expect(result.repeatabilityPassed).toBe(true);
    expect(result.consistencyPassed).toBe(true);
    expect(result.priorPassed).toBe(true);
    expect(result.priorDeviationPct).toBeCloseTo(0.0288, 2);
    expect(result.repeatabilityPct).toBeLessThan(0.05);
  });

  it("Repeatability fail when spread > tolerance", () => {
    const result = evaluateAcceptance({
      profile: sprague,
      mf: 1.0,
      imfPasses: [0.999, 1.001, 1.003], // spread = 0.4%, way over 0.05
    });
    expect(result.repeatabilityPassed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("Prior deviation fail when MF drift exceeds max", () => {
    const result = evaluateAcceptance({
      profile: sprague,
      mf: 1.0428,
      imfPasses: [1.0428, 1.0428, 1.0428],
      prior: { mf: 1.0500 }, // ~0.69% drift, exceeds 0.25
    });
    expect(result.priorPassed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("Skipped checks return null and don't fail the run", () => {
    const noPrior: AcceptanceCriteriaProfile = { ...sprague, priorDeviationCheck: false };
    const result = evaluateAcceptance({
      profile: noPrior,
      mf: 1.0,
      imfPasses: [0.9999, 1.0000, 1.0001],
    });
    expect(result.priorPassed).toBeNull();
    expect(result.passed).toBe(true);
  });

  it("Product-dependent prior excludes prior on different product", () => {
    const productDep: AcceptanceCriteriaProfile = {
      ...sprague,
      priorDeviationProductDependent: true,
    };
    const result = evaluateAcceptance({
      profile: productDep,
      mf: 1.0,
      imfPasses: [1.0, 1.0, 1.0],
      productId: "diesel",
      prior: { mf: 1.5, productId: "gasoline" }, // different product
    });
    expect(result.priorPassed).toBeNull(); // prior was excluded
    expect(result.passed).toBe(true);
  });

  it("Failed/voided prior excluded when flag is false", () => {
    const skipFailed: AcceptanceCriteriaProfile = {
      ...sprague,
      priorDeviationUseFailedProvings: false,
    };
    const result = evaluateAcceptance({
      profile: skipFailed,
      mf: 1.0,
      imfPasses: [1.0, 1.0],
      prior: { mf: 1.5, voidedOrFailed: true },
    });
    expect(result.priorPassed).toBeNull();
  });

  it("Irving-style: pass when within band, delta tight, avg near previous", () => {
    const irving: AcceptanceCriteriaProfile = {
      ...sprague,
      irvingStyleRepeatability: true,
      priorDeviationCheck: false,
    };
    const result = evaluateAcceptance({
      profile: irving,
      mf: 1.0,
      imfPasses: [0.9998, 1.0001],
      prior: { mf: 1.0000 },
    });
    expect(result.repeatabilityPassed).toBe(true);
  });

  it("Irving-style: fail when delta > 0.0005 even if both within band", () => {
    const irving: AcceptanceCriteriaProfile = {
      ...sprague,
      irvingStyleRepeatability: true,
      priorDeviationCheck: false,
    };
    const result = evaluateAcceptance({
      profile: irving,
      mf: 1.0,
      imfPasses: [0.9995, 1.0004], // delta = 0.0009
      prior: { mf: 1.0000 },
    });
    expect(result.repeatabilityPassed).toBe(false);
    expect(result.warnings.some((w) => w.includes("Irving"))).toBe(true);
  });

  it("Historical deviation pass when within tolerance of mean", () => {
    const histProfile: AcceptanceCriteriaProfile = {
      ...sprague,
      historicalDeviationCheck: true,
      historicalDeviationNPrevious: 3,
      historicalDeviationMaxPct: 0.25,
    };
    const result = evaluateAcceptance({
      profile: histProfile,
      mf: 1.0428,
      imfPasses: [1.0428, 1.0428, 1.0428],
      historical: [{ mf: 1.0427 }, { mf: 1.0429 }, { mf: 1.0428 }],
    });
    expect(result.historicalPassed).toBe(true);
    expect(result.historicalDeviationPct).toBeLessThan(0.05);
  });

  it("Baseline deviation flagged when MF drifts from baseline", () => {
    const baselineProfile: AcceptanceCriteriaProfile = {
      ...sprague,
      baselineDeviationCheck: true,
      baselineDeviationMaxPct: 0.10,
    };
    const result = evaluateAcceptance({
      profile: baselineProfile,
      mf: 1.0500,
      imfPasses: [1.05, 1.05, 1.05],
      baseline: { mf: 1.0428 },
    });
    expect(result.baselinePassed).toBe(false);
    expect(result.baselineDeviationPct).toBeGreaterThan(0.5);
  });
});
