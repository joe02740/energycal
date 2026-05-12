// REFERENCE.md §5 — CPS per API MPMS Ch 12.2

import type { ProverMaterial } from "./types";

const E_PSI: Record<ProverMaterial, number> = {
  carbon_steel: 30_000_000,
  ss_304: 28_000_000,
  ss_316: 28_000_000,
  invar: 21_000_000,
};

export function modulusPsi(material: ProverMaterial, override?: number | null): number {
  return override ?? E_PSI[material];
}

export function cps(params: {
  proverPressurePsig: number;
  pipeInternalDiameterIn: number;
  pipeWallThicknessIn: number;
  material: ProverMaterial;
  modulusOverride?: number | null;
}): number {
  const e = modulusPsi(params.material, params.modulusOverride);
  return (
    1 +
    (params.proverPressurePsig * params.pipeInternalDiameterIn) /
      (e * params.pipeWallThicknessIn)
  );
}
