import { describe, expect, it } from "vitest";
import { repeatabilityPct } from "./repeatability";

describe("repeatabilityPct", () => {
  it("returns 0 for fewer than 2 runs", () => {
    expect(repeatabilityPct([])).toBe(0);
    expect(repeatabilityPct([1.0001])).toBe(0);
  });

  it("computes (max - min) / min * 100", () => {
    // (1.0005 - 0.9995) / 0.9995 * 100 ≈ 0.10005
    expect(repeatabilityPct([0.9995, 1.0005])).toBeCloseTo(0.10005, 4);
  });

  it("matches Irving Portsmouth tolerance check", () => {
    // Two consecutive runs within [0.9995, 1.0005], delta 0.0003 → repeatability OK
    const r = repeatabilityPct([0.9998, 1.0001]);
    expect(r).toBeLessThan(0.05);
  });
});
