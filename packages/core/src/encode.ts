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
  // 1.1: tables with optional fields, and `[+]` items for the arrays that still can't be tables.
  const v11 = options.target !== "1.0";
  // Table rows are pushed with a leading "\n" (no other line can contain one) so `[+]` items can tell them
  // apart from path lines. It is removed when the lines are joined.
  const out: string[] = [];
  let inItem = 0;
  let refLines = 0;
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
        refLines++;
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
    for (let i = 0; i < n; i++) item(path, i, items[i]);
  }

  /**
   * One element of an array written line by line. In 1.1 its first line says `path[+]` and the others go on
   * with `.`, so the lines repeat instead of counting up (much better for gzip). Inside an item, and for an
   * item whose lines go on with an index (an array of arrays) or hold a reference, the index is written.
   */
  function item(path: string, i: number, x: unknown): void {
    const at = path + "[" + i + "]";
    if (!v11 || inItem > 0) return visit(at, x);
    const start = out.length;
    const refsBefore = refLines;
    inItem++;
    visit(at, x);
    inItem--;
    if (refLines > refsBefore && out.length > start + 1) return;
    const cut = at.length;
    for (let k = start + 1; k < out.length; k++) if (out[k]!.charCodeAt(0) !== 10 && out[k]!.charCodeAt(cut) === 91) return;
    out[start] = path + "[+]" + out[start]!.slice(cut);
    for (let k = start + 1; k < out.length; k++) if (out[k]!.charCodeAt(0) !== 10) out[k] = out[k]!.slice(cut);
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

  /**
   * Writes objects as `path[n]{a,b.c}:` plus one row each. In 1.1 the rows may have different keys: the header
   * is all of them (`phone?` for those some rows lack), and a row leaves the cell of a missing key empty.
   */
  function table(path: string, items: unknown[]): boolean {
    const keyRows: string[][] = [];
    const valRows: unknown[][] = [];
    let same = true;
    const claimed = new Map<object, string>();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const at = path + "[" + i + "]";
      if (!isContainer(it) || Array.isArray(it) || taken(it, at, claimed)) return false;
      const keys: string[] = [];
      const vals: unknown[] = [];
      stack.add(it);
      const ok = flattenRow(it, "", at, keys, vals, claimed);
      stack.delete(it);
      if (!ok) return false;
      const first = keyRows[0];
      if (same && first && (keys.length !== first.length || keys.some((k, j) => k !== first[j]))) {
        if (!v11) return false;
        same = false;
      }
      keyRows.push(keys);
      valRows.push(vals);
    }
    const merged = same ? { fields: keyRows[0]!, optional: new Set<string>() } : mergeFields(keyRows);
    if (!merged) return false;
    const { fields, optional } = merged;
    const index = new Map(fields.map((f, j) => [f, j]));
    if (seen) for (const [v, p] of claimed) seen.set(v, p);
    out.push(path + "[" + items.length + mark + "]{" + fields.map((f) => (optional.has(f) ? f + "?" : f)).join(delimiter) + "}:");
    for (let r = 0; r < valRows.length; r++) {
      let cells = valRows[r]!.map(cell);
      if (!same) {
        const sparse = fields.map(() => "");
        keyRows[r]!.forEach((k, j) => (sparse[index.get(k)!] = cells[j]!));
        cells = sparse;
      }
      // An empty last cell would leave a space at the end of the line.
      const row = pad + cells.join(sep);
      out.push("\n" + (same ? row : row.replace(/ +$/, "")));
    }
    return true;
  }

  const root = prep({ "": value }, "");
  if (skippable(root)) throw new TypeError(`Cannot encode ${typeof root}`);
  visit("", root);
  return out.map((line) => (line.charCodeAt(0) === 10 ? line.slice(1) : line)).join("\n");
}

/**
 * The header of a table whose rows have different keys: every key, in an order that keeps each row's keys in
 * their order. A key not seen before goes just before the next key of its row that the header has, or at the
 * end. `undefined` when there is no such order, when no key is in every row, when a key is a prefix of another
 * (`a` and `a.b`), or when the header would be more than twice as wide as the widest row.
 */
function mergeFields(rows: string[][]): { fields: string[]; optional: Set<string> } | undefined {
  const widest = rows.reduce((w, keys) => Math.max(w, keys.length), 0);
  const fields: string[] = [];
  const count = new Map<string, number>();
  for (const keys of rows) {
    let at = 0;
    for (let j = 0; j < keys.length; j++) {
      const k = keys[j]!;
      let i = fields.indexOf(k);
      if (i < 0) {
        if (fields.length === 2 * widest) return;
        const next = keys.slice(j + 1).find((n) => count.has(n));
        i = next === undefined ? fields.length : fields.indexOf(next);
        fields.splice(i, 0, k);
      }
      if (i < at) return;
      at = i + 1;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  const optional = new Set(fields.filter((f) => count.get(f)! < rows.length));
  if (optional.size === fields.length || fields.some((a) => fields.some((b) => b.startsWith(a + ".")))) return;
  return { fields, optional };
}
