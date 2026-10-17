import { decode } from "@flattype/core";
import { toCamel, toSnake } from "./case.js";
import { defineModel, isModel } from "./model.js";
import type { FieldOptions, KeyStyle, Model, Primitive, Shape, Spec } from "./types.js";

type Node =
  | { k: "prim"; p: Primitive; nullable: boolean }
  | { k: "object"; n: number; nullable: boolean; fields: Map<string, { node: Node; count: number }> }
  | { k: "array"; of: Node | undefined; nullable: boolean }
  | { k: "null" };

const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/;

function nodeOf(v: unknown): Node {
  if (v === null || v === undefined) return { k: "null" };
  if (Array.isArray(v)) {
    let of: Node | undefined;
    for (const x of v) of = of ? merge(of, nodeOf(x)) : nodeOf(x);
    return { k: "array", of, nullable: false };
  }
  switch (typeof v) {
    case "string":
      return { k: "prim", p: ISO.test(v) && !Number.isNaN(Date.parse(v)) ? "date" : "string", nullable: false };
    case "number":
      return { k: "prim", p: "number", nullable: false };
    case "bigint":
      return { k: "prim", p: "bigint", nullable: false };
    case "boolean":
      return { k: "prim", p: "boolean", nullable: false };
    case "object": {
      const fields = new Map<string, { node: Node; count: number }>();
      for (const [key, x] of Object.entries(v as Record<string, unknown>)) fields.set(key, { node: nodeOf(x), count: 1 });
      return { k: "object", n: 1, nullable: false, fields };
    }
    default:
      return { k: "prim", p: "any", nullable: false };
  }
}

function merge(a: Node, b: Node): Node {
  if (a.k === "null") return b.k === "null" ? a : { ...b, nullable: true };
  if (b.k === "null") return { ...a, nullable: true };
  const nullable = a.nullable || b.nullable;
  if (a.k === "prim" && b.k === "prim") {
    // IDs that are sometimes small and sometimes beyond 2^53 are BigInts.
    const big = (a.p === "bigint" && b.p === "number") || (a.p === "number" && b.p === "bigint");
    return { k: "prim", p: a.p === b.p ? a.p : big ? "bigint" : "any", nullable };
  }
  if (a.k === "array" && b.k === "array") {
    const of = a.of && b.of ? merge(a.of, b.of) : (a.of ?? b.of);
    return { k: "array", of, nullable };
  }
  if (a.k === "object" && b.k === "object") {
    const fields = new Map(a.fields);
    for (const [key, f] of b.fields) {
      const prev = fields.get(key);
      fields.set(key, prev ? { node: merge(prev.node, f.node), count: prev.count + f.count } : f);
    }
    return { k: "object", n: a.n + b.n, nullable, fields };
  }
  return { k: "prim", p: "any", nullable };
}

function toSpec(node: Node | undefined, keys: KeyStyle): { spec: Spec; nullable: boolean } {
  if (!node || node.k === "null") return { spec: "any", nullable: false };
  if (node.k === "prim") return { spec: node.p, nullable: node.nullable };
  if (node.k === "array") return { spec: [toSpec(node.of, keys).spec] as const, nullable: node.nullable };
  return { spec: toModel(node, keys), nullable: node.nullable };
}

function toModel(node: Extract<Node, { k: "object" }>, keys: KeyStyle): Model<unknown> {
  const style: KeyStyle = keys !== "auto" ? keys : [...node.fields.keys()].some((k) => k.includes("_")) ? "snake" : "auto";
  const shape: Record<string, Spec> = {};
  for (const [key, f] of node.fields) {
    const camel = toCamel(key);
    const name = /^[A-Za-z_$][\w$]*$/.test(camel) && !(camel in shape) ? camel : key;
    const { spec, nullable } = toSpec(f.node, keys);
    const optional = f.count < node.n;
    const read = style === "snake" ? toSnake(name) : name;
    const from = read !== key ? key : undefined;
    if (!optional && !from && nullable && typeof spec === "string") {
      shape[name] = `${spec as Primitive}?`;
    } else if (!optional && !from && !nullable) {
      shape[name] = spec;
    } else {
      const long: FieldOptions = { type: spec as FieldOptions["type"] };
      if (optional) long.optional = true;
      if (nullable) long.nullable = true;
      if (from) long.from = from;
      shape[name] = long;
    }
  }
  return defineModel(shape as Shape, style === "auto" ? {} : { keys: style }) as unknown as Model<unknown>;
}

/**
 * Builds a model from a real API response (an object, an array of objects, or Flat Notation).
 * Fields missing from some items become optional, fields that are sometimes `null` become nullable,
 * ISO date strings become `"date"`, and snake_case keys become camelCase fields.
 * Pass the result to `toSource` to get TypeScript you can commit.
 */
export function infer(sample: unknown, options: { keys?: KeyStyle } = {}): Model<Record<string, unknown>> {
  const data = typeof sample === "string" ? decode(sample, { bigint: true }) : sample;
  let node = nodeOf(data);
  if (node.k === "array") node = node.of ?? { k: "null" };
  if (node.k !== "object") throw new TypeError("infer() needs an object or an array of objects");
  return toModel(node, options.keys ?? "auto") as Model<Record<string, unknown>>;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

function pascal(s: string): string {
  const c = toCamel(s).replace(/[^\w$]/g, "");
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function singular(s: string): string {
  if (/ies$/.test(s)) return s.slice(0, -3) + "y";
  if (/[^s]s$/.test(s)) return s.slice(0, -1);
  return s;
}

/**
 * Prints TypeScript source for a model and the models nested in it, or for several named models at once
 * (`toSource({ User, Order })`), where a model used by another is referenced by its name, not repeated.
 */
export function toSource(model: Model<unknown>, name: string): string;
export function toSource(models: Record<string, Model<unknown>>): string;
export function toSource(modelOrModels: Model<unknown> | Record<string, Model<unknown>>, name?: string): string {
  const roots: Array<[string, Model<unknown>]> = isModel(modelOrModels)
    ? [[name ?? "Model", modelOrModels]]
    : Object.entries(modelOrModels);
  const names = new Map<Model<unknown>, string>();
  const emitted = new Set<Model<unknown>>();
  const used = new Set<string>();
  const blocks: string[] = [];

  const unique = (base: string): string => {
    let n = base || "Model";
    for (let i = 2; used.has(n); i++) n = `${base}${i}`;
    used.add(n);
    return n;
  };

  const emit = (m: Model<unknown>, want: string): string => {
    let id = names.get(m);
    if (id && emitted.has(m)) return id;
    if (!id) {
      id = unique(want);
      names.set(m, id);
    }
    emitted.add(m);
    const lines: string[] = [];
    for (const [field, spec] of Object.entries(m.shape)) {
      const key = IDENT.test(field) ? field : JSON.stringify(field);
      lines.push(`  ${key}: ${print(spec, id + pascal(singular(field)))},`);
    }
    const opts: string[] = [];
    if (m.options.keys !== "auto") opts.push(`keys: ${JSON.stringify(m.options.keys)}`);
    if (!m.options.coerce) opts.push("coerce: false");
    const tail = opts.length ? `, { ${opts.join(", ")} }` : "";
    blocks.push(`export const ${id} = defineModel({\n${lines.join("\n")}\n}${tail});\nexport type ${id} = Infer<typeof ${id}>;`);
    return id;
  };

  const print = (spec: unknown, nested: string): string => {
    if (typeof spec === "string") return JSON.stringify(spec);
    if (isModel(spec)) return emit(spec, nested);
    if (Array.isArray(spec)) return `[${print(spec[0], nested)}]`;
    const o = spec as FieldOptions;
    const parts = [`type: ${print(o.type, nested)}`];
    if (o.optional) parts.push("optional: true");
    if (o.nullable) parts.push("nullable: true");
    if ("default" in o) parts.push(`default: ${typeof o.default === "function" ? String(o.default) : JSON.stringify(o.default)}`);
    if (o.from !== undefined) parts.push(`from: ${JSON.stringify(o.from)}`);
    return `{ ${parts.join(", ")} }`;
  };

  // Claim the given names first, so references to these models use them.
  for (const [n, m] of roots) if (!names.has(m)) names.set(m, unique(pascal(n)));
  for (const [, m] of roots) emit(m, names.get(m)!);
  return `import { defineModel, type Infer } from "@flattype/models";\n\n${blocks.join("\n\n")}\n`;
}
