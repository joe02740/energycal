// Import pipeline types.
// Flow: file → parser → ParsedRow[] → mapper → MappedRow → normalizer → ProvingRecord
//                                          ↑
//                                  user-overridable

export type ParsedCellValue = string | number | boolean | null;

// Generic parsed row before any column mapping. Keys are source-file column
// headers; values are raw strings/numbers as the parser returned them.
export interface ParsedRow {
  rowNumber: number; // 1-based, useful for error reporting
  values: Record<string, ParsedCellValue>;
}

export interface ParserResult {
  format: "csv" | "tsv" | "xlsx" | "xls" | "json";
  headers: string[];
  rows: ParsedRow[];
  warnings: string[]; // parse-time warnings (sheet picked, encoding inferred, etc.)
  sheetName?: string;
}

// Canonical fields the importer maps to. Source column → target field.
export type TargetField =
  | "task_id"
  | "date_performed"
  | "username"
  | "status"
  | "reason"
  | "customer_name"
  | "location_name"
  | "meter_id"
  | "meter_name"
  | "meter_serial"
  | "meter_model"
  | "nominal_k_factor"
  | "product_name"
  | "density"
  | "density_temp_f"
  | "base_density"
  | "prover_name"
  | "prover_serial"
  | "mf"
  | "cmf"
  | "ma"
  | "kf"
  | "ckf"
  | "repeatability_pct"
  | "uncertainty_pct"
  | "prior_deviation_pct"
  | "prior_deviation_passed"
  | "passed"
  | "ctlm"
  | "ctlp"
  | "cplm"
  | "cplp"
  | "ccfm"
  | "ccfp"
  | "avg_flow_rate";

export type ColumnMapping = Partial<Record<TargetField, string>>;

export interface NormalizeWarning {
  rowNumber: number;
  message: string;
  field?: TargetField;
}

export interface ImportResult {
  parsed: number;
  imported: number;
  skipped: number;
  warnings: NormalizeWarning[];
  errors: NormalizeWarning[];
}
