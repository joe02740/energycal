"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useIsAnythingDirty } from "@/lib/nav/dirty-state";

interface BackButtonProps {
  /** Optional explicit fallback when router has no back-stack entry. */
  fallbackHref?: string;
  className?: string;
}

export function BackButton({ fallbackHref = "/", className }: BackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { dirty, message } = useIsAnythingDirty();

  const onClick = useCallback(() => {
    if (dirty) {
      const ok = window.confirm(message);
      if (!ok) return;
    }
    // history.length includes the current entry; ≤ 1 means no back-stack.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }, [dirty, message, router, fallbackHref]);

  // No back from the home page.
  if (pathname === "/" || pathname === "") return null;

  return (
    <button
      onClick={onClick}
      aria-label="Back"
      title="Back"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "gap-1 font-normal",
        className,
      )}
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Back</span>
    </button>
  );
}
