// REFERENCE.md §3

import { describe, expect, it } from "vitest";
import { compressibilityFactor, cpl } from "./cpl";
import { SPRAGUE_BAY7_DIESEL } from "./__fixtures__/sprague-bay7-diesel-2026-05-02";

describe("CPL — pressure correction on liquid (SI form)", () => {
  it("returns 1.0 when P = Pe", () => {
    const { cpl: result } = cpl({
      pressurePsig: 5,
      equilibriumVaporPressurePsig: 5,
      tempF: 60,
      rho60KgM3: 844.28,
    });
    expect(result).toBe(1);
  });

  it("CPL > 1 when P > Pe", () => {
    const { cpl: result } = cpl({
      pressurePsig: 50,
      equilibriumVaporPressurePsig: 0,
      tempF: 60,
      rho60KgM3: 844.28,
    });
    expect(result).toBeGreaterThan(1);
  });

  it("Sprague diesel: CPL at avg conditions (Pp=12.4 psig, Tp=50.8°F) matches PROVEit's 1.000060", () => {
    const { cpl: result } = cpl({
      pressurePsig: SPRAGUE_BAY7_DIESEL.runAverages.ppAvgPsig,
      equilibriumVaporPressurePsig: SPRAGUE_BAY7_DIESEL.product.equilibriumVaporPressurePsig,
      tempF: SPRAGUE_BAY7_DIESEL.runAverages.tpAvgF,
      rho60KgM3: SPRAGUE_BAY7_DIESEL.derived.rho60KgM3,
    });
    expect(result).toBeCloseTo(SPRAGUE_BAY7_DIESEL.expectedResults.cplProver, 4);
  });

  it("Sprague diesel: CPL per pass 1 (Pp=12.2 psig) matches PROVEit's 1.00006", () => {
    const { cpl: result } = cpl({
      pressurePsig: SPRAGUE_BAY7_DIESEL.passes[0].ppPsig,
      equilibriumVaporPressurePsig: SPRAGUE_BAY7_DIESEL.product.equilibriumVaporPressurePsig,
      tempF: SPRAGUE_BAY7_DIESEL.passes[0].tpF,
      rho60KgM3: SPRAGUE_BAY7_DIESEL.derived.rho60KgM3,
    });
    expect(result).toBeCloseTo(SPRAGUE_BAY7_DIESEL.passes[0].cplProver, 4);
  });

  it("F at Sprague diesel conditions is in the right magnitude (~5e-6 /psi)", () => {
    const f = compressibilityFactor({ tempF: 50.8, rho60KgM3: 844.28 });
    expect(f).toBeGreaterThan(4e-6);
    expect(f).toBeLessThan(6e-6);
  });
});
