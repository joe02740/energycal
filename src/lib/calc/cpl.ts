// REFERENCE.md §3 — CPL per API MPMS Ch 11.2.1, 2007 revision (SI form, ASTM D1250-08).
// Older customary-units constants produce results ~10× too small; we use SI internally
// and convert to /psi at the boundary.

import { CalcRangeError } from "./types";

const KPA_PER_PSI = 6.894757;

const A = -1.62080;
const B = 0.00021592;
const C = 0.87096e6;
const D = 0.0042092e6;

// Returns F in 1/kPa.
function compressibilityFactorPerKpa(params: {
  tempC: number;
  rho60KgM3: number;
}): number {
  const { tempC, rho60KgM3 } = params;
  if (rho60KgM3 < 638 || rho60KgM3 > 1074) {
    throw new CalcRangeError(
      "cpl.compressibilityFactor",
      `ρ_60 ${rho60KgM3} outside MPMS 11.2.1 valid range [638, 1074] kg/m³`,
    );
  }
  // Internal range check on T_C: -50°F ↔ -45.6°C, 350°F ↔ 176.7°C.
  if (tempC < -45.6 || tempC > 176.7) {
    throw new CalcRangeError(
      "cpl.compressibilityFactor",
      `T_C ${tempC}°C outside MPMS 11.2.1 valid range [-45.6, 176.7] °C`,
    );
  }
  const exponent = A + B * tempC + (C + D * tempC) / (rho60KgM3 * rho60KgM3);
  return Math.exp(exponent) * 1e-6;
}

export function compressibilityFactor(params: {
  tempF: number;
  rho60KgM3: number;
}): number {
  const tempC = ((params.tempF - 32) * 5) / 9;
  const fPerKpa = compressibilityFactorPerKpa({ tempC, rho60KgM3: params.rho60KgM3 });
  return fPerKpa * KPA_PER_PSI;
}

export function cpl(params: {
  pressurePsig: number;
  equilibriumVaporPressurePsig: number;
  tempF: number;
  rho60KgM3: number;
}): { cpl: number; f: number } {
  const f = compressibilityFactor({ tempF: params.tempF, rho60KgM3: params.rho60KgM3 });
  const dp = params.pressurePsig - params.equilibriumVaporPressurePsig;
  const denom = 1 - f * dp;
  if (denom <= 0) {
    throw new CalcRangeError(
      "cpl.cpl",
      `1 - F·(P−Pe) ≤ 0 (would invert CPL); inputs likely out of range`,
    );
  }
  return { cpl: 1 / denom, f };
}
