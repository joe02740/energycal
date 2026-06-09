import { describe, expect, it } from "vitest";
import { avgProverTemp, cts, ctlSheet, canRun } from "./canProving";
import { ctsFactorAt } from "./ctsTable";

// Ground truth = the filled "L1A2 ULSD" can-proving record (provitscreenshots/L1A2 ULSD.pdf).
// Both runs are at 60°F (so D = E = I = 1) — verifies the A–P arithmetic ties out exactly.
describe("can proving — ties out to the L1A2 ULSD worksheet", () => {
  const gravity = 38;
  const presentK = 1.04235; // line O on the sheet

  it("run 1: A=996.2, G=1001.21 @ 60°F", () => {
    const r = canRun({ tankReading: 996.2, proverTemps: [60, 60, 60], meteredAmount: 1001.21, invoiceTempF: 60, apiGravity: gravity, presentKFactor: presentK });
    expect(r.avgTemp).toBe(60);
    expect(r.cts).toBe(1); // D
    expect(r.ctlProver).toBe(1); // E
    expect(r.netProver).toBeCloseTo(996.2, 2); // F
    expect(r.netMeter).toBeCloseTo(1001.21, 2); // J
    expect(r.errorGal).toBeCloseTo(-5.01, 2); // K
    expect(r.errorPct).toBeCloseTo(-0.5004, 3); // L
    expect(r.cubicInches).toBeCloseTo(-1157.31, 1); // M
    expect(r.meterFactor).toBeCloseTo(0.995, 4); // N
    expect(r.newKFactor).toBeCloseTo(1.03713, 4); // P
  });

  it("run 2: A=996.89, G=995.22 @ 60°F", () => {
    const r = canRun({ tankReading: 996.89, proverTemps: [60, 60, 60], meteredAmount: 995.22, invoiceTempF: 60, apiGravity: gravity, presentKFactor: presentK });
    expect(r.netProver).toBeCloseTo(996.89, 2);
    expect(r.netMeter).toBeCloseTo(995.22, 2);
    expect(r.errorGal).toBeCloseTo(1.67, 2);
    expect(r.errorPct).toBeCloseTo(0.1678, 3);
    expect(r.meterFactor).toBeCloseTo(1.0017, 4);
    expect(r.newKFactor).toBeCloseTo(1.0441, 4);
  });
});

describe("can proving — CTS table + CTL formula", () => {
  it("CTS table anchors match the sheet", () => {
    expect(cts(60)).toBe(1);
    expect(ctsFactorAt(0)).toBeCloseTo(0.99926, 5);
    expect(ctsFactorAt(300)).toBeCloseTo(1.00298, 5);
    expect(cts(60.4)).toBe(cts(60)); // rounds to 60
    expect(cts(999)).toBe(ctsFactorAt(300)); // clamps to range
  });
  it("CTL is exactly 1 at 60°F and < 1 above it", () => {
    expect(ctlSheet(60, 35.9)).toBe(1);
    expect(ctlSheet(75, 35.9)).toBeLessThan(1); // warmer → expands → CTL < 1
    expect(ctlSheet(45, 35.9)).toBeGreaterThan(1);
  });
  it("avgProverTemp ignores blanks", () => {
    expect(avgProverTemp([70, 72, 74])).toBeCloseTo(72);
    expect(avgProverTemp([60, "", ""])).toBe(60);
  });
});
