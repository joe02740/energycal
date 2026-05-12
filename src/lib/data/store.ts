// Mutable in-memory store for imported / created entities, scoped per tenant.
// The static `mock-seed` provides the example fixtures; this store layers on
// top of it so imports persist within the session without touching the seed.
// When Supabase is wired, this whole file is replaced by a real backend client.

import type {
  Customer,
  Location,
  Meter,
  Product,
  Prover,
  ProvingRecord,
} from "./types";

interface MutableStore {
  customers: Customer[];
  locations: Location[];
  meters: Meter[];
  products: Product[];
  provers: Prover[];
  provings: ProvingRecord[];
}

const _store: MutableStore = {
  customers: [],
  locations: [],
  meters: [],
  products: [],
  provers: [],
  provings: [],
};

export const dynamicStore = {
  // Reads — return the live arrays so UI updates after imports
  customers: () => _store.customers,
  locations: () => _store.locations,
  meters: () => _store.meters,
  products: () => _store.products,
  provers: () => _store.provers,
  provings: () => _store.provings,

  // Writes
  upsertCustomer(c: Customer) {
    const idx = _store.customers.findIndex((x) => x.id === c.id);
    if (idx >= 0) _store.customers[idx] = c;
    else _store.customers.push(c);
  },
  upsertLocation(l: Location) {
    const idx = _store.locations.findIndex((x) => x.id === l.id);
    if (idx >= 0) _store.locations[idx] = l;
    else _store.locations.push(l);
  },
  upsertMeter(m: Meter) {
    const idx = _store.meters.findIndex((x) => x.id === m.id);
    if (idx >= 0) _store.meters[idx] = m;
    else _store.meters.push(m);
  },
  upsertProduct(p: Product) {
    const idx = _store.products.findIndex((x) => x.id === p.id);
    if (idx >= 0) _store.products[idx] = p;
    else _store.products.push(p);
  },
  upsertProver(pr: Prover) {
    const idx = _store.provers.findIndex((x) => x.id === pr.id);
    if (idx >= 0) _store.provers[idx] = pr;
    else _store.provers.push(pr);
  },
  upsertProving(p: ProvingRecord) {
    const idx = _store.provings.findIndex((x) => x.id === p.id);
    if (idx >= 0) _store.provings[idx] = p;
    else _store.provings.push(p);
  },
  // Bulk for imports — minimizes per-row work
  bulkUpsertProvings(rows: ProvingRecord[]) {
    for (const r of rows) this.upsertProving(r);
  },
  resetTenant(companyId: string) {
    _store.customers   = _store.customers.filter((x)   => x.companyId !== companyId);
    _store.locations   = _store.locations.filter((x)   => x.companyId !== companyId);
    _store.meters      = _store.meters.filter((x)      => x.companyId !== companyId);
    _store.products    = _store.products.filter((x)    => x.companyId !== companyId);
    _store.provers     = _store.provers.filter((x)     => x.companyId !== companyId);
    _store.provings    = _store.provings.filter((x)    => x.companyId !== companyId);
  },
};
