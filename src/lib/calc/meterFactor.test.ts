// REFERENCE.md §6, §7

import { describe, expect, it } from "vitest";
import {
  aggregateMf,
  computePassMf,
  kfFromMf,
  meterAccuracy,
  repeatabilityPctOfPasses,
} from "./meterFactor";
import { SPRAGUE_BAY7_DIESEL } from "./__fixtures__/sprague-bay7-diesel-2026-05-02";

describe("meter factor — pass + run aggregation", () => {
  // Compute per-pass MFs using PROVEit's reported per-pass CCFs as inputs.
  // This validates IVm/ISVm/GSVp/IMF chain, not the CCF computation (already tested).
  const passOutputs = SPRAGUE_BAY7_DIESEL.passes.map((p) =>
    computePassMf({
      pass: {
        passNumber: p.passNumber,
        isWetDown: false,
        excluded: false,
        pulses: p.pulses,
        ccfMeter: p.ccfm,
        ccfProver: p.ccfp,
      },
      nominalKFactorPulsesPerGal: SPRAGUE_BAY7_DIESEL.meter.nominalKFactorPulsesPerGal,
      bpvBbl: SPRAGUE_BAY7_DIESEL.prover.bpvBbl,
    }),
  );

  it("Sprague diesel: per-pass IVm matches PROVEit (pass 1: 38.4597)", () => {
    expect(passOutputs[0].ivm).toBeCloseTo(SPRAGUE_BAY7_DIESEL.passes[0].ivm, 3);
  });

  it("Sprague diesel: per-pass ISVm matches PROVEit (pass 1: 38.6282)", () => {
    expect(passOutputs[0].isvm).toBeCloseTo(SPRAGUE_BAY7_DIESEL.passes[0].isvm, 3);
  });

  it("Sprague diesel: per-pass GSVp matches PROVEit (pass 1: 40.2893)", () => {
    expect(passOutputs[0].gsvp).toBeCloseTo(SPRAGUE_BAY7_DIESEL.passes[0].gsvp, 3);
  });

  it("Sprague diesel: per-pass IMF matches PROVEit (pass 1: 1.04300)", () => {
    expect(passOutputs[0].imf).toBeCloseTo(SPRAGUE_BAY7_DIESEL.passes[0].imf, 4);
  });

  it("Sprague diesel: avg_meter_factor MF matches PROVEit's 1.0428", () => {
    const { mf, imfAvg } = aggregateMf({
      passes: passOutputs,
      method: "avg_meter_factor",
      pulsesPerPass: SPRAGUE_BAY7_DIESEL.passes.map((p) => p.pulses),
    });
    expect(mf).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.mf, 3);
    expect(imfAvg).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.imfAvg, 4);
  });

  it("MA = 1 / MF", () => {
    expect(meterAccuracy(SPRAGUE_BAY7_DIESEL.expectedResults.mf)).toBeCloseTo(
      SPRAGUE_BAY7_DIESEL.expectedResults.ma,
      3,
    );
  });

  it("KF — track_factor=meter_factor uses K_nominal / MF (displayed equivalent)", () => {
    const kf = kfFromMf({
      trackFactor: "meter_factor",
      mf: SPRAGUE_BAY7_DIESEL.expectedResults.mf,
      kPresent: SPRAGUE_BAY7_DIESEL.meter.nominalKFactorPulsesPerGal,
    });
    expect(kf).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.kf, 1);
  });

  it("KF — track_factor=k_factor uses K_present × MF (write-back to meter)", () => {
    const kf = kfFromMf({ trackFactor: "k_factor", mf: 0.9994, kPresent: 240.244 });
    expect(kf).toBeCloseTo(240.1, 0); // matches gold-standard gasoline run K-factor
  });

  it("repeatability matches PROVEit's 0.043%", () => {
    const repeat = repeatabilityPctOfPasses(passOutputs);
    expect(repeat).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.repeatabilityPct, 1);
  });

  it("wet-down and excluded passes don't count toward MF", () => {
    const passes = [
      computePassMf({
        pass: { passNumber: 0, isWetDown: true, excluded: false, pulses: 7000, ccfMeter: 1.0, ccfProver: 1.0 },
        nominalKFactorPulsesPerGal: 200,
        bpvBbl: 0.955332,
      }),
      computePassMf({
        pass: { passNumber: 1, isWetDown: false, excluded: false, pulses: 7693, ccfMeter: 1.00438, ccfProver: 1.00412 },
        nominalKFactorPulsesPerGal: 200,
        bpvBbl: 0.955332,
      }),
    ];
    const { mf } = aggregateMf({
      passes,
      method: "avg_meter_factor",
      pulsesPerPass: [7000, 7693],
    });
    // Should equal pass 1's IMF only (wet-down excluded)
    expect(mf).toBeCloseTo(passes[1].imf, 4);
  });
});
