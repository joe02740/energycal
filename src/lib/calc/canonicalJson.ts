// REFERENCE.md §9 — RFC 8785 (JSON Canonicalization Scheme), narrow subset
// sufficient for our submission payloads:
//   - object keys sorted lexicographically (UTF-16 code unit order)
//   - no whitespace
//   - numbers via ECMAScript Number.prototype.toString() (RFC 8785 §3.2.2.3)
//   - strings JSON-escaped per RFC 8259
//   - rejects non-finite numbers (Infinity, NaN)
//   - rejects undefined / functions / symbols

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return serializeNumber(value);
  if (typeof value === "string") return serializeString(value);
  if (Array.isArray(value)) {
    return "[" + value.map(serialize).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort((a, b) => {
      // RFC 8785 §3.2.3 — sort by UTF-16 code units (default JS string compare)
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const parts = keys.map(
      (k) => serializeString(k) + ":" + serialize(obj[k]),
    );
    return "{" + parts.join(",") + "}";
  }
  throw new Error(
    `canonicalize: unsupported value of type ${typeof value}`,
  );
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error("canonicalize: non-finite numbers are not allowed");
  }
  // RFC 8785 §3.2.2.3 — use ECMAScript Number.prototype.toString.
  // This handles integers as "1" not "1.0", and uses "1e+21" / "1e-7" boundaries
  // identically to Node and browsers, which is exactly the canonical form.
  return n === 0 ? "0" : n.toString();
}

function serializeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 0x22) out += "\\\""; // "
    else if (ch === 0x5c) out += "\\\\"; // \
    else if (ch === 0x08) out += "\\b";
    else if (ch === 0x09) out += "\\t";
    else if (ch === 0x0a) out += "\\n";
    else if (ch === 0x0c) out += "\\f";
    else if (ch === 0x0d) out += "\\r";
    else if (ch < 0x20) out += "\\u" + ch.toString(16).padStart(4, "0");
    else out += s[i];
  }
  out += '"';
  return out;
}

export type { Json };
