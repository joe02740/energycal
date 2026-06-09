"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Printer, X, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SavablePicker, type PickerOption } from "@/components/ui/savable-picker";
import { useCurrentTenant } from "@/lib/tenant/provider";
import { getRepository } from "@/lib/data/repository";
import type { Contact, Customer, Location, Prover } from "@/lib/data/types";
import { canRun, canRepeatability, type CanRunResult } from "@/lib/calc/can/canProving";
import { CuInGalCalculator } from "./_components/CuInGalCalculator";
import { CanCert } from "./_components/CanCert";
import { emptyHeader, emptyRow, parseDecimal, type CanHeader, type CanRunRow } from "./types";

const STORAGE_KEY = "can-proving-draft-v1";
const num = (s: string): number | "" => {
  const n = parseDecimal(s);
  return Number.isFinite(n) ? n : "";
};
const fmt = (v: number | null | undefined, dp: number) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(dp);

export default function CanProvingPage() {
  const tenant = useCurrentTenant();
  const [header, setHeader] = useState<CanHeader>(emptyHeader);
  const [rows, setRows] = useState<CanRunRow[]>([emptyRow(), emptyRow()]);
  const [showCert, setShowCert] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Roster (saved sites, people, provers) — loaded from the repository.
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [provers, setProvers] = useState<Prover[]>([]);

  const repo = useMemo(() => getRepository(tenant.id), [tenant.id]);
  const reloadRoster = useCallback(async () => {
    const [cs, ct, ls, pr] = await Promise.all([
      repo.listCustomers(),
      repo.listContacts(),
      repo.listLocationsAll(),
      repo.listProvers(),
    ]);
    setCustomers(cs);
    setContacts(ct);
    setLocations(ls);
    setProvers(pr);
  }, [repo]);
  useEffect(() => {
    reloadRoster();
  }, [reloadRoster]);

  // Restore / autosave the draft so field entries survive a refresh.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { header?: CanHeader; rows?: CanRunRow[] };
        if (d.header) setHeader({ ...emptyHeader(), ...d.header });
        if (d.rows?.length) setRows(d.rows.map((r) => ({ ...emptyRow(), ...r })));
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ header, rows }));
    } catch {
      /* ignore */
    }
  }, [header, rows, loaded]);

  const gravity = useMemo(() => {
    const g = parseDecimal(header.gravity);
    return Number.isFinite(g) ? g : 0;
  }, [header.gravity]);

  const prevMeterFactor = useMemo(() => {
    const p = parseDecimal(header.previousMeterFactor);
    return Number.isFinite(p) ? p : 0;
  }, [header.previousMeterFactor]);

  const results = useMemo<(CanRunResult | null)[]>(
    () =>
      rows.map((r) => {
        const A = num(r.tankReading);
        const G = num(r.metered);
        if (A === "" || G === "") return null;
        return canRun({
          tankReading: A,
          proverTemps: [num(r.t1), num(r.t2), num(r.t3)],
          meteredAmount: G,
          invoiceTempF: num(r.invoiceTemp),
          apiGravity: gravity,
          presentKFactor: prevMeterFactor,
        });
      }),
    [rows, gravity, prevMeterFactor],
  );

  const qualifying = results
    .map((res, i) => ({ res, row: rows[i] }))
    .filter((x): x is { res: CanRunResult; row: CanRunRow } => x.res !== null && !x.row.wetDown);

  const avg = (sel: (r: CanRunResult) => number) =>
    qualifying.length > 0 ? qualifying.reduce((s, x) => s + sel(x.res), 0) / qualifying.length : null;

  const finalMeterFactor = avg((r) => r.meterFactor);
  const avgErrorGal = avg((r) => r.errorGal);
  const avgErrorPct = avg((r) => r.errorPct);
  const avgCubicIn = avg((r) => r.cubicInches);
  const newMeterFactor = finalMeterFactor !== null && prevMeterFactor ? finalMeterFactor * prevMeterFactor : null;

  const repeatability = useMemo(() => {
    if (qualifying.length < 2) return null;
    const a = qualifying[qualifying.length - 2].res.meterFactor;
    const b = qualifying[qualifying.length - 1].res.meterFactor;
    const r = canRepeatability(a, b);
    return { passed: r.passed, diff: r.diff, avg: r.avg };
  }, [qualifying]);

  const setH = (patch: Partial<CanHeader>) => setHeader((h) => ({ ...h, ...patch }));
  const setRow = (i: number, patch: Partial<CanRunRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  // ---- Roster option lists + pick/create handlers ----------------------------
  const customerOpts: PickerOption[] = customers.map((c) => ({ value: c.id, label: c.name, searchText: c.name }));
  const locationOpts: PickerOption[] = locations
    .filter((l) => !header.customerId || l.customerId === header.customerId)
    .map((l) => ({ value: l.id, label: l.name, hint: l.address, searchText: `${l.name} ${l.address ?? ""}` }));
  const proverOpts: PickerOption[] = provers.map((p) => ({
    value: p.id,
    label: p.tag,
    hint: [p.serialNumber, `${p.baseVolume} ${p.baseVolumeUnit}`].filter(Boolean).join(" · "),
    searchText: `${p.tag} ${p.serialNumber ?? ""} ${p.proverType}`,
  }));
  const contactOpts: PickerOption[] = contacts.map((c) => ({
    value: c.id,
    label: c.name,
    hint: c.organization || (c.role ? c.role.replace(/_/g, " ") : undefined),
    searchText: `${c.name} ${c.organization ?? ""}`,
  }));

  const pickCustomer = (id: string | null) => {
    const c = customers.find((x) => x.id === id);
    setH({ customer: c?.name ?? "", customerId: c?.id ?? "", location: "", locationId: "" });
  };
  const createCustomer = async (name: string) => {
    const c = await repo.createCustomer({ name });
    await reloadRoster();
    setH({ customer: c.name, customerId: c.id, location: "", locationId: "" });
    return c.id;
  };

  const pickLocation = (id: string | null) => {
    const l = locations.find((x) => x.id === id);
    if (!l) return setH({ location: "", locationId: "" });
    const owner = customers.find((c) => c.id === l.customerId);
    setH({
      location: l.name,
      locationId: l.id,
      address: l.address ?? header.address,
      ...(owner ? { customer: owner.name, customerId: owner.id } : {}),
    });
  };
  const createLocation = async (name: string) => {
    const l = await repo.createLocation({
      customerId: header.customerId,
      name,
      address: header.address.trim() || undefined,
    });
    await reloadRoster();
    setH({ location: l.name, locationId: l.id });
    return l.id;
  };

  const pickProver = (id: string | null) => {
    const p = provers.find((x) => x.id === id);
    if (!p) return setH({ proverId: "" });
    setH({ proverId: p.id, proverSerial: p.serialNumber ?? "", proverSize: `${p.baseVolume} ${p.baseVolumeUnit}` });
  };
  const createProver = async (tag: string) => {
    const sizeNum = parseDecimal(header.proverSize);
    const p = await repo.createProver({
      tag,
      proverType: "tank_can_open_neck",
      serialNumber: header.proverSerial.trim() || undefined,
      baseVolume: Number.isFinite(sizeNum) ? sizeNum : 0,
      baseVolumeUnit: /bbl/i.test(header.proverSize) ? "bbl" : "gal",
      certifiedTempF: 60,
    });
    await reloadRoster();
    setH({ proverId: p.id });
    return p.id;
  };

  const contactIdByName = (name: string) => contacts.find((c) => c.name === name)?.id ?? null;
  const pickContact = (field: "performedBy" | "witness") => (id: string | null) => {
    const c = contacts.find((x) => x.id === id);
    setH({ [field]: c?.name ?? "" } as Partial<CanHeader>);
  };
  const createContact = (field: "performedBy" | "witness", role: Contact["role"]) => async (name: string) => {
    const c = await repo.createContact({ name, role });
    await reloadRoster();
    setH({ [field]: c.name } as Partial<CanHeader>);
    return c.id;
  };

  const brand = {
    name: tenant.branding.displayName ?? tenant.name,
    legalName: tenant.branding.legalName,
    accent: tenant.branding.accentColor,
    contactEmail: tenant.branding.contactEmail,
    contactPhone: tenant.branding.contactPhone,
    contactAddress: tenant.branding.contactAddress,
    logoUrl: tenant.branding.logoUrl,
  };
  const generatedAt = new Date().toLocaleString();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Everything except the certificate is hidden when printing */}
      <div className="print:hidden">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Can / tank proving</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manual-entry meter proving against an open-can prover — emulates the Excel record (A–P), live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CuInGalCalculator />
          <Button onClick={() => setShowCert(true)} disabled={qualifying.length === 0}>
            <FileCheck2 className="mr-2 h-4 w-4" />
            Certificate
          </Button>
        </div>
      </div>

      {/* Header / identification */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Pf label="Customer">
              <SavablePicker
                options={customerOpts}
                value={header.customerId || null}
                onChange={pickCustomer}
                onCreate={createCustomer}
                placeholder="Pick or add customer"
                searchPlaceholder="Search customers…"
                addLabel={(q) => `Add customer “${q}”`}
              />
            </Pf>
            <Pf label="Site / terminal">
              <SavablePicker
                options={locationOpts}
                value={header.locationId || null}
                onChange={pickLocation}
                onCreate={createLocation}
                placeholder="Pick or add site"
                searchPlaceholder="Search sites…"
                addLabel={(q) => `Add site “${q}”`}
              />
            </Pf>
            <Hf label="Address" v={header.address} on={(x) => setH({ address: x })} />
            <Hf label="Cert #" v={header.certNo} on={(x) => setH({ certNo: x })} />
            <Hf label="Date of test" type="date" v={header.testDate} on={(x) => setH({ testDate: x })} />
            <Hf label="Last test date" type="date" v={header.lastTestDate} on={(x) => setH({ lastTestDate: x })} />
            <Hf label="Product" v={header.product} on={(x) => setH({ product: x })} />
            <Hf label="Gravity (°API)" v={header.gravity} on={(x) => setH({ gravity: x })} placeholder="35.9" numeric />
            <Hf label="Throughput since" v={header.throughputSince} on={(x) => setH({ throughputSince: x })} />
            <Pf label="Performed by">
              <SavablePicker
                options={contactOpts}
                value={contactIdByName(header.performedBy)}
                onChange={pickContact("performedBy")}
                onCreate={createContact("performedBy", "technician")}
                placeholder="Pick or add person"
                searchPlaceholder="Search people…"
                addLabel={(q) => `Add person “${q}”`}
              />
            </Pf>
            <Pf label="Witness">
              <SavablePicker
                options={contactOpts}
                value={contactIdByName(header.witness)}
                onChange={pickContact("witness")}
                onCreate={createContact("witness", "witness")}
                placeholder="Pick or add person"
                searchPlaceholder="Search people…"
                addLabel={(q) => `Add person “${q}”`}
              />
            </Pf>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Hf label="Meter make" v={header.meterMake} on={(x) => setH({ meterMake: x })} />
            <Hf label="Meter model" v={header.meterModel} on={(x) => setH({ meterModel: x })} />
            <Hf label="Meter size" v={header.meterSize} on={(x) => setH({ meterSize: x })} />
            <Hf label="Meter ID #" v={header.meterId} on={(x) => setH({ meterId: x })} />
            <Hf label="Meter seal #" v={header.meterSeal} on={(x) => setH({ meterSeal: x })} />
            <Pf label="Prover (pick to autofill)">
              <SavablePicker
                options={proverOpts}
                value={header.proverId || null}
                onChange={pickProver}
                onCreate={createProver}
                placeholder="Pick or save prover"
                searchPlaceholder="Search provers…"
                addLabel={(q) => `Save current as “${q}”`}
              />
            </Pf>
            <Hf label="Prover serial #" v={header.proverSerial} on={(x) => setH({ proverSerial: x })} />
            <Hf label="Prover size" v={header.proverSize} on={(x) => setH({ proverSize: x })} placeholder="1000 gal" />
            <Hf label="Last totalizer" v={header.lastTotalizer} on={(x) => setH({ lastTotalizer: x })} />
            <Hf label="This test start" v={header.startTotalizer} on={(x) => setH({ startTotalizer: x })} />
            <Hf label="This test finish" v={header.finishTotalizer} on={(x) => setH({ finishTotalizer: x })} />
          </div>
        </CardContent>
      </Card>

      {/* Runs — two-line cards: inputs on top, derived readout below */}
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Runs</CardTitle>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" /> Add run
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r, i) => {
            const res = results[i];
            return (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    Run {i + 1}
                    {r.wetDown && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        wet-down · excluded
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={r.wetDown}
                        onChange={(e) => setRow(i, { wetDown: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      Wet-down
                    </label>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeRow(i)} aria-label="Remove run">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Line 1: inputs */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                  <Rf label="A · Tank gal" v={r.tankReading} on={(x) => setRow(i, { tankReading: x })} />
                  <Rf label="Temp top °F" v={r.t1} on={(x) => setRow(i, { t1: x })} />
                  <Rf label="Temp mid °F" v={r.t2} on={(x) => setRow(i, { t2: x })} />
                  <Rf label="Temp bot °F" v={r.t3} on={(x) => setRow(i, { t3: x })} />
                  <Rf label="G · Metered" v={r.metered} on={(x) => setRow(i, { metered: x })} />
                  <Rf label="H · Invoice °F" v={r.invoiceTemp} on={(x) => setRow(i, { invoiceTemp: x })} />
                  <Rf label="Flow (gpm)" v={r.flowGpm} on={(x) => setRow(i, { flowGpm: x })} />
                </div>

                {/* Line 2: derived readout */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-xs tabular-nums">
                  {res ? (
                    <>
                      <D label="Avg °F" v={fmt(res.avgTemp, 1)} />
                      <D label="CTS" v={fmt(res.cts, 5)} />
                      <D label="CTL" v={fmt(res.ctlProver, 5)} />
                      <D label="Net prv (F)" v={fmt(res.netProver, 2)} />
                      <D label="Net mtr (J)" v={fmt(res.netMeter, 2)} />
                      <D label="Error gal (K)" v={fmt(res.errorGal, 2)} strong />
                      <D label="Error %" v={fmt(res.errorPct, 4)} />
                      <D label="Cubic in (M)" v={fmt(res.cubicInches, 1)} strong />
                      <D label="MF (N)" v={fmt(res.meterFactor, 4)} strong />
                    </>
                  ) : (
                    <span className="text-muted-foreground">Enter tank gal + metered to compute…</span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Results summary */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Previous meter factor</Label>
              <Input
                value={header.previousMeterFactor}
                inputMode="decimal"
                onChange={(e) => setH({ previousMeterFactor: e.target.value })}
                placeholder="1.04235"
                className="tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground">The meter&apos;s currently-loaded factor.</p>
            </div>
            <div className="flex items-center justify-center text-2xl text-muted-foreground">→</div>
            <Stat
              label="New meter factor"
              value={fmt(newMeterFactor, 5)}
              hint={prevMeterFactor ? "avg MF × previous" : "enter previous factor"}
              tone="good"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Avg meter factor (N)" value={fmt(finalMeterFactor, 4)} />
            <Stat label="Avg error (gal)" value={fmt(avgErrorGal, 2)} />
            <Stat label="Avg error %" value={fmt(avgErrorPct, 4)} />
            <Stat label="Avg cubic in" value={fmt(avgCubicIn, 1)} />
            <Stat
              label="Repeatability Δ"
              value={repeatability ? fmt(repeatability.diff, 4) : "—"}
              hint={qualifying.length < 2 ? "needs 2 runs" : undefined}
            />
            <Stat
              label="Status"
              value={repeatability ? (repeatability.passed ? "PASS" : "REVIEW") : "—"}
              tone={repeatability ? (repeatability.passed ? "good" : "warn") : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {qualifying.length} qualifying run{qualifying.length === 1 ? "" : "s"} · wet-down runs excluded ·
            open-can atmospheric prover (no CPS/CPL). Repeatability rule: both MF in 0.9995–1.0005 and Δ ≤ 0.0005.
          </p>
        </CardContent>
      </Card>

      <div className="mb-2">
        <Textarea
          placeholder="Comments…"
          value={header.comments}
          onChange={(e) => setH({ comments: e.target.value })}
          rows={2}
        />
      </div>
      </div>
      {/* end print:hidden editor */}

      {/* Certificate overlay */}
      {showCert && (
        <div className="cert-print-root fixed inset-0 z-50 overflow-auto bg-neutral-200/95 p-4">
          <div className="no-print mx-auto mb-3 flex max-w-[8.5in] items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCert(false)}>
              <X className="mr-2 h-4 w-4" /> Close
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print / Save PDF
            </Button>
          </div>
          <div className="cert-wrap mx-auto max-w-[8.5in] bg-white shadow-lg print:max-w-none print:shadow-none">
            <CanCert
              header={header}
              rows={rows}
              results={results}
              finalMeterFactor={finalMeterFactor}
              newMeterFactor={newMeterFactor}
              avgErrorGal={avgErrorGal}
              avgCubicIn={avgCubicIn}
              repeatability={repeatability}
              brand={brand}
              generatedAt={generatedAt}
            />
          </div>
        </div>
      )}
    </main>
  );
}

/** Labeled wrapper for a picker cell. */
function Pf({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Hf({
  label,
  v,
  on,
  type,
  placeholder,
  numeric,
}: {
  label: string;
  v: string;
  on: (x: string) => void;
  type?: string;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={v}
        onChange={(e) => on(e.target.value)}
        type={type}
        inputMode={numeric ? "decimal" : undefined}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Labeled numeric input for a run row. */
function Rf({ label, v, on }: { label: string; v: string; on: (x: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input value={v} inputMode="decimal" onChange={(e) => on(e.target.value)} className="tabular-nums" />
    </div>
  );
}

/** A labeled derived value in the run readout strip. */
function D({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{v}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  const color = tone === "good" ? "text-green-600 dark:text-green-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
