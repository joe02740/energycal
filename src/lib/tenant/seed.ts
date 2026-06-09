// In-memory seed of tenants. Mirrors the seed in migration 0002.
// When Supabase is wired, replace this with a fetch from the `companies` table.

import type { Tenant } from "./types";
import { DEMO_TENANT_ID, QUORUM_TENANT_ID } from "./types";

export const SEED_TENANTS: Tenant[] = [
  {
    id: QUORUM_TENANT_ID,
    name: "Quorum Calibration",
    branding: {
      displayName: "Quorum Calibration",
      legalName: "Quorum Calibration LLC",
      accentColor: "#13294b", // navy from the logo
      contactEmail: "info@qcalibration.net",
      contactPhone: "361-449-8833",
      contactAddress: "1869 N Hwy 37 Access Rd, George West, TX 78022",
      logoUrl: "/quorum-logo.png",
      defaultAssumptions: {
        throughputGalDay: 100_000,
        pricePerGal: 2.0,
      },
    },
    suggestionThreshold: 85,
    minProvingsForBaseline: 5,
  },
  {
    id: DEMO_TENANT_ID,
    name: "Demo Lab",
    branding: {
      displayName: "Demo Lab (white-label preview)",
      accentColor: "#a855f7",
      contactEmail: "demo@example.com",
      defaultAssumptions: {
        throughputGalDay: 50_000,
        pricePerGal: 2.5,
      },
    },
    suggestionThreshold: 85,
    minProvingsForBaseline: 5,
  },
];

export function findTenant(id: string): Tenant | undefined {
  return SEED_TENANTS.find((t) => t.id === id);
}
