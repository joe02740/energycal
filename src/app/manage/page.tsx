"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Users, Building2, MapPin, Gauge, Download, Upload, Droplets, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentTenant } from "@/lib/tenant/provider";
import { getRepository } from "@/lib/data/repository";
import { dynamicStore } from "@/lib/data/store";
import { loadSavedProvings, persistSavedProvings, type SavedCanProving } from "@/app/proving/can/types";
import type { Contact, ContactRole, Customer, Location, Meter, Product, Prover, ProverType } from "@/lib/data/types";

type Tab = "people" | "customers" | "sites" | "meters" | "provers" | "products";
const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "people", label: "People", icon: Users },
  { key: "customers", label: "Customers", icon: Building2 },
  { key: "sites", label: "Sites", icon: MapPin },
  { key: "meters", label: "Meters", icon: Activity },
  { key: "provers", label: "Provers", icon: Gauge },
  { key: "products", label: "Products", icon: Droplets },
];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default function ManagePage() {
  const tenant = useCurrentTenant();
  const repo = useMemo(() => getRepository(tenant.id), [tenant.id]);
  const [tab, setTab] = useState<Tab>("people");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [provers, setProvers] = useState<Prover[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);

  const reload = useCallback(async () => {
    const [cs, ct, ls, pr, pd, mt] = await Promise.all([
      repo.listCustomers(),
      repo.listContacts(),
      repo.listLocationsAll(),
      repo.listProvers(),
      repo.listProducts(),
      repo.listMetersAll(),
    ]);
    setCustomers(cs.sort(byName));
    setContacts(ct.sort(byName));
    setLocations(ls.sort(byName));
    setProvers(pr.sort((a, b) => a.tag.localeCompare(b.tag)));
    setProducts(pd.sort(byName));
    setMeters(mt.sort((a, b) => a.tag.localeCompare(b.tag)));
  }, [repo]);
  useEffect(() => {
    reload();
  }, [reload]);

  const del = async (id: string) => {
    await repo.deleteEntity(id);
    await reload();
  };

  // Roster portability (move to another machine — localStorage doesn't travel).
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  // Export bundles BOTH the roster and the saved can provings, so one file
  // hands everything to another tech / machine. Import accepts this bundle or
  // a legacy roster-only file; both merge by id (never wipes existing data).
  const exportRoster = () => {
    const payload = {
      kind: "energycal-export",
      version: 2,
      exportedAt: new Date().toISOString(),
      roster: JSON.parse(dynamicStore.exportAll()) as unknown,
      canProvings: loadSavedProvings(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `energycal-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const importRoster = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as {
        kind?: string;
        roster?: unknown;
        canProvings?: SavedCanProving[];
      };
      const rosterJson = parsed.kind === "energycal-export" ? JSON.stringify(parsed.roster ?? {}) : JSON.stringify(parsed);
      const counts = dynamicStore.importAll(rosterJson);
      let provingCount = 0;
      if (Array.isArray(parsed.canProvings)) {
        const existing = loadSavedProvings();
        const byId = new Map(existing.map((p) => [p.id, p]));
        for (const p of parsed.canProvings) {
          if (p && typeof p.id === "string") {
            byId.set(p.id, p);
            provingCount++;
          }
        }
        persistSavedProvings(
          [...byId.values()].sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? "")),
        );
      }
      await reload();
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      setNote(
        `Imported ${total} roster record${total === 1 ? "" : "s"}${provingCount ? ` and ${provingCount} proving${provingCount === 1 ? "" : "s"}` : ""}.`,
      );
    } catch {
      setNote("Import failed — not a valid export file.");
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manage roster</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People, customers, sites, meters, provers, and products — edits autosave and feed the pickers everywhere.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportRoster}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" /> Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importRoster(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      {note && <p className="mb-4 text-sm text-muted-foreground">{note}</p>}

      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                active ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              <span className="ml-1 rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                {{ people: contacts.length, customers: customers.length, sites: locations.length, meters: meters.length, provers: provers.length, products: products.length }[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "people" && <PeopleSection contacts={contacts} repo={repo} reload={reload} del={del} />}
      {tab === "customers" && <CustomersSection customers={customers} repo={repo} reload={reload} del={del} />}
      {tab === "sites" && <SitesSection locations={locations} customers={customers} repo={repo} reload={reload} del={del} />}
      {tab === "meters" && <MetersSection meters={meters} locations={locations} repo={repo} reload={reload} del={del} />}
      {tab === "provers" && <ProversSection provers={provers} repo={repo} reload={reload} del={del} />}
      {tab === "products" && <ProductsSection products={products} repo={repo} reload={reload} del={del} />}
    </main>
  );
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
type Repo = ReturnType<typeof getRepository>;

function SectionShell({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RowShell({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete" className="mt-5 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function empty(rows: unknown[], noun: string) {
  if (rows.length) return null;
  return <p className="py-6 text-center text-sm text-muted-foreground">No {noun} yet. Click Add to create one.</p>;
}

// ---- People ----------------------------------------------------------------
function PeopleSection({ contacts, repo, reload, del }: { contacts: Contact[]; repo: Repo; reload: () => Promise<void>; del: (id: string) => void }) {
  const [local, setLocal] = useState(contacts);
  useEffect(() => setLocal(contacts), [contacts]);

  const add = async () => {
    await repo.createContact({ name: "New person", role: "technician" });
    await reload();
  };
  const patch = (c: Contact, p: Partial<Contact>) => setLocal((l) => l.map((x) => (x.id === c.id ? { ...x, ...p } : x)));
  const commit = (c: Contact) => repo.updateContact(c);

  return (
    <SectionShell title="People" onAdd={add}>
      {empty(local, "people")}
      {local.map((c) => (
        <RowShell key={c.id} onDelete={() => del(c.id)}>
          <Field label="Name" className="col-span-2">
            <Input value={c.name} onChange={(e) => patch(c, { name: e.target.value })} onBlur={() => commit(c)} />
          </Field>
          <Field label="Role">
            <select
              className={selectClass}
              value={c.role ?? "other"}
              onChange={(e) => { const role = e.target.value as ContactRole; patch(c, { role }); repo.updateContact({ ...c, role }); }}
            >
              <option value="technician">Technician</option>
              <option value="witness">Witness</option>
              <option value="customer_rep">Customer rep</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Organization">
            <Input value={c.organization ?? ""} onChange={(e) => patch(c, { organization: e.target.value })} onBlur={() => commit(c)} />
          </Field>
          <Field label="Email">
            <Input value={c.email ?? ""} onChange={(e) => patch(c, { email: e.target.value })} onBlur={() => commit(c)} />
          </Field>
          <Field label="Phone">
            <Input value={c.phone ?? ""} onChange={(e) => patch(c, { phone: e.target.value })} onBlur={() => commit(c)} />
          </Field>
        </RowShell>
      ))}
    </SectionShell>
  );
}

// ---- Customers -------------------------------------------------------------
function CustomersSection({ customers, repo, reload, del }: { customers: Customer[]; repo: Repo; reload: () => Promise<void>; del: (id: string) => void }) {
  const [local, setLocal] = useState(customers);
  useEffect(() => setLocal(customers), [customers]);

  const add = async () => {
    await repo.createCustomer({ name: "New customer" });
    await reload();
  };
  const patch = (c: Customer, p: Partial<Customer>) => setLocal((l) => l.map((x) => (x.id === c.id ? { ...x, ...p } : x)));

  return (
    <SectionShell title="Customers" onAdd={add}>
      {empty(local, "customers")}
      {local.map((c) => (
        <RowShell key={c.id} onDelete={() => del(c.id)}>
          <Field label="Name" className="col-span-4">
            <Input value={c.name} onChange={(e) => patch(c, { name: e.target.value })} onBlur={() => repo.updateCustomer(c)} />
          </Field>
        </RowShell>
      ))}
    </SectionShell>
  );
}

// ---- Sites -----------------------------------------------------------------
function SitesSection({ locations, customers, repo, reload, del }: { locations: Location[]; customers: Customer[]; repo: Repo; reload: () => Promise<void>; del: (id: string) => void }) {
  const [local, setLocal] = useState(locations);
  useEffect(() => setLocal(locations), [locations]);

  const add = async () => {
    await repo.createLocation({ customerId: customers[0]?.id ?? "", name: "New site" });
    await reload();
  };
  const patch = (l: Location, p: Partial<Location>) => setLocal((x) => x.map((y) => (y.id === l.id ? { ...y, ...p } : y)));
  const commit = (l: Location) => repo.updateLocation(l);

  return (
    <SectionShell title="Sites / terminals" onAdd={add}>
      {empty(local, "sites")}
      {local.map((l) => (
        <RowShell key={l.id} onDelete={() => del(l.id)}>
          <Field label="Site name" className="col-span-2">
            <Input value={l.name} onChange={(e) => patch(l, { name: e.target.value })} onBlur={() => commit(l)} />
          </Field>
          <Field label="Customer" className="col-span-2">
            <select
              className={selectClass}
              value={l.customerId}
              onChange={(e) => { const customerId = e.target.value; patch(l, { customerId }); repo.updateLocation({ ...l, customerId }); }}
            >
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Address" className="col-span-4">
            <Input value={l.address ?? ""} onChange={(e) => patch(l, { address: e.target.value })} onBlur={() => commit(l)} placeholder="11 Broadway, Chelsea, MA 02150" />
          </Field>
        </RowShell>
      ))}
    </SectionShell>
  );
}

// ---- Provers ---------------------------------------------------------------
const PROVER_TYPES: { value: ProverType; label: string }[] = [
  { value: "tank_can_open_neck", label: "Open-neck can / tank" },
  { value: "ball_bidirectional", label: "Ball — bidirectional" },
  { value: "ball_unidirectional", label: "Ball — unidirectional" },
  { value: "small_volume_prover", label: "Small-volume prover" },
  { value: "master_meter", label: "Master meter" },
];

function ProversSection({ provers, repo, reload, del }: { provers: Prover[]; repo: Repo; reload: () => Promise<void>; del: (id: string) => void }) {
  const [local, setLocal] = useState(provers);
  useEffect(() => setLocal(provers), [provers]);

  const add = async () => {
    await repo.createProver({ tag: "New prover", proverType: "tank_can_open_neck", baseVolume: 0, baseVolumeUnit: "gal", certifiedTempF: 60 });
    await reload();
  };
  const patch = (p: Prover, x: Partial<Prover>) => setLocal((l) => l.map((y) => (y.id === p.id ? { ...y, ...x } : y)));
  const commit = (p: Prover) => repo.updateProver(p);

  return (
    <SectionShell title="Provers" onAdd={add}>
      {empty(local, "provers")}
      {local.map((p) => (
        <RowShell key={p.id} onDelete={() => del(p.id)}>
          <Field label="Tag / name">
            <Input value={p.tag} onChange={(e) => patch(p, { tag: e.target.value })} onBlur={() => commit(p)} />
          </Field>
          <Field label="Serial #">
            <Input value={p.serialNumber ?? ""} onChange={(e) => patch(p, { serialNumber: e.target.value })} onBlur={() => commit(p)} />
          </Field>
          <Field label="Base volume">
            <Input
              value={String(p.baseVolume ?? "")}
              inputMode="decimal"
              onChange={(e) => patch(p, { baseVolume: parseFloat(e.target.value) || 0 })}
              onBlur={() => commit(p)}
            />
          </Field>
          <Field label="Unit">
            <select
              className={selectClass}
              value={p.baseVolumeUnit}
              onChange={(e) => { const baseVolumeUnit = e.target.value as Prover["baseVolumeUnit"]; patch(p, { baseVolumeUnit }); repo.updateProver({ ...p, baseVolumeUnit }); }}
            >
              <option value="gal">gal</option>
              <option value="bbl">bbl</option>
              <option value="l">L</option>
              <option value="m3">m³</option>
            </select>
          </Field>
          <Field label="Type" className="col-span-2">
            <select
              className={selectClass}
              value={p.proverType}
              onChange={(e) => { const proverType = e.target.value as ProverType; patch(p, { proverType }); repo.updateProver({ ...p, proverType }); }}
            >
              {PROVER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        </RowShell>
      ))}
    </SectionShell>
  );
}

// ---- Products --------------------------------------------------------------
function ProductsSection({ products, repo, reload, del }: { products: Product[]; repo: Repo; reload: () => Promise<void>; del: (id: string) => void }) {
  const [local, setLocal] = useState(products);
  useEffect(() => setLocal(products), [products]);

  const add = async () => {
    await repo.createProduct({ name: "New product", apiTableGroup: "refined_generalized" });
    await reload();
  };
  const patch = (p: Product, x: Partial<Product>) => setLocal((l) => l.map((y) => (y.id === p.id ? { ...y, ...x } : y)));
  const commit = (p: Product) => repo.updateProduct(p);

  return (
    <SectionShell title="Products" onAdd={add}>
      {empty(local, "products")}
      {local.map((p) => (
        <RowShell key={p.id} onDelete={() => del(p.id)}>
          <Field label="Name" className="col-span-2">
            <Input value={p.name} onChange={(e) => patch(p, { name: e.target.value })} onBlur={() => commit(p)} placeholder="#6 Oil" />
          </Field>
          <Field label="Default gravity (°API)">
            <Input
              value={p.defaultDensityApi != null ? String(p.defaultDensityApi) : ""}
              inputMode="decimal"
              onChange={(e) => patch(p, { defaultDensityApi: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
              onBlur={() => commit(p)}
            />
          </Field>
          <Field label="Category">
            <Input value={p.productType ?? ""} onChange={(e) => patch(p, { productType: e.target.value })} onBlur={() => commit(p)} placeholder="Fuel oil" />
          </Field>
        </RowShell>
      ))}
    </SectionShell>
  );
}

// ---- Meters ----------------------------------------------------------------
function MetersSection({ meters, locations, repo, reload, del }: { meters: Meter[]; locations: Location[]; repo: Repo; reload: () => Promise<void>; del: (id: string) => void }) {
  const [local, setLocal] = useState(meters);
  useEffect(() => setLocal(meters), [meters]);

  const add = async () => {
    const loc = locations[0];
    await repo.createMeter({
      customerId: loc?.customerId ?? "",
      locationId: loc?.id ?? "",
      tag: "New meter",
      meterType: "pd_positive_displacement",
      nominalKFactor: 0,
      pulseMode: "whole",
      mfCalcMethod: "avg_meter_factor",
      trackFactor: "meter_factor",
      baseTempF: 60,
      atmosphericPressurePsia: 14.696,
    });
    await reload();
  };
  const patch = (m: Meter, x: Partial<Meter>) => setLocal((l) => l.map((y) => (y.id === m.id ? { ...y, ...x } : y)));
  const commit = (m: Meter) => repo.updateMeter(m);

  return (
    <SectionShell title="Meters" onAdd={add}>
      {empty(local, "meters")}
      {local.map((m) => (
        <RowShell key={m.id} onDelete={() => del(m.id)}>
          <Field label="ID # / tag">
            <Input value={m.tag} onChange={(e) => patch(m, { tag: e.target.value })} onBlur={() => commit(m)} />
          </Field>
          <Field label="Make">
            <Input value={m.manufacturer ?? ""} onChange={(e) => patch(m, { manufacturer: e.target.value })} onBlur={() => commit(m)} />
          </Field>
          <Field label="Model">
            <Input value={m.model ?? ""} onChange={(e) => patch(m, { model: e.target.value })} onBlur={() => commit(m)} />
          </Field>
          <Field label='Size (")'>
            <Input
              value={m.sizeIn != null ? String(m.sizeIn) : ""}
              inputMode="decimal"
              onChange={(e) => patch(m, { sizeIn: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
              onBlur={() => commit(m)}
            />
          </Field>
          <Field label="Site" className="col-span-4">
            <select
              className={selectClass}
              value={m.locationId}
              onChange={(e) => {
                const locationId = e.target.value;
                const customerId = locations.find((l) => l.id === locationId)?.customerId ?? "";
                patch(m, { locationId, customerId });
                repo.updateMeter({ ...m, locationId, customerId });
              }}
            >
              <option value="">— unassigned —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
        </RowShell>
      ))}
    </SectionShell>
  );
}
