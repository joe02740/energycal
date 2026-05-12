"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/provider";
import { getRepository } from "@/lib/data/repository";
import { evaluate } from "@/lib/insights/evaluate";
import type { Customer, Location, Meter, ProvingRecord } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MeterHealthCard } from "@/components/meter-health-card";
import { MfHistoryChart } from "@/components/mf-history-chart";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MeterHistoryPage({ params }: PageProps) {
  const { id } = use(params);
  const tenant = useCurrentTenant();
  const repo = useMemo(() => getRepository(tenant.id), [tenant.id]);

  const [meter, setMeter] = useState<Meter | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [provings, setProvings] = useState<ProvingRecord[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const m = await repo.getMeter(id);
      if (!active) return;
      setMeter(m);
      if (!m) return;
      const [cs, locs, h] = await Promise.all([
        repo.listCustomers(),
        repo.listLocationsAll(),
        repo.listProvings({ meterId: id }),
      ]);
      if (!active) return;
      setCustomer(cs.find((c) => c.id === m.customerId) ?? null);
      setLocation(locs.find((l) => l.id === m.locationId) ?? null);
      setProvings(h);
    }
    load();
    return () => {
      active = false;
    };
  }, [id, repo]);

  const insights = useMemo(() => {
    if (!meter) return null;
    return evaluate({
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
      tenantSuggestionThreshold: tenant.suggestionThreshold,
      minProvingsForBaseline: tenant.minProvingsForBaseline,
    });
  }, [meter, provings, tenant.suggestionThreshold, tenant.minProvingsForBaseline]);

  if (!meter) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Loading meter…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href={customer ? `/customers/${customer.id}` : "/"}
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        {customer ? `Back to ${customer.name}` : "Back"}
      </Link>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Meter
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{meter.tag}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {customer?.name ?? "—"}
          {location ? ` · ${location.name}` : ""}
          {meter.description ? ` · ${meter.description}` : ""}
        </p>
      </header>

      {insights && (
        <div className="mb-6">
          <MeterHealthCard
            meterTag={meter.tag}
            maturity={insights.maturity}
            suggestions={insights.suggestions}
          />
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">MF over time</CardTitle>
        </CardHeader>
        <CardContent>
          {provings.length > 0 ? (
            <MfHistoryChart
              provings={provings}
              meterIds={[meter.id]}
              meterTags={{ [meter.id]: meter.tag }}
              tolerance={0.0005}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No provings yet for this meter. Import historical data on the{" "}
              <Link href="/import" className="text-primary hover:underline">
                Import page
              </Link>{" "}
              or run a new proving from the wizard.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proving history</CardTitle>
        </CardHeader>
        <CardContent>
          {provings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No provings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Source</th>
                    <th className="px-2 py-2 font-medium text-right">MF</th>
                    <th className="px-2 py-2 font-medium text-right">CMF</th>
                    <th className="px-2 py-2 font-medium text-right">Repeat %</th>
                    <th className="px-2 py-2 font-medium text-right">Prior Dev %</th>
                    <th className="px-2 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[...provings]
                    .sort((a, b) => b.datePerformed.localeCompare(a.datePerformed))
                    .map((p, i) => {
                      const drift =
                        i < provings.length - 1 && p.mf != null
                          ? p.mf - (provings[provings.length - 1 - i - 1]?.mf ?? p.mf)
                          : null;
                      void drift;
                      return (
                        <tr key={p.id}>
                          <td className="px-2 py-1.5 font-mono">
                            {p.datePerformed.slice(0, 10)}
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge variant="secondary" className="text-[10px]">
                              {p.source}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {p.mf == null ? "—" : p.mf.toFixed(4)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {p.cmf == null ? "—" : p.cmf.toFixed(4)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {p.repeatabilityPct == null
                              ? "—"
                              : p.repeatabilityPct.toFixed(3)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {p.priorDeviationPct == null
                              ? "—"
                              : p.priorDeviationPct.toFixed(3)}
                          </td>
                          <td className="px-2 py-1.5">
                            {p.passed === true ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                Pass
                              </Badge>
                            ) : p.passed === false ? (
                              <Badge variant="destructive">Fail</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <div className="text-xs text-muted-foreground">
        Annotation overlays + cross-meter outlier comparison are coming with the
        analytics layer when there's enough population data.
      </div>
    </main>
  );
}
