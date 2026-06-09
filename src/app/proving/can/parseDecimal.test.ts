import { describe, expect, it } from "vitest";
import { parseDecimal } from "./types";

describe("parseDecimal — tolerant field-entry number parsing", () => {
  it("plain decimals", () => {
    expect(parseDecimal("60.9")).toBeCloseTo(60.9);
    expect(parseDecimal("996.27")).toBeCloseTo(996.27);
    expect(parseDecimal("1.04235")).toBeCloseTo(1.04235);
  });
  it("decimal comma (European keyboards)", () => {
    expect(parseDecimal("60,9")).toBeCloseTo(60.9);
    expect(parseDecimal("35,9")).toBeCloseTo(35.9);
  });
  it("thousands comma with a decimal point", () => {
    expect(parseDecimal("1,000.5")).toBeCloseTo(1000.5);
    expect(parseDecimal("12,345.67")).toBeCloseTo(12345.67);
  });
  it("whitespace and blanks", () => {
    expect(parseDecimal("  72.5  ")).toBeCloseTo(72.5);
    expect(Number.isNaN(parseDecimal(""))).toBe(true);
    expect(Number.isNaN(parseDecimal("   "))).toBe(true);
  });
  it("integers and negatives", () => {
    expect(parseDecimal("60")).toBe(60);
    expect(parseDecimal("-12.3")).toBeCloseTo(-12.3);
  });
});
