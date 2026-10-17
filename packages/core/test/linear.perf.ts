import { describe, expect, it } from "vitest";
import { createDecoder, decode, encode } from "../src/index.js";

/**
 * Linear-time checks on hostile inputs: the time for 8n must stay well under 64x the time for n
 * (what a quadratic algorithm would take). Run alone (`pnpm test:perf`) so nothing competes for the CPU.
 */
export function expectLinear(name: string, run: (n: number) => void, n = 20_000): void {
  const time = (size: number): number => {
    run(size); // warm up
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      run(size);
      best = Math.min(best, performance.now() - t);
    }
    return Math.max(best, 0.05);
  };
  const ratio = time(n * 8) / time(n);
  expect(ratio, `${name}: 8x input took ${ratio.toFixed(1)}x as long`).toBeLessThan(30);
}

describe("decoding is linear", () => {
  it("long digit runs", () => expectLinear("digits", (n) => decode(`a: ${"1".repeat(n)}x`)));
  it("long integers with { bigint: true }", () => expectLinear("bigint digits", (n) => decode(`a: ${"9".repeat(n * 10)}`, { bigint: true })));
  it("many 4,300-digit integers with { bigint: true }", () =>
    expectLinear("bigints", (n) => decode(`a[]: ${Array(n).fill("9".repeat(4300)).join(", ")}`, { bigint: true }), 20));
  it("long quoted strings with escapes", () => expectLinear("string", (n) => decode(`a: "${'\\"'.repeat(n)}"`)));
  it("many cells on one line", () => expectLinear("cells", (n) => decode(`a[]: ${"1, ".repeat(n)}1`)));
  it("many unclosed quotes in lenient mode", () => expectLinear("quotes", (n) => decode(`a[]: ${'", '.repeat(n)}`, { strict: false })));
  it("deep paths", () => expectLinear("path", (n) => decode(`${"a.".repeat(n)}b: 1`), 5_000));
  it("many lines", () => expectLinear("lines", (n) => decode("x: 1\n".repeat(n).replace(/x/g, () => "k" + Math.random().toString(36).slice(2)))));
  it("a long table", () => expectLinear("table", (n) => decode(encode({ t: Array.from({ length: n }, (_, i) => ({ id: i, s: "v" })) })), 5_000));
  it("one long line streamed in tiny chunks", () =>
    expectLinear("chunks", (n) => {
      const d = createDecoder();
      d.write("a: ");
      for (let i = 0; i < n; i++) d.write("x");
      d.end();
    }));
});

const deep = (n: number): unknown => {
  let v: unknown = 1;
  for (let i = 0; i < n; i++) v = { a: v };
  return v;
};

describe("encoding is linear", () => {
  it("deeply nested objects", () => expectLinear("deep encode", (n) => encode(deep(n)), 250));
  it("deeply nested objects with refs", () => expectLinear("deep refs", (n) => encode(deep(n), { refs: true }), 250));
  it("many shared objects", () =>
    expectLinear("shared", (n) => {
      const s = { id: 1 };
      encode({ list: Array.from({ length: n }, () => s) }, { refs: true });
    }));
});

describe("references and revivers are linear", () => {
  it("many references", () => expectLinear("refs", (n) => decode(`a.x: 1\n${Array.from({ length: n }, (_, i) => `b[${i}] = a`).join("\n")}`, { refs: true })));
  it("a reviver on a deep document", () => expectLinear("revive", (n) => decode(`${"a.".repeat(n)}b: 1`, { reviver: (_k, v) => v }), 5_000));
});

describe("the type helpers are linear", async () => {
  const { parseJson, reviveDates, stringifyJson } = await import("../src/types.js");
  it("reviveDates on long lookalike strings", () => expectLinear("dates", (n) => reviveDates("", `2026-01-01T09:00:00.${"1".repeat(n)}`)));
  it("stringifyJson with many BigInts", () => expectLinear("stringify", (n) => stringifyJson(Array.from({ length: n }, (_, i) => BigInt(i))), 5_000));
  it("parseJson with many big integers", () => expectLinear("parse", (n) => parseJson(`[${Array(n).fill("18446744073709551617").join(",")}]`), 5_000));
});
