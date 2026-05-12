// JSON importer. Accepts:
//   - an array of row objects
//   - { provings: [...] } envelope
//   - { rows: [...] } envelope
// Each row is treated as a flat key/value where values can be strings, numbers,
// booleans, or null. Nested objects are flattened to dot-notation keys.

import type { ParsedRow, ParserResult } from "../types";

export function parseJson(text: string): ParserResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown parse error";
    return {
      format: "json",
      headers: [],
      rows: [],
      warnings: [`Invalid JSON: ${msg}`],
    };
  }

  const arr = extractArray(parsed);
  if (!arr) {
    return {
      format: "json",
      headers: [],
      rows: [],
      warnings: [
        "JSON payload must be an array of rows, or { provings: [...] }, or { rows: [...] }.",
      ],
    };
  }

  const flatRows = arr.map((r) =>
    typeof r === "object" && r !== null ? flatten(r as Record<string, unknown>) : {},
  );

  // Stable header set across all rows (union)
  const headerSet = new Set<string>();
  for (const r of flatRows) for (const k of Object.keys(r)) headerSet.add(k);
  const headers = [...headerSet];

  const rows: ParsedRow[] = flatRows.map((r, i) => {
    const values: Record<string, string | number | boolean | null> = {};
    for (const h of headers) {
      const v = r[h];
      if (v === undefined || v === null) values[h] = null;
      else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") values[h] = v;
      else values[h] = JSON.stringify(v);
    }
    return { rowNumber: i + 1, values };
  });

  return { format: "json", headers, rows, warnings: [] };
}

function extractArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.provings)) return obj.provings;
    if (Array.isArray(obj.rows)) return obj.rows;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return null;
}

function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) {
      out[key] = null;
    } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[key] = v;
    } else if (Array.isArray(v)) {
      out[key] = JSON.stringify(v);
    } else if (typeof v === "object") {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}
