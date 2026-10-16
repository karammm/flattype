import type { EncodeOptions } from "@flattype/shared";
import { encode } from "./encode.js";

export interface FlatStats {
  /** UTF-8 bytes of minified `JSON.stringify(value)`. */
  jsonBytes: number;
  /** UTF-8 bytes of `encode(value, options)`. */
  flatBytes: number;
  /** Fraction saved, e.g. `0.42` for 42% smaller. Negative if Flat Notation is larger. */
  saved: number;
}

const utf8 = new TextEncoder();

/** Compares the size of a value as minified JSON and as Flat Notation. */
export function stats(value: unknown, options?: EncodeOptions): FlatStats {
  const jsonBytes = utf8.encode(JSON.stringify(value)).length;
  const flatBytes = utf8.encode(encode(value, options)).length;
  return { jsonBytes, flatBytes, saved: jsonBytes === 0 ? 0 : 1 - flatBytes / jsonBytes };
}
