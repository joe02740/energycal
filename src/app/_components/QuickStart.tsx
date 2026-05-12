"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import type {
  Customer,
  Location,
  Meter,
  Product,
  Prover,
} from "@/lib/data/types";
import { Label } from "@/components/ui/label";

export function QuickStart({
  customers,
  locations,
  meters,
  provers,
  products,
}: {
  customers: Customer[];
  locations: Location[];
  meters: Meter[];
  provers: Prover[];
  products: Product[];
}) {
  const router = useRouter();
  const [meterId, setMeterId] = useState<string | null>(null);
  const [proverId, setProverId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);

  const meter = meters.find((m) => m.id === meterId);
  const customer = meter ? customers.find((c) => c.id === meter.customerId) : null;
  const location = meter ? locations.find((l) => l.id === meter.locationId) : null;

  const onJump = () => {
    if (!meterId) return;
    const m = meters.find((x) => x.id === meterId)!;
    const params = new URLSearchParams({
      customer: m.customerId,
      location: m.locationId,
      meter: m.id,
    });
    if (proverId) params.set("prover", proverId);
    if (productId) params.set("product", productId);
    router.push(`/proving/new?${params.toString()}`);
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Jump to a meter
        </Label>
        <Combobox
          options={meters.map((m) => {
            const c = customers.find((x) => x.id === m.customerId);
            const l = locations.find((x) => x.id === m.locationId);
            return {
              value: m.id,
              label: m.tag,
              searchText: `${m.tag} ${m.description ?? ""} ${m.serialNumber ?? ""} ${c?.name ?? ""} ${l?.name ?? ""}`,
              hint: [c?.name, l?.name].filter(Boolean).join(" · "),
            };
          })}
          value={meterId}
          onChange={setMeterId}
          placeholder="Type a tag, serial, customer, or location"
          searchPlaceholder="Search meters…"
        />
        {meter ? (
          <p className="text-xs text-muted-foreground">
            {customer?.name} · {location?.name}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Prover (optional)
          </Label>
          <Combobox
            options={provers.map((p) => ({
              value: p.id,
              label: p.tag,
              searchText: `${p.tag} ${p.serialNumber ?? ""} ${p.proverType}`,
              hint: p.proverType.replace(/_/g, " "),
            }))}
            value={proverId}
            onChange={setProverId}
            placeholder="Pick later in wizard"
            searchPlaceholder="Search provers…"
          />
        </div>
        <div className="grid gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Product (optional)
          </Label>
          <Combobox
            options={products.map((p) => ({
              value: p.id,
              label: p.name,
              searchText: `${p.name} ${p.productType ?? ""}`,
              hint: p.productType,
            }))}
            value={productId}
            onChange={setProductId}
            placeholder="Pick later in wizard"
            searchPlaceholder="Search products…"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onJump} disabled={!meterId}>
          Jump to wizard
        </Button>
      </div>
    </div>
  );
}
