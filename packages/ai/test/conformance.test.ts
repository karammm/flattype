import fc from "fast-check";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromModelOutput, ModelOutputError, outputInstructions, toPrompt } from "../src/index.js";
import type { FlatWarning } from "@flattype/core";

/**
 * conformance/llm.json: what toPrompt writes and fromModelOutput reads, for the Python package to match.
 * Regenerate with `UPDATE_CONFORMANCE=1 pnpm --filter @flattype/ai test`.
 */
const FILE = new URL("../../../conformance/llm.json", import.meta.url);
const SEED = 20261016;

const piece = fc.constantFrom(
  "<data>", "</data>", '<data format="flat-notation">', "<database>", "<DATA>", "<data-x>", "```", "```json\n", "```flat\n", "\n",
  "a: 1", "b.c: x", "t[2]{x,y}:\n  1, 2\n  3, 4", "e[+].x: 1", ".y: 2", "u[2]{id,p?}:\n  1, 2\n  3,", '{"a": 1}', "[1, 2]", "Here you go:", "Sure!", " ", ": ", "#", '"',
);
const reply = fc.array(piece, { maxLength: 12 }).map((p) => p.join(""));

function build(): unknown {
  const values = [
    { name: "John", age: 30 },
    { orders: [{ id: 1, customer: "Alice", amount: 120.5 }, { id: 2, customer: "Bob, Jr.", amount: 80 }] },
    [1, "x"],
    42,
    { users: [{ id: 1, phone: "555" }, { id: 2 }], events: [{ type: "push", commits: [{ sha: "a1" }] }, { type: "star", user: "u" }] },
  ];
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
    '[{"name": "Noa","language" "Galician"}]',
    "```json\n{\"a\": 1,}\n```",
    "people[2]{name,id}\n  Ann, 1\n  Bo",
    "<data>\nevents[+].type: push\n.repo: r\nevents[+].type: star\n</data>",
    "Here you go:\nusers[2]{id,phone?}:\n  1, 555\n  2,\nThat's all.",
  ].map((text) => {
    const warnings: FlatWarning[] = [];
    try {
      return { text, value: fromModelOutput(text, { onWarning: (w) => warnings.push(w) }), warnings };
    } catch (e) {
      if (!(e instanceof ModelOutputError)) throw e;
      // Engines word JSON errors differently: other implementations must fail too, but not with this message.
      return { text, error: "ModelOutputError" };
    }
  });
  return { prompts, instructions, replies };
}

describe("LLM conformance cases", () => {
  it("conformance/llm.json is up to date", () => {
    const next = JSON.stringify(build(), null, 1) + "\n";
    if (process.env.UPDATE_CONFORMANCE) writeFileSync(FILE, next);
    expect(readFileSync(FILE, "utf8") === next, "conformance/llm.json is stale: run UPDATE_CONFORMANCE=1 pnpm --filter @flattype/ai test").toBe(true);
  });
});
