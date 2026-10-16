import { describe, expect, it } from "vitest";
import { defineModel } from "../src/index.js";

function expectLinear(name: string, run: (n: number) => void, n = 20_000): void {
  const time = (size: number): number => {
    run(size);
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

describe("coercion is linear", () => {
  const M = defineModel({ n: "number" });
  it("rejects long almost-numbers quickly", () => expectLinear("numeric", (n) => void M.safeParse({ n: "1".repeat(n) + "x" })));
});
