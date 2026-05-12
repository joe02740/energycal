// Tenant-scoped repository. Reads merge the static seed (example fixtures
// shipped with the app) with the dynamic in-memory store (imports + future
// user-created entities). Both are filtered by companyId.
//
// When Supabase is wired, only the implementation behind getRepository()
// changes; the surface is stable.

import type {
  AcceptanceProfile,
  Customer,
  Location,
  Meter,
  Product,
  Prover,
  ProvingRecord,
} from "./types";
import { mockSeed } from "./mock-seed";
import { dynamicStore } from "./store";

export interface Repository {
  listCustomers(): Promise<Customer[]>;
  listLocations(customerId: string): Promise<Location[]>;
  listLocationsAll(): Promise<Location[]>;
  listMeters(customerId: string, locationId: string): Promise<Meter[]>;
  listMetersAll(): Promise<Meter[]>;
  getMeter(meterId: string): Promise<Meter | null>;
  listProvers(): Promise<Prover[]>;
  getProver(proverId: string): Promise<Prover | null>;
  listProducts(): Promise<Product[]>;
  getProduct(productId: string): Promise<Product | null>;
  listAcceptanceProfiles(): Promise<AcceptanceProfile[]>;
  getAcceptanceProfile(id: string): Promise<AcceptanceProfile | null>;

  // Provings
  listProvings(filter?: {
    meterId?: string;
    customerId?: string;
    productId?: string;
  }): Promise<ProvingRecord[]>;
  getProving(id: string): Promise<ProvingRecord | null>;
}

class InMemoryRepository implements Repository {
  constructor(private readonly tenantId: string) {}

  private inTenant<T extends { companyId: string }>(rows: T[]): T[] {
    return rows.filter((r) => r.companyId === this.tenantId);
  }
  private oneInTenant<T extends { companyId: string }>(row: T | undefined): T | null {
    if (!row) return null;
    return row.companyId === this.tenantId ? row : null;
  }
  // Merge seed (static) with dynamic store (imported + user-created). Dedupe by id, dynamic wins.
  private merge<T extends { id: string }>(seed: T[], dyn: T[]): T[] {
    const map = new Map<string, T>();
    for (const r of seed) map.set(r.id, r);
    for (const r of dyn) map.set(r.id, r);
    return [...map.values()];
  }

  async listCustomers() {
    return this.inTenant(this.merge(mockSeed.customers, dynamicStore.customers()));
  }
  async listLocations(customerId: string) {
    return this.inTenant(this.merge(mockSeed.locations, dynamicStore.locations()))
      .filter((l) => l.customerId === customerId);
  }
  async listLocationsAll() {
    return this.inTenant(this.merge(mockSeed.locations, dynamicStore.locations()));
  }
  async listMeters(customerId: string, locationId: string) {
    return this.inTenant(this.merge(mockSeed.meters, dynamicStore.meters()))
      .filter((m) => m.customerId === customerId && m.locationId === locationId);
  }
  async listMetersAll() {
    return this.inTenant(this.merge(mockSeed.meters, dynamicStore.meters()));
  }
  async getMeter(id: string) {
    const all = this.merge(mockSeed.meters, dynamicStore.meters());
    return this.oneInTenant(all.find((m) => m.id === id));
  }
  async listProvers() {
    return this.inTenant(this.merge(mockSeed.provers, dynamicStore.provers()));
  }
  async getProver(id: string) {
    const all = this.merge(mockSeed.provers, dynamicStore.provers());
    return this.oneInTenant(all.find((p) => p.id === id));
  }
  async listProducts() {
    return this.inTenant(this.merge(mockSeed.products, dynamicStore.products()));
  }
  async getProduct(id: string) {
    const all = this.merge(mockSeed.products, dynamicStore.products());
    return this.oneInTenant(all.find((p) => p.id === id));
  }
  async listAcceptanceProfiles() {
    return this.inTenant(mockSeed.acceptanceProfiles);
  }
  async getAcceptanceProfile(id: string) {
    return this.oneInTenant(mockSeed.acceptanceProfiles.find((p) => p.id === id));
  }

  async listProvings(filter?: {
    meterId?: string;
    customerId?: string;
    productId?: string;
  }) {
    let rows = this.inTenant(dynamicStore.provings());
    if (filter?.meterId)    rows = rows.filter((r) => r.meterId === filter.meterId);
    if (filter?.customerId) rows = rows.filter((r) => r.customerId === filter.customerId);
    if (filter?.productId)  rows = rows.filter((r) => r.productId === filter.productId);
    rows.sort((a, b) => a.datePerformed.localeCompare(b.datePerformed));
    return rows;
  }
  async getProving(id: string) {
    const r = dynamicStore.provings().find((x) => x.id === id);
    return this.oneInTenant(r);
  }
}

type RepositoryFactory = (tenantId: string) => Repository;

let _factory: RepositoryFactory = (tenantId) => new InMemoryRepository(tenantId);

export function getRepository(tenantId: string): Repository {
  return _factory(tenantId);
}

export function setRepositoryFactory(factory: RepositoryFactory) {
  _factory = factory;
}
