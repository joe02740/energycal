import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { autoDetectMapping } from "./mapper";
import type { ParsedRow } from "./types";

const TENANT = "00000000-0000-0000-0000-000000000001";

function row(rowNumber: number, vals: Record<string, string | number | null>): ParsedRow {
  return { rowNumber, values: vals };
}

describe("normalize", () => {
  const headers = [
    "date_performed", "meter_name", "customer", "field_location_name",
    "product", "mf", "cmf", "repeatability_pct", "prior_deviation_pct",
    "passed", "ctlm", "cplm", "ctlp", "cplp", "ccfm", "ccfp",
  ];
  const mapping = autoDetectMapping(headers);

  it("imports a healthy row + auto-creates customer/location/meter/product", () => {
    const out = normalize(
      [
        row(2, {
          date_performed: "2026-04-20T08:50:35",
          meter_name: "BAY_7_ARM_1",
          customer: "Sprague",
          field_location_name: "Newington Terminal",
          product: "ULSD",
          mf: "1.0428",
          cmf: "1.0428",
          repeatability_pct: "0.043",
          prior_deviation_pct: "0.0288",
          passed: "Yes",
          ctlm: "1.004280",
          cplm: "1.000060",
          ctlp: "1.004280",
          cplp: "1.000060",
          ccfm: "1.004340",
          ccfp: "1.004090",
        }),
      ],
      mapping,
      {
        companyId: TENANT,
        source: "fieldapps",
        existingCustomers: [],
        existingLocations: [],
        existingMeters: [],
        existingProducts: [],
      },
    );

    expect(out.errors).toHaveLength(0);
    expect(out.provings).toHaveLength(1);
    expect(out.customers.find((c) => c.name === "Sprague")).toBeTruthy();
    expect(out.locations.find((l) => l.name === "Newington Terminal")).toBeTruthy();
    expect(out.meters.find((m) => m.tag === "BAY_7_ARM_1")).toBeTruthy();
    expect(out.products.find((p) => p.name === "ULSD")).toBeTruthy();

    const p = out.provings[0];
    expect(p.mf).toBe(1.0428);
    expect(p.cmf).toBe(1.0428);
    expect(p.passed).toBe(true);
    expect(p.priorDeviationPct).toBeCloseTo(0.0288, 4);
    expect(p.ctlMeter).toBe(1.00428);
    expect(p.ccfProver).toBe(1.00409);
    expect(p.companyId).toBe(TENANT);
    expect(p.source).toBe("fieldapps");
  });

  it("skips rows with epoch-zero placeholder dates", () => {
    const out = normalize(
      [row(2, { date_performed: "1969-12-31 18:00:00", meter_name: "X", mf: "1.0" })],
      mapping,
      {
        companyId: TENANT,
        source: "fieldapps",
        existingCustomers: [],
        existingLocations: [],
        existingMeters: [],
        existingProducts: [],
      },
    );
    expect(out.provings).toHaveLength(0);
    expect(out.warnings.some((w) => w.message.includes("epoch"))).toBe(true);
  });

  it("errors when meter_name missing", () => {
    const out = normalize(
      [row(2, { date_performed: "2026-01-01", meter_name: null, mf: "1.0" })],
      mapping,
      {
        companyId: TENANT,
        source: "fieldapps",
        existingCustomers: [],
        existingLocations: [],
        existingMeters: [],
        existingProducts: [],
      },
    );
    expect(out.provings).toHaveLength(0);
    expect(out.errors).toHaveLength(1);
  });

  it("dedupes customer/location/meter across rows of same import", () => {
    const r = (n: number, mf: number) =>
      row(n, {
        date_performed: `2026-0${n}-01`,
        meter_name: "BAY_7_ARM_1",
        customer: "Sprague",
        field_location_name: "Newington",
        product: "ULSD",
        mf: String(mf),
      });
    const out = normalize([r(2, 1.04), r(3, 1.05), r(4, 1.06)], mapping, {
      companyId: TENANT,
      source: "fieldapps",
      existingCustomers: [],
      existingLocations: [],
      existingMeters: [],
      existingProducts: [],
    });
    expect(out.customers).toHaveLength(1);
    expect(out.locations).toHaveLength(1);
    expect(out.meters).toHaveLength(1);
    expect(out.provings).toHaveLength(3);
  });

  it("strips % signs and commas from numeric cells", () => {
    const out = normalize(
      [
        row(2, {
          date_performed: "2026-01-01",
          meter_name: "X",
          mf: "1.0428",
          repeatability_pct: "0.043%",
        }),
      ],
      mapping,
      {
        companyId: TENANT,
        source: "fieldapps",
        existingCustomers: [],
        existingLocations: [],
        existingMeters: [],
        existingProducts: [],
      },
    );
    expect(out.provings[0].repeatabilityPct).toBe(0.043);
  });

  it("interprets pass/fail words for booleans", () => {
    const out = normalize(
      [row(2, { date_performed: "2026-01-01", meter_name: "X", mf: "1.0", passed: "Pass" })],
      mapping,
      {
        companyId: TENANT,
        source: "fieldapps",
        existingCustomers: [],
        existingLocations: [],
        existingMeters: [],
        existingProducts: [],
      },
    );
    expect(out.provings[0].passed).toBe(true);
  });
});
