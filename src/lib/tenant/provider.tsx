"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Tenant } from "./types";
import { QUORUM_TENANT_ID } from "./types";
import { findTenant, SEED_TENANTS } from "./seed";
import { useTenantStore } from "./store";

interface TenantContextValue {
  tenant: Tenant;
  tenants: Tenant[];
  switchTenant: (id: string) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

const QUORUM = SEED_TENANTS.find((t) => t.id === QUORUM_TENANT_ID)!;

export function TenantProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe: render with the default tenant during SSR + first client
  // paint, then swap to the persisted choice on mount. Without this, the
  // accent color flickers when zustand's persist middleware rehydrates.
  const [hydrated, setHydrated] = useState(false);
  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const setTenant = useTenantStore((s) => s.setTenant);

  useEffect(() => setHydrated(true), []);

  const tenant = useMemo(() => {
    if (!hydrated) return QUORUM;
    return findTenant(currentTenantId) ?? QUORUM;
  }, [hydrated, currentTenantId]);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant,
      tenants: SEED_TENANTS,
      switchTenant: setTenant,
    }),
    [tenant, setTenant],
  );

  const accent = tenant.branding.accentColor;

  return (
    <TenantContext.Provider value={value}>
      {/* Apply tenant accent as CSS variable override. Wrapping in a div
          ensures both light and dark modes pick it up via shadcn tokens. */}
      <div
        style={accent ? ({ ["--primary" as string]: accent } as React.CSSProperties) : undefined}
        className="contents"
      >
        {children}
      </div>
    </TenantContext.Provider>
  );
}

export function useCurrentTenant(): Tenant {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useCurrentTenant must be used within <TenantProvider>");
  }
  return ctx.tenant;
}

export function useTenantSwitcher(): {
  current: Tenant;
  tenants: Tenant[];
  switchTenant: (id: string) => void;
} {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenantSwitcher must be used within <TenantProvider>");
  }
  return { current: ctx.tenant, tenants: ctx.tenants, switchTenant: ctx.switchTenant };
}
