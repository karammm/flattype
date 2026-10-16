import type { EncodeOptions, Replacer } from "@flattype/shared";
import { formatPrimitive, joinKey } from "./syntax.js";

type Obj = Record<string, unknown>;

/** Values `JSON.stringify` drops from objects (and turns into `null` in arrays). */
function skippable(v: unknown): boolean {
  return v === undefined || typeof v === "function" || typeof v === "symbol";
}

function isContainer(v: unknown): v is object {
  return v !== null && typeof v === "object";
}

const hasOwn = Object.prototype.hasOwnProperty;

/**
 * Encodes any JSON-serializable value as Flat Notation:
 *
 * ```
 * name: John
 * address.city: New York
 * tags[]: admin, editor
 * users[2]{id,name}:
 *   1, Alice
 *   2, Bob
 * ```
 *
 * `decode(encode(x))` deep-equals `JSON.parse(JSON.stringify(x))`.
 *
 * With `refs: true`, an object that appears more than once (including a cycle) is written in full the first
 * time and as `path = first.path` after that; `decode(text, { refs: true })` rebuilds the same object graph.
 */
export function encode(value: unknown, options: EncodeOptions = {}): string {
  const delimiter = options.delimiter ?? ",";
  const pad = " ".repeat(options.indent ?? 2);
  const tabular = options.tabular !== "off";
  const sep = delimiter === "," ? ", " : delimiter === "|" ? " | " : "\t";
  const mark = delimiter === "," ? "" : delimiter;
  const replacer: Replacer | undefined = typeof options.replacer === "function" ? options.replacer : undefined;
  const allow = Array.isArray(options.replacer) ? [...new Set(options.replacer.map(String))] : undefined;
  const out: string[] = [];
  // Containers on the current path (cycle check), or with `refs`, every container and where it was written.
  const stack = new Set<object>();
  const seen = options.refs ? new Map<object, string>() : undefined;

  /** `holder[key]` after `toJSON` and the replacer, like `JSON.stringify` does it. */
  const prep = (holder: object, key: string): unknown => {
    let v = (holder as Obj)[key];
    if (isContainer(v) && typeof (v as { toJSON?: unknown }).toJSON === "function") {
      v = (v as { toJSON(key: string): unknown }).toJSON(key);
    }
    return replacer ? replacer.call(holder, key, v) : v;
  };
  // An array replacer lists the object keys to keep, in its order. Arrays keep every item.
  const keysOf = (obj: object): string[] => (allow ? allow.filter((k) => hasOwn.call(obj, k)) : Object.keys(obj));
  const cell = (v: unknown): string => formatPrimitive(v, delimiter);

  function visit(path: string, v: unknown): void {
    if (!isContainer(v)) {
      out.push(path + ": " + formatPrimitive(v));
      return;
    }
    if (seen) {
      const first = seen.get(v);
      if (first !== undefined) {
        out.push(path + " = " + (first === "" ? "~" : first));
        return;
      }
      seen.set(v, path);
    } else {
      if (stack.has(v)) throw new TypeError("Converting circular structure to Flat Notation (use { refs: true })");
      stack.add(v);
    }
    if (Array.isArray(v)) visitArray(path, v);
    else visitObject(path, v);
    stack.delete(v);
  }

  function visitObject(path: string, obj: object): void {
    let empty = true;
    for (const key of keysOf(obj)) {
      const child = prep(obj, key);
      if (skippable(child)) continue;
      empty = false;
      visit(joinKey(path, key), child);
    }
    // An empty root object is an empty document.
    if (empty && path !== "") out.push(path + ": {}");
  }

  function visitArray(path: string, arr: unknown[]): void {
    const n = arr.length;
    if (n === 0) {
      out.push(path + ": []");
      return;
    }
    const items = new Array<unknown>(n);
    let primitives = true;
    for (let i = 0; i < n; i++) {
      let x = prep(arr, String(i));
      if (skippable(x)) x = null;
      items[i] = x;
      if (isContainer(x)) primitives = false;
    }
    if (primitives) {
      out.push(path + "[" + mark + "]: " + items.map(cell).join(sep));
      return;
    }
    if (tabular && table(path, items)) return;
    for (let i = 0; i < n; i++) visit(path + "[" + i + "]", items[i]);
  }

  /**
   * True if `v` can't go in a table row: it is on the current path (a cycle), or with `refs`, it was already
   * written or appears twice in this table. Otherwise, with `refs`, claims it for `path`.
   */
  const taken = (v: object, path: string, claimed: Map<object, string>): boolean => {
    if (stack.has(v)) return true;
    if (!seen) return false;
    if (claimed.has(v) || seen.has(v)) return true;
    claimed.set(v, path);
    return false;
  };

  /** Collects the leaf paths and values of one row. False if the row can't be a table row. */
  function flattenRow(obj: object, prefix: string, at: string, keys: string[], vals: unknown[], claimed: Map<object, string>): boolean {
    let any = false;
    for (const key of keysOf(obj)) {
      const v = prep(obj, key);
      if (skippable(v)) continue;
      any = true;
      const p = joinKey(prefix, key);
      if (isContainer(v)) {
        if (Array.isArray(v) || taken(v, at + "." + p, claimed)) return false;
        stack.add(v);
        const ok = flattenRow(v, p, at, keys, vals, claimed);
        stack.delete(v);
        if (!ok) return false;
      } else {
        keys.push(p);
        vals.push(v);
      }
    }
    return any;
  }

  /** Writes same-shaped objects as `path[n]{a,b.c}:` plus one row each. */
  function table(path: string, items: unknown[]): boolean {
    let header: string[] | undefined;
    const rows: string[] = [];
    const claimed = new Map<object, string>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const at = path + "[" + i + "]";
      if (!isContainer(item) || Array.isArray(item) || taken(item, at, claimed)) return false;
      const keys: string[] = [];
      const vals: unknown[] = [];
      stack.add(item);
      const ok = flattenRow(item, "", at, keys, vals, claimed);
      stack.delete(item);
      if (!ok) return false;
      if (header === undefined) header = keys;
      else if (keys.length !== header.length || keys.some((k, j) => k !== header![j])) return false;
      rows.push(pad + vals.map(cell).join(sep));
    }
    if (seen) for (const [v, p] of claimed) seen.set(v, p);
    out.push(path + "[" + items.length + mark + "]{" + header!.join(delimiter) + "}:");
    for (const row of rows) out.push(row);
    return true;
  }

  const root = prep({ "": value }, "");
  if (skippable(root)) throw new TypeError(`Cannot encode ${typeof root}`);
  visit("", root);
  return out.join("\n");
}
