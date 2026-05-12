// Stable export-input shape. The wizard, the (future) Supabase fetcher, and any
// other source of a "completed proving" should produce this shape, then exporters
// turn it into MD / CSV / HTML / PDF without caring where it came from.

import type { RunProvingOutput } from "@/lib/calc";

export interface ExportContacts {
  techName: string;
  techCompany?: string;
  techEmail?: string;
  techPhone?: string;
  witnessName?: string;
  witnessCompany?: string;
  witnessEmail?: string;
  witnessPhone?: string;
}

export interface ExportPayload {
  generatedAt: string; // ISO timestamp
  customer: { name: string };
  location: { name: string; address?: string };
  meter: {
    tag: string;
    description?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    nominalKFactor: number;
    sizeIn?: number;
  };
  prover: {
    tag: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    baseVolume: number;
    baseVolumeUnit: string;
    pipeInternalDiameterIn?: number;
    pipeWallThicknessIn?: number;
    material?: string;
  };
  product: {
    name: string;
    productType?: string;
  };
  acceptance: {
    name: string;
    repeatabilityTolerancePct: number;
    consistencyRunsRequired: number;
    consistencyRunsMax: number;
  };
  conditions: {
    densityApi: number;
    densityTempF: number;
    densityPressurePsig: number;
    evpPsig: number;
    hydrometerCorrection: boolean;
  };
  contacts: ExportContacts;
  result: RunProvingOutput;
  // Short hash for the cert footer; full HMAC stored elsewhere.
  shortHash?: string;
  appVersion?: string;
}
