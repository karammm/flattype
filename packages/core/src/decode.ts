import type { Decoder, DecoderOptions, DecodeOptions, Delimiter, FlatWarning, JsonValue } from "@flattype/shared";
import { APPEND, assign, isKeyStart, parsePath, Ref, resolveAppends, resolveRefs, type Segment, type Slot, type Terminal } from "./path.js";
import { revive } from "./revive.js";
import { FlatDecodeError, formatKey, parseScalar, scanString, type Warn } from "./syntax.js";

/**
 * Decodes Flat Notation back into the JSON value it came from. An empty document is `{}`.
 * With a `reviver`, the result is whatever the reviver returns for the root (cast it to your type).
 */
export function decode(text: string, options: DecodeOptions = {}): JsonValue {
  const decoder = createDecoder(options);
  decoder.write(text);
  return decoder.end();
}

type Table = Extract<Terminal, { kind: "table" }>;

/**
 * The item a `[+]` line opened, which `.path` lines continue: `path` (ending with the appended index) from where
 * that line started. Its place is found once and kept, so a `.path` line costs only its own length.
 */
interface Item {
  from: Slot | undefined;
  path: Segment[];
  prev: Item | undefined;
  slot?: Slot;
}

/**
 * Incremental decoder: `write` chunks as they arrive (any split, even mid-line), then `end()`.
 * `onRow` is called for every table row as soon as its line is complete. With `keepRows: false`,
 * rows are only passed to `onRow` and their tables stay empty, so memory stays flat for huge lists.
 */
export function createDecoder(options: DecoderOptions = {}): Decoder {
  const strict = options.strict !== false;
  const keep = options.keepRows !== false;
  const onRow = options.onRow;
  const refs = options.refs === true;
  const big = options.bigint === true;
  // Lenient only: a line that can't be read is dropped, as if it weren't there.
  const skip = !strict && options.skipInvalidLines === true;
  const holder: { root?: unknown } = {};
  // Lenient repairs, reported to onWarning. When skipping lines, a line's warnings wait until it has been
  // read, so a line that is dropped reports only that.
  const onWarning = strict ? undefined : options.onWarning;
  let held: FlatWarning[] | undefined;
  const emit = (w: FlatWarning): void => {
    if (held) held.push(w);
    else onWarning!(w);
  };
  const warn: Warn | undefined = onWarning && ((reason, line, column, repair) => emit({ message: `${reason}: ${repair}`, line, column }));
  /** Strict: an error. Lenient: a warning, and the caller repairs it. */
  const problem: Warn = (reason, line, column, repair) => {
    if (strict) throw new FlatDecodeError(reason, line, column);
    warn?.(reason, line, column, repair);
  };
  // Reference lines, resolved once the whole document has been read (a cycle points at a parent).
  const pending: Ref[] = [];
  let lineNo = 0;
  let rest = "";
  // The item that `.path` lines continue.
  let anchor: Item | undefined;
  // The table whose rows are being read.
  let table:
    | { at: number; from: Slot | undefined; segments: Segment[]; t: Table; path: string; rows: unknown[]; read: number; opens: boolean }
    | undefined;

  /** `assign` into the result. When skipping lines, checked first, so a line that fails changes nothing. */
  const put = (from: Slot | undefined, segments: Segment[], value: unknown, at: number): void => {
    if (skip) assign(holder, segments, value, strict, at, true, undefined, from);
    assign(holder, segments, value, strict, at, false, warn, from);
  };

  /** Where `item` is: found from where its line started, once. Undefined if it isn't there. */
  const place = (item: Item): Slot | undefined => {
    if (item.slot) return item.slot;
    let cur: unknown = item.from ? (item.from.parent as Record<string, unknown>)[item.from.key as string] : holder.root;
    for (let i = 0; i < item.path.length - 1 && cur !== null && typeof cur === "object"; i++) cur = (cur as Record<string, unknown>)[item.path[i] as string];
    if (!Array.isArray(cur)) return undefined;
    return (item.slot = { parent: cur, key: item.path[item.path.length - 1]! });
  };

  /** The whole path of an item, for `onRow`. */
  const whole = (item: Item | undefined): Segment[] => (item ? [...whole(item.prev), ...item.path] : []);

  const closeTable = (): void => {
    // Cleared first: a table whose path can't be written is dropped, not left half-open.
    const t = table!;
    table = undefined;
    if (!skip) return put(t.from, t.segments, t.rows, t.at);
    try {
      put(t.from, t.segments, t.rows, t.at);
    } catch (e) {
      if (!(e instanceof FlatDecodeError)) throw e;
      warn?.(e.reason, e.line, e.column, "the table is dropped");
      // The item a dropped table would have opened doesn't exist.
      if (t.opens) anchor = undefined;
    }
  };

  const line = (raw: string): void => {
    lineNo++;
    if (!skip) return readLine(raw);
    if (onWarning) held = [];
    try {
      readLine(raw);
    } catch (e) {
      if (!(e instanceof FlatDecodeError)) throw e;
      if (held) held = [{ message: `${e.reason}: the line is skipped`, line: e.line, column: e.column }];
    }
    const lineWarnings = held;
    held = undefined;
    lineWarnings?.forEach(onWarning!);
  };

  const readLine = (raw: string): void => {
    const text = stripCR(raw);
    if (table) {
      const { t } = table;
      const width = t.fields.length;
      const row = cells(text, t.delimiter, problem, lineNo, 1, big, t.optional);
      if (row.length !== width) {
        problem(`Expected ${width} values, got ${row.length}`, lineNo, 1, row.length < width ? "the missing values are null" : "the extra values are dropped");
      }
      const obj: { root?: unknown } = { root: {} };
      for (let f = 0; f < width; f++) {
        const v = f < row.length ? row[f] : null;
        if (v !== ABSENT) assign(obj, t.fields[f]!, v, strict, lineNo, false, warn);
      }
      if (keep) table.rows.push(obj.root);
      onRow?.({ path: table.path, index: table.read, value: obj.root as JsonValue });
      if (++table.read === t.count) closeTable();
      return;
    }
    let pos = 0;
    while (text.charCodeAt(pos) === 32 || text.charCodeAt(pos) === 9) pos++;
    if (pos === text.length || text.charCodeAt(pos) === 35) return; // blank or # comment

    // `.path` continues the item the last `[+]` line opened: it starts there, not at the root.
    const relative = text.charCodeAt(pos) === 46;
    let from: Slot | undefined;
    let rawPath: (Segment | typeof APPEND)[];
    let end: number;
    let terminal: Terminal;
    if (relative) {
      if (!anchor) throw new FlatDecodeError("A '.' path needs a [+] item before it", lineNo, pos + 1);
      if (!isKeyStart(text.charCodeAt(++pos))) throw new FlatDecodeError("Expected a key after '.'", lineNo, pos + 1);
      ({ segments: rawPath, terminal, end } = parsePath(text, pos, lineNo));
      from = place(anchor);
      // Only after a line that failed, which can't open an item: treated as no item.
      if (!from) throw new FlatDecodeError("A '.' path needs a [+] item before it", lineNo, pos);
    } else {
      ({ segments: rawPath, terminal, end } = parsePath(text, pos, lineNo));
    }
    const last = rawPath.lastIndexOf(APPEND);
    const segments = last < 0 ? (rawPath as Segment[]) : resolveAppends(from ? (from.parent as Record<string, unknown>)[from.key as string] : holder.root, rawPath);
    // Set once the line has been read: a line that fails changes nothing.
    const next: Item | undefined = last >= 0 ? { from, path: segments.slice(0, last + 1), prev: from ? anchor : undefined } : relative ? anchor : undefined;
    let eq = end;
    while (text.charCodeAt(eq) === 32) eq++;
    if (terminal.kind === "value" && text.charCodeAt(eq) === 61) {
      if (relative) throw new FlatDecodeError("A reference can't start with '.'", lineNo, pos);
      // A reference that is refused (lenient, without refs) is a skipped line: it changes nothing.
      if (reference(segments, text, eq)) anchor = next;
      return;
    }
    const colon = text.charCodeAt(end) === 58;
    if (!colon) {
      // A table header that only lacks its colon is still clearly a header: lenient mode reads it as one.
      if (strict || terminal.kind !== "table" || text.slice(end).trim() !== "") {
        throw new FlatDecodeError("Expected ':' after path", lineNo, end + 1);
      }
      warn?.("Expected ':' after the table header", lineNo, end + 1, "read as a table anyway");
    }
    const value = colon ? text.slice(end + 1) : "";
    if (terminal.kind === "value") {
      put(from, segments, scalar(value.trim(), problem, lineNo, end + 2, big), lineNo);
    } else if (terminal.kind === "inline") {
      put(from, segments, cells(value, terminal.delimiter, problem, lineNo, end + 2, big), lineNo);
    } else {
      if (value.trim() !== "") problem("Table rows go on the following lines", lineNo, end + 2, "the text after the header is ignored");
      // The path only matters to onRow; for a `.path` table it is the item's path and the rest.
      const path = !onRow ? "" : formatPath(from ? [...whole(anchor), ...segments] : segments);
      anchor = next;
      table = { at: lineNo, from, segments, t: terminal, path, rows: [], read: 0, opens: last >= 0 };
      if (terminal.count === 0) closeTable();
      return;
    }
    anchor = next;
  };

  /** `path = target` (`~` is the root). */
  const reference = (segments: Segment[], text: string, eq: number): boolean => {
    if (!refs) {
      problem("References need { refs: true }", lineNo, eq + 1, "the line is skipped");
      return false;
    }
    if (segments.length === 0) throw new FlatDecodeError("The root can't be a reference", lineNo, eq + 1);
    let pos = eq + 1;
    while (text.charCodeAt(pos) === 32) pos++;
    let target: Segment[];
    let end: number;
    if (text.charCodeAt(pos) === 126) {
      target = [];
      end = pos + 1;
    } else {
      const p = parsePath(text, pos, lineNo);
      if (p.terminal.kind !== "value" || p.segments.length === 0 || p.segments.includes(APPEND)) {
        throw new FlatDecodeError("Expected a path or '~' after '='", lineNo, pos + 1);
      }
      target = p.segments as Segment[];
      end = p.end;
    }
    while (text.charCodeAt(end) === 32) end++;
    if (end !== text.length) throw new FlatDecodeError("Unexpected text after reference", lineNo, end + 1);
    const ref = new Ref(segments, target, lineNo);
    put(undefined, segments, ref, lineNo);
    pending.push(ref);
    return true;
  };

  return {
    write(chunk) {
      // Only the new chunk is searched for newlines, so a long line streamed in small chunks stays linear.
      let nl = chunk.indexOf("\n");
      if (nl < 0) {
        rest += chunk;
        return;
      }
      line(rest + chunk.slice(0, nl));
      let start = nl + 1;
      while ((nl = chunk.indexOf("\n", start)) >= 0) {
        line(chunk.slice(start, nl));
        start = nl + 1;
      }
      rest = chunk.slice(start);
    },
    end() {
      line(rest);
      rest = "";
      if (table) {
        problem(`Expected ${table.t.count} rows, got ${table.read}`, table.at, 1, "the table has the rows that are there");
        closeTable();
      }
      if (pending.length > 0) resolveRefs(holder, pending, strict, warn);
      const value = "root" in holder ? holder.root : {};
      return (options.reviver ? revive(value, options.reviver) : value) as JsonValue;
    },
  };
}

function formatPath(segments: Segment[]): string {
  let out = "";
  for (const s of segments) out += typeof s === "number" ? `[${s}]` : out === "" ? formatKey(s) : "." + formatKey(s);
  return out;
}

function stripCR(line: string): string {
  return line.charCodeAt(line.length - 1) === 13 ? line.slice(0, -1) : line;
}

function scalar(tok: string, problem: Warn, line: number, column: number, big: boolean): unknown {
  if (tok === "") {
    problem("Missing value", line, column, "read as null");
    return null;
  }
  const v = parseScalar(tok, big);
  if (v === undefined) {
    problem("Invalid quoted string", line, column, "kept as text");
    return tok;
  }
  return v;
}

/** An empty cell in an optional table field (`phone?`): the key is left out of the row. */
const ABSENT: unique symbol = Symbol("absent");

/** Splits `a, "b, c", 3` on the delimiter, honouring quotes. With `optional`, an empty cell there is ABSENT. */
function cells(s: string, delimiter: Delimiter, problem: Warn, line: number, column: number, big: boolean, optional?: boolean[]): unknown[] {
  const out: unknown[] = [];
  const n = s.length;
  const isSpace = (c: number): boolean => c === 32 || (c === 9 && delimiter !== "\t");
  let i = 0;
  for (;;) {
    while (i < n && isSpace(s.charCodeAt(i))) i++;
    if (s.charCodeAt(i) === 34) {
      const close = scanString(s, i);
      if (close < 0) {
        problem("Unterminated string", line, column + i, "kept as text");
        out.push(s.slice(i + 1));
        return out;
      }
      out.push(scalar(s.slice(i, close + 1), problem, line, column + i, big));
      i = close + 1;
      while (i < n && isSpace(s.charCodeAt(i))) i++;
      if (i < n && s[i] !== delimiter) problem("Expected delimiter after quoted string", line, column + i, "the text after it is dropped");
      const next = s.indexOf(delimiter, i);
      i = next < 0 ? n : next;
    } else {
      const next = s.indexOf(delimiter, i);
      const j = next < 0 ? n : next;
      const tok = s.slice(i, j).trim();
      out.push(tok === "" && optional?.[out.length] ? ABSENT : scalar(tok, problem, line, column + i, big));
      i = j;
    }
    if (i >= n) return out;
    i++;
  }
}
