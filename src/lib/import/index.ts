// Public surface of the import pipeline. Glue: parse → map → normalize → upsert.

import { dynamicStore } from "@/lib/data/store";
import { mockSeed } from "@/lib/data/mock-seed";
import type { ProvingRecord } from "@/lib/data/types";
import { autoDetectMapping } from "./mapper";
import { normalize } from "./normalize";
import { parseCsv } from "./parsers/csv";
import { parseJson } from "./parsers/json";
import { parseXlsx } from "./parsers/xlsx";
import type {
  ColumnMapping,
  ImportResult,
  ParserResult,
} from "./types";

export type { ColumnMapping, ImportResult, ParserResult } from "./types";
export { autoDetectMapping, listMappableTargets, isRequired, findMissingRequired, getRequiredFields } from "./mapper";

export async function parseFile(file: File): Promise<ParserResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || ext === "tsv") {
    const text = await file.text();
    return parseCsv(text, ext === "tsv" ? "\t" : undefined);
  }
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    return parseXlsx(buf, { ext: ext as "xlsx" | "xls" });
  }
  if (ext === "json") {
    const text = await file.text();
    return parseJson(text);
  }
  return {
    format: "csv",
    headers: [],
    rows: [],
    warnings: [`Unrecognized file extension ".${ext}". Supported: csv, tsv, xlsx, xls, json.`],
  };
}

export interface RunImportOptions {
  parsed: ParserResult;
  mapping: ColumnMapping;
  companyId: string;
  source?: ProvingRecord["source"];
}

export async function runImport(opts: RunImportOptions): Promise<ImportResult> {
  const ctx = {
    companyId: opts.companyId,
    source: opts.source ?? "fieldapps",
    existingCustomers: [
      ...mockSeed.customers.filter((c) => c.companyId === opts.companyId),
      ...dynamicStore.customers().filter((c) => c.companyId === opts.companyId),
    ],
    existingLocations: [
      ...mockSeed.locations.filter((l) => l.companyId === opts.companyId),
      ...dynamicStore.locations().filter((l) => l.companyId === opts.companyId),
    ],
    existingMeters: [
      ...mockSeed.meters.filter((m) => m.companyId === opts.companyId),
      ...dynamicStore.meters().filter((m) => m.companyId === opts.companyId),
    ],
    existingProducts: [
      ...mockSeed.products.filter((p) => p.companyId === opts.companyId),
      ...dynamicStore.products().filter((p) => p.companyId === opts.companyId),
    ],
  };

  const out = normalize(opts.parsed.rows, opts.mapping, ctx);

  // Upsert into the dynamic store so subsequent reads see the imports.
  for (const c of out.customers) dynamicStore.upsertCustomer(c);
  for (const l of out.locations) dynamicStore.upsertLocation(l);
  for (const m of out.meters) dynamicStore.upsertMeter(m);
  for (const p of out.products) dynamicStore.upsertProduct(p);
  dynamicStore.bulkUpsertProvings(out.provings);

  return {
    parsed: opts.parsed.rows.length,
    imported: out.provings.length,
    skipped: opts.parsed.rows.length - out.provings.length - out.errors.length,
    warnings: out.warnings,
    errors: out.errors,
  };
}
