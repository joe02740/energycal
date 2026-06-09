import { describe, expect, it } from "vitest";
import { avgProverTemp, cts, ctlSheet, canRun } from "./canProving";
import { ctsFactorAt } from "./ctsTable";

// Regression: decimal temperatures (e.g. 60.9) and decimal inputs must flow through
// every formula without producing NaN/Infinity or throwing. CTS rounds to the nearest
// integer degree (matches Excel VLOOKUP(ROUND(temp,0),...)) — everything else is full precision.
describe("can proving — decimal inputs are accepted everywhere", () => {
  it("a single decimal temp like 60.9 produces finite, sane results", () => {
    const r = canRun({
      tankReading: 996.27,
      proverTemps: [60.9, 61.3, 60.4],
      meteredAmount: 1001.21,
      invoiceTempF: 60.9,
      apiGravity: 35.9,
      presentKFactor: 1.04235,
    });
    for (const [k, v] of Object.entries(r)) {
      expect(Number.isFinite(v), `${k} should be finite, got ${v}`).toBe(true);
    }
    expect(r.avgTemp).toBeCloseTo((60.9 + 61.3 + 60.4) / 3, 6); // 60.866…
    expect(r.cts).toBe(ctsFactorAt(61)); // 60.866 rounds to 61
    expect(r.meterFactor).toBeGreaterThan(0.9);
    expect(r.meterFactor).toBeLessThan(1.1);
  });

  it("CTS rounds the decimal temp (matches the Excel ROUND lookup)", () => {
    expect(cts(60.4)).toBe(ctsFactorAt(60)); // -> 60
    expect(cts(60.5)).toBe(ctsFactorAt(61)); // -> 61
    expect(cts(60.9)).toBe(ctsFactorAt(61)); // -> 61
    expect(cts(199.7)).toBe(ctsFactorAt(200));
    expect(cts(-19.6)).toBe(ctsFactorAt(-20));
  });

  it("CTL is smooth across decimal temps (no whole-number requirement)", () => {
    const a = ctlSheet(60.0, 35.9);
    const b = ctlSheet(60.9, 35.9);
    const c = ctlSheet(61.0, 35.9);
    expect(Number.isFinite(b)).toBe(true);
    expect(a).toBe(1); // exactly 60
    expect(b).toBeLessThan(a); // 60.9 > 60 => slight expansion
    expect(b).toBeGreaterThan(c); // monotonic between 60.0 and 61.0
  });

  it("decimal gravity and decimal present-K carry through", () => {
    const r = canRun({
      tankReading: 1000.5,
      proverTemps: [72.25, 72.75, 73.1],
      meteredAmount: 998.33,
      invoiceTempF: 71.9,
      apiGravity: 38.27,
      presentKFactor: 1.041985,
    });
    expect(Number.isFinite(r.ctlProver)).toBe(true);
    expect(Number.isFinite(r.newKFactor)).toBe(true);
    expect(r.newKFactor).toBeCloseTo(r.meterFactor * 1.041985, 8);
  });

  it("avgProverTemp keeps full precision (no rounding of the average itself)", () => {
    expect(avgProverTemp([60.9, 61.1, 60.7])).toBeCloseTo(60.9, 10);
    expect(avgProverTemp([60.33, 60.34, 60.35])).toBeCloseTo(60.34, 10);
  });
});
