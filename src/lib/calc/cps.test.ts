// REFERENCE.md §5

import { describe, expect, it } from "vitest";
import { cps } from "./cps";
import { SPRAGUE_BAY7_DIESEL } from "./__fixtures__/sprague-bay7-diesel-2026-05-02";

describe("CPS — pressure correction on steel", () => {
  it("returns 1.0 at zero pressure", () => {
    expect(
      cps({
        proverPressurePsig: 0,
        pipeInternalDiameterIn: 6,
        pipeWallThicknessIn: 0.25,
        material: "carbon_steel",
      }),
    ).toBe(1);
  });

  it("Sprague diesel: CPS at Pp_avg=12.4 psig matches PROVEit's 1.000010", () => {
    const result = cps({
      proverPressurePsig: SPRAGUE_BAY7_DIESEL.runAverages.ppAvgPsig,
      pipeInternalDiameterIn: SPRAGUE_BAY7_DIESEL.prover.pipeInternalDiameterIn,
      pipeWallThicknessIn: SPRAGUE_BAY7_DIESEL.prover.pipeWallThicknessIn,
      material: SPRAGUE_BAY7_DIESEL.prover.material,
    });
    expect(result).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.cpsProver, 4);
  });
});
