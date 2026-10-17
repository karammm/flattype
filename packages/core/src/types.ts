/**
 * `@flattype/core/types`: ready-made helpers for values JSON has no type for, like MessagePack's extension types.
 * They don't change the format, so the text stays readable and any decoder (or Python) can read it.
 *
 * ```ts
 * import { replaceTypes, reviveDates } from "@flattype/core/types";
 * const text = encode(data, { replacer: replaceTypes }); // Map, Set, bytes, errors
 * const back = decode(text, { reviver: reviveDates, bigint: true }); // ISO strings → Date, big IDs → BigInt
 * ```
 */
import type { JsonValue } from "@flattype/shared";

const INTEGER = /^-?\d+$/;
// Date and time with a zone: what `toISOString()` and Python's `isoformat()` write. No date-only strings.
const DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * A `replacer` (for `encode` or `JSON.stringify`) for the values JSON can't represent:
 *
 * - `Map` → an object, or `[key, value]` pairs when a key isn't a string
 * - `Set` → an array
 * - `Uint8Array`, `Buffer`, `ArrayBuffer` and `DataView` → a base64 string (read it back with the `"bytes"` model type)
 * - other typed arrays → arrays of numbers (or of BigInts)
 * - `Error` → `{ name, message }`
 *
 * Dates already become ISO strings, and BigInts are written as their digits.
 */
export function replaceTypes(this: unknown, key: string, value: unknown): unknown {
  // The value before `toJSON`, which turns a Buffer into { type, data }.
  const raw = (this as Record<string, unknown>)[key];
  if (raw instanceof Map) {
    const entries = [...raw];
    return entries.every(([k]) => typeof k === "string") ? Object.fromEntries(entries) : entries;
  }
  if (raw instanceof Set) return [...raw];
  if (raw instanceof ArrayBuffer) return base64(new Uint8Array(raw));
  if (ArrayBuffer.isView(raw)) {
    if (raw instanceof Uint8Array || raw instanceof DataView) return base64(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    return Array.from(raw as unknown as ArrayLike<number>);
  }
  if (raw instanceof Error) return { name: raw.name, message: raw.message };
  return value;
}

/**
 * A `reviver` (for `decode` or `JSON.parse`) that turns date-time strings with a zone, such as
 * `2026-01-01T09:00:00.000Z` or Python's `2026-01-01T09:00:00.123456+00:00`, into `Date`s.
 * Date-only strings like `2026-01-01` stay strings. For per-field types, use a model from `@flattype/models`.
 */
export function reviveDates(_key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  const m = DATE_TIME.exec(value);
  if (!m) return value;
  // Milliseconds only: not every engine reads more fraction digits.
  const d = new Date(m[1]! + (m[2] ? "." + m[2].slice(0, 3).padEnd(3, "0") : "") + m[3]!);
  return Number.isNaN(d.getTime()) ? value : d;
}

/**
 * `JSON.parse` that reads integers beyond 2^53 as exact `BigInt`s, like `decode(text, { bigint: true })`.
 * It needs JSON.parse source text access (Node 21+, Chrome 114+). Engines without it round, as `JSON.parse`
 * always has.
 */
export function parseJson(text: string): JsonValue {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) => {
    const source = context?.source;
    return typeof value === "number" && !Number.isSafeInteger(value) && source !== undefined && source.length <= 4300 && INTEGER.test(source)
      ? BigInt(source)
      : value;
  }) as JsonValue;
}

/** `JSON.stringify` that writes BigInts as their digits instead of throwing, so other languages read them exactly. */
export function stringifyJson(value: unknown, space?: string | number): string {
  const big: bigint[] = [];
  // A placeholder no real string can match, swapped for the digits afterwards.
  const tag = "\u0001flattype-bigint-" + Math.random().toString(36).slice(2) + "-";
  const out = JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? tag + (big.push(v) - 1) : v), space);
  if (big.length === 0) return out;
  const quoted = JSON.stringify(tag).slice(0, -1);
  let result = "";
  let from = 0;
  for (let at = out.indexOf(quoted); at >= 0; at = out.indexOf(quoted, from)) {
    const close = out.indexOf('"', at + quoted.length);
    result += out.slice(from, at) + String(big[Number(out.slice(at + quoted.length, close))]);
    from = close + 1;
  }
  return result + out.slice(from);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
