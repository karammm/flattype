export type {
  Decoder,
  DecoderOptions,
  DecodeOptions,
  Delimiter,
  EncodeOptions,
  FlatLeaf,
  FlatRecord,
  JsonPrimitive,
  JsonValue,
  TableRow,
} from "@flattype/shared";
export { encode } from "./encode.js";
export { createDecoder, decode } from "./decode.js";
export { flatten, unflatten } from "./flatten.js";
export { stats, type FlatStats } from "./stats.js";
export { FlatDecodeError } from "./syntax.js";

/** Media type for Flat Notation over HTTP. */
export const MEDIA_TYPE = "text/x-flat";
