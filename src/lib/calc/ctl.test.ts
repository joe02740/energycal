// REFERENCE.md §2

import { describe, expect, it } from "vitest";
import { ctl } from "./ctl";
import { SPRAGUE_BAY7_DIESEL } from "./__fixtures__/sprague-bay7-diesel-2026-05-02";

describe("CTL — temperature correction on liquid", () => {
  it("returns 1.0 at 60°F regardless of density", () => {
    expect(
      ctl({ rho60KgM3: 844.28, observedTempF: 60, productGroup: "refined_diesel_heating" }),
    ).toBe(1);
    expect(
      ctl({ rho60KgM3: 740, observedTempF: 60, productGroup: "refined_gasoline" }),
    ).toBe(1);
  });

  it("CTL < 1 above 60°F (liquid expanded)", () => {
    expect(
      ctl({ rho60KgM3: 844.28, observedTempF: 80, productGroup: "refined_diesel_heating" }),
    ).toBeLessThan(1);
  });

  it("CTL > 1 below 60°F (liquid contracted)", () => {
    expect(
      ctl({ rho60KgM3: 844.28, observedTempF: 40, productGroup: "refined_diesel_heating" }),
    ).toBeGreaterThan(1);
  });

  it("Sprague diesel: CTL at Tp_avg=50.8°F matches PROVEit's 1.004280", () => {
    const result = ctl({
      rho60KgM3: SPRAGUE_BAY7_DIESEL.derived.rho60KgM3,
      observedTempF: SPRAGUE_BAY7_DIESEL.runAverages.tpAvgF,
      productGroup: SPRAGUE_BAY7_DIESEL.product.group,
    });
    expect(result).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.ctlProver, 4);
  });

  it("Sprague diesel: CTL per pass 1 (Tp=50.7°F) matches PROVEit's 1.00432", () => {
    const result = ctl({
      rho60KgM3: SPRAGUE_BAY7_DIESEL.derived.rho60KgM3,
      observedTempF: SPRAGUE_BAY7_DIESEL.passes[0].tpF,
      productGroup: SPRAGUE_BAY7_DIESEL.product.group,
    });
    expect(result).toBeCloseTo(SPRAGUE_BAY7_DIESEL.passes[0].ctlProver, 4);
  });

  it("emits warning when ρ_60 outside published bound but still computes", () => {
    const warnings: string[] = [];
    // 844.28 is outside diesel/heating's 788–839 published range
    const result = ctl({
      rho60KgM3: 844.28,
      observedTempF: 50.8,
      productGroup: "refined_diesel_heating",
      warnings,
    });
    expect(result).toBeCloseTo(1.004280, 4);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("outside published range");
  });
});
