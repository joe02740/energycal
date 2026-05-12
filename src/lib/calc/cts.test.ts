// REFERENCE.md §4

import { describe, expect, it } from "vitest";
import { cts } from "./cts";
import { SPRAGUE_BAY7_DIESEL } from "./__fixtures__/sprague-bay7-diesel-2026-05-02";

describe("CTS — thermal expansion of steel", () => {
  it("returns 1.0 when prover temp equals base temp", () => {
    expect(cts({ proverTempF: 60, material: "carbon_steel" })).toBe(1);
  });

  it("Sprague diesel: CTS at Tp_avg=50.8°F matches PROVEit's 0.999740", () => {
    const result = cts({
      proverTempF: SPRAGUE_BAY7_DIESEL.runAverages.tpAvgF,
      material: SPRAGUE_BAY7_DIESEL.prover.material,
      baseTempF: SPRAGUE_BAY7_DIESEL.prover.certifiedTempF,
    });
    expect(result).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ctsProver, 4);
  });

  it("respects gcOverride", () => {
    const result = cts({ proverTempF: 70, material: "carbon_steel", gcOverride: 1e-5 });
    expect(result).toBe(1 + 1e-5 * 10);
  });
});
