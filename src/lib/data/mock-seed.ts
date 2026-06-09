// In-memory seed data shaped after the real PROVEit fixtures.
// Two tenants seeded so we can verify isolation + branding in dev:
//   - Quorum Calibration (real domain data)
//   - Demo Lab (white-label preview, sparse fixture)

import type {
  AcceptanceProfile,
  Contact,
  Customer,
  Location,
  Meter,
  Product,
  Prover,
} from "./types";
import { DEMO_TENANT_ID, QUORUM_TENANT_ID } from "@/lib/tenant/types";

const customers: Customer[] = [
  // Quorum customers — real shapes from PROVEit
  { id: "cust-sprague",  companyId: QUORUM_TENANT_ID, name: "Sprague" },
  { id: "cust-irving",   companyId: QUORUM_TENANT_ID, name: "Irving Portsmouth" },
  { id: "cust-global",   companyId: QUORUM_TENANT_ID, name: "Global Partners" },
  // Demo Lab customer
  { id: "cust-demo-acme", companyId: DEMO_TENANT_ID,  name: "Acme Pipeline (demo)" },
];

const locations: Location[] = [
  { id: "loc-newington",  companyId: QUORUM_TENANT_ID, customerId: "cust-sprague", name: "Newington Terminal" },
  { id: "loc-portsmouth", companyId: QUORUM_TENANT_ID, customerId: "cust-irving",  name: "Portsmouth Terminal", address: "50 Preble Way, Portsmouth NH" },
  { id: "loc-albany",     companyId: QUORUM_TENANT_ID, customerId: "cust-global",  name: "Albany LPG" },
  { id: "loc-demo-tank",  companyId: DEMO_TENANT_ID,   customerId: "cust-demo-acme", name: "Tank Farm A (demo)" },
];

const products: Product[] = [
  // Quorum
  { id: "prod-diesel",   companyId: QUORUM_TENANT_ID, name: "ULSD (#2 Diesel)",  apiTableGroup: "refined_diesel_heating", productType: "Distillate",      defaultDensityApi: 35.9, vaporPressurePsi: 0 },
  { id: "prod-gasoline", companyId: QUORUM_TENANT_ID, name: "Gasoline (E10)",    apiTableGroup: "refined_gasoline",       productType: "Gasoline (2004)", defaultDensityApi: 60,   vaporPressurePsi: 8 },
  { id: "prod-kerosene", companyId: QUORUM_TENANT_ID, name: "Kerosene / Jet A",  apiTableGroup: "refined_jet_distillate", productType: "Jet Fuel (2004)", defaultDensityApi: 43,   vaporPressurePsi: 0 },
  // Demo
  { id: "prod-demo-crude", companyId: DEMO_TENANT_ID, name: "Crude (light sweet) — demo", apiTableGroup: "crude", defaultDensityApi: 39, vaporPressurePsi: 0 },
];

const meters: Meter[] = [
  {
    id: "meter-bay7-arm1",
    companyId: QUORUM_TENANT_ID,
    customerId: "cust-sprague",
    locationId: "loc-newington",
    tag: "BAY_7_ARM_1",
    description: "Sprague Newington Bay 7 Arm 1",
    manufacturer: "Brodie",
    serialNumber: "17521",
    meterType: "pd_positive_displacement",
    sizeIn: 4,
    nominalKFactor: 200,
    pulseMode: "interpolated",
    mfCalcMethod: "avg_meter_factor",
    trackFactor: "meter_factor",
    baseTempF: 60,
    atmosphericPressurePsia: 14.696,
  },
  {
    id: "meter-bay1-arm1",
    companyId: QUORUM_TENANT_ID,
    customerId: "cust-irving",
    locationId: "loc-portsmouth",
    tag: "BAY_1_ARM_1",
    description: "Irving Portsmouth Bay 1 Arm 1",
    manufacturer: "Smith",
    model: "Prime 4",
    sizeIn: 4,
    nominalKFactor: 100,
    pulseMode: "interpolated",
    mfCalcMethod: "avg_meter_factor",
    trackFactor: "k_factor",
    baseTempF: 60,
    atmosphericPressurePsia: 14.696,
    meterType: "pd_positive_displacement",
  },
  {
    id: "meter-demo-1",
    companyId: DEMO_TENANT_ID,
    customerId: "cust-demo-acme",
    locationId: "loc-demo-tank",
    tag: "DEMO_M_001",
    description: "Demo crude meter",
    meterType: "turbine",
    sizeIn: 6,
    nominalKFactor: 1000,
    pulseMode: "interpolated",
    mfCalcMethod: "avg_meter_factor",
    trackFactor: "meter_factor",
    baseTempF: 60,
    atmosphericPressurePsia: 14.696,
  },
];

const provers: Prover[] = [
  {
    id: "prover-qc3",
    companyId: QUORUM_TENANT_ID,
    tag: "QC_3_LARGE",
    proverType: "ball_bidirectional",
    manufacturer: "Quorum",
    model: "6\" Ball",
    serialNumber: "QC3",
    baseVolume: 0.955332,
    baseVolumeUnit: "bbl",
    certifiedTempF: 60,
    pipeInternalDiameterIn: 6.065,
    pipeWallThicknessIn: 0.28,
    material: "304 Stainless Steel",
    piuCommType: "calibron",
  },
  {
    id: "prover-demo-svp",
    companyId: DEMO_TENANT_ID,
    tag: "DEMO_SVP",
    proverType: "small_volume_prover",
    baseVolume: 1.5,
    baseVolumeUnit: "bbl",
    certifiedTempF: 60,
    pipeInternalDiameterIn: 8,
    pipeWallThicknessIn: 0.35,
    material: "Carbon Steel",
    piuCommType: "none",
  },
];

const acceptanceProfiles: AcceptanceProfile[] = [
  {
    id: "accept-default-quorum",
    companyId: QUORUM_TENANT_ID,
    name: "Custody Transfer Default",
    repeatabilityTolerancePct: 0.05,
    consistencyRunsRequired: 3,
    consistencyRunsMax: 3,
    priorDeviationCheck: true,
    priorDeviationMaxPct: 0.25,
  },
  {
    id: "accept-default-demo",
    companyId: DEMO_TENANT_ID,
    name: "Default",
    repeatabilityTolerancePct: 0.05,
    consistencyRunsRequired: 3,
    consistencyRunsMax: 3,
    priorDeviationCheck: false,
    priorDeviationMaxPct: null,
  },
];

export const mockSeed = {
  customers,
  contacts: [] as Contact[],
  locations,
  products,
  meters,
  provers,
  acceptanceProfiles,
};
