// REFERENCE.md §10 — top-level orchestrator. Composes every module into a single
// (inputs) → ProvingRunResult function. The UI will call this; nothing else
// imports the per-module files directly except for tests.

import {
  evaluateAcceptance,
  type AcceptanceCriteriaProfile,
  type BaselineProving,
  type PriorProving,
} from "./acceptance";
import { ccfMeter, ccfProver } from "./ccf";
import { cpl } from "./cpl";
import { cps } from "./cps";
import { ctl } from "./ctl";
import { cts } from "./cts";
import { apiToRho60KgM3, hydrometerCorrect } from "./density";
import {
  aggregateMf,
  computePassMf,
  kfFromMf,
  meterAccuracy,
  repeatabilityPctOfPasses,
  type PassMfOutput,
} from "./meterFactor";
import type {
  DensityType,
  DensityUnit,
  MfCalcMethod,
  ProductGroup,
  ProverMaterial,
} from "./types";

export interface RunProvingInputs {
  meter: {
    nominalKFactorPulsesPerGal: number;
    mfCalcMethod: MfCalcMethod;
    trackFactor: "meter_factor" | "k_factor";
    kPresent: number; // K_nominal for meter_factor track; current programmed K for k_factor track
  };
  prover: {
    bpvBbl: number;
    pipeInternalDiameterIn: number;
    pipeWallThicknessIn: number;
    material: ProverMaterial;
    certifiedTempF?: number;
    gcOverride?: number | null;
    modulusOverride?: number | null;
  };
  product: {
    group: ProductGroup;
    equilibriumVaporPressurePsig: number;
    densityType: DensityType;
    densityValue: number;
    densityUnit: DensityUnit;
    densityTemperatureF: number;
    densityPressurePsig?: number;
    hydrometerCorrection?: boolean;
  };
  acceptance: AcceptanceCriteriaProfile;
  passes: Array<{
    passNumber: number;
    isWetDown: boolean;
    excluded: boolean;
    pulses: number;
    proverTempF: number;
    proverPressurePsig: number;
    meterTempF: number;
    meterPressurePsig: number;
  }>;
  history?: {
    prior?: PriorProving | null;
    historical?: PriorProving[];
    baseline?: BaselineProving | null;
    productId?: string | null;
  };
}

export interface RunProvingOutput {
  // Headline factors (PROVEit naming)
  mf: number;
  cmf: number;
  ma: number;
  kf: number;
  ckf: number;

  // Run-level corrections (averaged across non-excluded non-wet-down passes)
  ctlMeter: number;
  cplMeter: number;
  ccfMeter: number;
  ctsProver: number;
  cpsProver: number;
  ctlProver: number;
  cplProver: number;
  ccfProver: number;

  // Aggregates
  imfAvg: number;
  ivmTotal: number;
  isvmTotal: number;
  gsvpTotal: number;
  nm: number;

  // Density resolution
  rho60KgM3: number;

  // Acceptance
  repeatabilityPct: number;
  passed: boolean;
  consistencyPassed: boolean;
  repeatabilityPassed: boolean;
  priorPassed: boolean | null;
  priorDeviationPct: number | null;
  historicalPassed: boolean | null;
  historicalDeviationPct: number | null;
  baselinePassed: boolean | null;
  baselineDeviationPct: number | null;

  passes: Array<
    PassMfOutput & {
      ctlMeter: number;
      cplMeter: number;
      ctsProver: number;
      cpsProver: number;
      ctlProver: number;
      cplProver: number;
      ccfMeter: number;
      ccfProver: number;
    }
  >;
  warnings: string[];
}

function resolveRho60(input: RunProvingInputs["product"], warnings: string[]): number {
  // Convert input density to kg/m³
  let rhoEntered: number;
  if (input.densityUnit === "api_gravity") {
    rhoEntered = apiToRho60KgM3(input.densityValue);
  } else if (input.densityUnit === "g_cm3") {
    rhoEntered = input.densityValue * 1000;
  } else {
    rhoEntered = input.densityValue;
  }

  // Optional hydrometer correction
  if (input.hydrometerCorrection) {
    rhoEntered = hydrometerCorrect(rhoEntered, input.densityTemperatureF);
  }

  // If entered as base density at 60°F, we're done.
  if (input.densityType === "base_rho_60") return rhoEntered;

  // Observed density: if entered at 60°F, ρ_obs == ρ_60. Otherwise iterate.
  if (Math.abs(input.densityTemperatureF - 60) < 0.05) return rhoEntered;

  // Iterate ρ_60 = ρ_obs / CTL(ρ_60, T_obs)
  let rho60 = rhoEntered;
  for (let i = 0; i < 20; i++) {
    const c = ctl({
      rho60KgM3: rho60,
      observedTempF: input.densityTemperatureF,
      productGroup: input.group,
      warnings,
    });
    const next = rhoEntered / c;
    if (Math.abs(next - rho60) < 0.01) {
      return next;
    }
    rho60 = next;
  }
  warnings.push("ρ_60 iteration did not converge in 20 steps — using last value");
  return rho60;
}

export function runProving(inputs: RunProvingInputs): RunProvingOutput {
  const warnings: string[] = [];
  const rho60 = resolveRho60(inputs.product, warnings);
  const baseTempF = inputs.prover.certifiedTempF ?? 60;

  const passOutputs = inputs.passes.map((p) => {
    const ctsP = cts({
      proverTempF: p.proverTempF,
      baseTempF,
      material: inputs.prover.material,
      gcOverride: inputs.prover.gcOverride,
    });
    const cpsP = cps({
      proverPressurePsig: p.proverPressurePsig,
      pipeInternalDiameterIn: inputs.prover.pipeInternalDiameterIn,
      pipeWallThicknessIn: inputs.prover.pipeWallThicknessIn,
      material: inputs.prover.material,
      modulusOverride: inputs.prover.modulusOverride,
    });
    const ctlP = ctl({
      rho60KgM3: rho60,
      observedTempF: p.proverTempF,
      productGroup: inputs.product.group,
      warnings,
    });
    const cplP = cpl({
      pressurePsig: p.proverPressurePsig,
      equilibriumVaporPressurePsig: inputs.product.equilibriumVaporPressurePsig,
      tempF: p.proverTempF,
      rho60KgM3: rho60,
    }).cpl;
    const ctlM = ctl({
      rho60KgM3: rho60,
      observedTempF: p.meterTempF,
      productGroup: inputs.product.group,
      warnings,
    });
    const cplM = cpl({
      pressurePsig: p.meterPressurePsig,
      equilibriumVaporPressurePsig: inputs.product.equilibriumVaporPressurePsig,
      tempF: p.meterTempF,
      rho60KgM3: rho60,
    }).cpl;
    const ccfP = ccfProver({
      ctsProver: ctsP,
      cpsProver: cpsP,
      ctlProver: ctlP,
      cplProver: cplP,
    });
    const ccfM = ccfMeter({ ctlMeter: ctlM, cplMeter: cplM });

    const passMf = computePassMf({
      pass: {
        passNumber: p.passNumber,
        isWetDown: p.isWetDown,
        excluded: p.excluded,
        pulses: p.pulses,
        ccfMeter: ccfM,
        ccfProver: ccfP,
      },
      nominalKFactorPulsesPerGal: inputs.meter.nominalKFactorPulsesPerGal,
      bpvBbl: inputs.prover.bpvBbl,
    });

    return {
      ...passMf,
      ctlMeter: ctlM,
      cplMeter: cplM,
      ctsProver: ctsP,
      cpsProver: cpsP,
      ctlProver: ctlP,
      cplProver: cplP,
      ccfMeter: ccfM,
      ccfProver: ccfP,
    };
  });

  const eligible = passOutputs.filter((p) => p.countsTowardMf);
  const { mf, imfAvg } = aggregateMf({
    passes: passOutputs,
    method: inputs.meter.mfCalcMethod,
    pulsesPerPass: inputs.passes.map((p) => p.pulses),
  });
  const cmf = mf; // v0: simple — composite = this run only
  const ma = meterAccuracy(mf);
  const kf = kfFromMf({
    trackFactor: inputs.meter.trackFactor,
    mf,
    kPresent: inputs.meter.kPresent,
  });

  // Run-averaged correction factors: simple mean across eligible passes.
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const ctlMeterAvg = mean(eligible.map((p) => p.ctlMeter));
  const cplMeterAvg = mean(eligible.map((p) => p.cplMeter));
  const ccfMeterAvg = mean(eligible.map((p) => p.ccfMeter));
  const ctsProverAvg = mean(eligible.map((p) => p.ctsProver));
  const cpsProverAvg = mean(eligible.map((p) => p.cpsProver));
  const ctlProverAvg = mean(eligible.map((p) => p.ctlProver));
  const cplProverAvg = mean(eligible.map((p) => p.cplProver));
  const ccfProverAvg = mean(eligible.map((p) => p.ccfProver));

  const ivmTotal = eligible.reduce((s, p) => s + p.ivm, 0);
  const isvmTotal = eligible.reduce((s, p) => s + p.isvm, 0);
  const gsvpTotal = eligible.reduce((s, p) => s + p.gsvp, 0);
  const nm = eligible.reduce(
    (s, p, i) => s + (inputs.passes[passOutputs.indexOf(p)]?.pulses ?? 0),
    0,
  );

  const repeatabilityPct = repeatabilityPctOfPasses(passOutputs);
  const acceptance = evaluateAcceptance({
    profile: inputs.acceptance,
    mf,
    imfPasses: eligible.map((p) => p.imf),
    productId: inputs.history?.productId ?? null,
    prior: inputs.history?.prior ?? null,
    historical: inputs.history?.historical ?? [],
    baseline: inputs.history?.baseline ?? null,
  });

  return {
    mf,
    cmf,
    ma,
    kf,
    ckf: kf,
    ctlMeter: ctlMeterAvg,
    cplMeter: cplMeterAvg,
    ccfMeter: ccfMeterAvg,
    ctsProver: ctsProverAvg,
    cpsProver: cpsProverAvg,
    ctlProver: ctlProverAvg,
    cplProver: cplProverAvg,
    ccfProver: ccfProverAvg,
    imfAvg,
    ivmTotal,
    isvmTotal,
    gsvpTotal,
    nm,
    rho60KgM3: rho60,
    repeatabilityPct,
    passed: acceptance.passed,
    consistencyPassed: acceptance.consistencyPassed,
    repeatabilityPassed: acceptance.repeatabilityPassed,
    priorPassed: acceptance.priorPassed,
    priorDeviationPct: acceptance.priorDeviationPct,
    historicalPassed: acceptance.historicalPassed,
    historicalDeviationPct: acceptance.historicalDeviationPct,
    baselinePassed: acceptance.baselinePassed,
    baselineDeviationPct: acceptance.baselineDeviationPct,
    passes: passOutputs,
    warnings: [...warnings, ...acceptance.warnings],
  };
}
