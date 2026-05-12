// REFERENCE.md §9

import { describe, expect, it } from "vitest";
import { hmacOfPayload, shortHash } from "./hash";

describe("HMAC-SHA-256 over canonical JSON", () => {
  const key = "test-server-key-do-not-use-in-prod";

  it("identical payloads → identical hashes", () => {
    const a = hmacOfPayload({ key, payload: { b: 1, a: 2 } });
    const b = hmacOfPayload({ key, payload: { a: 2, b: 1 } });
    expect(a).toBe(b);
  });

  it("different payloads → different hashes", () => {
    const a = hmacOfPayload({ key, payload: { mf: 1.0428 } });
    const b = hmacOfPayload({ key, payload: { mf: 1.0429 } });
    expect(a).not.toBe(b);
  });

  it("different keys → different hashes (key actually mixes in)", () => {
    const a = hmacOfPayload({ key: "k1", payload: { x: 1 } });
    const b = hmacOfPayload({ key: "k2", payload: { x: 1 } });
    expect(a).not.toBe(b);
  });

  it("hash is 64 hex chars (SHA-256)", () => {
    const h = hmacOfPayload({ key, payload: { x: 1 } });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("shortHash returns last N chars", () => {
    const h = hmacOfPayload({ key, payload: { x: 1 } });
    expect(shortHash(h, 12)).toHaveLength(12);
    expect(h.endsWith(shortHash(h, 12))).toBe(true);
  });
});
