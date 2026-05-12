"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Upload,
} from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/provider";
import { useDirtyState } from "@/lib/nav/dirty-state";
import {
  autoDetectMapping,
  findMissingRequired,
  isRequired,
  listMappableTargets,
  parseFile,
  runImport,
  type ColumnMapping,
  type ImportResult,
  type ParserResult,
} from "@/lib/import";
import type { TargetField } from "@/lib/import/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ACCEPT = ".csv,.tsv,.xlsx,.xls,.json";

export default function ImportPage() {
  const tenant = useCurrentTenant();

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParserResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Dirty whenever a file has been loaded but the import hasn't run yet.
  // After import success/failure, the result panel is informational, not unsaved work.
  useDirtyState(
    "import-page",
    file !== null && parsed !== null && result === null,
    "You have a file loaded but haven't imported yet. Leave anyway?",
  );

  const onFile = useCallback(async (f: File) => {
    setFile(f);
    setResult(null);
    setParseError(null);
    setParsed(null);
    try {
      const p = await parseFile(f);
      if (p.rows.length === 0 && p.warnings.length > 0) {
        setParseError(p.warnings.join("\n"));
      }
      setParsed(p);
      setMapping(autoDetectMapping(p.headers));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse file");
    }
  }, []);

  const missingRequired = useMemo(
    () => (parsed ? findMissingRequired(mapping) : []),
    [parsed, mapping],
  );

  const onImport = useCallback(async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const r = await runImport({
        parsed,
        mapping,
        companyId: tenant.id,
      });
      setResult(r);
    } finally {
      setImporting(false);
    }
  }, [parsed, mapping, tenant.id]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Import provings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag-drop or pick a file. Supports CSV, TSV, XLSX, XLS, JSON. Imports into{" "}
          <span className="font-medium">{tenant.branding.displayName ?? tenant.name}</span>.
        </p>
      </header>

      <Dropzone onFile={onFile} disabled={importing} fileName={file?.name} />

      {parseError && (
        <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="whitespace-pre-wrap">{parseError}</div>
          </div>
        </div>
      )}

      {parsed && parsed.rows.length > 0 && (
        <>
          <ParseSummary parsed={parsed} />
          <ColumnMapper
            parsed={parsed}
            mapping={mapping}
            onChange={setMapping}
          />
          <Preview parsed={parsed} mapping={mapping} />

          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {missingRequired.length > 0 ? (
                <span className="text-amber-700 dark:text-amber-300">
                  Missing required mapping{missingRequired.length === 1 ? "" : "s"}:{" "}
                  {missingRequired.join(", ")}
                </span>
              ) : (
                <span>Ready to import {parsed.rows.length} rows.</span>
              )}
            </div>
            <Button
              onClick={onImport}
              disabled={importing || missingRequired.length > 0}
            >
              {importing ? "Importing…" : `Import into ${tenant.branding.displayName ?? tenant.name}`}
            </Button>
          </div>
        </>
      )}

      {result && <ResultPanel result={result} />}
    </main>
  );
}

function Dropzone({
  onFile,
  disabled,
  fileName,
}: {
  onFile: (f: File) => void;
  disabled?: boolean;
  fileName?: string;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "block cursor-pointer rounded-lg border border-dashed p-8 text-center transition-colors",
        drag
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/30 hover:bg-muted/30",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="flex flex-col items-center gap-2">
        <Upload className="h-6 w-6 text-muted-foreground" />
        <div className="text-sm font-medium">
          {fileName ? fileName : "Drop a file here, or click to choose"}
        </div>
        <div className="text-xs text-muted-foreground">
          Accepts CSV / TSV / XLSX / XLS / JSON
        </div>
      </div>
    </label>
  );
}

function ParseSummary({ parsed }: { parsed: ParserResult }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <SummaryStat label="Format" value={parsed.format.toUpperCase()} />
      <SummaryStat label="Rows" value={parsed.rows.length.toString()} />
      <SummaryStat label="Columns" value={parsed.headers.length.toString()} />
      {parsed.warnings.length > 0 && (
        <div className="sm:col-span-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          {parsed.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ColumnMapper({
  parsed,
  mapping,
  onChange,
}: {
  parsed: ParserResult;
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
}) {
  const targets = listMappableTargets();
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Column mapping</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {targets.map((t) => {
            const required = isRequired(t);
            const current = mapping[t] ?? "";
            return (
              <div
                key={t}
                className="flex items-center gap-2 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{t}</span>
                    {required && (
                      <Badge variant="outline" className="text-[10px]">
                        required
                      </Badge>
                    )}
                  </div>
                </div>
                <select
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                  value={current}
                  onChange={(e) =>
                    onChange({ ...mapping, [t]: e.target.value || undefined })
                  }
                >
                  <option value="">— unmapped —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Preview({
  parsed,
  mapping,
}: {
  parsed: ParserResult;
  mapping: ColumnMapping;
}) {
  // Show the first 5 rows projected through the current mapping so the user
  // can sanity-check before clicking Import.
  const visibleTargets: TargetField[] = (
    [
      "date_performed",
      "meter_name",
      "customer_name",
      "location_name",
      "product_name",
      "mf",
      "cmf",
      "repeatability_pct",
      "passed",
    ] as TargetField[]
  ).filter((t) => mapping[t]);

  const sample = parsed.rows.slice(0, 5);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Preview (first 5 rows after mapping)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5">#</th>
                {visibleTargets.map((t) => (
                  <th key={t} className="px-2 py-1.5 font-medium">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((r) => (
                <tr key={r.rowNumber}>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.rowNumber}</td>
                  {visibleTargets.map((t) => {
                    const col = mapping[t];
                    const v = col ? r.values[col] : null;
                    return (
                      <td key={t} className="px-2 py-1.5 font-mono">
                        {v === null || v === undefined || v === "" ? (
                          <span className="text-muted-foreground/60">—</span>
                        ) : (
                          String(v)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultPanel({ result }: { result: ImportResult }) {
  const ok = result.imported > 0 && result.errors.length === 0;
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
          Import results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryStat label="Imported" value={result.imported.toString()} />
          <SummaryStat label="Skipped" value={result.skipped.toString()} />
          <SummaryStat label="Errors" value={result.errors.length.toString()} />
        </div>

        {result.warnings.length > 0 && (
          <details className="rounded-md border bg-muted/20 p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
            </summary>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {result.warnings.slice(0, 50).map((w, i) => (
                <div key={i} className="text-muted-foreground">
                  Row {w.rowNumber}: {w.message}
                </div>
              ))}
              {result.warnings.length > 50 && (
                <div className="text-muted-foreground/70">
                  …and {result.warnings.length - 50} more
                </div>
              )}
            </div>
          </details>
        )}
        {result.errors.length > 0 && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
            <div className="font-medium">{result.errors.length} errors:</div>
            <div className="mt-1 max-h-48 space-y-1 overflow-y-auto">
              {result.errors.slice(0, 50).map((e, i) => (
                <div key={i}>
                  Row {e.rowNumber}: {e.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
