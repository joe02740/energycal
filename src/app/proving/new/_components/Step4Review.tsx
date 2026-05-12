"use client";

import { useWizardStore } from "@/lib/wizard/store";
import type {
  AcceptanceProfile,
  Customer,
  Location,
  Meter,
  Product,
  Prover,
} from "@/lib/data/types";
import type { RunProvingOutput } from "@/lib/calc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExportActions } from "./ExportActions";

function fmt(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function Step4Review({
  customer,
  location,
  meter,
  prover,
  product,
  acceptance,
  liveResult,
}: {
  customer?: Customer;
  location?: Location;
  meter: Meter | null;
  prover: Prover | null;
  product: Product | null;
  acceptance: AcceptanceProfile | null;
  liveResult: RunProvingOutput | null;
}) {
  const wiz = useWizardStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 text-sm">
          <KV
            label="Technician"
            value={
              wiz.techName
                ? `${wiz.techName}${wiz.techCompany ? ` (${wiz.techCompany})` : ""}`
                : undefined
            }
          />
          <KV
            label="Witness"
            value={
              wiz.witnessName
                ? `${wiz.witnessName}${wiz.witnessCompany ? ` (${wiz.witnessCompany})` : ""}`
                : undefined
            }
          />
          <KV label="Customer" value={customer?.name} />
          <KV label="Location" value={location?.name} />
          <KV label="Meter" value={meter ? `${meter.tag} (${meter.serialNumber ?? "—"})` : undefined} />
          <KV label="Prover" value={prover ? `${prover.tag} (${prover.serialNumber ?? "—"})` : undefined} />
          <KV label="Product" value={product?.name} />
          <KV
            label="Acceptance profile"
            value={
              acceptance
                ? `${acceptance.name} · ±${acceptance.repeatabilityTolerancePct}% · ${acceptance.consistencyRunsRequired}/${acceptance.consistencyRunsMax}`
                : undefined
            }
          />
        </section>

        <Separator />

        <section>
          <h3 className="text-sm font-medium mb-2">Run conditions</h3>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <KV label="Density" value={`${wiz.densityApi} °API @ ${wiz.densityTempF}°F`} />
            <KV label="EVP" value={`${wiz.evpPsig} psig`} />
            <KV
              label="Hydrometer correction"
              value={wiz.hydrometerCorrection ? "Yes" : "No"}
            />
          </div>
        </section>

        <Separator />

        <section>
          <h3 className="text-sm font-medium mb-2">Computed (live)</h3>
          {liveResult ? (
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <KV label="MF" value={fmt(liveResult.mf)} />
              <KV label="CMF" value={fmt(liveResult.cmf)} />
              <KV label="MA" value={fmt(liveResult.ma)} />
              <KV label="KF" value={fmt(liveResult.kf, 1)} />
              <KV label="Repeatability" value={`${fmt(liveResult.repeatabilityPct, 3)}%`} />
              <KV
                label="Result"
                value={
                  <Badge variant={liveResult.passed ? "default" : "destructive"}>
                    {liveResult.passed ? "Pass" : "Fail"}
                  </Badge>
                }
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Fill in run conditions and at least one pass to see computed values.
            </p>
          )}
        </section>

        <Separator />

        <section>
          <h3 className="text-sm font-medium mb-2">Exports</h3>
          <ExportActions
            customer={customer}
            location={location}
            meter={meter}
            prover={prover}
            product={product}
            acceptance={acceptance}
            liveResult={liveResult}
          />
        </section>

        <Separator />

        <div className="flex justify-between">
          <Button variant="secondary" onClick={wiz.prev}>
            Back
          </Button>
          <Button disabled title="Submission persistence wires up when Supabase is connected">
            Submit (pending Supabase)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KV({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
