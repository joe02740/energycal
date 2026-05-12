// REFERENCE.md §6, §7 — per-pass and run-level aggregation
//
// Per pass (ball/SVP):
//   IVm  = pulses / KF_nominal
//   ISVm = IVm × CCFm
//   GSVp = BPV × CCFp
//   IMF  = GSVp / ISVm
//
// Run-level:
//   MF per meter.mfCalcMethod
//   CMF = composite (rolling per-meter; v0 default = MF for this run)
//   MA  = 1 / MF
//   KF_new depends on track_factor (see §7.3)

import type { MfCalcMethod } from "./types";

export interface PassMfInput {
  passNumber: number;
  isWetDown: boolean;
  excluded: boolean;
  pulses: number;
  ccfMeter: number;
  ccfProver: number;
}

export interface PassMfOutput {
  passNumber: number;
  ivm: number;
  isvm: number;
  gsvp: number;
  imf: number;
  isWetDown: boolean;
  excluded: boolean;
  countsTowardMf: boolean;
}

export function computePassMf(params: {
  pass: PassMfInput;
  nominalKFactorPulsesPerGal: number;
  bpvBbl: number;
  bblToGal?: number;
}): PassMfOutput {
  const bblToGal = params.bblToGal ?? 42;
  const ivm = params.pass.pulses / params.nominalKFactorPulsesPerGal; // gal
  const isvm = ivm * params.pass.ccfMeter;
  const gsvp = params.bpvBbl * bblToGal * params.pass.ccfProver; // gal
  const imf = isvm === 0 ? 0 : gsvp / isvm;
  return {
    passNumber: params.pass.passNumber,
    ivm,
    isvm,
    gsvp,
    imf,
    isWetDown: params.pass.isWetDown,
    excluded: params.pass.excluded,
    countsTowardMf: !params.pass.isWetDown && !params.pass.excluded,
  };
}

export function aggregateMf(params: {
  passes: PassMfOutput[];
  method: MfCalcMethod;
  pulsesPerPass: number[]; // parallel array; only used for weighted_by_pulses
}): { mf: number; imfAvg: number } {
  const eligible = params.passes.filter((p) => p.countsTowardMf);
  if (eligible.length === 0) return { mf: 0, imfAvg: 0 };
  const imfAvg =
    eligible.reduce((sum, p) => sum + p.imf, 0) / eligible.length;

  switch (params.method) {
    case "avg_meter_factor":
      return { mf: imfAvg, imfAvg };
    case "weighted_by_volume": {
      const totalIsvm = eligible.reduce((sum, p) => sum + p.isvm, 0);
      const weighted =
        eligible.reduce((sum, p) => sum + p.imf * p.isvm, 0) / totalIsvm;
      return { mf: weighted, imfAvg };
    }
    case "weighted_by_pulses": {
      const totalPulses = params.pulsesPerPass.reduce((a, b) => a + b, 0);
      const weighted =
        eligible.reduce(
          (sum, p, i) => sum + p.imf * (params.pulsesPerPass[i] ?? 0),
          0,
        ) / totalPulses;
      return { mf: weighted, imfAvg };
    }
  }
}

// REFERENCE.md §7.3
export function kfFromMf(params: {
  trackFactor: "meter_factor" | "k_factor";
  mf: number;
  kPresent: number;
}): number {
  return params.trackFactor === "k_factor"
    ? params.kPresent * params.mf
    : params.kPresent / params.mf; // displayed equivalent K when track = meter_factor
}

export function meterAccuracy(mf: number): number {
  return 1 / mf;
}

// REFERENCE.md §7.4
export function repeatabilityPctOfPasses(passes: PassMfOutput[]): number {
  const eligible = passes.filter((p) => p.countsTowardMf).map((p) => p.imf);
  if (eligible.length < 2) return 0;
  const min = Math.min(...eligible);
  const max = Math.max(...eligible);
  return ((max - min) / min) * 100;
}
