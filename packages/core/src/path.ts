import type { Delimiter } from "@flattype/shared";
import { FlatDecodeError, formatKey, isKeyChar, scanString, type Warn } from "./syntax.js";

/** `[+]` in a path: the next element of the array (Flat Notation 1.1). Resolved to a number before assigning. */
export const APPEND: unique symbol = Symbol("[+]");

/** A key (string) or an array index (number), or `[+]` until it is resolved. */
export type Segment = string | number;
export type RawSegment = Segment | typeof APPEND;

export type Terminal =
  | { kind: "value" }
  | { kind: "inline"; delimiter: Delimiter }
  // `optional[i]`: field i was written `name?`, so an empty cell means the key is absent.
  | { kind: "table"; count: number; delimiter: Delimiter; fields: Segment[][]; optional: boolean[] };

export interface ParsedPath {
  segments: RawSegment[];
  terminal: Terminal;
  /** Index just after the path. */
  end: number;
}

const VALUE: Terminal = { kind: "value" };

function delimiterOf(mark: string): Delimiter {
  return mark === "" ? "," : (mark as Delimiter);
}

/** Whether a path can start with this character: a bare key character or the quote of a quoted key. */
export function isKeyStart(code: number): boolean {
  return code === 34 || isKeyChar(code);
}

/**
 * Reads a path such as `user.address.zip`, `users[0]."first name"`, `tags[]` or `rows[2]{id,name}`,
 * starting at `pos`. Stops at the first character that can't continue a path (normally `:`).
 */
export function parsePath(s: string, pos: number, line: number): ParsedPath {
  const segments: RawSegment[] = [];
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
    if (inner === "+") {
      segments.push(APPEND);
      pos = close + 1;
      if (s.charCodeAt(pos) === 46) {
        pos++;
        needKey = true;
      }
      continue;
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
      const { fields, optional, end } = readFields(s, pos + 1, delimiter, fail);
      return { segments, terminal: { kind: "table", count: n, delimiter, fields, optional }, end };
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

function readKey(s: string, pos: number, out: RawSegment[], fail: (msg: string, at: number) => never): number {
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

/** Reads `id,user.name,phone?}` (after the `{`) into one key path per field, and which are optional. */
function readFields(
  s: string,
  pos: number,
  delimiter: Delimiter,
  fail: (msg: string, at: number) => never,
): { fields: Segment[][]; optional: boolean[]; end: number } {
  const fields: Segment[][] = [];
  const optional: boolean[] = [];
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
    const opt = s.charCodeAt(pos) === 63;
    optional.push(opt);
    if (opt) pos++;
    while (s.charCodeAt(pos) === 32) pos++;
    const c = s[pos];
    if (c === "}") return { fields, optional, end: pos + 1 };
    if (c !== delimiter) fail(`Expected '${delimiter === "\t" ? "\\t" : delimiter}' or '}' in table header`, pos);
    pos++;
  }
}

const hasOwn = Object.prototype.hasOwnProperty;

/** A place a value is or will be: `parent[key]`. */
export interface Slot {
  parent: Record<string, unknown> | unknown[];
  key: Segment;
}

/** Placeholder for a `path = target` line until the whole document has been read. */
export class Ref {
  constructor(
    readonly segments: Segment[],
    readonly target: Segment[],
    readonly line: number,
  ) {}
}

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

/**
 * Replaces each `[+]` with the index it appends at: the current length of the array it is in, or 0 where that
 * array doesn't exist yet. Nothing is created or changed; `assign` then reports any conflict as usual.
 */
export function resolveAppends(start: unknown, segments: RawSegment[]): Segment[] {
  let cur: unknown = start;
  return segments.map((seg) => {
    if (seg === APPEND) {
      const i = Array.isArray(cur) ? cur.length : 0;
      cur = undefined;
      return i;
    }
    if (typeof seg === "number") cur = Array.isArray(cur) ? cur[seg] : undefined;
    else cur = isObject(cur) && !(cur instanceof Ref) && hasOwn.call(cur, seg) ? cur[seg] : undefined;
    return seg;
  });
}

/**
 * Writes `value` at `segments` under `holder.root`, creating objects and arrays on the way. In lenient mode,
 * what it repairs (duplicates, skipped indexes) goes to `warn`.
 * With `dry`, nothing is written and nothing is reported, but every error is still thrown: containers it would
 * create are made and walked into, just never attached. So a line that fails can be skipped cleanly.
 */
export function assign(
  holder: { root?: unknown },
  segments: Segment[],
  value: unknown,
  strict: boolean,
  line: number,
  dry = false,
  warn?: Warn,
  from?: Slot,
): void {
  // From `holder.root`, or for a `.path` line, from the item it continues.
  let parent: Record<string, unknown> | unknown[] = from ? from.parent : (holder as Record<string, unknown>);
  let key: Segment = from ? from.key : "root";
  const fail = (msg: string): never => {
    throw new FlatDecodeError(msg, line, 1);
  };
  /** Strict: an error. Lenient: reported, then repaired by the caller. */
  const problem = (msg: string, repair: string): void => {
    if (strict) fail(msg);
    if (!dry) warn?.(msg, line, 1, repair);
  };

  const slot = (create: () => unknown, leaf: boolean): unknown => {
    if (typeof key === "number") {
      const arr = parent as unknown[];
      if (key < arr.length) {
        if (leaf) {
          problem(`Duplicate index [${key}]`, "the last value is kept");
          if (!dry) arr[key] = create();
        }
        return arr[key];
      }
      if (key > arr.length) {
        if (strict) fail(`Index [${key}] skips [${arr.length}]`);
        // Lenient mode fills small gaps with null, but a tiny line like `a[999999999]: 1` must not
        // allocate a billion entries.
        if (key - arr.length > MAX_GAP) fail(`Index [${key}] is too far past [${arr.length}]`);
        problem(`Index [${key}] skips [${arr.length}]`, "the gap is filled with null");
        if (!dry) while (arr.length < key) arr.push(null);
      }
      const v = create();
      if (!dry) arr.push(v);
      return v;
    }
    const obj = parent as Record<string, unknown>;
    if (hasOwn.call(obj, key) && obj[key] !== undefined) {
      if (!leaf) return obj[key];
      problem(`Duplicate key '${key}'`, "the last value is kept");
    }
    const v = create();
    if (!dry) setOwn(obj, key, v);
    return v;
  };

  for (const seg of segments) {
    const wantArray = typeof seg === "number";
    const cur = slot(() => (wantArray ? [] : {}), false);
    if (wantArray ? !Array.isArray(cur) : !isObject(cur) || cur instanceof Ref) {
      fail(`Path conflict at ${typeof key === "number" ? `[${key}]` : `'${key}'`}`);
    }
    parent = cur as Record<string, unknown> | unknown[];
    key = seg;
  }
  slot(() => value, true);
}

const show = (segments: Segment[]): string =>
  segments.length === 0 ? "~" : segments.map((s, i) => (typeof s === "number" ? `[${s}]` : i === 0 ? formatKey(s) : `.${formatKey(s)}`)).join("");

/**
 * Replaces each reference placeholder with the object or array its target path points to, in document order.
 * A target may pass through a reference resolved before it, but not through one still waiting.
 */
export function resolveRefs(holder: { root?: unknown }, refs: Ref[], strict: boolean, warn?: Warn): void {
  const isContainer = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !(v instanceof Ref);
  for (const ref of refs) {
    // Lenient decoding may have overwritten the placeholder (or a parent) with a later line; that line wins.
    let parent: unknown = holder.root;
    const last = ref.segments.length - 1;
    for (let i = 0; i < last && isContainer(parent); i++) parent = parent[ref.segments[i] as string];
    if (!isContainer(parent) || parent[ref.segments[last] as string] !== ref) continue;

    let cur: unknown = holder.root;
    for (const seg of ref.target) {
      cur = isContainer(cur) && hasOwn.call(cur, seg) ? cur[seg as string] : undefined;
    }
    let value: unknown = cur;
    if (cur === null || typeof cur !== "object" || cur instanceof Ref) {
      const why = cur instanceof Ref ? "is a reference that comes later" : cur === undefined ? "doesn't exist" : "isn't an object or array";
      const msg = `Reference target '${show(ref.target)}' ${why}`;
      if (strict) throw new FlatDecodeError(msg, ref.line, 1);
      warn?.(msg, ref.line, 1, "read as null");
      value = null;
    }
    setOwn(parent, ref.segments[last] as string, value);
  }
}
