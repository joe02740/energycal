"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container, Gauge, Users2, Upload, ArrowRight } from "lucide-react";
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

const TILES = [
  {
    href: "/proving/can",
    title: "Can proving",
    desc: "Open-can / tank prover. Live A–P, branded certificate.",
    icon: Container,
    accent: true,
  },
  {
    href: "/proving/new",
    title: "Meter proving",
    desc: "Ball / SVP prover wizard with live MF and acceptance gates.",
    icon: Gauge,
  },
  {
    href: "/manage",
    title: "Manage roster",
    desc: "People, customers, sites, and provers — edit once, reuse everywhere.",
    icon: Users2,
  },
  {
    href: "/import",
    title: "Import data",
    desc: "Pull in historical provings and records.",
    icon: Upload,
  },
];

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

  const brandName = tenant.branding.displayName ?? tenant.name;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* Hero */}
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Field-first proving</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Custody-transfer meter calibration with live meter factors, can &amp; ball provers, and
            tamper-evident certificates — built to replace the spreadsheet and the clunky desktop tool.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Operating as <span className="font-medium text-foreground">{brandName}</span>.
          </p>
        </div>
        {tenant.branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.branding.logoUrl} alt={brandName} className="h-12 w-auto self-start sm:self-center" />
        ) : null}
      </header>

      {/* Action tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`group flex flex-col rounded-xl border p-4 transition-colors hover:bg-muted/50 ${
                t.accent ? "border-primary/40 bg-primary/[0.04]" : ""
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <Icon className={`h-5 w-5 ${t.accent ? "text-primary" : "text-muted-foreground"}`} />
                <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </div>
              <div className="text-sm font-semibold">{t.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
            </Link>
          );
        })}
      </div>

      {/* Quick start (pick a meter → ball wizard) */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Jump into a meter proving</CardTitle>
          <CardDescription>
            Pick a meter to start the ball/SVP wizard pre-filled, or start clean and select inside.
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
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/proving/new" className={buttonVariants({ variant: "secondary" })}>
              Start clean
            </Link>
            <Link href="/proving/can" className={buttonVariants()}>
              New can proving
            </Link>
            <p className="text-xs text-muted-foreground">Can provings are manual entry — no meter selection needed.</p>
          </div>
        </CardContent>
      </Card>

      {customers.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Customers</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {customers.map((c) => {
              const customerMeters = meters.filter((m) => m.customerId === c.id);
              return (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
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

      {meters.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent meters</h2>
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
                  className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="font-medium">{m.tag}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {customer?.name}{location ? ` · ${location.name}` : ""}
                  </div>
                  {m.description && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.description}</div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-12 text-xs text-muted-foreground">
        v0 · multi-tenant scaffolding live · auth/sync wired in a later milestone
      </div>
    </main>
  );
}
