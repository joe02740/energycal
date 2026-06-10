"use client";

// The active user profile — "who is proving today". Stored per machine
// (localStorage), pointing at a Contact in the roster. Auto-fills
// "Performed by" on new provings and stamps saved records.

import { useEffect, useState } from "react";

const KEY = "energycal-active-user-v1";
const EVENT = "energycal:user-changed";

export interface ActiveUser {
  contactId: string;
  name: string;
}

export function getActiveUser(): ActiveUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as ActiveUser;
    return u && typeof u.name === "string" && u.name.trim() !== "" ? u : null;
  } catch {
    return null;
  }
}

export function setActiveUser(u: ActiveUser | null) {
  try {
    if (u) localStorage.setItem(KEY, JSON.stringify(u));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Reactive hook — updates everywhere when the profile changes. */
export function useActiveUser(): ActiveUser | null {
  const [user, setUser] = useState<ActiveUser | null>(null);
  useEffect(() => {
    setUser(getActiveUser());
    const h = () => setUser(getActiveUser());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return user;
}
