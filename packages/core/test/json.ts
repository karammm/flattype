/**
 * What `JSON.parse(JSON.stringify(v))` gives for a JSON-like value, built without JSON.parse: V8 (Node 23 and
 * later) sometimes drops a key when parsing an object that has both `"\""` and `"\\"` keys, which made this
 * test oracle wrong, not the decoder. `-0` becomes 0, non-finite numbers null, `undefined` is dropped from
 * objects and is null in arrays.
 */
export function asJson(v: unknown): unknown {
  if (typeof v === "number") return Number.isFinite(v) ? (Object.is(v, -0) ? 0 : v) : null;
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : asJson(x)));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (x === undefined) continue;
    if (k === "__proto__") Object.defineProperty(out, k, { value: asJson(x), writable: true, enumerable: true, configurable: true });
    else out[k] = asJson(x);
  }
  return out;
}
