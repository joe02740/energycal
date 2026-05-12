import { describe, expect, it } from "vitest";
import { formatGallons, impactForCustomer } from "./impact";
import type { ProvingRecord } from "@/lib/data/types";

function p(meterId: string, date: string, mf: number): ProvingRecord {
  return {
    id: `${meterId}-${date}`,
    companyId: "T",
    source: "fieldapps",
    meterId,
    customerId: "C",
    locationId: "L",
    productId: null,
    datePerformed: date,
    mf,
    cmf: null, ma: null, kf: null, ckf: null,
    repeatabilityPct: null, uncertaintyPct: null,
    priorDeviationPct: null, priorDeviationPassed: null, passed: null,
    ctlMeter: null, cplMeter: null, ccfMeter: null,
    ctlProver: null, cplProver: null, ccfProver: null,
    density: null, densityTempF: null, baseDensity: null, avgFlowRate: null,
    runs: [],
  };
}

describe("impactForCustomer (volume only)", () => {
  it("computes per-interval gallon impact and totals", () => {
    const provings = [
      p("m1", "2026-01-01", 1.000),
      p("m1", "2026-04-01", 0.999),
      p("m1", "2026-07-01", 0.998),
    ];
    const r = impactForCustomer(provings, { throughputGalDay: 100_000 });
    expect(r.intervals).toHaveLength(2);
    expect(r.totalGallons).toBeGreaterThan(0);
    // Sanity bound: 100k gal/day × ~180 days × 0.001 drift = ~18k gal
    expect(r.totalGallons).toBeLessThan(100_000);
  });

  it("skips absurd drifts (likely baseline noise)", () => {
    const provings = [
      p("m1", "2026-01-01", 1.000),
      p("m1", "2026-02-01", 1.500),
    ];
    const r = impactForCustomer(provings, { throughputGalDay: 100_000 });
    expect(r.intervals).toHaveLength(0);
  });

  it("divides throughput across meters when not specified", () => {
    const provings = [
      p("m1", "2026-01-01", 1.000),
      p("m1", "2026-04-01", 0.999),
      p("m2", "2026-01-01", 1.000),
      p("m2", "2026-04-01", 0.999),
    ];
    const r = impactForCustomer(provings, { throughputGalDay: 100_000 });
    expect(r.meterCount).toBe(2);
  });

  it("returns zero impact when only one proving exists", () => {
    const r = impactForCustomer([p("m1", "2026-01-01", 1.0)], {
      throughputGalDay: 100_000,
    });
    expect(r.intervals).toHaveLength(0);
    expect(r.totalGallons).toBe(0);
  });

  it("no dollar fields anywhere in the result", () => {
    const provings = [
      p("m1", "2026-01-01", 1.0),
      p("m1", "2026-02-01", 0.999),
    ];
    const r = impactForCustomer(provings, { throughputGalDay: 100_000 });
    const json = JSON.stringify(r);
    expect(json.toLowerCase()).not.toContain("dollar");
    expect(json).not.toContain("$");
    expect(json.toLowerCase()).not.toContain("price");
  });
});

describe("formatGallons", () => {
  it("formats millions with M suffix", () => {
    expect(formatGallons(1_500_000)).toBe("1.50M gal");
  });
  it("formats below a million with commas", () => {
    expect(formatGallons(45_678)).toBe("45,678 gal");
  });
  it("rounds sub-gallon precision", () => {
    expect(formatGallons(123.7)).toBe("124 gal");
  });
  it("handles zero", () => {
    expect(formatGallons(0)).toBe("0 gal");
  });
});
