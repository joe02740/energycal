// End-to-end orchestrator test against the Sprague diesel gold-standard.

import { describe, expect, it } from "vitest";
import { runProving } from "./runProving";
import { SPRAGUE_BAY7_DIESEL } from "./__fixtures__/sprague-bay7-diesel-2026-05-02";

describe("runProving — end-to-end against Sprague diesel fixture", () => {
  const result = runProving({
    meter: {
      nominalKFactorPulsesPerGal: SPRAGUE_BAY7_DIESEL.meter.nominalKFactorPulsesPerGal,
      mfCalcMethod: SPRAGUE_BAY7_DIESEL.meter.mfCalcMethod,
      trackFactor: SPRAGUE_BAY7_DIESEL.meter.trackFactor,
      kPresent: SPRAGUE_BAY7_DIESEL.meter.nominalKFactorPulsesPerGal,
    },
    prover: {
      bpvBbl: SPRAGUE_BAY7_DIESEL.prover.bpvBbl,
      pipeInternalDiameterIn: SPRAGUE_BAY7_DIESEL.prover.pipeInternalDiameterIn,
      pipeWallThicknessIn: SPRAGUE_BAY7_DIESEL.prover.pipeWallThicknessIn,
      material: SPRAGUE_BAY7_DIESEL.prover.material,
      certifiedTempF: SPRAGUE_BAY7_DIESEL.prover.certifiedTempF,
    },
    product: {
      group: SPRAGUE_BAY7_DIESEL.product.group,
      equilibriumVaporPressurePsig:
        SPRAGUE_BAY7_DIESEL.product.equilibriumVaporPressurePsig,
      densityType: SPRAGUE_BAY7_DIESEL.product.densityType,
      densityValue: SPRAGUE_BAY7_DIESEL.product.densityApi,
      densityUnit: "api_gravity",
      densityTemperatureF: SPRAGUE_BAY7_DIESEL.product.densityTemperatureF,
      densityPressurePsig: SPRAGUE_BAY7_DIESEL.product.densityPressurePsig,
      hydrometerCorrection: SPRAGUE_BAY7_DIESEL.product.hydroCorrection,
    },
    acceptance: {
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
    },
    passes: SPRAGUE_BAY7_DIESEL.passes.map((p) => ({
      passNumber: p.passNumber,
      isWetDown: false,
      excluded: false,
      pulses: p.pulses,
      proverTempF: p.tpF,
      proverPressurePsig: p.ppPsig,
      meterTempF: p.tmF,
      meterPressurePsig: p.pmPsig,
    })),
    history: {
      prior: { mf: 1.0431 },
    },
  });

  it("MF matches PROVEit's 1.0428 within ±0.0001", () => {
    expect(result.mf).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.mf, 3);
  });

  it("MA matches PROVEit's 0.9590", () => {
    expect(result.ma).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ma, 3);
  });

  it("KF (equivalent, track_factor=meter_factor) matches PROVEit's 191.8", () => {
    expect(result.kf).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.kf, 1);
  });

  it("Run-avg CTLp matches PROVEit's 1.004280", () => {
    expect(result.ctlProver).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ctlProver, 4);
  });

  it("Run-avg CPLp matches PROVEit's 1.000060", () => {
    expect(result.cplProver).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.cplProver, 4);
  });

  it("Run-avg CTSp matches PROVEit's 0.999740", () => {
    expect(result.ctsProver).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ctsProver, 4);
  });

  it("Run-avg CCFp matches PROVEit's 1.004090", () => {
    expect(result.ccfProver).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ccfProver, 3);
  });

  it("Run-avg CCFm matches PROVEit's 1.004340", () => {
    expect(result.ccfMeter).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ccfMeter, 3);
  });

  it("Repeatability matches PROVEit's 0.043%", () => {
    expect(result.repeatabilityPct).toBeCloseTo(
      SPRAGUE_BAY7_DIESEL.expectedResults.repeatabilityPct,
      1,
    );
  });

  it("Run passes overall acceptance", () => {
    expect(result.passed).toBe(true);
  });

  it("Resolves ρ_60 to ~844 kg/m³ from 35.9 °API at 60°F", () => {
    expect(result.rho60KgM3).toBeCloseTo(844.45, 0);
  });
});
