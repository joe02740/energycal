import { describe, expect, it } from "vitest";
import { autoDetectMapping, findMissingRequired } from "./mapper";

describe("autoDetectMapping", () => {
  it("maps the FieldApps shape end-to-end", () => {
    const headers = [
      "revision_index", "date_performed", "reason", "username", "task_id", "status",
      "meter_id", "meter_name", "field_location_id", "field_location_name",
      "location_id", "location", "customer", "operator", "state", "county",
      "meter_serial", "meter_model", "nominal_k_factor", "nominal_size_in",
      "passes_per_run", "proving_mode", "mf_calc_method",
      "prover_class", "prover_brand", "prover_name", "prover_serial", "base_prover_vol_bbl",
      "product", "product_table", "density", "density_temp_f", "base_density",
      "mf", "cmf", "ma", "kf", "ckf",
      "repeatability_pct", "uncertainty_pct", "prior_deviation_pct",
      "prior_deviation_passed", "passed",
      "ctlm", "ctlp", "cplm", "cplp", "ccfm", "ccfp", "avg_flow_rate",
    ];
    const m = autoDetectMapping(headers);
    expect(m.date_performed).toBe("date_performed");
    expect(m.meter_name).toBe("meter_name");
    expect(m.customer_name).toBe("customer");
    expect(m.location_name).toBe("field_location_name"); // first synonym match wins
    expect(m.product_name).toBe("product");
    expect(m.mf).toBe("mf");
    expect(m.cmf).toBe("cmf");
    expect(m.repeatability_pct).toBe("repeatability_pct");
    expect(m.prior_deviation_pct).toBe("prior_deviation_pct");
    expect(m.passed).toBe("passed");
    expect(m.ctlm).toBe("ctlm");
    expect(m.cplp).toBe("cplp");
    expect(findMissingRequired(m)).toHaveLength(0);
  });

  it("handles odd casing + delimiters", () => {
    const headers = ["Date Performed", "Meter-Name", "M.F.", "Customer Name"];
    const m = autoDetectMapping(headers);
    expect(m.date_performed).toBe("Date Performed");
    expect(m.meter_name).toBe("Meter-Name");
    expect(m.mf).toBe("M.F.");
    expect(m.customer_name).toBe("Customer Name");
  });

  it("flags missing required fields when headers unknown", () => {
    const headers = ["foo", "bar", "baz"];
    const m = autoDetectMapping(headers);
    const missing = findMissingRequired(m);
    expect(missing).toContain("date_performed");
    expect(missing).toContain("meter_name");
    expect(missing).toContain("mf");
  });

  it("does not double-assign columns", () => {
    const headers = ["mf", "cmf"];
    const m = autoDetectMapping(headers);
    expect(m.mf).toBe("mf");
    expect(m.cmf).toBe("cmf");
  });
});
