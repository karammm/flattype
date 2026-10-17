import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decode, encode } from "../src/index.js";

/**
 * The examples in spec/SPEC.md: a `text` block followed by a `json` block decodes to that JSON, and a `text`
 * block that starts with a JSON line, then a blank line, is what the encoder writes for it.
 */
const spec = readFileSync(new URL("../../../spec/SPEC.md", import.meta.url), "utf8");
const blocks = [...spec.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1]!, body: m[2]!.replace(/\n$/, "") }));

const decodes = blocks.flatMap((b, i) => (b.lang === "text" && blocks[i + 1]?.lang === "json" ? [[b.body, blocks[i + 1]!.body]] : []));
const encodes = blocks.flatMap((b) => {
  const m = /^([[{].*)\n\n([\s\S]+)$/.exec(b.lang === "text" ? b.body : "");
  return m ? [[m[1]!, m[2]!]] : [];
});

describe("spec/SPEC.md examples", () => {
  it("has examples", () => {
    expect(decodes.length).toBeGreaterThan(0);
    expect(encodes.length).toBeGreaterThan(1);
  });
  it.each(decodes)("decodes %j", (text, json) => {
    expect(decode(text)).toEqual(JSON.parse(json));
  });
  it.each(encodes)("encodes %s", (json, text) => {
    expect(encode(JSON.parse(json))).toBe(text);
  });
});
