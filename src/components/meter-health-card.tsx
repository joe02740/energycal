"use client";

import { Activity, AlertTriangle, CircleAlert, Eye, Info, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Suggestion, MeterMaturity, Severity } from "@/lib/insights/types";

interface MeterHealthCardProps {
  meterTag: string;
  maturity: MeterMaturity;
  suggestions: Suggestion[];
}

const SEVERITY_VISUAL: Record<
  Severity,
  { icon: typeof AlertTriangle; tone: string; label: string }
> = {
  info:  { icon: Info,         tone: "text-sky-700 dark:text-sky-300",       label: "Info" },
  watch: { icon: Eye,          tone: "text-amber-700 dark:text-amber-300",   label: "Watch" },
  warn:  { icon: AlertTriangle, tone: "text-orange-700 dark:text-orange-300", label: "Warn" },
  alert: { icon: CircleAlert,  tone: "text-red-700 dark:text-red-300",        label: "Alert" },
};

export function MeterHealthCard({
  meterTag,
  maturity,
  suggestions,
}: MeterHealthCardProps) {
  const isEstablishing = maturity.baselineStatus === "establishing";
  const isDeveloping = maturity.baselineStatus === "developing";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Meter health · {meterTag}
          </span>
          <BaselinePill maturity={maturity} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lead with the baseline state — the empty state IS the UI. */}
        {isEstablishing && (
          <div className="rounded-md border border-dashed bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="space-y-1.5">
                <p className="text-sm font-medium">
                  Establishing baseline ({maturity.qualifyingObservations} of{" "}
                  {maturity.qualifyingObservations + maturity.provingsToBaseline} provings)
                </p>
                <p className="text-sm text-muted-foreground">
                  We don't make recommendations on this meter until we have a stable read on
                  its normal behavior. <span className="font-medium">{maturity.provingsToBaseline}</span>{" "}
                  more proving{maturity.provingsToBaseline === 1 ? "" : "s"} to baseline.
                </p>
                <p className="text-xs text-muted-foreground/80">
                  Why: building a baseline avoids false alarms and earns the right to flag
                  real issues when they emerge.
                </p>
              </div>
            </div>
          </div>
        )}

        {!isEstablishing && suggestions.length === 0 && (
          <div className="rounded-md border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No flags. Meter is operating within baseline.</p>
                {isDeveloping && (
                  <p className="text-xs text-muted-foreground">
                    Still developing baseline — only the highest-confidence flags are surfaced
                    until {maturity.provingsToBaseline + maturity.qualifyingObservations} provings.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-3">
            {suggestions.map((s, i) => {
              const v = SEVERITY_VISUAL[s.severity];
              const Icon = v.icon;
              return (
                <div
                  key={`${s.ruleId}-${i}`}
                  className="rounded-md border bg-background p-3"
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", v.tone)} />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.title}</span>
                        <Badge variant="secondary" className={cn("text-[10px]", v.tone)}>
                          {v.label}
                        </Badge>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {Math.round(s.confidence)}% confidence
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{s.body}</p>
                      <Separator />
                      <p className="text-sm">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Recommended:&nbsp;
                        </span>
                        {s.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BaselinePill({ maturity }: { maturity: MeterMaturity }) {
  const { baselineStatus, qualifyingObservations, provingsToBaseline } = maturity;
  const total = qualifyingObservations + provingsToBaseline;
  const labels: Record<MeterMaturity["baselineStatus"], string> = {
    establishing: `Establishing · ${qualifyingObservations}/${total}`,
    developing: "Baseline developing",
    established: "Baseline established",
  };
  const tones: Record<MeterMaturity["baselineStatus"], string> = {
    establishing: "border-dashed text-muted-foreground",
    developing: "text-amber-700 dark:text-amber-300 border-amber-500/40",
    established: "text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  };
  return (
    <Badge variant="outline" className={cn("font-normal", tones[baselineStatus])}>
      {labels[baselineStatus]}
    </Badge>
  );
}
