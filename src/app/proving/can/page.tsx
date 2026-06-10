"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Printer, X, FileCheck2, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SavablePicker, type PickerOption } from "@/components/ui/savable-picker";
import { useCurrentTenant } from "@/lib/tenant/provider";
import { getRepository } from "@/lib/data/repository";
import { useActiveUser } from "@/lib/user/activeUser";
import type { Contact, Customer, Location, Meter, Product, Prover } from "@/lib/data/types";
import { canRun, canRepeatability, type CanRunResult } from "@/lib/calc/can/canProving";
import { CuInGalCalculator } from "./_components/CuInGalCalculator";
import { CanCert } from "./_components/CanCert";
import {
  emptyHeader,
  emptyRow,
  parseDecimal,
  loadSavedProvings,
  persistSavedProvings,
  newProvingId,
  type CanHeader,
  type CanRunRow,
  type SavedCanProving,
} from "./types";

const STORAGE_KEY = "can-proving-draft-v1";
const num = (s: string): number | "" => {
  const n = parseDecimal(s);
  return Number.isFinite(n) ? n : "";
};
const fmt = (v: number | null | undefined, dp: number) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(dp);
const today = () => new Date().toISOString().slice(0, 10);

export default function CanProvingPage() {
  const tenant = useCurrentTenant();
  const activeUser = useActiveUser();
  const [header, setHeader] = useState<CanHeader>(emptyHeader);
  const [rows, setRows] = useState<CanRunRow[]>([emptyRow(), emptyRow()]);
  const [showCert, setShowCert] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Saved provings (history) — each finished proving is kept so it can be reopened + re-printed.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedCanProving[]>([]);
  const [note, setNote] = useState<string | null>(null);

  // Roster (saved sites, people, provers, products, meters) — loaded from the repository.
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [provers, setProvers] = useState<Prover[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);

  const repo = useMemo(() => getRepository(tenant.id), [tenant.id]);
  const reloadRoster = useCallback(async () => {
    const [cs, ct, ls, pr, pd, mt] = await Promise.all([
      repo.listCustomers(),
      repo.listContacts(),
      repo.listLocationsAll(),
      repo.listProvers(),
      repo.listProducts(),
      repo.listMetersAll(),
    ]);
    setCustomers(cs);
    setContacts(ct);
    setLocations(ls);
    setProvers(pr);
    setProducts(pd);
    setMeters(mt);
  }, [repo]);
  useEffect(() => {
    reloadRoster();
  }, [reloadRoster]);

  // Restore / autosave the draft so field entries survive a refresh.
  useEffect(() => {
    setSaved(loadSavedProvings());
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { header?: CanHeader; rows?: CanRunRow[]; currentId?: string | null };
        if (d.header) setHeader({ ...emptyHeader(), ...d.header });
        if (d.rows?.length) setRows(d.rows.map((r) => ({ ...emptyRow(), ...r })));
        if (d.currentId) setCurrentId(d.currentId);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ header, rows, currentId }));
    } catch {
      /* ignore */
    }
  }, [header, rows, currentId, loaded]);

  // PROVEit-style defaults: date of test = today, performed by = the active
  // profile. Fills blanks only — never overwrites a restored draft or an
  // opened proving.
  useEffect(() => {
    if (!loaded) return;
    setHeader((h) => {
      const patch: Partial<CanHeader> = {};
      if (h.testDate === "") patch.testDate = today();
      if (h.performedBy.trim() === "" && activeUser) patch.performedBy = activeUser.name;
      return Object.keys(patch).length ? { ...h, ...patch } : h;
    });
  }, [loaded, activeUser]);

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
  const productOpts: PickerOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    hint: p.defaultDensityApi != null ? `${p.defaultDensityApi}°API` : p.productType,
    searchText: `${p.name} ${p.productType ?? ""}`,
  }));
  // Meters offered for the selected site (PROVEit-style: pick the site, choose its meters).
  const meterOpts: PickerOption[] = meters
    .filter((m) => !header.locationId || m.locationId === header.locationId)
    .map((m) => ({
      value: m.id,
      label: m.tag,
      hint: [m.manufacturer, m.model, m.sizeIn != null ? `${m.sizeIn}"` : ""].filter(Boolean).join(" "),
      searchText: `${m.tag} ${m.manufacturer ?? ""} ${m.model ?? ""}`,
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

  const pickProduct = (id: string | null) => {
    const p = products.find((x) => x.id === id);
    if (!p) return setH({ productId: "", product: "" });
    setH({
      productId: p.id,
      product: p.name,
      ...(p.defaultDensityApi != null ? { gravity: String(p.defaultDensityApi) } : {}),
    });
  };
  const createProduct = async (name: string) => {
    const g = parseDecimal(header.gravity);
    const p = await repo.createProduct({
      name,
      apiTableGroup: "refined_generalized",
      defaultDensityApi: Number.isFinite(g) ? g : undefined,
    });
    await reloadRoster();
    setH({ productId: p.id, product: p.name });
    return p.id;
  };

  const pickMeter = (id: string | null) => {
    const m = meters.find((x) => x.id === id);
    if (!m) return setH({ meterRecordId: "" });
    const patch: Partial<CanHeader> = {
      meterRecordId: m.id,
      meterId: m.tag,
      meterMake: m.manufacturer ?? "",
      meterModel: m.model ?? "",
      meterSize: m.sizeIn != null ? String(m.sizeIn) : "",
    };

    // PROVEit-style history pull: this meter's most recent saved proving
    // supplies last test date, last totalizer, previous meter factor (= that
    // proving's NEW factor), and the product it ran.
    const prior = loadSavedProvings()
      .filter((p) => p.id !== currentId && (p.header.meterRecordId === m.id || p.header.meterId === m.tag))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
    if (prior) {
      const pulled: string[] = [];
      if (prior.header.testDate) {
        patch.lastTestDate = prior.header.testDate;
        pulled.push(`last test ${prior.header.testDate}`);
      }
      if (prior.header.finishTotalizer) {
        patch.lastTotalizer = prior.header.finishTotalizer;
        pulled.push("last totalizer");
      }
      const s = summarizeProving(prior);
      const prevK = parseDecimal(prior.header.previousMeterFactor);
      const newMF = s.mf !== null && Number.isFinite(prevK) && prevK > 0 ? s.mf * prevK : null;
      if (newMF !== null) {
        patch.previousMeterFactor = newMF.toFixed(5);
        pulled.push(`previous MF ${newMF.toFixed(4)}`);
      }
      const priorProduct = products.find((p) => p.id === prior.header.productId);
      if (priorProduct) {
        patch.productId = priorProduct.id;
        patch.product = priorProduct.name;
        if (prior.header.gravity) patch.gravity = prior.header.gravity;
        pulled.push(priorProduct.name);
      } else if (prior.header.product) {
        patch.product = prior.header.product;
        patch.productId = "";
        if (prior.header.gravity) patch.gravity = prior.header.gravity;
        pulled.push(prior.header.product);
      }
      if (pulled.length) setNote(`Pulled from this meter's last proving: ${pulled.join(" · ")}.`);
    }
    setH(patch);
  };
  const createMeter = async (tag: string) => {
    const size = parseDecimal(header.meterSize);
    const m = await repo.createMeter({
      customerId: header.customerId,
      locationId: header.locationId,
      tag,
      manufacturer: header.meterMake.trim() || undefined,
      model: header.meterModel.trim() || undefined,
      sizeIn: Number.isFinite(size) ? size : undefined,
      meterType: "pd_positive_displacement",
      nominalKFactor: 0,
      pulseMode: "whole",
      mfCalcMethod: "avg_meter_factor",
      trackFactor: "meter_factor",
      baseTempF: 60,
      atmosphericPressurePsia: 14.696,
    });
    await reloadRoster();
    setH({ meterRecordId: m.id, meterId: m.tag });
    return m.id;
  };

  // Write-back: editing a detail field updates the entity it came from, so the
  // roster "learns" (e.g. a site remembers its address the first time you type it).
  const writeBackLocation = () => {
    const l = locations.find((x) => x.id === header.locationId);
    if (l && (l.address ?? "") !== header.address)
      repo.updateLocation({ ...l, address: header.address.trim() || undefined }).then(reloadRoster);
  };
  const writeBackProduct = () => {
    const p = products.find((x) => x.id === header.productId);
    const g = parseDecimal(header.gravity);
    if (p && Number.isFinite(g) && p.defaultDensityApi !== g)
      repo.updateProduct({ ...p, defaultDensityApi: g }).then(reloadRoster);
  };
  const writeBackMeter = () => {
    const m = meters.find((x) => x.id === header.meterRecordId);
    if (!m) return;
    const size = parseDecimal(header.meterSize);
    const next: Meter = {
      ...m,
      tag: header.meterId.trim() || m.tag,
      manufacturer: header.meterMake.trim() || undefined,
      model: header.meterModel.trim() || undefined,
      sizeIn: Number.isFinite(size) ? size : m.sizeIn,
    };
    if (next.tag !== m.tag || next.manufacturer !== m.manufacturer || next.model !== m.model || next.sizeIn !== m.sizeIn)
      repo.updateMeter(next).then(reloadRoster);
  };
  const writeBackProver = () => {
    const p = provers.find((x) => x.id === header.proverId);
    if (!p) return;
    const size = parseDecimal(header.proverSize);
    const next: Prover = {
      ...p,
      serialNumber: header.proverSerial.trim() || undefined,
      baseVolume: Number.isFinite(size) ? size : p.baseVolume,
    };
    if (next.serialNumber !== p.serialNumber || next.baseVolume !== p.baseVolume)
      repo.updateProver(next).then(reloadRoster);
  };

  // ---- Saved provings (history) — auto-saved once a run is entered ----------
  const hasRunData = rows.some((r) => r.tankReading.trim() !== "" && r.metered.trim() !== "");

  // Persist the working proving into the saved list automatically: a record is
  // created the moment a run has data, and every later edit updates it in place.
  // No Save button to remember — open one, edit, it stays saved.
  useEffect(() => {
    if (!loaded || !hasRunData) return;
    const id = currentId ?? newProvingId();
    if (!currentId) setCurrentId(id);
    setSaved((list) => {
      const record: SavedCanProving = { id, savedAt: new Date().toISOString(), header, rows };
      const next = list.some((p) => p.id === id)
        ? list.map((p) => (p.id === id ? record : p)) // update in place
        : [record, ...list]; // first save → top of the list
      persistSavedProvings(next);
      return next;
    });
  }, [header, rows, currentId, hasRunData, loaded]);

  const newProving = () => {
    setHeader({ ...emptyHeader(), testDate: today(), performedBy: activeUser?.name ?? "" });
    setRows([emptyRow(), emptyRow()]);
    setCurrentId(null);
    setShowCert(false);
    setNote("Started a new proving. The previous one is saved below.");
  };

  const openSaved = (p: SavedCanProving) => {
    setHeader({ ...emptyHeader(), ...p.header });
    setRows(p.rows.length ? p.rows.map((r) => ({ ...emptyRow(), ...r })) : [emptyRow(), emptyRow()]);
    setCurrentId(p.id);
    setShowCert(false);
    setNote("Opened — your edits save automatically.");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteSaved = (id: string) => {
    setSaved((list) => {
      const next = list.filter((p) => p.id !== id);
      persistSavedProvings(next);
      return next;
    });
    if (currentId === id) setCurrentId(null);
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
        <div className="flex flex-wrap items-center gap-2">
          <CuInGalCalculator />
          <Button variant="outline" onClick={newProving}>
            <FilePlus className="mr-2 h-4 w-4" />
            New proving
          </Button>
          <Button onClick={() => setShowCert(true)} disabled={qualifying.length === 0}>
            <FileCheck2 className="mr-2 h-4 w-4" />
            Certificate
          </Button>
        </div>
      </div>
      {note && <p className="mb-4 text-xs text-muted-foreground">{note}</p>}

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
            <Hf label="Address" v={header.address} on={(x) => setH({ address: x })} onBlur={writeBackLocation} />
            <Hf label="Cert #" v={header.certNo} on={(x) => setH({ certNo: x })} />
            <Hf label="Date of test" type="date" v={header.testDate} on={(x) => setH({ testDate: x })} />
            <Hf label="Last test date" type="date" v={header.lastTestDate} on={(x) => setH({ lastTestDate: x })} />
            <Pf label="Product">
              <SavablePicker
                options={productOpts}
                value={header.productId || null}
                onChange={pickProduct}
                onCreate={createProduct}
                placeholder="Pick or add product"
                searchPlaceholder="Search products…"
                addLabel={(q) => `Add product “${q}”`}
              />
            </Pf>
            <Hf
              label="Gravity (°API)"
              v={header.gravity}
              on={(x) => setH({ gravity: x })}
              onBlur={writeBackProduct}
              placeholder="35.9"
              numeric
            />
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
            <Pf label="Meter (pick this site's meters)">
              <SavablePicker
                options={meterOpts}
                value={header.meterRecordId || null}
                onChange={pickMeter}
                onCreate={createMeter}
                placeholder="Pick or save meter"
                searchPlaceholder="Search meters…"
                addLabel={(q) => `Save meter “${q}”`}
              />
            </Pf>
            <Hf label="Meter make" v={header.meterMake} on={(x) => setH({ meterMake: x })} onBlur={writeBackMeter} />
            <Hf label="Meter model" v={header.meterModel} on={(x) => setH({ meterModel: x })} onBlur={writeBackMeter} />
            <Hf label="Meter size" v={header.meterSize} on={(x) => setH({ meterSize: x })} onBlur={writeBackMeter} />
            <Hf label="Meter ID #" v={header.meterId} on={(x) => setH({ meterId: x })} onBlur={writeBackMeter} />
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
            <Hf label="Prover serial #" v={header.proverSerial} on={(x) => setH({ proverSerial: x })} onBlur={writeBackProver} />
            <Hf label="Prover size" v={header.proverSize} on={(x) => setH({ proverSize: x })} onBlur={writeBackProver} placeholder="1000 gal" />
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

      <div className="mb-6">
        <Textarea
          placeholder="Comments…"
          value={header.comments}
          onChange={(e) => setH({ comments: e.target.value })}
          rows={2}
        />
      </div>

      {/* Saved provings (history) */}
      {saved.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saved provings ({saved.length})</CardTitle>
            <p className="text-xs text-muted-foreground">
              Auto-saved once a run is entered. Open any to edit or re-print its certificate.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {saved.map((p) => {
              const s = summarizeProving(p);
              const title =
                [p.header.meterId, p.header.customer, p.header.location].filter(Boolean).join(" · ") ||
                "Untitled proving";
              const when = new Date(p.savedAt).toLocaleString();
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    p.id === currentId ? "border-primary/50 bg-primary/[0.04]" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {title}
                      {p.id === currentId ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">open</span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {when}
                      {p.header.product ? ` · ${p.header.product}` : ""} · {s.count} run{s.count === 1 ? "" : "s"}
                      {s.mf !== null ? ` · MF ${s.mf.toFixed(4)}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => openSaved(p)}>
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteSaved(p.id)}
                      aria-label="Delete proving"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
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
  onBlur,
  type,
  placeholder,
  numeric,
}: {
  label: string;
  v: string;
  on: (x: string) => void;
  onBlur?: () => void;
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
        onBlur={onBlur}
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

/** Quick aggregate for the saved-provings list: qualifying run count + average meter factor. */
function summarizeProving(p: SavedCanProving): { mf: number | null; count: number } {
  const gravity = parseDecimal(p.header.gravity);
  const g = Number.isFinite(gravity) ? gravity : 0;
  const prev = parseDecimal(p.header.previousMeterFactor);
  const pk = Number.isFinite(prev) ? prev : 0;
  const qual = p.rows
    .map((r) => {
      const A = num(r.tankReading);
      const G = num(r.metered);
      if (A === "" || G === "" || r.wetDown) return null;
      return canRun({
        tankReading: A,
        proverTemps: [num(r.t1), num(r.t2), num(r.t3)],
        meteredAmount: G,
        invoiceTempF: num(r.invoiceTemp),
        apiGravity: g,
        presentKFactor: pk,
      });
    })
    .filter((x): x is CanRunResult => x !== null);
  if (!qual.length) return { mf: null, count: 0 };
  return { mf: qual.reduce((s, x) => s + x.meterFactor, 0) / qual.length, count: qual.length };
}
