import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses headers + rows with quoted values", () => {
    const text =
      `meter_name,date_performed,mf\n` +
      `BAY_7_ARM_1,2026-04-20,1.0428\n` +
      `"BAY,WITH,COMMAS",2026-04-21,0.9994\n`;
    const r = parseCsv(text);
    expect(r.format).toBe("csv");
    expect(r.headers).toEqual(["meter_name", "date_performed", "mf"]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].values.meter_name).toBe("BAY_7_ARM_1");
    expect(r.rows[0].values.mf).toBe("1.0428");
    expect(r.rows[1].values.meter_name).toBe("BAY,WITH,COMMAS");
  });

  it("treats empty cells as null", () => {
    const text = `a,b,c\n1,,3\n`;
    const r = parseCsv(text);
    expect(r.rows[0].values.b).toBeNull();
  });

  it("strips BOM", () => {
    const text = `﻿a,b\n1,2\n`;
    const r = parseCsv(text);
    expect(r.headers).toEqual(["a", "b"]);
  });

  it("auto-detects tab delimiter", () => {
    const text = `a\tb\tc\n1\t2\t3\n`;
    const r = parseCsv(text);
    expect(r.format).toBe("tsv");
    expect(r.rows[0].values.a).toBe("1");
  });

  it("rowNumber starts at 2 (header is row 1)", () => {
    const text = `a\n1\n2\n`;
    const r = parseCsv(text);
    expect(r.rows[0].rowNumber).toBe(2);
    expect(r.rows[1].rowNumber).toBe(3);
  });
});
