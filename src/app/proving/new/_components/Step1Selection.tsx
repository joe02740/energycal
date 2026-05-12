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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

export function Step1Selection({
  customers,
  locations,
  meters,
  provers,
  products,
  acceptanceProfiles,
}: {
  customers: Customer[];
  locations: Location[];
  meters: Meter[];
  provers: Prover[];
  products: Product[];
  acceptanceProfiles: AcceptanceProfile[];
}) {
  const wiz = useWizardStore();

  const customerOpts: ComboboxOption[] = customers.map((c) => ({
    value: c.id,
    label: c.name,
    searchText: c.name,
  }));
  const locationOpts: ComboboxOption[] = locations.map((l) => ({
    value: l.id,
    label: l.name,
    searchText: `${l.name} ${l.address ?? ""}`,
    hint: l.address,
  }));
  const meterOpts: ComboboxOption[] = meters.map((m) => ({
    value: m.id,
    label: m.tag,
    searchText: `${m.tag} ${m.description ?? ""} ${m.serialNumber ?? ""} ${m.manufacturer ?? ""}`,
    hint: m.description,
  }));
  const proverOpts: ComboboxOption[] = provers.map((p) => ({
    value: p.id,
    label: p.tag,
    searchText: `${p.tag} ${p.serialNumber ?? ""} ${p.manufacturer ?? ""} ${p.proverType}`,
    hint: p.proverType.replace(/_/g, " "),
  }));
  const productOpts: ComboboxOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    searchText: `${p.name} ${p.productType ?? ""} ${p.apiTableGroup}`,
    hint: p.productType,
  }));
  const acceptanceOpts: ComboboxOption[] = acceptanceProfiles.map((p) => ({
    value: p.id,
    label: p.name,
    searchText: p.name,
    hint: `±${p.repeatabilityTolerancePct}%`,
  }));

  const canAdvance =
    wiz.customerId && wiz.locationId && wiz.meterId && wiz.proverId && wiz.productId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Selection</CardTitle>
        <p className="text-sm text-muted-foreground">
          Type to filter — most fields support partial-match search by name, tag, or serial.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Customer</Label>
          <Combobox
            options={customerOpts}
            value={wiz.customerId}
            onChange={(v) => wiz.setCustomer(v)}
            placeholder="Pick a customer"
            searchPlaceholder="Search customers…"
          />
        </div>
        <div className="grid gap-2">
          <Label>Location</Label>
          <Combobox
            options={locationOpts}
            value={wiz.locationId}
            onChange={(v) => wiz.setLocation(v)}
            placeholder={wiz.customerId ? "Pick a location" : "Pick a customer first"}
            searchPlaceholder="Search locations…"
            disabled={!wiz.customerId}
          />
        </div>
        <div className="grid gap-2">
          <Label>Meter</Label>
          <Combobox
            options={meterOpts}
            value={wiz.meterId}
            onChange={(v) => wiz.setMeter(v)}
            placeholder={wiz.locationId ? "Pick a meter" : "Pick a location first"}
            searchPlaceholder="Search by tag, serial, model…"
            disabled={!wiz.locationId}
          />
        </div>
        <div className="grid gap-2">
          <Label>Prover</Label>
          <Combobox
            options={proverOpts}
            value={wiz.proverId}
            onChange={(v) => wiz.setProver(v)}
            placeholder="Pick a prover"
            searchPlaceholder="Search by tag, serial…"
          />
        </div>
        <div className="grid gap-2">
          <Label>Product</Label>
          <Combobox
            options={productOpts}
            value={wiz.productId}
            onChange={(v) => wiz.setProduct(v)}
            placeholder="Pick a product"
            searchPlaceholder="Search products…"
          />
        </div>
        <div className="grid gap-2">
          <Label>Acceptance profile</Label>
          <Combobox
            options={acceptanceOpts}
            value={wiz.acceptanceProfileId}
            onChange={(v) => wiz.setAcceptanceProfile(v)}
            placeholder="Default"
            searchPlaceholder="Search profiles…"
          />
        </div>

        <div className="sm:col-span-2 mt-4 flex justify-between">
          <Button variant="secondary" onClick={wiz.prev}>
            Back
          </Button>
          <Button onClick={wiz.next} disabled={!canAdvance}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
