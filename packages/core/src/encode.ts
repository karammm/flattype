import type { EncodeOptions } from "@flattype/shared";
import { formatPrimitive, joinKey } from "./syntax.js";

type Obj = Record<string, unknown>;

/** Applies `toJSON` (e.g. Date → ISO string), like `JSON.stringify` does. */
function prep(v: unknown, key: string): unknown {
  if (v !== null && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON === "function") {
    return (v as { toJSON(key: string): unknown }).toJSON(key);
  }
  return v;
}

/** Values `JSON.stringify` drops from objects (and turns into `null` in arrays). */
function skippable(v: unknown): boolean {
  return v === undefined || typeof v === "function" || typeof v === "symbol";
}

function isContainer(v: unknown): v is object {
  return v !== null && typeof v === "object";
}

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
 */
export function encode(value: unknown, options: EncodeOptions = {}): string {
  const delimiter = options.delimiter ?? ",";
  const pad = " ".repeat(options.indent ?? 2);
  const tabular = options.tabular !== "off";
  const sep = delimiter === "," ? ", " : delimiter === "|" ? " | " : "\t";
  const mark = delimiter === "," ? "" : delimiter;
  const out: string[] = [];
  const stack: object[] = [];

  const enter = (v: object): void => {
    if (stack.includes(v)) throw new TypeError("Converting circular structure to Flat Notation");
    stack.push(v);
  };
  const cell = (v: unknown): string => formatPrimitive(v, delimiter);

  function visit(path: string, v: unknown): void {
    if (!isContainer(v)) {
      out.push(path + ": " + formatPrimitive(v));
      return;
    }
    enter(v);
    if (Array.isArray(v)) visitArray(path, v);
    else visitObject(path, v as Obj);
    stack.pop();
  }

  function visitObject(path: string, obj: Obj): void {
    let empty = true;
    for (const key of Object.keys(obj)) {
      const child = prep(obj[key], key);
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
      let x = prep(arr[i], String(i));
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

  /** Collects the leaf paths and values of one row. False if the row can't be a table row. */
  function flattenRow(obj: Obj, prefix: string, keys: string[], vals: unknown[]): boolean {
    let any = false;
    for (const key of Object.keys(obj)) {
      const v = prep(obj[key], key);
      if (skippable(v)) continue;
      any = true;
      const p = joinKey(prefix, key);
      if (isContainer(v)) {
        if (Array.isArray(v) || stack.includes(v)) return false;
        stack.push(v);
        const ok = flattenRow(v as Obj, p, keys, vals);
        stack.pop();
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
    for (const item of items) {
      if (!isContainer(item) || Array.isArray(item) || stack.includes(item)) return false;
      const keys: string[] = [];
      const vals: unknown[] = [];
      stack.push(item);
      const ok = flattenRow(item as Obj, "", keys, vals);
      stack.pop();
      if (!ok) return false;
      if (header === undefined) header = keys;
      else if (keys.length !== header.length || keys.some((k, i) => k !== header![i])) return false;
      rows.push(pad + vals.map(cell).join(sep));
    }
    out.push(path + "[" + items.length + mark + "]{" + header!.join(delimiter) + "}:");
    for (const row of rows) out.push(row);
    return true;
  }

  const root = prep(value, "");
  if (skippable(root)) throw new TypeError(`Cannot encode ${typeof root}`);
  visit("", root);
  return out.join("\n");
}
