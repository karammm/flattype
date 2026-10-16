import type { DecodeOptions, Delimiter, JsonValue } from "@flattype/shared";
import { assign, parsePath } from "./path.js";
import { FlatDecodeError, parseScalar, scanString } from "./syntax.js";

/** Decodes Flat Notation back into the JSON value it came from. An empty document is `{}`. */
export function decode(text: string, options: DecodeOptions = {}): JsonValue {
  const strict = options.strict !== false;
  const lines = text.split("\n");
  const holder: { root?: unknown } = {};

  for (let i = 0; i < lines.length; i++) {
    const line = stripCR(lines[i]!);
    const lineNo = i + 1;
    let pos = 0;
    while (line.charCodeAt(pos) === 32 || line.charCodeAt(pos) === 9) pos++;
    if (pos === line.length || line.charCodeAt(pos) === 35) continue; // blank or # comment

    const { segments, terminal, end } = parsePath(line, pos, lineNo);
    if (line.charCodeAt(end) !== 58) {
      throw new FlatDecodeError("Expected ':' after path", lineNo, end + 1);
    }
    const rest = line.slice(end + 1);
    let value: unknown;

    if (terminal.kind === "value") {
      value = scalar(rest.trim(), strict, lineNo, end + 2);
    } else if (terminal.kind === "inline") {
      value = cells(rest, terminal.delimiter, strict, lineNo, end + 2);
    } else {
      if (rest.trim() !== "" && strict) {
        throw new FlatDecodeError("Table rows go on the following lines", lineNo, end + 2);
      }
      const rows: unknown[] = [];
      const width = terminal.fields.length;
      for (let r = 0; r < terminal.count; r++) {
        if (i + 1 >= lines.length) {
          if (strict) throw new FlatDecodeError(`Expected ${terminal.count} rows, got ${r}`, lineNo, 1);
          break;
        }
        i++;
        const row = cells(stripCR(lines[i]!), terminal.delimiter, strict, i + 1, 1);
        if (row.length !== width && strict) {
          throw new FlatDecodeError(`Expected ${width} values, got ${row.length}`, i + 1, 1);
        }
        const obj: { root?: unknown } = { root: {} };
        for (let f = 0; f < width; f++) {
          assign(obj, terminal.fields[f]!, f < row.length ? row[f] : null, strict, i + 1);
        }
        rows.push(obj.root);
      }
      value = rows;
    }
    assign(holder, segments, value, strict, lineNo);
  }
  return ("root" in holder ? holder.root : {}) as JsonValue;
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
