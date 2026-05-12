// REFERENCE.md §9

import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonicalJson";

describe("canonical JSON (RFC 8785 subset)", () => {
  it("sorts object keys lexicographically", () => {
    expect(canonicalize({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
  });

  it("no whitespace", () => {
    const out = canonicalize({ a: [1, 2, { b: "x" }] });
    expect(out).toBe('{"a":[1,2,{"b":"x"}]}');
  });

  it("integers don't carry .0", () => {
    expect(canonicalize({ x: 1 })).toBe('{"x":1}');
    expect(canonicalize({ x: 1.0 })).toBe('{"x":1}');
  });

  it("escapes control chars + quote + backslash", () => {
    expect(canonicalize({ s: 'a"b\\c\nd' })).toBe('{"s":"a\\"b\\\\c\\nd"}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize({ x: Infinity })).toThrow();
    expect(() => canonicalize({ x: NaN })).toThrow();
  });

  it("rejects undefined", () => {
    expect(() => canonicalize({ x: undefined })).toThrow();
  });

  it("nested objects sort independently", () => {
    expect(canonicalize({ z: { b: 1, a: 2 }, a: 1 })).toBe(
      '{"a":1,"z":{"a":2,"b":1}}',
    );
  });

  it("equivalent payloads produce identical strings (key-order independence)", () => {
    const a = canonicalize({ b: 1, a: 2, c: { z: 9, m: 8 } });
    const b = canonicalize({ a: 2, c: { m: 8, z: 9 }, b: 1 });
    expect(a).toBe(b);
  });
});
