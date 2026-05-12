// REFERENCE.md §9 — HMAC-SHA-256 over canonical JSON.
// Server-only entry: the HMAC key never leaves the backend.

import { createHmac } from "node:crypto";
import { canonicalize } from "./canonicalJson";

export function hmacOfPayload(params: {
  key: string | Buffer;
  payload: unknown;
}): string {
  const canonical = canonicalize(params.payload);
  return createHmac("sha256", params.key).update(canonical, "utf8").digest("hex");
}

export function shortHash(hash: string, n: number = 12): string {
  return hash.slice(-n);
}
