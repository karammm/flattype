/** Errors from `decode` and `unflatten`, with the 1-based line and column of the problem. */
export class FlatDecodeError extends SyntaxError {
  constructor(
    /** The problem without its position, e.g. `Missing value`. */
    readonly reason: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${reason} (line ${line}, column ${column})`);
    this.name = "FlatDecodeError";
  }
}

/** Reports a problem lenient decoding repaired, and the `repair` it made. */
export type Warn = (reason: string, line: number, column: number, repair: string) => void;

/** Exactly the JSON number grammar. Anything else bare is a string. */
export const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const BARE_KEY = /^[A-Za-z0-9_$-]+$/;
const CONTROL = /[\u0000-\u001f]/;

/** Characters allowed in an unquoted key: A-Z a-z 0-9 _ $ - */
export function isKeyChar(code: number): boolean {
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90) ||
    (code >= 48 && code <= 57) ||
    code === 95 ||
    code === 36 ||
    code === 45
  );
}

export function formatKey(key: string): string {
  return BARE_KEY.test(key) ? key : JSON.stringify(key);
}

export function joinKey(path: string, key: string): string {
  return path === "" ? formatKey(key) : path + "." + formatKey(key);
}

/** Writes a string bare when it can't be mistaken for anything else, quoted (JSON style) otherwise. */
export function formatString(s: string, delimiter?: string): string {
  if (
    s === "" ||
    s.charCodeAt(0) === 34 ||
    s !== s.trim() ||
    s === "null" ||
    s === "true" ||
    s === "false" ||
    s === "{}" ||
    s === "[]" ||
    NUMBER.test(s) ||
    CONTROL.test(s) ||
    (delimiter !== undefined && s.includes(delimiter))
  ) {
    return JSON.stringify(s);
  }
  return s;
}

/** Formats a primitive the way `JSON.stringify` would, except for bare strings. */
export function formatPrimitive(v: unknown, delimiter?: string): string {
  switch (typeof v) {
    case "string":
      return formatString(v, delimiter);
    case "number":
      return Number.isFinite(v) ? JSON.stringify(v) : "null";
    case "boolean":
      return v ? "true" : "false";
    case "bigint":
      throw new TypeError("Do not know how to serialize a BigInt");
    default:
      return "null";
  }
}

/** Parses one trimmed bare or quoted token. Returns `undefined` when a quoted token is malformed. */
export function parseScalar(tok: string): unknown {
  switch (tok) {
    case "null":
      return null;
    case "true":
      return true;
    case "false":
      return false;
    case "{}":
      return {};
    case "[]":
      return [];
  }
  if (tok.charCodeAt(0) === 34) {
    try {
      return JSON.parse(tok) as string;
    } catch {
      return undefined;
    }
  }
  return NUMBER.test(tok) ? Number(tok) : tok;
}

/** Index of the closing quote of the JSON string starting at `start`, or -1. */
export function scanString(s: string, start: number): number {
  for (let i = start + 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 92) i++;
    else if (c === 34) return i;
  }
  return -1;
}
