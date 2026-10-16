import { describe, expect, it } from "vitest";
import { ACCEPT, prefersFlat } from "../src/index.js";

describe("prefersFlat", () => {
  it.each([
    [ACCEPT, true],
    ["text/x-flat", true],
    ["application/json, text/x-flat", true],
    ["text/x-flat;q=0.5, application/json", false],
    ["application/json", false],
    ["*/*", false],
    ["text/x-flat;q=0", false],
    ["", false],
    [undefined, false],
  ])("%s → %s", (accept, expected) => {
    expect(prefersFlat(accept)).toBe(expected);
  });
});
