"use client";

// Installs a browser-level beforeunload listener whenever anything in the
// dirty-state store is dirty. Internal nav (back button, Link clicks) is
// intercepted separately — see <BackButton /> and any future <GuardedLink />.

import { useEffect } from "react";
import { useIsAnythingDirty } from "@/lib/nav/dirty-state";

export function UnsavedChangesGuard() {
  const { dirty } = useIsAnythingDirty();

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom strings here; setting returnValue is
      // still required to trigger the native prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return null;
}
