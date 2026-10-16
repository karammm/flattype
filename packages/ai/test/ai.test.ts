import type Anthropic from "@anthropic-ai/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { decode } from "@flattype/core";
import { defineModel } from "@flattype/models";
import { describe, expect, expectTypeOf, it } from "vitest";
import { claudeToolResult, countTokens, fromModelOutput, LEGEND, outputInstructions, toolResult, toPrompt, type TokenCounter } from "../src/index.js";

const orders = {
  total: 2,
  orders: [
    { id: 1, customer: "Alice", amount: 120.5, paid: true },
    { id: 2, customer: "Bob, Jr.", amount: 80, paid: false },
  ],
};
const Order = defineModel({ id: "number", customer: "string", amount: "number", paid: "boolean" });

describe("toPrompt", () => {
  it("wraps Flat Notation in a tag with a one-line legend", () => {
    const text = toPrompt(orders, { name: "orders" });
    expect(text).toBe(
      `<data format="flat-notation" name="orders">\n${LEGEND}\ntotal: 2\norders[2]{id,customer,amount,paid}:\n  1, Alice, 120.5, true\n  2, "Bob, Jr.", 80, false\n</data>`,
    );
  });

  it("keeps the block itself valid Flat Notation (the legend is a comment)", () => {
    const inner = toPrompt(orders, { tag: false });
    expect(decode(inner)).toEqual(orders);
  });

  it("can drop the legend and the tag, and escapes the name", () => {
    expect(toPrompt({ a: 1 }, { legend: false, tag: false })).toBe("a: 1");
    expect(toPrompt({ a: 1 }, { legend: false, name: 'x"<y' })).toContain('name="x&quot;&lt;y"');
  });
});

describe("fromModelOutput", () => {
  const table = 'orders[2]{id,customer,amount,paid}:\n  1, Alice, 120.5, true\n  2, "Bob, Jr.", 80, false';

  it.each([
    ["a <data> block with prose around it", `Here you go:\n<data format="flat-notation">\n${table}\n</data>\nLet me know!`],
    ["a fenced block", "Sure!\n```flat\n" + table + "\n```"],
    ["bare text with a sentence first", `Here are the orders:\n${table}`],
    ["JSON in a json fence", "```json\n" + JSON.stringify({ orders: orders.orders }) + "\n```"],
    ["bare JSON", JSON.stringify({ orders: orders.orders })],
  ])("reads %s", (_label, reply) => {
    expect(fromModelOutput(reply)).toEqual({ orders: orders.orders });
  });

  it("doesn't hang on a tag that only looks like <data> at the very start", () => {
    expect(fromModelOutput("<database></data>")).toEqual({});
    expect(fromModelOutput("<data-x>a: 1</data>")).toEqual({});
  });

  it("drops prose lines in one pass", () => {
    expect(fromModelOutput("Sure.\nname: Alice\nThat's all.\nage: 30")).toEqual({ name: "Alice", age: 30 });
  });

  it("uses the last <data> block when there are several", () => {
    expect(fromModelOutput("<data>a: 1</data> draft\n<data>a: 2</data>")).toEqual({ a: 2 });
  });

  it("recovers from small slips (short tables, missing values)", () => {
    expect(fromModelOutput("t[3]{a,b}:\n  1, 2\n  3")).toEqual({ t: [{ a: 1, b: 2 }, { a: 3, b: null }] });
  });

  it("maps and validates with a model", () => {
    const rows = fromModelOutput(`<data>\n${table.replace("orders[2]", "[2]")}\n</data>`, { model: Order, list: true });
    expectTypeOf(rows).toEqualTypeOf<{ id: number; customer: string; amount: number; paid: boolean }[]>();
    expect(rows[1]).toEqual({ id: 2, customer: "Bob, Jr.", amount: 80, paid: false });
    expect(() => fromModelOutput("[1]{id}:\n  x", { model: Order, list: true })).toThrow(/\[0\]\.id: Expected number/);
  });

  it("round-trips everything toPrompt writes", () => {
    expect(fromModelOutput(toPrompt(orders))).toEqual(orders);
  });
});

describe("outputInstructions", () => {
  it("explains the format and shows the expected shape", () => {
    const text = outputInstructions({ orders: orders.orders.slice(0, 1) });
    expect(text).toContain("inside <data> and </data> tags");
    expect(text).toContain("orders[1]{id,customer,amount,paid}:");
  });
});

describe("countTokens", () => {
  // Stands in for `new Anthropic()`: one token per 4 characters plus 7 tokens of message framing.
  const calls: string[] = [];
  const fake: TokenCounter = {
    messages: {
      countTokens: async ({ model, messages }) => {
        calls.push(model);
        return { input_tokens: 7 + Math.ceil(messages[0]!.content.length / 4) };
      },
    },
  };

  it("compares JSON with Flat Notation and subtracts message overhead", async () => {
    const big = { rows: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `User ${i}`, city: "Paris" })) };
    const report = await countTokens(fake, big);
    expect(report.model).toBe("claude-opus-5-5");
    expect(report.json).toBe(Math.ceil(JSON.stringify(big).length / 4));
    expect(report.flat).toBe(Math.ceil(toPrompt(big).length / 4));
    expect(report.saved).toBeGreaterThan(0.3);
    await countTokens(fake, big, { model: "claude-haiku-5-5", legend: false });
    expect(calls.at(-1)).toBe("claude-haiku-5-5");
  });

  it("accepts the real Anthropic client type", () => {
    expectTypeOf<Anthropic>().toMatchTypeOf<TokenCounter>();
  });
});

describe("tool results", () => {
  it("builds an MCP CallToolResult", () => {
    const r = toolResult(orders, { structured: true });
    expectTypeOf(r).toMatchTypeOf<CallToolResult>();
    const typed: CallToolResult = r;
    expect(typed.content[0]).toEqual({ type: "text", text: toPrompt(orders) });
    expect(r.structuredContent).toEqual(orders);
    expect(toolResult({ error: "nope" }, { isError: true }).isError).toBe(true);
    expect(toolResult([1, 2], { structured: true }).structuredContent).toBeUndefined();
  });

  it("builds a Claude API tool_result block", () => {
    const block = claudeToolResult("toolu_1", orders, { legend: false });
    const typed: Anthropic.ToolResultBlockParam = block;
    expect(typed).toEqual({ type: "tool_result", tool_use_id: "toolu_1", content: toPrompt(orders, { legend: false }) });
    expect(claudeToolResult("toolu_2", { error: "x" }, { isError: true }).is_error).toBe(true);
  });
});
