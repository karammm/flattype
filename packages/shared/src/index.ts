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

/** One table row, passed to `onRow` as soon as its line has been read. */
export interface TableRow {
  /** Path of the table, e.g. `"users"` or `"data.items"`; `""` for a root table. */
  path: string;
  /** Row number within the table, from 0. */
  index: number;
  value: JsonValue;
}

export interface DecoderOptions extends DecodeOptions {
  onRow?: (row: TableRow) => void;
  /** Keep rows in the decoded result. `false` passes them only to `onRow`. Default `true`. */
  keepRows?: boolean;
}

export interface Decoder {
  /** Feeds the next chunk of text. Chunks may split lines anywhere. */
  write(chunk: string): void;
  /** Finishes decoding and returns the value. */
  end(): JsonValue;
}
