// CSV / TSV parser via papaparse. Handles quoting, escaping, embedded newlines,
// auto-detected delimiter, and BOM stripping.

import Papa from "papaparse";
import type { ParsedRow, ParserResult } from "../types";

export function parseCsv(text: string, delimiter?: string): ParserResult {
  // Manual tab sniff: if the caller didn't specify and the first non-empty
  // line has no comma but has tabs, treat as TSV. Papaparse's auto-detect
  // is good but conservative; explicit sniff handles single-row TSV cleanly.
  let resolvedDelim = delimiter ?? "";
  if (!delimiter) {
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    if (!firstLine.includes(",") && firstLine.includes("\t")) {
      resolvedDelim = "\t";
    }
  }

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter: resolvedDelim, // empty = papaparse auto-detect
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });

  const warnings: string[] = [];
  if (result.errors.length > 0) {
    for (const e of result.errors.slice(0, 5)) {
      warnings.push(`Row ${e.row ?? "?"}: ${e.message}`);
    }
    if (result.errors.length > 5) {
      warnings.push(`…and ${result.errors.length - 5} more parse warnings`);
    }
  }

  const headers = (result.meta.fields ?? []).map((f) => f.trim());
  const rows: ParsedRow[] = result.data.map((raw, i) => {
    const values: Record<string, string | null> = {};
    for (const h of headers) {
      const v = (raw as Record<string, string | undefined>)[h];
      values[h] = v === undefined || v === "" ? null : v;
    }
    return { rowNumber: i + 2, values }; // +2 = header row + 1-based
  });

  const detected = result.meta.delimiter ?? ",";
  const format: "csv" | "tsv" = detected === "\t" ? "tsv" : "csv";

  return { format, headers, rows, warnings };
}
