"use client";

// Global "this page has unsaved changes" tracker. Pages opt in by calling
// useDirtyState(isDirty, message?). The BackButton and a beforeunload listener
// both read this to decide whether to prompt.
//
// Multiple sources of dirty state can exist on one page (e.g., a wizard step
// with its own form + a child component with another); they're tracked by key
// and combined to a single "is anything dirty?" boolean.

import { useEffect } from "react";
import { create } from "zustand";

interface DirtyEntry {
  isDirty: boolean;
  message?: string;
}

interface DirtyStore {
  entries: Record<string, DirtyEntry>;
  setEntry: (key: string, entry: DirtyEntry) => void;
  clearEntry: (key: string) => void;
}

export const useDirtyStore = create<DirtyStore>((set) => ({
  entries: {},
  setEntry: (key, entry) =>
    set((s) => ({ entries: { ...s.entries, [key]: entry } })),
  clearEntry: (key) =>
    set((s) => {
      if (!(key in s.entries)) return s;
      const { [key]: _gone, ...rest } = s.entries;
      void _gone;
      return { entries: rest };
    }),
}));

export function useIsAnythingDirty(): { dirty: boolean; message: string } {
  const entries = useDirtyStore((s) => s.entries);
  const dirtyEntries = Object.values(entries).filter((e) => e.isDirty);
  const message =
    dirtyEntries.find((e) => e.message)?.message ??
    "You have unsaved changes. Leave anyway?";
  return { dirty: dirtyEntries.length > 0, message };
}

/**
 * Page-level dirty-state opt-in. Pass `key` as a stable identifier per page
 * (e.g. component name). Pass `isDirty` as the computed dirty boolean.
 * Optionally pass a page-specific message shown in the confirm prompt.
 */
export function useDirtyState(
  key: string,
  isDirty: boolean,
  message?: string,
) {
  const setEntry = useDirtyStore((s) => s.setEntry);
  const clearEntry = useDirtyStore((s) => s.clearEntry);

  useEffect(() => {
    setEntry(key, { isDirty, message });
    return () => clearEntry(key);
  }, [key, isDirty, message, setEntry, clearEntry]);
}

/** Imperatively reset a page's dirty state (e.g. after a successful submit). */
export function useClearDirty(key: string) {
  const clearEntry = useDirtyStore((s) => s.clearEntry);
  return () => clearEntry(key);
}
