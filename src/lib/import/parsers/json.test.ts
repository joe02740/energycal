import { describe, expect, it } from "vitest";
import { parseJson } from "./json";

describe("parseJson", () => {
  it("accepts a raw array", () => {
    const r = parseJson(JSON.stringify([{ mf: 1.0, meter: "X" }, { mf: 2.0, meter: "Y" }]));
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].values.mf).toBe(1.0);
  });

  it("accepts { provings: [...] }", () => {
    const r = parseJson(JSON.stringify({ provings: [{ a: 1 }] }));
    expect(r.rows).toHaveLength(1);
  });

  it("flattens nested objects to dot keys", () => {
    const r = parseJson(JSON.stringify([{ meter: { name: "M1", serial: "X" }, mf: 1.0 }]));
    expect(r.headers).toContain("meter.name");
    expect(r.headers).toContain("meter.serial");
    expect(r.rows[0].values["meter.name"]).toBe("M1");
  });

  it("returns warning on invalid JSON", () => {
    const r = parseJson("{not valid json");
    expect(r.rows).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("union of headers across rows with different keys", () => {
    const r = parseJson(JSON.stringify([{ a: 1 }, { b: 2 }]));
    expect(r.headers.sort()).toEqual(["a", "b"]);
    expect(r.rows[0].values.b).toBeNull();
    expect(r.rows[1].values.a).toBeNull();
  });
});
