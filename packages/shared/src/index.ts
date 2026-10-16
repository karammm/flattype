/** Any value `JSON.parse` can return. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Cell separator for inline arrays and table rows. */
export type Delimiter = "," | "|" | "\t";

/** Like the `JSON.stringify` replacer: called with `this` set to the holder of each key. */
export type Replacer = (this: any, key: string, value: any) => any;
/** Like the `JSON.parse` reviver: called bottom-up with `this` set to the holder of each key. */
export type Reviver = (this: any, key: string, value: any) => any;

export interface EncodeOptions {
  /** Separator for inline arrays and table rows. Default `","`. */
  delimiter?: Delimiter;
  /** Spaces before each table row. Default `2`. */
  indent?: number;
  /** `"auto"` writes arrays of same-shaped objects as tables (header once, then rows). Default `"auto"`. */
  tabular?: "auto" | "off";
  /**
   * A function that can change or drop (`undefined`) each value, or a list of the object keys to keep,
   * exactly like the second argument of `JSON.stringify`.
   */
  replacer?: Replacer | (string | number)[];
  /**
   * Write an object that appears more than once (a shared object or a cycle) only once, and
   * `path = first.path` where it appears again. Without it, shared objects are repeated and cycles throw.
   * Default `false`.
   */
  refs?: boolean;
}

export interface DecodeOptions {
  /** Throw on malformed input (default). Set `false` to recover what it can, e.g. from LLM output. */
  strict?: boolean;
  /**
   * With `strict: false`: drop any line that can't be read (prose around data, a path that conflicts) as if
   * it weren't there, instead of throwing. That's what `fromModelOutput` uses. Default `false`.
   */
  skipInvalidLines?: boolean;
  /** Called for every value after decoding, bottom-up, exactly like the second argument of `JSON.parse`. */
  reviver?: Reviver;
  /**
   * Accept `path = other.path` references and rebuild the shared objects and cycles they describe.
   * Off by default: a few reference lines can describe a graph that is huge or endless when walked, so only
   * turn it on for text you trust or code that handles cycles. Without it, a reference is an error
   * (strict) or skipped (lenient).
   */
  refs?: boolean;
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
