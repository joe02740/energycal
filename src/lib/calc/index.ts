// Public surface of the calc engine. Anything outside this folder should import
// from "@/lib/calc" — never reach into individual modules.

export * from "./types";
export {
  apiToRho60KgM3,
  apiToSg60,
  hydrometerCorrect,
  rho60KgM3ToApi,
  rho60KgM3ToSg60,
  sg60ToApi,
  sg60ToRho60KgM3,
} from "./density";
export { ctl, alpha60PerC } from "./ctl";
export { cpl, compressibilityFactor } from "./cpl";
export { cts, gcPerF } from "./cts";
export { cps, modulusPsi } from "./cps";
export { ccfMeter, ccfProver } from "./ccf";
export {
  computePassMf,
  aggregateMf,
  kfFromMf,
  meterAccuracy,
  repeatabilityPctOfPasses,
} from "./meterFactor";
export {
  evaluateAcceptance,
  type AcceptanceCriteriaProfile,
  type AcceptanceResult,
} from "./acceptance";
export { canonicalize } from "./canonicalJson";
export { hmacOfPayload, shortHash } from "./hash";
export { runProving, type RunProvingInputs, type RunProvingOutput } from "./runProving";
