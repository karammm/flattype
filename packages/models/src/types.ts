import type { EncodeOptions } from "@flattype/shared";

/** Built-in field types. Append `?` (e.g. `"string?"`) to also allow `null`; a missing value becomes `null`. */
export type Primitive = "string" | "number" | "integer" | "boolean" | "date" | "any";

/** How a field is declared: a type name, a nested model, `[spec]` for an array, or the long form. */
export type Spec = Primitive | `${Primitive}?` | Model<any> | readonly [Spec] | FieldOptions;

export interface FieldOptions {
  type: Primitive | Model<any> | readonly [Spec];
  /** Leave the field out when the input doesn't have it. */
  optional?: boolean;
  /** Allow `null`. */
  nullable?: boolean;
  /** Used when the input is missing or `null`. A function is called each time (for arrays, dates…). */
  default?: unknown;
  /** Read from (and serialize to) this input key instead of the field name. */
  from?: string;
}

export type Shape = Record<string, Spec>;

/** Key style of the API. */
export type KeyStyle = "auto" | "snake" | "exact";

export interface ModelOptions {
  /**
   * `"auto"` (default): read `createdAt` or `created_at`, serialize as written in the model.
   * `"snake"`: the API uses snake_case both ways. `"exact"`: only the field name.
   */
  keys?: KeyStyle;
  /** Convert compatible values, e.g. `"42"` → `42` or `"true"` → `true`. Default `true`. */
  coerce?: boolean;
}

export interface Issue {
  /** Where the problem is, e.g. `users[2].address.city`. */
  path: string;
  message: string;
}

export type SafeResult<T> = { ok: true; value: T } | { ok: false; error: import("./error.js").ModelError };

export interface Model<T> {
  readonly shape: Shape;
  readonly options: Readonly<Required<ModelOptions>>;
  /** Maps a JSON value, or a Flat Notation string, to a typed object. Throws `ModelError`. */
  parse(input: unknown): T;
  /** Like `parse`, but returns `{ ok, value | error }` instead of throwing. */
  safeParse(input: unknown): SafeResult<T>;
  /** Maps an array (or Flat Notation for one). Throws `ModelError`. */
  parseList(input: unknown): T[];
  /** Turns a typed object back into API-shaped JSON (dates as ISO strings, API key names). */
  serialize(value: T): Record<string, unknown>;
  /** `serialize`, then Flat Notation. */
  encode(value: T | T[], options?: EncodeOptions): string;
  /** @internal */
  readonly __model: true;
}

type PrimitiveOut<P> = P extends "string"
  ? string
  : P extends "number" | "integer"
    ? number
    : P extends "boolean"
      ? boolean
      : P extends "date"
        ? Date
        : unknown;

type TypeOut<S> =
  S extends Model<infer T>
    ? T
    : S extends `${infer P extends Primitive}?`
      ? PrimitiveOut<P> | null
      : S extends Primitive
        ? PrimitiveOut<S>
        : S extends readonly [infer E]
          ? TypeOut<E>[]
          : S extends { type: infer E }
            ? S extends { default: {} }
              ? TypeOut<E>
              : S extends { nullable: true }
                ? TypeOut<E> | null
                : TypeOut<E>
            : never;

type OptionalKeys<S> = {
  [K in keyof S]: S[K] extends { optional: true } ? (S[K] extends { default: {} } ? never : K) : never;
}[keyof S];

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The object type a shape produces. */
export type InferShape<S> = Simplify<
  { -readonly [K in Exclude<keyof S, OptionalKeys<S>>]: TypeOut<S[K]> } & {
    -readonly [K in OptionalKeys<S>]?: TypeOut<S[K]>;
  }
>;

/** `type User = Infer<typeof User>` */
export type Infer<M> = M extends Model<infer T> ? T : never;
