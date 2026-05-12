"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Droplets, TrendingDown } from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/provider";
import { getRepository } from "@/lib/data/repository";
import {
  formatGallons,
  impactForCustomer,
  type ImpactSummary,
} from "@/lib/analytics/impact";
import { evaluate } from "@/lib/insights/evaluate";
import type { Customer, Location, Meter, ProvingRecord } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MfHistoryChart } from "@/components/mf-history-chart";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomerDashboardPage({ params }: PageProps) {
  const { id } = use(params);
  const tenant = useCurrentTenant();
  const repo = useMemo(() => getRepository(tenant.id), [tenant.id]);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [provings, setProvings] = useState<ProvingRecord[]>([]);

  // Adjustable assumptions — start from tenant defaults
  const [throughput, setThroughput] = useState<number>(
    tenant.branding.defaultAssumptions?.throughputGalDay ?? 100_000,
  );

  useEffect(() => {
    let active = true;
    async function load() {
      const [cs, allMeters, allLocs, allProvings] = await Promise.all([
        repo.listCustomers(),
        repo.listMetersAll(),
        repo.listLocationsAll(),
        repo.listProvings({ customerId: id }),
      ]);
      if (!active) return;
      setCustomer(cs.find((c) => c.id === id) ?? null);
      setMeters(allMeters.filter((m) => m.customerId === id));
      setLocations(allLocs.filter((l) => l.customerId === id));
      setProvings(allProvings);
    }
    load();
    return () => {
      active = false;
    };
  }, [id, repo]);

  const impact = useMemo<ImpactSummary>(
    () =>
      impactForCustomer(provings, {
        throughputGalDay: throughput,
        meterCount: Math.max(meters.length, 1),
      }),
    [provings, throughput, meters.length],
  );

  const meterTagMap = useMemo(
    () => Object.fromEntries(meters.map((m) => [m.id, m.tag])),
    [meters],
  );

  if (!customer) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Loading customer…</p>
      </main>
    );
  }

  const earliest = impact.startDate ? impact.startDate.slice(0, 10) : "—";
  const latest = impact.endDate ? impact.endDate.slice(0, 10) : "—";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Customer · {tenant.branding.displayName ?? tenant.name}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{customer.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {meters.length} meter{meters.length === 1 ? "" : "s"} across{" "}
          {locations.length} location{locations.length === 1 ? "" : "s"} · {provings.length}{" "}
          historical proving{provings.length === 1 ? "" : "s"}
          {impact.startDate ? ` · ${earliest} → ${latest}` : ""}.
        </p>
      </header>

      {/* Hero: unregistered product (volume, not dollars) */}
      <Card className="mb-6 border-primary/30">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Droplets className="h-3 w-3" /> Estimated unregistered product between visits
            </div>
            <div className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">
              {formatGallons(impact.totalGallons)}
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {throughput.toLocaleString()} gal/day across{" "}
              {Math.max(meters.length, 1)} meter{meters.length === 1 ? "" : "s"} ×
              cumulative MF drift across {impact.intervals.length} visit interval
              {impact.intervals.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="lg:max-w-[200px]">
            <Label className="text-xs">Throughput · gal/day</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={throughput}
              onChange={(e) => setThroughput(Number(e.target.value) || 0)}
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Customer-provided. Default from tenant settings.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* MF history chart across meters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Meter factor history</CardTitle>
        </CardHeader>
        <CardContent>
          {provings.length > 0 ? (
            <MfHistoryChart
              provings={provings}
              meterIds={meters.map((m) => m.id)}
              meterTags={meterTagMap}
              tolerance={0.0005}
            />
          ) : (
            <EmptyState
              title="No proving history yet"
              body="Import historical provings on the Import page, or run a new proving from the wizard. The chart will plot every accepted MF over time with a reference line at 1.0000 and a ±0.05% tolerance band."
              link={{ href: "/import", label: "Go to Import" }}
            />
          )}
        </CardContent>
      </Card>

      {/* Per-meter table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meters</CardTitle>
        </CardHeader>
        <CardContent>
          {meters.length === 0 ? (
            <EmptyState
              title="No meters yet for this customer"
              body="Build meters from the wizard or import them with their proving history."
              link={{ href: "/proving/new", label: "New proving" }}
            />
          ) : (
            <div className="divide-y">
              {meters.map((m) => (
                <MeterRow
                  key={m.id}
                  meter={m}
                  provings={provings.filter((p) => p.meterId === m.id)}
                  tenantSuggestionThreshold={tenant.suggestionThreshold}
                  minProvingsForBaseline={tenant.minProvingsForBaseline}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Numbers only — no price assumption baked in. Operators read gallons natively; multiply
        by current rack price as needed. Throughput defaults from tenant settings; override
        above for ad-hoc what-ifs.
      </p>
    </main>
  );
}

function MeterRow({
  meter,
  provings,
  tenantSuggestionThreshold,
  minProvingsForBaseline,
}: {
  meter: Meter;
  provings: ProvingRecord[];
  tenantSuggestionThreshold: number;
  minProvingsForBaseline: number;
}) {
  const lastMf =
    provings.length > 0 ? provings[provings.length - 1].mf : null;
  const lastDate =
    provings.length > 0 ? provings[provings.length - 1].datePerformed.slice(0, 10) : null;
  const insights = evaluate({
    meterId: meter.id,
    meterModel: meter.model,
    history: provings.map((p) => ({
      meterId: p.meterId,
      productId: p.productId,
      datePerformed: new Date(p.datePerformed),
      mf: p.mf ?? 0,
      cmf: p.cmf,
      repeatabilityPct: p.repeatabilityPct,
      priorDeviationPct: p.priorDeviationPct,
      passed: p.passed ?? false,
      isWetDown: false,
      excluded: false,
    })),
    population: { totalProvings: provings.length, byMeterModel: {} },
    tenantSuggestionThreshold,
    minProvingsForBaseline,
  });

  return (
    <Link
      href={`/meters/${meter.id}/history`}
      className="flex items-center justify-between gap-4 py-3 text-sm hover:bg-muted/30 -mx-3 px-3 rounded-md"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{meter.tag}</span>
          {insights.maturity.baselineStatus === "establishing" && (
            <Badge variant="outline" className="border-dashed text-[10px] text-muted-foreground">
              Establishing {insights.maturity.qualifyingObservations}/
              {insights.maturity.qualifyingObservations + insights.maturity.provingsToBaseline}
            </Badge>
          )}
          {insights.suggestions.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300">
              <TrendingDown className="mr-1 h-3 w-3" />
              {insights.suggestions.length} flag{insights.suggestions.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {meter.description ?? meter.serialNumber ?? meter.tag}
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs">
        <div className="text-right">
          <div className="text-muted-foreground">Last MF</div>
          <div className="font-mono font-medium">
            {lastMf == null ? "—" : lastMf.toFixed(4)}
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-muted-foreground">Last date</div>
          <div className="font-medium">{lastDate ?? "—"}</div>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-muted-foreground">Provings</div>
          <div className="font-medium">{provings.length}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function EmptyState({
  title,
  body,
  link,
}: {
  title: string;
  body: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      {link && (
        <>
          <Separator className="my-3" />
          <Link
            href={link.href}
            className="text-xs font-medium text-primary hover:underline"
          >
            {link.label} →
          </Link>
        </>
      )}
    </div>
  );
}
