// Turns ParsedRow + ColumnMapping into a domain-shaped record ready for the
// data store. Handles:
//   - epoch-zero placeholder dates ("1969-12-31..." / "1970-01-01...") → null
//   - numeric coercion (strips % signs, commas)
//   - boolean coercion ("Y"/"N", "Yes"/"No", "Pass"/"Fail")
//   - auto-creation of missing customer/location/meter/product entities

import type {
  Customer,
  Location,
  Meter,
  Product,
  ProvingRecord,
} from "@/lib/data/types";
import type {
  ColumnMapping,
  NormalizeWarning,
  ParsedRow,
  TargetField,
} from "./types";

export interface NormalizeContext {
  companyId: string;
  source: ProvingRecord["source"];
  // Existing entities the normalizer may dedupe against. Passed in by caller.
  existingCustomers: Customer[];
  existingLocations: Location[];
  existingMeters: Meter[];
  existingProducts: Product[];
}

export interface NormalizeOutput {
  // Records to upsert.
  customers: Customer[];
  locations: Location[];
  meters: Meter[];
  products: Product[];
  provings: ProvingRecord[];
  warnings: NormalizeWarning[];
  errors: NormalizeWarning[];
}

const EPOCH_PATTERNS = [
  /^1969-12-3[01]/,
  /^1970-01-01/,
];

function getCell(row: ParsedRow, mapping: ColumnMapping, target: TargetField): unknown {
  const col = mapping[target];
  if (!col) return null;
  return row.values[col] ?? null;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  return String(v).trim() || null;
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const cleaned = String(v).replace(/[%,]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function asBoolean(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["y", "yes", "true", "t", "1", "pass", "passed"].includes(s)) return true;
  if (["n", "no", "false", "f", "0", "fail", "failed"].includes(s)) return false;
  return null;
}

function asDate(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  // Filter epoch-zero placeholders that the FieldApps schema uses for "missing".
  if (EPOCH_PATTERNS.some((p) => p.test(s))) return null;
  // ISO already? keep.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  // Common Excel-ish formats: M/D/YYYY [HH:MM[:SS] [AM|PM]]
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function normalize(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  ctx: NormalizeContext,
): NormalizeOutput {
  const warnings: NormalizeWarning[] = [];
  const errors: NormalizeWarning[] = [];

  // Working maps so we dedupe across rows of the same import + against existing.
  const customers = new Map<string, Customer>();
  const locations = new Map<string, Location>();
  const meters = new Map<string, Meter>();
  const products = new Map<string, Product>();
  const provings: ProvingRecord[] = [];

  for (const c of ctx.existingCustomers) customers.set(c.id, c);
  for (const l of ctx.existingLocations) locations.set(l.id, l);
  for (const m of ctx.existingMeters) meters.set(m.id, m);
  for (const p of ctx.existingProducts) products.set(p.id, p);

  function findOrCreateCustomer(name: string): Customer {
    const existing = [...customers.values()].find(
      (c) => c.companyId === ctx.companyId && c.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    const c: Customer = {
      id: `imp-cust-${ctx.companyId.slice(-4)}-${slug(name)}`,
      companyId: ctx.companyId,
      name,
    };
    customers.set(c.id, c);
    return c;
  }
  function findOrCreateLocation(name: string, customerId: string): Location {
    const existing = [...locations.values()].find(
      (l) =>
        l.companyId === ctx.companyId &&
        l.customerId === customerId &&
        l.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    const l: Location = {
      id: `imp-loc-${ctx.companyId.slice(-4)}-${slug(name)}-${slug(customerId)}`,
      companyId: ctx.companyId,
      customerId,
      name,
    };
    locations.set(l.id, l);
    return l;
  }
  function findOrCreateMeter(
    name: string,
    customerId: string,
    locationId: string,
    extras: Partial<Meter>,
  ): Meter {
    const existing = [...meters.values()].find(
      (m) =>
        m.companyId === ctx.companyId &&
        m.customerId === customerId &&
        m.locationId === locationId &&
        m.tag.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    const m: Meter = {
      id: `imp-mtr-${ctx.companyId.slice(-4)}-${slug(name)}`,
      companyId: ctx.companyId,
      customerId,
      locationId,
      tag: name,
      meterType: "pd_positive_displacement",
      nominalKFactor: extras.nominalKFactor ?? 0,
      pulseMode: "interpolated",
      mfCalcMethod: "avg_meter_factor",
      trackFactor: "meter_factor",
      baseTempF: 60,
      atmosphericPressurePsia: 14.696,
      ...extras,
    };
    meters.set(m.id, m);
    return m;
  }
  function findOrCreateProduct(name: string): Product {
    const existing = [...products.values()].find(
      (p) => p.companyId === ctx.companyId && p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    const p: Product = {
      id: `imp-prod-${ctx.companyId.slice(-4)}-${slug(name)}`,
      companyId: ctx.companyId,
      name,
      apiTableGroup: "refined_generalized",
    };
    products.set(p.id, p);
    return p;
  }

  for (const row of rows) {
    const meterName = asString(getCell(row, mapping, "meter_name"));
    const datePerformed = asDate(getCell(row, mapping, "date_performed"));
    const mf = asNumber(getCell(row, mapping, "mf"));

    if (!meterName) {
      errors.push({ rowNumber: row.rowNumber, message: "Missing meter name", field: "meter_name" });
      continue;
    }
    if (!datePerformed) {
      // Epoch-zero or otherwise unusable: skip with a warning, not error.
      warnings.push({
        rowNumber: row.rowNumber,
        message: "Skipped — date_performed unparseable or epoch-placeholder",
        field: "date_performed",
      });
      continue;
    }
    if (mf === null) {
      warnings.push({
        rowNumber: row.rowNumber,
        message: "Skipped — MF missing",
        field: "mf",
      });
      continue;
    }

    const customerName = asString(getCell(row, mapping, "customer_name")) ?? "Unassigned";
    const locationName =
      asString(getCell(row, mapping, "location_name")) ?? customerName;
    const productName = asString(getCell(row, mapping, "product_name")) ?? "Unspecified";

    const customer = findOrCreateCustomer(customerName);
    const location = findOrCreateLocation(locationName, customer.id);
    const nominalKFactor = asNumber(getCell(row, mapping, "nominal_k_factor")) ?? 0;
    const meter = findOrCreateMeter(meterName, customer.id, location.id, {
      manufacturer: asString(getCell(row, mapping, "meter_model")) ?? undefined,
      serialNumber: asString(getCell(row, mapping, "meter_serial")) ?? undefined,
      nominalKFactor,
    });
    const product = findOrCreateProduct(productName);

    const taskId = asString(getCell(row, mapping, "task_id")) ?? row.rowNumber.toString();
    const id = `imp-prv-${ctx.companyId.slice(-4)}-${slug(meterName)}-${slug(datePerformed)}-${taskId}`;

    provings.push({
      id,
      companyId: ctx.companyId,
      source: ctx.source,
      meterId: meter.id,
      customerId: customer.id,
      locationId: location.id,
      productId: product.id,
      datePerformed,
      taskId,
      status: asString(getCell(row, mapping, "status")) ?? undefined,
      username: asString(getCell(row, mapping, "username")) ?? undefined,
      mf,
      cmf: asNumber(getCell(row, mapping, "cmf")),
      ma: asNumber(getCell(row, mapping, "ma")),
      kf: asNumber(getCell(row, mapping, "kf")),
      ckf: asNumber(getCell(row, mapping, "ckf")),
      repeatabilityPct: asNumber(getCell(row, mapping, "repeatability_pct")),
      uncertaintyPct: asNumber(getCell(row, mapping, "uncertainty_pct")),
      priorDeviationPct: asNumber(getCell(row, mapping, "prior_deviation_pct")),
      priorDeviationPassed: asBoolean(getCell(row, mapping, "prior_deviation_passed")),
      passed: asBoolean(getCell(row, mapping, "passed")),
      ctlMeter: asNumber(getCell(row, mapping, "ctlm")),
      cplMeter: asNumber(getCell(row, mapping, "cplm")),
      ccfMeter: asNumber(getCell(row, mapping, "ccfm")),
      ctlProver: asNumber(getCell(row, mapping, "ctlp")),
      cplProver: asNumber(getCell(row, mapping, "cplp")),
      ccfProver: asNumber(getCell(row, mapping, "ccfp")),
      density: asNumber(getCell(row, mapping, "density")),
      densityTempF: asNumber(getCell(row, mapping, "density_temp_f")),
      baseDensity: asNumber(getCell(row, mapping, "base_density")),
      avgFlowRate: asNumber(getCell(row, mapping, "avg_flow_rate")),
      runs: [], // detailed per-run data not modeled here for v0
    });
  }

  return {
    customers: [...customers.values()].filter((c) => c.companyId === ctx.companyId),
    locations: [...locations.values()].filter((l) => l.companyId === ctx.companyId),
    meters: [...meters.values()].filter((m) => m.companyId === ctx.companyId),
    products: [...products.values()].filter((p) => p.companyId === ctx.companyId),
    provings,
    warnings,
    errors,
  };
}
