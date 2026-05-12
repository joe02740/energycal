// REFERENCE.md §1, §2.4

import { describe, expect, it } from "vitest";
import { apiToRho60KgM3, apiToSg60, sg60ToApi } from "./density";
import { SPRAGUE_BAY7_DIESEL } from "./__fixtures__/sprague-bay7-diesel-2026-05-02";

describe("density conversions", () => {
  it("API ↔ SG round-trips", () => {
    expect(sg60ToApi(apiToSg60(35.9))).toBeCloseTo(35.9, 6);
  });

  it("Sprague diesel: 35.9 °API → 844.28 kg/m³", () => {
    const rho = apiToRho60KgM3(SPRAGUE_BAY7_DIESEL.product.densityApi);
    expect(rho).toBeCloseTo(SPRAGUE_BAY7_DIESEL.derived.rho60KgM3, 1);
  });

  it("SG of water at 60°F is ~1.0", () => {
    expect(apiToSg60(10)).toBeCloseTo(1.0, 3);
  });
});
