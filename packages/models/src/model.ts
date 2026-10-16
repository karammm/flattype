import { decode, encode } from "@flattype/core";
import { toSnake } from "./case.js";
import { ModelError } from "./error.js";
import type { InferShape, Issue, Model, ModelOptions, Primitive, Shape, Spec } from "./types.js";

type Compiled =
  | { t: "prim"; p: Primitive }
  | { t: "model"; m: Model<unknown> }
  | { t: "array"; of: Compiled };

interface Field {
  name: string;
  sources: string[];
  output: string;
  type: Compiled;
  optional: boolean;
  nullable: boolean;
  hasDefault: boolean;
  default: unknown;
}

const PRIMITIVES = new Set(["string", "number", "integer", "boolean", "date", "any"]);
const FAIL = Symbol("fail");
// No overlapping quantifiers (`\d+\.?\d*` would backtrack quadratically on long digit runs).
const NUMERIC = /^\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?\s*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function isModel(v: unknown): v is Model<unknown> {
  return typeof v === "object" && v !== null && (v as { __model?: unknown }).__model === true;
}

function compileType(spec: unknown, where: string): Compiled {
  if (typeof spec === "string" && PRIMITIVES.has(spec)) return { t: "prim", p: spec as Primitive };
  if (isModel(spec)) return { t: "model", m: spec };
  if (Array.isArray(spec) && spec.length === 1) return { t: "array", of: compileField(where, spec[0] as Spec).type };
  throw new TypeError(`Invalid type for field '${where}': ${JSON.stringify(spec)}`);
}

function compileField(name: string, spec: Spec, keys = "auto"): Field {
  let opts: { type: unknown; optional?: boolean; nullable?: boolean; default?: unknown; from?: string };
  if (typeof spec === "string" && spec.endsWith("?")) {
    opts = { type: spec.slice(0, -1), nullable: true };
  } else if (typeof spec === "object" && spec !== null && !Array.isArray(spec) && !isModel(spec)) {
    opts = spec as typeof opts;
  } else {
    opts = { type: spec };
  }
  const snake = toSnake(name);
  const sources = opts.from
    ? [opts.from]
    : keys === "exact"
      ? [name]
      : keys === "snake"
        ? [...new Set([snake, name])]
        : [...new Set([name, snake])];
  const output = opts.from ?? (keys === "snake" ? snake : name);
  // `"string?"` means "null or missing → null"; the long form's `nullable` only allows null.
  const sugar = typeof spec === "string" && spec.endsWith("?");
  return {
    name,
    sources,
    output,
    type: compileType(opts.type, name),
    optional: opts.optional === true,
    nullable: opts.nullable === true,
    hasDefault: sugar || "default" in opts,
    default: sugar ? null : opts.default,
  };
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "string") return `string ${JSON.stringify(v.length > 30 ? v.slice(0, 30) + "…" : v)}`;
  return typeof v;
}

function convertPrimitive(p: Primitive, v: unknown, coerce: boolean): unknown {
  switch (p) {
    case "any":
      return v;
    case "string":
      if (typeof v === "string") return v;
      return coerce && (typeof v === "number" || typeof v === "boolean") ? String(v) : FAIL;
    case "number":
    case "integer": {
      let n: unknown = v;
      if (typeof v === "string" && coerce && NUMERIC.test(v)) n = Number(v);
      if (typeof n !== "number" || !Number.isFinite(n)) return FAIL;
      return p === "integer" && !Number.isInteger(n) ? FAIL : n;
    }
    case "boolean":
      if (typeof v === "boolean") return v;
      if (!coerce) return FAIL;
      if (v === "true" || v === 1 || v === "1") return true;
      if (v === "false" || v === 0 || v === "0") return false;
      return FAIL;
    case "date": {
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? FAIL : v;
      if ((typeof v === "string" && ISO_DATE.test(v)) || (typeof v === "number" && Number.isFinite(v))) {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? FAIL : d;
      }
      return FAIL;
    }
  }
}

function join(path: string, key: string | number): string {
  return typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key;
}

/**
 * Declares a typed model for API data.
 *
 * ```ts
 * const User = defineModel({ id: "number", createdAt: "date", bio: "string?", tags: ["string"] });
 * type User = Infer<typeof User>;
 * const user = User.parse(await res.json()); // created_at → createdAt, ISO string → Date
 * ```
 */
export function defineModel<const S extends Shape>(shape: S, options: ModelOptions = {}): Model<InferShape<S>> {
  const opts = { keys: options.keys ?? "auto", coerce: options.coerce !== false } as const;
  const fields = Object.keys(shape).map((name) => compileField(name, shape[name]!, opts.keys));
  const hasOwn = Object.prototype.hasOwnProperty;

  function convert(c: Compiled, v: unknown, path: string, issues: Issue[]): unknown {
    if (c.t === "prim") {
      const out = convertPrimitive(c.p, v, opts.coerce);
      if (out === FAIL) issues.push({ path, message: `Expected ${c.p}, got ${describe(v)}` });
      return out;
    }
    if (c.t === "model") return (c.m as unknown as Internal).read(v, path, issues);
    if (!Array.isArray(v)) {
      issues.push({ path, message: `Expected array, got ${describe(v)}` });
      return FAIL;
    }
    return v.map((x, i) => convert(c.of, x, join(path, i), issues));
  }

  function read(input: unknown, path: string, issues: Issue[]): unknown {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      issues.push({ path, message: `Expected object, got ${describe(input)}` });
      return FAIL;
    }
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      let v: unknown;
      for (const key of f.sources) {
        if (hasOwn.call(src, key) && src[key] !== undefined) {
          v = src[key];
          break;
        }
      }
      const at = join(path, f.name);
      if (v === undefined || v === null) {
        if (f.hasDefault) out[f.name] = typeof f.default === "function" ? (f.default as () => unknown)() : f.default;
        else if (v === null && f.nullable) out[f.name] = null;
        else if (v === undefined && f.optional) continue;
        else issues.push({ path: at, message: v === null ? `Expected ${typeName(f.type)}, got null` : "Required" });
        continue;
      }
      out[f.name] = convert(f.type, v, at, issues);
    }
    return out;
  }

  function write(c: Compiled, v: unknown): unknown {
    if (v === null || v === undefined) return null;
    if (c.t === "prim") return v instanceof Date ? v.toISOString() : v;
    if (c.t === "model") return c.m.serialize(v);
    return (v as unknown[]).map((x) => write(c.of, x));
  }

  const parseOrThrow = (input: unknown, list: boolean): unknown => {
    const data = typeof input === "string" ? decode(input) : input;
    const issues: Issue[] = [];
    let out: unknown;
    if (list) {
      if (!Array.isArray(data)) throw new ModelError([{ path: "", message: `Expected array, got ${describe(data)}` }]);
      out = data.map((x, i) => read(x, `[${i}]`, issues));
    } else {
      out = read(data, "", issues);
    }
    if (issues.length) throw new ModelError(issues);
    return out;
  };

  const model: Model<InferShape<S>> & Internal = {
    shape,
    options: opts,
    __model: true,
    read,
    parse: (input) => parseOrThrow(input, false) as InferShape<S>,
    parseList: (input) => parseOrThrow(input, true) as InferShape<S>[],
    safeParse(input) {
      try {
        return { ok: true, value: parseOrThrow(input, false) as InferShape<S> };
      } catch (error) {
        if (error instanceof ModelError) return { ok: false, error };
        throw error;
      }
    },
    serialize(value) {
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const f of fields) {
        if (src[f.name] === undefined && f.optional) continue;
        out[f.output] = write(f.type, src[f.name]);
      }
      return out;
    },
    encode(value, encodeOptions) {
      const json = Array.isArray(value) ? value.map((v) => model.serialize(v)) : model.serialize(value);
      return encode(json, encodeOptions);
    },
  };
  return model;
}

interface Internal {
  read(input: unknown, path: string, issues: Issue[]): unknown;
}

function typeName(c: Compiled): string {
  return c.t === "prim" ? c.p : c.t === "model" ? "object" : "array";
}
