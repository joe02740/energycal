// REFERENCE.md §6.1 — Combined Correction Factors
//   CCFm = CTLm × CPLm
//   CCFp = CTSp × CPSp × CTLp × CPLp

export function ccfMeter(params: { ctlMeter: number; cplMeter: number }): number {
  return params.ctlMeter * params.cplMeter;
}

export function ccfProver(params: {
  ctsProver: number;
  cpsProver: number;
  ctlProver: number;
  cplProver: number;
}): number {
  return params.ctsProver * params.cpsProver * params.ctlProver * params.cplProver;
}
