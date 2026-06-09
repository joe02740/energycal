// Tenant-scoped repository. Reads merge the static seed (example fixtures
// shipped with the app) with the dynamic in-memory store (imports + future
// user-created entities). Both are filtered by companyId.
//
// When Supabase is wired, only the implementation behind getRepository()
// changes; the surface is stable.

import type {
  AcceptanceProfile,
  Contact,
  Customer,
  Location,
  Meter,
  Product,
  Prover,
  ProvingRecord,
} from "./types";
import { mockSeed } from "./mock-seed";
import { dynamicStore } from "./store";

function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  return `${prefix}-${rand}`;
}

export interface Repository {
  listCustomers(): Promise<Customer[]>;
  listContacts(): Promise<Contact[]>;
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

  // Creates (field roster — id minted here, persisted via the dynamic store)
  createCustomer(input: Omit<Customer, "id" | "companyId">): Promise<Customer>;
  createContact(input: Omit<Contact, "id" | "companyId">): Promise<Contact>;
  createLocation(input: Omit<Location, "id" | "companyId">): Promise<Location>;
  createProver(input: Omit<Prover, "id" | "companyId">): Promise<Prover>;

  // Edits (overlay over seed via the dynamic store) + tombstone delete
  updateCustomer(row: Customer): Promise<Customer>;
  updateContact(row: Contact): Promise<Contact>;
  updateLocation(row: Location): Promise<Location>;
  updateProver(row: Prover): Promise<Prover>;
  deleteEntity(id: string): Promise<void>;

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
  // Merge seed (static) with dynamic store (imported + user-created). Dedupe by id,
  // dynamic wins, then drop tombstoned ids so deletes hide both seed + dynamic rows.
  private merge<T extends { id: string }>(seed: T[], dyn: T[]): T[] {
    const deleted = new Set(dynamicStore.deletedIds());
    const map = new Map<string, T>();
    for (const r of seed) map.set(r.id, r);
    for (const r of dyn) map.set(r.id, r);
    return [...map.values()].filter((r) => !deleted.has(r.id));
  }

  async listCustomers() {
    return this.inTenant(this.merge(mockSeed.customers, dynamicStore.customers()));
  }
  async listContacts() {
    const seedContacts: Contact[] = mockSeed.contacts ?? [];
    return this.inTenant(this.merge(seedContacts, dynamicStore.contacts()));
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

  async createCustomer(input: Omit<Customer, "id" | "companyId">) {
    const row: Customer = { ...input, id: newId("cust"), companyId: this.tenantId };
    dynamicStore.upsertCustomer(row);
    return row;
  }
  async createContact(input: Omit<Contact, "id" | "companyId">) {
    const row: Contact = { ...input, id: newId("contact"), companyId: this.tenantId };
    dynamicStore.upsertContact(row);
    return row;
  }
  async createLocation(input: Omit<Location, "id" | "companyId">) {
    const row: Location = { ...input, id: newId("loc"), companyId: this.tenantId };
    dynamicStore.upsertLocation(row);
    return row;
  }
  async createProver(input: Omit<Prover, "id" | "companyId">) {
    const row: Prover = { ...input, id: newId("prover"), companyId: this.tenantId };
    dynamicStore.upsertProver(row);
    return row;
  }

  async updateCustomer(row: Customer) {
    dynamicStore.upsertCustomer({ ...row, companyId: this.tenantId });
    return row;
  }
  async updateContact(row: Contact) {
    dynamicStore.upsertContact({ ...row, companyId: this.tenantId });
    return row;
  }
  async updateLocation(row: Location) {
    dynamicStore.upsertLocation({ ...row, companyId: this.tenantId });
    return row;
  }
  async updateProver(row: Prover) {
    dynamicStore.upsertProver({ ...row, companyId: this.tenantId });
    return row;
  }
  async deleteEntity(id: string) {
    dynamicStore.markDeleted(id);
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
