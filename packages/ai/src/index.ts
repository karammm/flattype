import { decode, encode, type EncodeOptions, type FlatWarning, type JsonValue } from "@flattype/core";

/** Anything with `parse` / `parseList`, such as a model from `@flattype/models`. */
export interface Parser<T> {
  parse(input: unknown): T;
  parseList(input: unknown): T[];
}

/**
 * One line that teaches a model the format. It is a `#` comment, so a prompt block that includes it is
 * still valid Flat Notation.
 */
export const LEGEND =
  "# Flat Notation: one `path: value` per line. `a.b` is a nested key, `a[0]` an array index, `a[]: x, y` a list. " +
  "`t[N]{f,g}:` is a table: N rows follow, one per line, values in field order. Quoted values are JSON strings.";

export interface PromptOptions extends EncodeOptions {
  /** Adds `name="…"` to the tag, so a prompt can refer to several data blocks. */
  name?: string;
  /** Include the one-line format legend. Default `true`; turn it off once a system prompt explains the format. */
  legend?: boolean;
  /** Wrap in `<data format="flat-notation">…</data>`. Default `true`. */
  tag?: boolean;
}

const attr = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Formats data for an LLM prompt: Flat Notation inside a `<data>` tag, with a one-line legend.
 *
 * ```ts
 * const content = `${toPrompt(orders, { name: "orders" })}\n\nWhich customer spent the most?`;
 * ```
 */
export function toPrompt(value: unknown, options: PromptOptions = {}): string {
  const { name, legend = true, tag = true, ...encodeOptions } = options;
  const body = (legend ? LEGEND + "\n" : "") + encode(value, encodeOptions);
  if (!tag) return body;
  return `<data format="flat-notation"${name ? ` name="${attr(name)}"` : ""}>\n${body}\n</data>`;
}

/**
 * Instructions that ask a model to answer in Flat Notation, with an example built from `example` so the
 * model sees the exact shape (keys, tables) you expect. Pair with `fromModelOutput`.
 */
export function outputInstructions(example?: unknown): string {
  const lines = [
    "Reply with the data only, in Flat Notation, inside <data> and </data> tags.",
    LEGEND.slice(2),
    "Write a list of objects with the same keys as a table. Quote a string value if it contains a comma or could be read as a number, true, false or null.",
  ];
  if (example !== undefined) lines.push("Example of the expected shape:", toPrompt(example, { legend: false }));
  return lines.join("\n");
}

/**
 * Finds the data in a model reply: the last `<data>…</data>` block, else the last fenced block, else the
 * whole text. Plain `indexOf` scans, so it stays linear even on hostile input (many openers, no closer).
 */
function extract(text: string): { body: string; json: boolean } {
  const lower = text.toLowerCase();
  const close = lower.lastIndexOf("</data>");
  if (close >= 0) {
    let open = lower.lastIndexOf("<data", close);
    // `<data` must be the tag itself, not e.g. `<database>`.
    // (At index 0, lastIndexOf(…, -1) would find the same match again: stop instead of looping forever.)
    while (open >= 0 && /[\w-]/.test(lower[open + 5] ?? "")) open = open > 0 ? lower.lastIndexOf("<data", open - 1) : -1;
    const gt = open >= 0 ? text.indexOf(">", open) : -1;
    if (gt >= 0 && gt < close) return { body: text.slice(gt + 1, close), json: false };
  }
  const fences: number[] = [];
  for (let i = text.indexOf("```"); i >= 0; i = text.indexOf("```", i + 3)) fences.push(i);
  if (fences.length >= 2) {
    // Fences pair up in order; use the last complete pair.
    const last = fences.length % 2 === 0 ? fences.length - 2 : fences.length - 3;
    const start = fences[last]!;
    const end = fences[last + 1]!;
    const nl = text.indexOf("\n", start);
    if (nl >= 0 && nl < end) {
      const lang = text.slice(start + 3, nl).trim();
      return { body: text.slice(nl + 1, end), json: /^json/i.test(lang) };
    }
  }
  return { body: text, json: false };
}

/**
 * Thrown by `fromModelOutput` when the reply holds JSON that can't be parsed. It says where the JSON breaks
 * (when the JavaScript engine reports a position) and shows the text around it.
 */
export class ModelOutputError extends SyntaxError {
  constructor(
    message: string,
    /** 1-based position of the problem inside the JSON, when known. */
    readonly line?: number,
    readonly column?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ModelOutputError";
  }
}

/** Where `JSON.parse` failed, from its message (V8: "position N", Firefox: "line L column C"). */
function brokenJson(json: string, error: Error): ModelOutputError {
  let pos = Number(/position (\d+)/.exec(error.message)?.[1] ?? NaN);
  const lc = /line (\d+) column (\d+)/.exec(error.message);
  if (Number.isNaN(pos) && lc) {
    const lines = json.split("\n").slice(0, Number(lc[1]) - 1);
    pos = lines.reduce((n, l) => n + l.length + 1, 0) + Number(lc[2]) - 1;
  }
  if (Number.isNaN(pos)) return new ModelOutputError(`The data is JSON, but it is broken: ${error.message}`, undefined, undefined, { cause: error });
  const before = json.slice(0, pos);
  const line = before.split("\n").length;
  const column = pos - before.lastIndexOf("\n");
  const near = (json.slice(Math.max(0, pos - 30), pos) + " ⟶ " + json.slice(pos, pos + 30)).replace(/\s+/g, " ").trim();
  return new ModelOutputError(`The data is JSON, but it is broken at line ${line}, column ${column}: ${near}`, line, column, { cause: error });
}

/** Text that is JSON rather than Flat Notation. A Flat Notation root table or list also starts with `[`. */
const looksLikeJson = (s: string): boolean => s[0] === "{" || (s[0] === "[" && !/^\[\d*[|\t]?\][{:]/.test(s));

/**
 * Reads data out of an LLM reply, tolerating what models actually send back: `<data>` tags or code fences
 * around it, a sentence before or after, small format slips, or plain JSON instead. With a model, the
 * result is mapped and validated (throws `ModelError` with every problem).
 *
 * Every slip that was repaired is passed to `onWarning` with its line and column, so you can show where the
 * data may be wrong. JSON that can't be parsed throws `ModelOutputError`, saying where it breaks.
 *
 * ```ts
 * const rows = fromModelOutput(reply, { model: Row, list: true, onWarning: (w) => console.warn(w.message) });
 * ```
 */
export function fromModelOutput(text: string, options?: { onWarning?: (warning: FlatWarning) => void }): JsonValue;
export function fromModelOutput<T>(text: string, options: { model: Parser<T>; list?: false; onWarning?: (warning: FlatWarning) => void }): T;
export function fromModelOutput<T>(text: string, options: { model: Parser<T>; list: true; onWarning?: (warning: FlatWarning) => void }): T[];
export function fromModelOutput(
  text: string,
  options: { model?: Parser<unknown>; list?: boolean; onWarning?: (warning: FlatWarning) => void } = {},
): unknown {
  const { body, json } = extract(text);
  const trimmed = body.trim();
  let value: unknown;
  if (json || looksLikeJson(trimmed)) {
    try {
      value = JSON.parse(trimmed);
    } catch (e) {
      // Reading broken JSON as Flat Notation would only lose the data quietly.
      throw brokenJson(trimmed, e as Error);
    }
  } else {
    // Lenient, and lines that aren't Flat Notation (prose like "Here are the results:") are dropped, in one pass.
    value = decode(body, { strict: false, skipInvalidLines: true, onWarning: options.onWarning });
  }
  const { model, list } = options;
  if (!model) return value;
  return list ? model.parseList(value) : model.parse(value);
}

/** The part of an Anthropic client this needs, e.g. `new Anthropic()` from `@anthropic-ai/sdk`. */
export interface TokenCounter {
  messages: {
    countTokens(params: { model: string; messages: Array<{ role: "user"; content: string }> }): PromiseLike<{ input_tokens: number }>;
  };
}

export interface TokenReport {
  model: string;
  /** Tokens for minified `JSON.stringify(value)`. */
  json: number;
  /** Tokens for `toPrompt(value, options)` (tag and legend included unless turned off). */
  flat: number;
  /** Fraction saved, e.g. `0.4` for 40% fewer tokens. Negative if Flat Notation costs more. */
  saved: number;
}

/**
 * Counts real Claude tokens for the same data as JSON and as Flat Notation, with the Messages API's
 * `count_tokens` endpoint (free to call, but needs API credentials). The fixed per-message overhead is
 * subtracted, so the numbers are the data's own tokens.
 *
 * ```ts
 * import Anthropic from "@anthropic-ai/sdk";
 * const report = await countTokens(new Anthropic(), await res.json());
 * ```
 */
export async function countTokens(
  client: TokenCounter,
  value: unknown,
  options: PromptOptions & { model?: string } = {},
): Promise<TokenReport> {
  const { model = "claude-opus-5-5", ...prompt } = options;
  const count = async (content: string): Promise<number> =>
    (await client.messages.countTokens({ model, messages: [{ role: "user", content }] })).input_tokens;
  const [overhead, json, flat] = await Promise.all([count("."), count(JSON.stringify(value)), count(toPrompt(value, prompt))]);
  // "." itself is one token; what's left is the message framing both counts share.
  const base = Math.max(0, overhead - 1);
  const j = json - base;
  const f = flat - base;
  return { model, json: j, flat: f, saved: j === 0 ? 0 : 1 - f / j };
}

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Returns data from an MCP tool as Flat Notation text, which is what the model reads, so large results
 * cost fewer tokens. Compatible with `CallToolResult` from `@modelcontextprotocol/sdk`.
 * `structured: true` also attaches the object as `structuredContent` for clients that use it.
 *
 * ```ts
 * server.registerTool("list_orders", { description: "…" }, async () => toolResult(await db.orders()));
 * ```
 */
export function toolResult(value: unknown, options: PromptOptions & { isError?: boolean; structured?: boolean } = {}): McpToolResult {
  const { isError, structured, ...prompt } = options;
  const result: McpToolResult = { content: [{ type: "text", text: toPrompt(value, prompt) }] };
  if (structured && typeof value === "object" && value !== null && !Array.isArray(value)) {
    result.structuredContent = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }
  if (isError) result.isError = true;
  return result;
}

export interface ClaudeToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * A Claude API `tool_result` block (assignable to `Anthropic.ToolResultBlockParam`) whose content is the
 * data as Flat Notation. Return it in the next user message after a `tool_use` block.
 */
export function claudeToolResult(toolUseId: string, value: unknown, options: PromptOptions & { isError?: boolean } = {}): ClaudeToolResult {
  const { isError, ...prompt } = options;
  const block: ClaudeToolResult = { type: "tool_result", tool_use_id: toolUseId, content: toPrompt(value, prompt) };
  if (isError) block.is_error = true;
  return block;
}
