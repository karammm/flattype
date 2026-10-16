import fc from "fast-check";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromModelOutput, outputInstructions, toPrompt } from "../src/index.js";

/**
 * conformance/llm.json: what toPrompt writes and fromModelOutput reads, for the Python package to match.
 * Regenerate with `UPDATE_CONFORMANCE=1 pnpm --filter @flattype/ai test`.
 */
const FILE = new URL("../../../conformance/llm.json", import.meta.url);
const SEED = 20261016;

const piece = fc.constantFrom(
  "<data>", "</data>", '<data format="flat-notation">', "<database>", "<DATA>", "<data-x>", "```", "```json\n", "```flat\n", "\n",
  "a: 1", "b.c: x", "t[2]{x,y}:\n  1, 2\n  3, 4", '{"a": 1}', "[1, 2]", "Here you go:", "Sure!", " ", ": ", "#", '"',
);
const reply = fc.array(piece, { maxLength: 12 }).map((p) => p.join(""));

function build(): unknown {
  const values = [{ name: "John", age: 30 }, { orders: [{ id: 1, customer: "Alice", amount: 120.5 }, { id: 2, customer: "Bob, Jr.", amount: 80 }] }, [1, "x"], 42];
  const prompts = values.flatMap((value) =>
    [{}, { name: 'or"ders&<' }, { legend: false }, { tag: false }, { delimiter: "|" }].map((options) => ({ value, options, text: toPrompt(value, options as never) })),
  );
  const instructions = [{ text: outputInstructions() }, { example: values[1], text: outputInstructions(values[1]) }];
  const replies = [
    "<database></data>",
    "Sure.\nname: Alice\nThat's all.\nage: 30",
    "<data>a: 1</data> draft\n<data>a: 2</data>",
    "```json\n{\"a\": [1, 2]}\n```",
    "Here:\n```\nx: 1\n```\nand ```y```",
    ...fc.sample(reply, { seed: SEED, numRuns: 400 }),
  ].map((text) => ({ text, value: fromModelOutput(text) }));
  return { prompts, instructions, replies };
}

describe("LLM conformance cases", () => {
  it("conformance/llm.json is up to date", () => {
    const next = JSON.stringify(build(), null, 1) + "\n";
    if (process.env.UPDATE_CONFORMANCE) writeFileSync(FILE, next);
    expect(readFileSync(FILE, "utf8") === next, "conformance/llm.json is stale: run UPDATE_CONFORMANCE=1 pnpm --filter @flattype/ai test").toBe(true);
  });
});
