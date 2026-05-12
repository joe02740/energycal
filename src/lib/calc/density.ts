// REFERENCE.md §1 (density/API conversions) and §2.4 (iterative base density)

import type { ProductGroup } from "./types";
import { CalcRangeError } from "./types";

const RHO_WATER_60F_KG_M3 = 999.012;

export function apiToSg60(api: number): number {
  return 141.5 / (131.5 + api);
}

export function sg60ToApi(sg: number): number {
  return 141.5 / sg - 131.5;
}

export function sg60ToRho60KgM3(sg: number): number {
  return sg * RHO_WATER_60F_KG_M3;
}

export function rho60KgM3ToSg60(rho: number): number {
  return rho / RHO_WATER_60F_KG_M3;
}

export function apiToRho60KgM3(api: number): number {
  return sg60ToRho60KgM3(apiToSg60(api));
}

export function rho60KgM3ToApi(rho: number): number {
  return sg60ToApi(rho60KgM3ToSg60(rho));
}

// REFERENCE.md §2.5 — hydrometer glass-expansion correction
const GLASS_GAMMA_PER_C = 0.000023;

export function hydrometerCorrect(
  rhoObserved: number,
  observedTempF: number,
  referenceTempF: number = 60,
): number {
  const dtC = ((observedTempF - referenceTempF) * 5) / 9;
  return rhoObserved * (1 - GLASS_GAMMA_PER_C * dtC);
}

// REFERENCE.md §2.4 — iterate to find ρ_60 from observed (live) density
export interface IterateResult {
  rho60: number;
  ctl: number;
  iterations: number;
  converged: boolean;
}

export function iterateBaseDensity(params: {
  rhoObservedKgM3: number;
  observedTempF: number;
  productGroup: ProductGroup;
  ctlOf: (rho60: number, observedTempF: number, group: ProductGroup) => number;
  tolerance?: number;
  maxIterations?: number;
}): IterateResult {
  const {
    rhoObservedKgM3,
    observedTempF,
    productGroup,
    ctlOf,
    tolerance = 0.01,
    maxIterations = 20,
  } = params;

  if (rhoObservedKgM3 <= 0) {
    throw new CalcRangeError("density.iterateBaseDensity", "observed density must be > 0");
  }

  let rho60 = rhoObservedKgM3;
  let ctl = 1;
  let iterations = 0;
  let converged = false;

  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    ctl = ctlOf(rho60, observedTempF, productGroup);
    const next = rhoObservedKgM3 / ctl;
    if (Math.abs(next - rho60) < tolerance) {
      rho60 = next;
      ctl = ctlOf(rho60, observedTempF, productGroup);
      converged = true;
      break;
    }
    rho60 = next;
  }

  return { rho60, ctl, iterations, converged };
}
