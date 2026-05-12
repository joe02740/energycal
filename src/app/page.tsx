"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getRepository } from "@/lib/data/repository";
import { useCurrentTenant } from "@/lib/tenant/provider";
import type {
  Customer,
  Location,
  Meter,
  Product,
  Prover,
} from "@/lib/data/types";
import { QuickStart } from "./_components/QuickStart";

export default function Home() {
  const tenant = useCurrentTenant();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [provers, setProvers] = useState<Prover[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let active = true;
    const repo = getRepository(tenant.id);
    async function load() {
      const cs = await repo.listCustomers();
      if (!active) return;
      setCustomers(cs);

      const allLocs = (await Promise.all(cs.map((c) => repo.listLocations(c.id)))).flat();
      if (!active) return;
      setLocations(allLocs);

      const allMeters = (
        await Promise.all(allLocs.map((l) => repo.listMeters(l.customerId, l.id)))
      ).flat();
      if (!active) return;
      setMeters(allMeters);

      const [ps, prs] = await Promise.all([repo.listProvers(), repo.listProducts()]);
      if (!active) return;
      setProvers(ps);
      setProducts(prs);
    }
    load();
    return () => {
      active = false;
    };
  }, [tenant.id]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Field-first proving
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Custody-transfer meter calibration with live MF, four-gate acceptance, and
          tamper-evident certificates.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Operating as <span className="font-medium">{tenant.branding.displayName ?? tenant.name}</span>.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle>Start a proving</CardTitle>
            <CardDescription>
              Pick a meter to jump straight into the wizard, or start clean and select inside.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickStart
              customers={customers}
              locations={locations}
              meters={meters}
              provers={provers}
              products={products}
            />
            <Separator />
            <div className="flex items-center gap-3">
              <Link href="/proving/new" className={buttonVariants()}>
                Start clean
              </Link>
              <p className="text-xs text-muted-foreground">
                Build it up step by step from the wizard.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>
              Browse past provings, search by meter or customer.{" "}
              <span className="text-muted-foreground">(coming soon)</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              disabled
              className={buttonVariants({ variant: "secondary" })}
              aria-disabled
            >
              Browse
            </button>
          </CardContent>
        </Card>
      </div>

      {customers.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Customers
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {customers.map((c) => {
              const customerMeters = meters.filter((m) => m.customerId === c.id);
              return (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {customerMeters.length} meter{customerMeters.length === 1 ? "" : "s"}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {meters.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Recent meters
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {meters.slice(0, 6).map((m) => {
              const customer = customers.find((c) => c.id === m.customerId);
              const location = locations.find((l) => l.id === m.locationId);
              const params = new URLSearchParams({
                customer: m.customerId,
                location: m.locationId,
                meter: m.id,
              });
              return (
                <Link
                  key={m.id}
                  href={`/proving/new?${params.toString()}`}
                  className="rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="font-medium">{m.tag}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {customer?.name}{location ? ` · ${location.name}` : ""}
                  </div>
                  {m.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {m.description}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="mt-10 rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No meters yet for {tenant.branding.displayName ?? tenant.name}. Add one from the wizard.
          </p>
        </section>
      )}

      <div className="mt-12 text-xs text-muted-foreground">
        v0 · multi-tenant scaffolding live · auth/sync wired in a later milestone
      </div>
    </main>
  );
}
