import type { Delimiter } from "@flattype/shared";
import { FlatDecodeError, isKeyChar, scanString } from "./syntax.js";

/** A key (string) or an array index (number). */
export type Segment = string | number;

export type Terminal =
  | { kind: "value" }
  | { kind: "inline"; delimiter: Delimiter }
  | { kind: "table"; count: number; delimiter: Delimiter; fields: Segment[][] };

export interface ParsedPath {
  segments: Segment[];
  terminal: Terminal;
  /** Index just after the path. */
  end: number;
}

const VALUE: Terminal = { kind: "value" };

function delimiterOf(mark: string): Delimiter {
  return mark === "" ? "," : (mark as Delimiter);
}

/**
 * Reads a path such as `user.address.zip`, `users[0]."first name"`, `tags[]` or `rows[2]{id,name}`,
 * starting at `pos`. Stops at the first character that can't continue a path (normally `:`).
 */
export function parsePath(s: string, pos: number, line: number): ParsedPath {
  const segments: Segment[] = [];
  const fail = (msg: string, at: number): never => {
    throw new FlatDecodeError(msg, line, at + 1);
  };
  let needKey = false;
  for (;;) {
    const c = s.charCodeAt(pos);
    if (c === 34 || isKeyChar(c)) {
      if (segments.length > 0 && !needKey) fail("Expected '.' or ':' before key", pos);
      pos = readKey(s, pos, segments, fail);
      needKey = false;
      if (s.charCodeAt(pos) === 46) {
        pos++;
        needKey = true;
      }
      continue;
    }
    if (needKey) fail("Expected a key after '.'", pos);
    if (c !== 91) break;

    const close = s.indexOf("]", pos);
    if (close < 0) fail("Unclosed '['", pos);
    const inner = s.slice(pos + 1, close);
    if (inner === "" || inner === "|" || inner === "\t") {
      return { segments, terminal: { kind: "inline", delimiter: delimiterOf(inner) }, end: close + 1 };
    }
    let digits = inner;
    let mark = "";
    const last = inner.charCodeAt(inner.length - 1);
    if (last === 124 || last === 9) {
      digits = inner.slice(0, -1);
      mark = inner.slice(-1);
    }
    if (!/^\d+$/.test(digits)) fail(`Invalid index '[${inner}]'`, pos);
    const n = Number(digits);
    pos = close + 1;
    if (s.charCodeAt(pos) === 123) {
      const delimiter = delimiterOf(mark);
      const { fields, end } = readFields(s, pos + 1, delimiter, fail);
      return { segments, terminal: { kind: "table", count: n, delimiter, fields }, end };
    }
    if (mark !== "") fail("A delimiter mark is only allowed on inline arrays and tables", pos - 1);
    segments.push(n);
    if (s.charCodeAt(pos) === 46) {
      pos++;
      needKey = true;
    }
  }
  return { segments, terminal: VALUE, end: pos };
}

function readKey(s: string, pos: number, out: Segment[], fail: (msg: string, at: number) => never): number {
  if (s.charCodeAt(pos) === 34) {
    const close = scanString(s, pos);
    if (close < 0) fail("Unterminated quoted key", pos);
    try {
      out.push(JSON.parse(s.slice(pos, close + 1)) as string);
    } catch {
      fail("Invalid quoted key", pos);
    }
    return close + 1;
  }
  let end = pos;
  while (end < s.length && isKeyChar(s.charCodeAt(end))) end++;
  out.push(s.slice(pos, end));
  return end;
}

/** Reads `id,user.name}` (after the `{`) into one key path per field. */
function readFields(
  s: string,
  pos: number,
  delimiter: Delimiter,
  fail: (msg: string, at: number) => never,
): { fields: Segment[][]; end: number } {
  const fields: Segment[][] = [];
  for (;;) {
    while (s.charCodeAt(pos) === 32) pos++;
    const field: Segment[] = [];
    for (;;) {
      const c = s.charCodeAt(pos);
      if (c !== 34 && !isKeyChar(c)) fail("Expected a field name", pos);
      pos = readKey(s, pos, field, fail);
      if (s.charCodeAt(pos) !== 46) break;
      pos++;
    }
    fields.push(field);
    while (s.charCodeAt(pos) === 32) pos++;
    const c = s[pos];
    if (c === "}") return { fields, end: pos + 1 };
    if (c !== delimiter) fail(`Expected '${delimiter === "\t" ? "\\t" : delimiter}' or '}' in table header`, pos);
    pos++;
  }
}

const hasOwn = Object.prototype.hasOwnProperty;

/** The most nulls lenient decoding inserts for a skipped index range. */
export const MAX_GAP = 1000;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Sets an own property, including `__proto__`, without touching the prototype chain. */
function setOwn(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    obj[key] = value;
  }
}

/** Writes `value` at `segments` under `holder.root`, creating objects and arrays on the way. */
export function assign(
  holder: { root?: unknown },
  segments: Segment[],
  value: unknown,
  strict: boolean,
  line: number,
): void {
  let parent: Record<string, unknown> | unknown[] = holder as Record<string, unknown>;
  let key: Segment = "root";
  const fail = (msg: string): never => {
    throw new FlatDecodeError(msg, line, 1);
  };

  const slot = (create: () => unknown, leaf: boolean): unknown => {
    if (typeof key === "number") {
      const arr = parent as unknown[];
      if (key < arr.length) {
        if (leaf) {
          if (strict) fail(`Duplicate index [${key}]`);
          arr[key] = create();
        }
        return arr[key];
      }
      if (key > arr.length) {
        if (strict) fail(`Index [${key}] skips [${arr.length}]`);
        // Lenient mode fills small gaps with null, but a tiny line like `a[999999999]: 1` must not
        // allocate a billion entries.
        if (key - arr.length > MAX_GAP) fail(`Index [${key}] is too far past [${arr.length}]`);
        while (arr.length < key) arr.push(null);
      }
      const v = create();
      arr.push(v);
      return v;
    }
    const obj = parent as Record<string, unknown>;
    if (hasOwn.call(obj, key) && obj[key] !== undefined) {
      if (!leaf) return obj[key];
      if (strict) fail(`Duplicate key '${key}'`);
    }
    const v = create();
    setOwn(obj, key, v);
    return v;
  };

  for (const seg of segments) {
    const wantArray = typeof seg === "number";
    const cur = slot(() => (wantArray ? [] : {}), false);
    if (wantArray ? !Array.isArray(cur) : !isObject(cur)) {
      fail(`Path conflict at ${typeof key === "number" ? `[${key}]` : `'${key}'`}`);
    }
    parent = cur as Record<string, unknown> | unknown[];
    key = seg;
  }
  slot(() => value, true);
}
