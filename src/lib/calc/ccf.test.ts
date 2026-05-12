// REFERENCE.md §6.1

import { describe, expect, it } from "vitest";
import { ccfMeter, ccfProver } from "./ccf";
import { SPRAGUE_BAY7_DIESEL } from "./__fixtures__/sprague-bay7-diesel-2026-05-02";

describe("CCF — combined correction factors", () => {
  it("Sprague diesel: CCFm at avg matches PROVEit's 1.004340", () => {
    const result = ccfMeter({
      ctlMeter: SPRAGUE_BAY7_DIESEL.expectedResults.ctlMeter,
      cplMeter: SPRAGUE_BAY7_DIESEL.expectedResults.cplMeter,
    });
    expect(result).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ccfMeter, 4);
  });

  it("Sprague diesel: CCFp at avg matches PROVEit's 1.004090", () => {
    const result = ccfProver({
      ctsProver: SPRAGUE_BAY7_DIESEL.expectedResults.ctsProver,
      cpsProver: SPRAGUE_BAY7_DIESEL.expectedResults.cpsProver,
      ctlProver: SPRAGUE_BAY7_DIESEL.expectedResults.ctlProver,
      cplProver: SPRAGUE_BAY7_DIESEL.expectedResults.cplProver,
    });
    expect(result).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ccfProver, 4);
  });
});
