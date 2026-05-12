"use client";

import { useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantSwitcher } from "@/lib/tenant/provider";
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function TenantSwitcher() {
  const { current, tenants, switchTenant } = useTenantSwitcher();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-2 font-normal",
        )}
        aria-label="Switch tenant"
      >
        <Building2 className="h-3.5 w-3.5 opacity-70" />
        <span className="max-w-[180px] truncate">
          {current.branding.displayName ?? current.name}
        </span>
        <ChevronsUpDown className="h-3 w-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="end">
        <div className="px-2 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          Tenant
        </div>
        {tenants.map((t) => {
          const active = t.id === current.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                switchTenant(t.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                active && "bg-muted font-medium",
                !active && "hover:bg-muted/50",
              )}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full border"
                style={{ background: t.branding.accentColor ?? "transparent" }}
                aria-hidden
              />
              <span className="flex-1 truncate">
                {t.branding.displayName ?? t.name}
              </span>
              {active && <Check className="h-3.5 w-3.5 opacity-70" />}
            </button>
          );
        })}
        <div className="mt-1 border-t pt-1 px-2 py-1.5 text-[10px] text-muted-foreground/80">
          v0 dev: in-memory tenants. Subdomain routing comes later.
        </div>
      </PopoverContent>
    </Popover>
  );
}
