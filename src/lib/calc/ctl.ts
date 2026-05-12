// REFERENCE.md §2 — CTL per API MPMS Ch 11.1, 2004 revision

import type { ProductGroup } from "./types";
import { CalcRangeError } from "./types";

interface KCoefficients {
  k0: number;
  k1: number;
  k2: number;
  rhoMin: number;
  rhoMax: number;
}

// REFERENCE.md §2.3 — SI K-coefficients (per °C; ρ in kg/m³)
const K_TABLE: Record<ProductGroup, KCoefficients | null> = {
  crude: { k0: 341.0957, k1: 0.0, k2: 0.0, rhoMin: 610.5, rhoMax: 1075.0 },
  refined_gasoline: { k0: 346.4228, k1: 0.4388, k2: 0.0, rhoMin: 653.0, rhoMax: 770.0 },
  refined_jet_distillate: { k0: 594.5418, k1: 0.0, k2: 0.0, rhoMin: 770.0, rhoMax: 788.0 },
  refined_diesel_heating: { k0: 186.9696, k1: 0.4862, k2: 0.0, rhoMin: 788.0, rhoMax: 839.0 },
  refined_fuel_oil: { k0: 186.9696, k1: 0.4862, k2: 0.0, rhoMin: 839.0, rhoMax: 1075.0 },
  refined_generalized: {
    k0: 103.872,
    k1: 0.2701,
    k2: 0.00000034478,
    rhoMin: 653.0,
    rhoMax: 1075.0,
  },
  lubricating_oils: { k0: 0.0, k1: 0.34878, k2: 0.0, rhoMin: 800.9, rhoMax: 1163.5 },
  ethanol: null,
  biodiesel: null,
  ngl_lpg: null,
};

export function alpha60PerC(
  rho60KgM3: number,
  group: ProductGroup,
  warnings?: string[],
): number {
  const k = K_TABLE[group];
  if (!k) {
    throw new CalcRangeError(
      "ctl.alpha60PerC",
      `Product group "${group}" CTL not implemented in v0 (see REFERENCE.md §2.3)`,
    );
  }
  // Range bounds are advisory — PROVEit applies the equation outside published bounds
  // (e.g. diesel at ρ_60 = 844, just past the 839 upper bound). Warn, don't error.
  if (rho60KgM3 < k.rhoMin || rho60KgM3 > k.rhoMax) {
    warnings?.push(
      `ρ_60 ${rho60KgM3.toFixed(2)} outside published range [${k.rhoMin}, ${k.rhoMax}] for group "${group}"`,
    );
  }
  return k.k0 / (rho60KgM3 * rho60KgM3) + k.k1 / rho60KgM3 + k.k2;
}

// REFERENCE.md §2.2 — CTL = exp(−α × ΔT × (1 + 0.8 × α × ΔT))
// Internally everything is °C; ΔT_F is converted at the boundary.
export function ctl(params: {
  rho60KgM3: number;
  observedTempF: number;
  productGroup: ProductGroup;
  warnings?: string[];
}): number {
  const { rho60KgM3, observedTempF, productGroup, warnings } = params;
  const alpha = alpha60PerC(rho60KgM3, productGroup, warnings);
  const dtC = ((observedTempF - 60) * 5) / 9;
  return Math.exp(-alpha * dtC * (1 + 0.8 * alpha * dtC));
}
