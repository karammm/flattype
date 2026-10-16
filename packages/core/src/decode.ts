import type { Decoder, DecoderOptions, DecodeOptions, Delimiter, JsonValue } from "@flattype/shared";
import { assign, parsePath, Ref, resolveRefs, type Segment, type Terminal } from "./path.js";
import { revive } from "./revive.js";
import { FlatDecodeError, formatKey, parseScalar, scanString } from "./syntax.js";

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
 * Incremental decoder: `write` chunks as they arrive (any split, even mid-line), then `end()`.
 * `onRow` is called for every table row as soon as its line is complete. With `keepRows: false`,
 * rows are only passed to `onRow` and their tables stay empty, so memory stays flat for huge lists.
 */
export function createDecoder(options: DecoderOptions = {}): Decoder {
  const strict = options.strict !== false;
  const keep = options.keepRows !== false;
  const onRow = options.onRow;
  const refs = options.refs === true;
  const holder: { root?: unknown } = {};
  // Reference lines, resolved once the whole document has been read (a cycle points at a parent).
  const pending: Ref[] = [];
  let lineNo = 0;
  let rest = "";
  // The table whose rows are being read.
  let table: { at: number; segments: Segment[]; t: Table; path: string; rows: unknown[]; read: number } | undefined;

  const closeTable = (): void => {
    assign(holder, table!.segments, table!.rows, strict, table!.at);
    table = undefined;
  };

  const line = (raw: string): void => {
    lineNo++;
    const text = stripCR(raw);
    if (table) {
      const { t } = table;
      const width = t.fields.length;
      const row = cells(text, t.delimiter, strict, lineNo, 1);
      if (row.length !== width && strict) {
        throw new FlatDecodeError(`Expected ${width} values, got ${row.length}`, lineNo, 1);
      }
      const obj: { root?: unknown } = { root: {} };
      for (let f = 0; f < width; f++) assign(obj, t.fields[f]!, f < row.length ? row[f] : null, strict, lineNo);
      if (keep) table.rows.push(obj.root);
      onRow?.({ path: table.path, index: table.read, value: obj.root as JsonValue });
      if (++table.read === t.count) closeTable();
      return;
    }
    let pos = 0;
    while (text.charCodeAt(pos) === 32 || text.charCodeAt(pos) === 9) pos++;
    if (pos === text.length || text.charCodeAt(pos) === 35) return; // blank or # comment

    const { segments, terminal, end } = parsePath(text, pos, lineNo);
    let eq = end;
    while (text.charCodeAt(eq) === 32) eq++;
    if (terminal.kind === "value" && text.charCodeAt(eq) === 61) {
      reference(segments, text, eq);
      return;
    }
    if (text.charCodeAt(end) !== 58) {
      throw new FlatDecodeError("Expected ':' after path", lineNo, end + 1);
    }
    const value = text.slice(end + 1);
    if (terminal.kind === "value") {
      assign(holder, segments, scalar(value.trim(), strict, lineNo, end + 2), strict, lineNo);
    } else if (terminal.kind === "inline") {
      assign(holder, segments, cells(value, terminal.delimiter, strict, lineNo, end + 2), strict, lineNo);
    } else {
      if (value.trim() !== "" && strict) {
        throw new FlatDecodeError("Table rows go on the following lines", lineNo, end + 2);
      }
      table = { at: lineNo, segments, t: terminal, path: formatPath(segments), rows: [], read: 0 };
      if (terminal.count === 0) closeTable();
    }
  };

  /** `path = target` (`~` is the root). */
  const reference = (segments: Segment[], text: string, eq: number): void => {
    if (!refs) {
      if (strict) throw new FlatDecodeError("References need { refs: true }", lineNo, eq + 1);
      return;
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
      if (p.terminal.kind !== "value" || p.segments.length === 0) {
        throw new FlatDecodeError("Expected a path or '~' after '='", lineNo, pos + 1);
      }
      target = p.segments;
      end = p.end;
    }
    while (text.charCodeAt(end) === 32) end++;
    if (end !== text.length) throw new FlatDecodeError("Unexpected text after reference", lineNo, end + 1);
    const ref = new Ref(segments, target, lineNo);
    assign(holder, segments, ref, strict, lineNo);
    pending.push(ref);
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
        if (strict) throw new FlatDecodeError(`Expected ${table.t.count} rows, got ${table.read}`, table.at, 1);
        closeTable();
      }
      if (pending.length > 0) resolveRefs(holder, pending, strict);
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

function scalar(tok: string, strict: boolean, line: number, column: number): unknown {
  if (tok === "") {
    if (strict) throw new FlatDecodeError("Missing value", line, column);
    return null;
  }
  const v = parseScalar(tok);
  if (v === undefined) {
    if (strict) throw new FlatDecodeError("Invalid quoted string", line, column);
    return tok;
  }
  return v;
}

/** Splits `a, "b, c", 3` on the delimiter, honouring quotes. */
function cells(s: string, delimiter: Delimiter, strict: boolean, line: number, column: number): unknown[] {
  const out: unknown[] = [];
  const n = s.length;
  const isSpace = (c: number): boolean => c === 32 || (c === 9 && delimiter !== "\t");
  let i = 0;
  for (;;) {
    while (i < n && isSpace(s.charCodeAt(i))) i++;
    if (s.charCodeAt(i) === 34) {
      const close = scanString(s, i);
      if (close < 0) {
        if (strict) throw new FlatDecodeError("Unterminated string", line, column + i);
        out.push(s.slice(i + 1));
        return out;
      }
      out.push(scalar(s.slice(i, close + 1), strict, line, column + i));
      i = close + 1;
      while (i < n && isSpace(s.charCodeAt(i))) i++;
      if (i < n && s[i] !== delimiter && strict) {
        throw new FlatDecodeError("Expected delimiter after quoted string", line, column + i);
      }
      const next = s.indexOf(delimiter, i);
      i = next < 0 ? n : next;
    } else {
      const next = s.indexOf(delimiter, i);
      const j = next < 0 ? n : next;
      out.push(scalar(s.slice(i, j).trim(), strict, line, column + i));
      i = j;
    }
    if (i >= n) return out;
    i++;
  }
}
