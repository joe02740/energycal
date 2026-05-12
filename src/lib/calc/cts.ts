// REFERENCE.md §4 — CTS per API MPMS Ch 12.2

import type { ProverMaterial } from "./types";

const GC_PER_F: Record<ProverMaterial, number> = {
  carbon_steel: 1.86e-5,
  ss_304: 2.88e-5,
  ss_316: 2.65e-5,
  invar: 0.18e-5,
};

export function gcPerF(material: ProverMaterial, override?: number | null): number {
  return override ?? GC_PER_F[material];
}

export function cts(params: {
  proverTempF: number;
  baseTempF?: number;
  material: ProverMaterial;
  gcOverride?: number | null;
}): number {
  const baseTempF = params.baseTempF ?? 60;
  const gc = gcPerF(params.material, params.gcOverride);
  return 1 + gc * (params.proverTempF - baseTempF);
}
