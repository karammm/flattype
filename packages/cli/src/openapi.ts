import { defineModel, toCamel, toSnake, type FieldOptions, type KeyStyle, type Model, type Primitive, type Spec } from "@flattype/models";

type Schema = Record<string, unknown>;

export interface OpenAPIResult {
  /** One model per object schema, keyed by schema name. Pass to `toSource` from `@flattype/models`. */
  models: Record<string, Model<unknown>>;
  /** Things that couldn't be mapped exactly (they became `"any"`). */
  warnings: string[];
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
const isObj = (v: unknown): v is Schema => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Builds models from an OpenAPI 3.x document (or Swagger 2 `definitions`): one model per object schema in
 * `components.schemas`, with `$ref`s pointing at each other, `required` for optional fields, `nullable` /
 * `type: [..., "null"]` for nullable ones, and `date-time` / `date` strings as dates.
 */
export function fromOpenAPI(document: unknown, options: { schemas?: string[] } = {}): OpenAPIResult {
  const doc = isObj(document) ? document : {};
  const components = isObj(doc.components) ? doc.components : {};
  const all: Schema = isObj(components.schemas) ? components.schemas : isObj(doc.definitions) ? doc.definitions : {};
  const warnings: string[] = [];
  const built = new Map<string, Model<unknown>>();
  const building = new Set<string>();

  const deref = (ref: string): { name: string; schema: Schema } | undefined => {
    const name = decodeURIComponent(ref.split("/").pop()!.replace(/~1/g, "/").replace(/~0/g, "~"));
    const schema = all[name];
    if (!isObj(schema)) {
      warnings.push(`Unresolved $ref ${ref}`);
      return undefined;
    }
    return { name, schema };
  };

  /** Properties and required keys of an object schema, merging `allOf` parts. */
  const objectParts = (schema: Schema): { properties: Schema; required: Set<string> } | undefined => {
    const properties: Schema = {};
    const required = new Set<string>();
    const add = (s: Schema): void => {
      if (typeof s.$ref === "string") {
        const r = deref(s.$ref);
        if (r) add(r.schema);
        return;
      }
      if (isObj(s.properties)) Object.assign(properties, s.properties);
      if (Array.isArray(s.required)) for (const k of s.required) required.add(String(k));
      if (Array.isArray(s.allOf)) for (const part of s.allOf) if (isObj(part)) add(part);
    };
    add(schema);
    return Object.keys(properties).length ? { properties, required } : undefined;
  };

  const isObjectSchema = (schema: Schema): boolean => objectParts(schema) !== undefined;

  const build = (name: string): Model<unknown> | undefined => {
    const done = built.get(name);
    if (done) return done;
    if (building.has(name)) return undefined; // a cycle: the caller falls back to "any"
    building.add(name);
    const model = buildObject(all[name] as Schema, name);
    building.delete(name);
    if (model) built.set(name, model);
    return model;
  };

  const toSpec = (schema: unknown, where: string): { spec: Spec; nullable: boolean } => {
    if (!isObj(schema)) return { spec: "any", nullable: false };
    if (typeof schema.$ref === "string") {
      const r = deref(schema.$ref);
      if (!r) return { spec: "any", nullable: false };
      if (isObjectSchema(r.schema)) {
        const model = build(r.name);
        if (!model) {
          warnings.push(`${where}: recursive reference to ${r.name} is typed as "any"`);
          return { spec: "any", nullable: false };
        }
        return { spec: model, nullable: schema.nullable === true };
      }
      return toSpec(r.schema, where);
    }
    let nullable = schema.nullable === true;
    for (const key of ["oneOf", "anyOf"] as const) {
      const options = schema[key];
      if (!Array.isArray(options)) continue;
      const nonNull = options.filter((o) => !(isObj(o) && o.type === "null"));
      if (nonNull.length === 1) {
        const inner = toSpec(nonNull[0], where);
        return { spec: inner.spec, nullable: inner.nullable || nonNull.length < options.length || nullable };
      }
      warnings.push(`${where}: ${key} with ${nonNull.length} alternatives is typed as "any"`);
      return { spec: "any", nullable };
    }
    if (Array.isArray(schema.allOf) && !schema.properties) {
      const refs = schema.allOf.filter(isObj);
      if (refs.length === 1) return toSpec(refs[0], where);
    }
    let type = schema.type;
    if (Array.isArray(type)) {
      nullable ||= type.includes("null");
      const rest = type.filter((t) => t !== "null");
      if (rest.length !== 1) return { spec: "any", nullable };
      type = rest[0];
    }
    if (type === undefined && (schema.properties || schema.allOf)) type = "object";
    switch (type) {
      case "string":
        return { spec: schema.format === "date-time" || schema.format === "date" ? "date" : "string", nullable };
      case "integer":
        return { spec: "integer", nullable };
      case "number":
        return { spec: "number", nullable };
      case "boolean":
        return { spec: "boolean", nullable };
      case "array": {
        const item = toSpec(schema.items, `${where}[]`);
        const itemSpec = item.nullable && typeof item.spec === "string" ? (`${item.spec}?` as Spec) : item.spec;
        return { spec: [itemSpec] as const, nullable };
      }
      case "object": {
        const model = buildObject(schema, where);
        return { spec: model ?? "any", nullable };
      }
      default:
        return { spec: "any", nullable };
    }
  };

  const buildObject = (schema: Schema, where: string): Model<unknown> | undefined => {
    const parts = objectParts(schema);
    if (!parts) return undefined;
    const keys = Object.keys(parts.properties);
    const style: KeyStyle = keys.some((k) => k.includes("_")) ? "snake" : "auto";
    const shape: Record<string, Spec> = {};
    for (const key of keys) {
      const camel = toCamel(key);
      const name = IDENT.test(camel) && !(camel in shape) ? camel : key;
      const { spec, nullable } = toSpec(parts.properties[key], `${where}.${key}`);
      const optional = !parts.required.has(key);
      const read = style === "snake" ? toSnake(name) : name;
      const from = read !== key ? key : undefined;
      if (!optional && !from && !nullable) shape[name] = spec;
      else if (!optional && !from && nullable && typeof spec === "string") shape[name] = `${spec as Primitive}?`;
      else {
        const long: FieldOptions = { type: spec as FieldOptions["type"] };
        if (optional) long.optional = true;
        if (nullable) long.nullable = true;
        if (from) long.from = from;
        shape[name] = long;
      }
    }
    return defineModel(shape, style === "auto" ? {} : { keys: style }) as unknown as Model<unknown>;
  };

  const wanted = options.schemas ?? Object.keys(all);
  const models: Record<string, Model<unknown>> = {};
  for (const name of wanted) {
    if (!(name in all)) {
      warnings.push(`No schema named ${name}`);
      continue;
    }
    const model = isObjectSchema(all[name] as Schema) ? build(name) : undefined;
    if (model) models[name] = model;
  }
  return { models, warnings };
}
