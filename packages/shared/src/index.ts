/** Any value `JSON.parse` can return. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Cell separator for inline arrays and table rows. */
export type Delimiter = "," | "|" | "\t";

export interface EncodeOptions {
  /** Separator for inline arrays and table rows. Default `","`. */
  delimiter?: Delimiter;
  /** Spaces before each table row. Default `2`. */
  indent?: number;
  /** `"auto"` writes arrays of same-shaped objects as tables (header once, then rows). Default `"auto"`. */
  tabular?: "auto" | "off";
}

export interface DecodeOptions {
  /** Throw on malformed input (default). Set `false` to recover what it can, e.g. from LLM output. */
  strict?: boolean;
}

/** A leaf in a flattened record: a primitive, or an empty object/array that has no leaves of its own. */
export type FlatLeaf = JsonPrimitive | Record<string, never> | never[];

/** Path → leaf, e.g. `{ "user.name": "John", "tags[0]": "a" }`. */
export type FlatRecord = Record<string, FlatLeaf>;
