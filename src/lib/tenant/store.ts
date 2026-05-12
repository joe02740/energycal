"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { QUORUM_TENANT_ID } from "./types";

interface TenantStore {
  currentTenantId: string;
  setTenant: (id: string) => void;
}

export const useTenantStore = create<TenantStore>()(
  persist(
    (set) => ({
      currentTenantId: QUORUM_TENANT_ID,
      setTenant: (id) => set({ currentTenantId: id }),
    }),
    { name: "energy-cal:tenant" },
  ),
);
