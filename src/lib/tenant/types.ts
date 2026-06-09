// A Tenant is a proving company that licenses Energy Cal.
// Maps 1:1 to a row in the `companies` table (schema named that way for
// historical/PIDX-alignment reasons; app-layer uses Tenant for clarity).

export interface TenantBranding {
  displayName?: string;
  legalName?: string; // full legal entity name for certificates (e.g. "Quorum Calibration LLC")
  accentColor?: string; // CSS color; applied as --primary CSS variable override
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  defaultAssumptions?: {
    throughputGalDay?: number;
    pricePerGal?: number;
  };
}

export interface Tenant {
  id: string;
  name: string;
  branding: TenantBranding;
  suggestionThreshold: number; // 0-100, quiet at high values
  minProvingsForBaseline: number;
}

export const QUORUM_TENANT_ID = "00000000-0000-0000-0000-000000000001";
export const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000002";
