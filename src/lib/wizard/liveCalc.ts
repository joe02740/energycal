// Wires the wizard state into the calc engine for live MF/repeatability display.

import { runProving, type RunProvingInputs, type RunProvingOutput } from "@/lib/calc";
import type {
  AcceptanceProfile,
  ApiTableGroup,
  Meter,
  Product,
  Prover,
  ProverMaterial,
} from "@/lib/data/types";
import type { WizardPass } from "./store";

interface LiveCalcArgs {
  meter: Meter;
  prover: Prover;
  product: Product;
  acceptance: AcceptanceProfile;
  densityApi: number;
  densityTempF: number;
  densityPressurePsig: number;
  hydrometerCorrection: boolean;
  evpPsig: number;
  passes: WizardPass[];
}

const materialMap: Record<ProverMaterial, RunProvingInputs["prover"]["material"]> = {
  "Carbon Steel": "carbon_steel",
  "304 Stainless Steel": "ss_304",
  "316 Stainless Steel": "ss_316",
  "Invar": "invar",
};

export function tryRunProving(args: LiveCalcArgs): RunProvingOutput | null {
  // Only run when at least one pass has every required field filled in.
  const ready = args.passes.filter(
    (p) =>
      !p.excluded &&
      typeof p.pulses === "number" && p.pulses > 0 &&
      typeof p.proverTempF === "number" &&
      typeof p.proverPressurePsig === "number" &&
      typeof p.meterTempF === "number" &&
      typeof p.meterPressurePsig === "number",
  );
  if (ready.length === 0) return null;
  if (typeof args.densityApi !== "number" || args.densityApi <= 0) return null;
  if (!args.prover.pipeInternalDiameterIn || !args.prover.pipeWallThicknessIn) {
    return null;
  }

  try {
    return runProving({
      meter: {
        nominalKFactorPulsesPerGal: args.meter.nominalKFactor,
        mfCalcMethod: args.meter.mfCalcMethod,
        trackFactor: args.meter.trackFactor,
        kPresent: args.meter.nominalKFactor,
      },
      prover: {
        bpvBbl: args.prover.baseVolume,
        pipeInternalDiameterIn: args.prover.pipeInternalDiameterIn,
        pipeWallThicknessIn: args.prover.pipeWallThicknessIn,
        material: materialMap[args.prover.material ?? "Carbon Steel"],
        certifiedTempF: args.prover.certifiedTempF,
      },
      product: {
        group: args.product.apiTableGroup as ApiTableGroup,
        equilibriumVaporPressurePsig: args.evpPsig,
        densityType: "observed_rho_obs",
        densityValue: args.densityApi,
        densityUnit: "api_gravity",
        densityTemperatureF: args.densityTempF,
        densityPressurePsig: args.densityPressurePsig,
        hydrometerCorrection: args.hydrometerCorrection,
      },
      acceptance: {
        evaluationMethod: "repeatability",
        repeatabilityTolerancePct: args.acceptance.repeatabilityTolerancePct,
        consistencyRunsRequired: args.acceptance.consistencyRunsRequired,
        consistencyRunsMax: args.acceptance.consistencyRunsMax,
        priorDeviationCheck: args.acceptance.priorDeviationCheck,
        priorDeviationMaxPct: args.acceptance.priorDeviationMaxPct,
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
      passes: args.passes
        .filter((p) => typeof p.pulses === "number" && p.pulses > 0)
        .map((p) => ({
          passNumber: p.passNumber,
          isWetDown: p.isWetDown,
          excluded: p.excluded,
          pulses: p.pulses as number,
          proverTempF: p.proverTempF as number,
          proverPressurePsig: p.proverPressurePsig as number,
          meterTempF: p.meterTempF as number,
          meterPressurePsig: p.meterPressurePsig as number,
        })),
    });
  } catch {
    return null;
  }
}
