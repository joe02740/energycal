// Wizard state — Zustand. Holds the in-progress proving run as the user moves
// through the steps. The wizard is offline-friendly: state lives in memory plus
// (later) IndexedDB via Dexie. For v0 we keep it in-memory; submission persists
// will be wired when Supabase lands.

"use client";

import { create } from "zustand";

export interface WizardPass {
  passNumber: number;
  isWetDown: boolean;
  excluded: boolean;
  pulses: number | "";
  proverTempF: number | "";
  proverPressurePsig: number | "";
  meterTempF: number | "";
  meterPressurePsig: number | "";
}

interface WizardState {
  step: number;

  // People (captured first so they're locked into the certificate from the start)
  techName: string;
  techCompany: string;
  techEmail: string;
  techPhone: string;
  witnessName: string;
  witnessCompany: string;
  witnessEmail: string;
  witnessPhone: string;

  customerId: string | null;
  locationId: string | null;
  meterId: string | null;
  proverId: string | null;
  productId: string | null;
  acceptanceProfileId: string | null;

  // Run-level inputs
  densityApi: number | "";
  densityTempF: number | "";
  densityPressurePsig: number | "";
  hydrometerCorrection: boolean;
  evpPsig: number | "";

  passes: WizardPass[];

  setStep: (n: number) => void;
  next: () => void;
  prev: () => void;

  setContact: (
    role: "tech" | "witness",
    field: "name" | "company" | "email" | "phone",
    value: string,
  ) => void;

  setCustomer: (id: string | null) => void;
  setLocation: (id: string | null) => void;
  setMeter: (id: string | null) => void;
  setProver: (id: string | null) => void;
  setProduct: (id: string | null) => void;
  setAcceptanceProfile: (id: string | null) => void;

  setRunInput: (
    key:
      | "densityApi"
      | "densityTempF"
      | "densityPressurePsig"
      | "evpPsig",
    value: number | "",
  ) => void;
  setHydrometerCorrection: (v: boolean) => void;

  addPass: () => void;
  removePass: (passNumber: number) => void;
  updatePass: (passNumber: number, patch: Partial<WizardPass>) => void;
  discardPass: (passNumber: number) => void;
  setPassCount: (n: number) => void;

  reset: () => void;
  prefill: (patch: Partial<Pick<WizardState, "customerId" | "locationId" | "meterId" | "proverId" | "productId">>) => void;
}

export const MAX_PASSES = 20;
export const DEFAULT_PASS_COUNT = 10;

const initialPass = (n: number): WizardPass => ({
  passNumber: n,
  isWetDown: false, // wet-down only meaningful for can provers; defaults off
  excluded: false,
  pulses: "",
  proverTempF: "",
  proverPressurePsig: "",
  meterTempF: "",
  meterPressurePsig: "",
});

const initialState = {
  step: 0,
  techName: "",
  techCompany: "Quorum Calibration",
  techEmail: "",
  techPhone: "",
  witnessName: "",
  witnessCompany: "",
  witnessEmail: "",
  witnessPhone: "",
  customerId: null,
  locationId: null,
  meterId: null,
  proverId: null,
  productId: null,
  acceptanceProfileId: null,
  densityApi: "" as number | "",
  densityTempF: 60 as number | "",
  densityPressurePsig: 0 as number | "",
  hydrometerCorrection: true,
  evpPsig: 0 as number | "",
  passes: Array.from({ length: DEFAULT_PASS_COUNT }, (_, i) => initialPass(i + 1)),
};

export const useWizardStore = create<WizardState>((set, get) => ({
  ...initialState,
  setStep: (n) => set({ step: n }),
  next: () => set((s) => ({ step: Math.min(s.step + 1, 4) })),
  prev: () => set((s) => ({ step: Math.max(s.step - 1, 0) })),

  setContact: (role, field, value) => {
    const key = (role === "tech" ? "tech" : "witness") +
      field.charAt(0).toUpperCase() + field.slice(1);
    set({ [key]: value } as Partial<WizardState>);
  },

  setCustomer: (id) =>
    set({ customerId: id, locationId: null, meterId: null }),
  setLocation: (id) => set({ locationId: id, meterId: null }),
  setMeter: (id) => set({ meterId: id }),
  setProver: (id) => set({ proverId: id }),
  setProduct: (id) => {
    set({ productId: id });
  },
  setAcceptanceProfile: (id) => set({ acceptanceProfileId: id }),

  setRunInput: (key, value) => set({ [key]: value } as Partial<WizardState>),
  setHydrometerCorrection: (v) => set({ hydrometerCorrection: v }),

  addPass: () =>
    set((s) => {
      if (s.passes.length >= MAX_PASSES) return {};
      return { passes: [...s.passes, initialPass(s.passes.length + 1)] };
    }),
  setPassCount: (n) =>
    set((s) => {
      const target = Math.max(1, Math.min(MAX_PASSES, n));
      if (target === s.passes.length) return {};
      if (target > s.passes.length) {
        const extra = Array.from(
          { length: target - s.passes.length },
          (_, i) => initialPass(s.passes.length + i + 1),
        );
        return { passes: [...s.passes, ...extra] };
      }
      return { passes: s.passes.slice(0, target) };
    }),
  removePass: (passNumber) =>
    set((s) => ({
      passes: s.passes
        .filter((p) => p.passNumber !== passNumber)
        .map((p, i) => ({ ...p, passNumber: i + 1 })),
    })),
  updatePass: (passNumber, patch) =>
    set((s) => ({
      passes: s.passes.map((p) =>
        p.passNumber === passNumber ? { ...p, ...patch } : p,
      ),
    })),
  // Clear the data fields of a single pass without removing the row.
  // "Discard" in PROVEit terms — the row stays so re-running a slot is easy.
  discardPass: (passNumber) =>
    set((s) => ({
      passes: s.passes.map((p) =>
        p.passNumber === passNumber
          ? {
              ...p,
              pulses: "",
              proverTempF: "",
              proverPressurePsig: "",
              meterTempF: "",
              meterPressurePsig: "",
              excluded: false,
            }
          : p,
      ),
    })),

  reset: () => set(initialState),
  prefill: (patch) => set(patch),
}));
