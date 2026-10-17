import type { FlatRecord, JsonValue } from "@flattype/shared";
import { APPEND, assign, parsePath, type Segment } from "./path.js";
import { FlatDecodeError, joinKey } from "./syntax.js";

/**
 * Flattens a value into a path → leaf record, e.g.
 * `{ user: { name: "John" }, tags: ["a"] }` → `{ "user.name": "John", "tags[0]": "a" }`.
 * Empty objects and arrays are kept as `{}` / `[]` leaves so `unflatten` can restore them.
 * A primitive root is stored under the empty path `""`.
 */
export function flatten(value: unknown): FlatRecord {
  const out: FlatRecord = {};
  const stack = new Set<object>();
  const put = (path: string, leaf: FlatRecord[string]): void => {
    // A plain assignment to "__proto__" would replace the prototype instead of adding a key.
    Object.defineProperty(out, path, { value: leaf, writable: true, enumerable: true, configurable: true });
  };

  const visit = (path: string, v: unknown): void => {
    if (v !== null && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON === "function") {
      v = (v as { toJSON(): unknown }).toJSON();
    }
    if (v === null || typeof v !== "object") {
      const leaf = typeof v === "number" ? (Number.isFinite(v) ? v + 0 : null) : v;
      const skip = leaf === undefined || typeof leaf === "function" || typeof leaf === "symbol";
      put(path, skip ? null : (leaf as FlatRecord[string]));
      return;
    }
    if (stack.has(v)) throw new TypeError("Converting circular structure to a flat record");
    stack.add(v);
    if (Array.isArray(v)) {
      if (v.length === 0) put(path, []);
      v.forEach((x, i) => visit(path + "[" + i + "]", x));
    } else {
      let empty = true;
      for (const key of Object.keys(v)) {
        const x = (v as Record<string, unknown>)[key];
        if (x === undefined || typeof x === "function" || typeof x === "symbol") continue;
        empty = false;
        visit(joinKey(path, key), x);
      }
      if (empty && path !== "") put(path, {});
    }
    stack.delete(v);
  };

  visit("", value);
  return out;
}

/** Rebuilds the value `flatten` produced. Throws `FlatDecodeError` on a malformed or conflicting path. */
export function unflatten(record: FlatRecord): JsonValue {
  const holder: { root?: unknown } = {};
  let n = 0;
  for (const path of Object.keys(record)) {
    n++;
    const { segments, terminal, end } = parsePath(path, 0, n);
    if (terminal.kind !== "value" || end !== path.length || segments.includes(APPEND)) {
      throw new FlatDecodeError(`Invalid path '${path}'`, n, end + 1);
    }
    const leaf = record[path];
    assign(holder, segments as Segment[], Array.isArray(leaf) ? [] : leaf !== null && typeof leaf === "object" ? {} : leaf, true, n);
  }
  return ("root" in holder ? holder.root : {}) as JsonValue;
}
