// Excel parser via SheetJS. Handles .xlsx and .xls. For multi-sheet workbooks,
// picks the first non-empty sheet by default; caller can pass a sheetName.

import * as XLSX from "xlsx";
import type { ParsedRow, ParserResult } from "../types";

export function parseXlsx(
  bytes: ArrayBuffer,
  opts?: { sheetName?: string; ext?: "xlsx" | "xls" },
): ParserResult {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const allSheetNames = workbook.SheetNames;
  if (allSheetNames.length === 0) {
    return {
      format: opts?.ext ?? "xlsx",
      headers: [],
      rows: [],
      warnings: ["Workbook has no sheets"],
    };
  }

  let sheetName = opts?.sheetName ?? "";
  if (!sheetName || !allSheetNames.includes(sheetName)) {
    // Pick the first sheet that has rows; fall back to the first sheet.
    sheetName =
      allSheetNames.find((n) => {
        const ws = workbook.Sheets[n];
        const ref = ws["!ref"];
        return ref && ref.length > 0;
      }) ?? allSheetNames[0];
  }

  const ws = workbook.Sheets[sheetName];
  // Pull the sheet as JSON. defval: null normalises empty cells to null.
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: false,
    defval: null,
    blankrows: false,
  });

  const headers =
    json.length > 0
      ? Object.keys(json[0]).map((h) => h.replace(/^﻿/, "").trim())
      : [];

  const rows: ParsedRow[] = json.map((raw, i) => {
    const values: Record<string, string | number | boolean | null> = {};
    for (const h of headers) {
      const v = raw[h];
      if (v === undefined || v === null || v === "") values[h] = null;
      else if (v instanceof Date) values[h] = v.toISOString();
      else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
        values[h] = v;
      else values[h] = String(v);
    }
    return { rowNumber: i + 2, values };
  });

  const warnings: string[] = [];
  if (allSheetNames.length > 1) {
    warnings.push(
      `Workbook has ${allSheetNames.length} sheets; imported "${sheetName}". Other sheets: ${allSheetNames.filter((n) => n !== sheetName).join(", ")}`,
    );
  }

  return {
    format: opts?.ext ?? "xlsx",
    headers,
    rows,
    warnings,
    sheetName,
  };
}

export function listXlsxSheets(bytes: ArrayBuffer): string[] {
  const workbook = XLSX.read(bytes, { type: "array" });
  return workbook.SheetNames;
}
