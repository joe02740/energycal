"use client";

import type { RunProvingOutput } from "@/lib/calc";
import type { AcceptanceProfile } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function fmt(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function LiveResults({
  result,
  acceptance,
}: {
  result: RunProvingOutput | null;
  acceptance: AcceptanceProfile | null;
}) {
  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Live results
          {result && (
            <Badge variant={result.passed ? "default" : "destructive"}>
              {result.passed ? "Pass" : "Fail"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!result && (
          <p className="text-muted-foreground">
            Numbers appear here as you enter pass data.
          </p>
        )}
        {result && (
          <>
            <Row label="MF" value={fmt(result.mf)} accent />
            <Row label="CMF" value={fmt(result.cmf)} />
            <Row label="MA" value={fmt(result.ma)} />
            <Row label="KF" value={fmt(result.kf, 1)} />
            <hr className="my-2" />
            <Row
              label="Repeatability"
              value={`${fmt(result.repeatabilityPct, 3)}%`}
              status={result.repeatabilityPassed ? "pass" : "fail"}
              tolerance={
                acceptance ? `≤ ${acceptance.repeatabilityTolerancePct}%` : undefined
              }
            />
            <Row
              label="Consistency"
              value={result.consistencyPassed ? "OK" : "Fail"}
              status={result.consistencyPassed ? "pass" : "fail"}
            />
            <Row
              label="Prior deviation"
              value={
                result.priorDeviationPct != null
                  ? `${fmt(result.priorDeviationPct, 4)}%`
                  : "—"
              }
              status={
                result.priorPassed === null
                  ? undefined
                  : result.priorPassed
                  ? "pass"
                  : "fail"
              }
            />
            <hr className="my-2" />
            <Row label="CTLm" value={fmt(result.ctlMeter, 6)} />
            <Row label="CPLm" value={fmt(result.cplMeter, 6)} />
            <Row label="CCFm" value={fmt(result.ccfMeter, 6)} />
            <Row label="CTSp" value={fmt(result.ctsProver, 6)} />
            <Row label="CPSp" value={fmt(result.cpsProver, 6)} />
            <Row label="CTLp" value={fmt(result.ctlProver, 6)} />
            <Row label="CPLp" value={fmt(result.cplProver, 6)} />
            <Row label="CCFp" value={fmt(result.ccfProver, 6)} />
            <hr className="my-2" />
            <Row label="ρ_60" value={`${result.rho60KgM3.toFixed(2)} kg/m³`} />
            {result.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-200">
                {result.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  accent,
  status,
  tolerance,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  status?: "pass" | "fail";
  tolerance?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-muted-foreground">
        {label}
        {tolerance ? <span className="ml-1 opacity-75">({tolerance})</span> : null}
      </span>
      <span
        className={cn(
          "font-mono",
          accent && "text-base font-semibold",
          status === "pass" && "text-emerald-600 dark:text-emerald-400",
          status === "fail" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}
