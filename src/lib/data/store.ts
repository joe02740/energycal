// Mutable store for imported / user-created entities, scoped per tenant.
// The static `mock-seed` provides the example fixtures; this store layers on
// top of it so imports + things created in the field persist.
//
// Persistence: the whole store is mirrored to localStorage (browser only) so a
// roster of people / sites / provers built up in the field survives a refresh.
// When Supabase is wired, this whole file is replaced by a real backend client.

import type {
  Contact,
  Customer,
  Location,
  Meter,
  Product,
  Prover,
  ProvingRecord,
} from "./types";

interface MutableStore {
  customers: Customer[];
  contacts: Contact[];
  locations: Location[];
  meters: Meter[];
  products: Product[];
  provers: Prover[];
  provings: ProvingRecord[];
  deleted: string[]; // tombstones — ids hidden from reads (works for seed + dynamic rows)
}

const STORAGE_KEY = "energycal-dynamic-store-v1";

const _store: MutableStore = {
  customers: [],
  contacts: [],
  locations: [],
  meters: [],
  products: [],
  provers: [],
  provings: [],
  deleted: [],
};

let _hydrated = false;
function hydrate() {
  if (_hydrated) return;
  _hydrated = true; // set first so a parse failure doesn't retry every read
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<MutableStore>;
    for (const k of Object.keys(_store) as (keyof MutableStore)[]) {
      const rows = parsed[k];
      if (Array.isArray(rows)) (_store[k] as unknown[]) = rows;
    }
  } catch {
    /* ignore corrupt cache */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_store));
  } catch {
    /* quota / private mode — stay in-memory */
  }
}

function upsert<T extends { id: string }>(arr: T[], row: T) {
  const idx = arr.findIndex((x) => x.id === row.id);
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  persist();
}

export const dynamicStore = {
  // Reads — hydrate lazily on first access, return the live arrays
  customers: () => (hydrate(), _store.customers),
  contacts: () => (hydrate(), _store.contacts),
  locations: () => (hydrate(), _store.locations),
  meters: () => (hydrate(), _store.meters),
  products: () => (hydrate(), _store.products),
  provers: () => (hydrate(), _store.provers),
  provings: () => (hydrate(), _store.provings),
  deletedIds: () => (hydrate(), _store.deleted),

  // Writes
  upsertCustomer(c: Customer) {
    hydrate();
    upsert(_store.customers, c);
  },
  upsertContact(c: Contact) {
    hydrate();
    upsert(_store.contacts, c);
  },
  upsertLocation(l: Location) {
    hydrate();
    upsert(_store.locations, l);
  },
  upsertMeter(m: Meter) {
    hydrate();
    upsert(_store.meters, m);
  },
  upsertProduct(p: Product) {
    hydrate();
    upsert(_store.products, p);
  },
  upsertProver(pr: Prover) {
    hydrate();
    upsert(_store.provers, pr);
  },
  upsertProving(p: ProvingRecord) {
    hydrate();
    upsert(_store.provings, p);
  },
  markDeleted(id: string) {
    hydrate();
    if (!_store.deleted.includes(id)) _store.deleted.push(id);
    persist();
  },
  restore(id: string) {
    hydrate();
    _store.deleted = _store.deleted.filter((x) => x !== id);
    persist();
  },

  // Portability: carry the field roster to another machine. Export the whole
  // dynamic store as JSON; import merges by id (upsert) so it never wipes data
  // already on the target machine.
  exportAll(): string {
    hydrate();
    return JSON.stringify(_store, null, 2);
  },
  importAll(json: string): Record<string, number> {
    hydrate();
    const incoming = JSON.parse(json) as Partial<MutableStore>;
    const counts: Record<string, number> = {};
    const keys: (keyof MutableStore)[] = ["customers", "contacts", "locations", "meters", "products", "provers", "provings"];
    for (const k of keys) {
      const rows = incoming[k];
      if (!Array.isArray(rows)) continue;
      const arr = _store[k] as { id: string }[];
      for (const r of rows as { id: string }[]) {
        const idx = arr.findIndex((x) => x.id === r.id);
        if (idx >= 0) arr[idx] = r;
        else arr.push(r);
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    if (Array.isArray(incoming.deleted)) {
      for (const id of incoming.deleted) if (!_store.deleted.includes(id)) _store.deleted.push(id);
    }
    persist();
    return counts;
  },
  // Bulk for imports — minimizes per-row work
  bulkUpsertProvings(rows: ProvingRecord[]) {
    hydrate();
    for (const r of rows) {
      const idx = _store.provings.findIndex((x) => x.id === r.id);
      if (idx >= 0) _store.provings[idx] = r;
      else _store.provings.push(r);
    }
    persist();
  },
  resetTenant(companyId: string) {
    hydrate();
    _store.customers = _store.customers.filter((x) => x.companyId !== companyId);
    _store.contacts = _store.contacts.filter((x) => x.companyId !== companyId);
    _store.locations = _store.locations.filter((x) => x.companyId !== companyId);
    _store.meters = _store.meters.filter((x) => x.companyId !== companyId);
    _store.products = _store.products.filter((x) => x.companyId !== companyId);
    _store.provers = _store.provers.filter((x) => x.companyId !== companyId);
    _store.provings = _store.provings.filter((x) => x.companyId !== companyId);
    persist();
  },
};
