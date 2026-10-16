import { describe, expect, it } from "vitest";
import { fromModelOutput } from "../src/index.js";

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

const attempt = (f: () => unknown): void => {
  try {
    f();
  } catch {
    // only timing matters here
  }
};

describe("reading model output is linear", () => {
  it("many <data openers without a closer", () => expectLinear("tags", (n) => attempt(() => fromModelOutput("<data>".repeat(n)))));
  it("many openers before one closer", () => expectLinear("tags+close", (n) => attempt(() => fromModelOutput("<data ".repeat(n) + "a: 1</data>"))));
  it("many fences", () => expectLinear("fences", (n) => attempt(() => fromModelOutput("```".repeat(n)))));
});
