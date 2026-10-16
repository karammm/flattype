import { createDecoder, type JsonValue, type TableRow } from "@flattype/core";
import { HttpError, readBody, withAccept } from "./client.js";
import { isFlatType } from "./negotiate.js";

type Source = string | URL | Response | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string>;

async function* chunks(body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string>): AsyncGenerator<Uint8Array | string> {
  if (Symbol.asyncIterator in body) {
    yield* body as AsyncIterable<Uint8Array | string>;
    return;
  }
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Yields rows of the arrays of objects in a JSON value, the way a Flat Notation table would. */
function* jsonRows(value: unknown): Generator<TableRow> {
  const isRows = (v: unknown): v is JsonValue[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "object" && x !== null && !Array.isArray(x));
  if (isRows(value)) {
    for (let i = 0; i < value.length; i++) yield { path: "", index: i, value: value[i]! };
  } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [key, v] of Object.entries(value)) {
      if (isRows(v)) for (let i = 0; i < v.length; i++) yield { path: key, index: i, value: v[i]! };
    }
  }
}

/**
 * Yields table rows while a large response is still downloading, so the first rows can be shown before the
 * last ones arrive. Rows are not kept in memory. The generator's return value is the rest of the document.
 *
 * Takes a URL (fetched with the Flat Notation `Accept` header), a `Response`, or any byte/text stream.
 * A JSON response still works: its arrays of objects are yielded once it has fully arrived.
 *
 * ```ts
 * for await (const { path, value } of streamRows("/api/events")) render(value);
 * ```
 */
export async function* streamRows(
  source: Source,
  options: { strict?: boolean; fetch?: typeof fetch; init?: RequestInit } = {},
): AsyncGenerator<TableRow, JsonValue, void> {
  let body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string>;
  if (typeof source === "string" || source instanceof URL) {
    source = await (options.fetch ?? fetch)(source, withAccept(options.init));
  }
  if (source instanceof Response) {
    if (!source.ok) throw new HttpError(source.status, source.statusText, await readBody(source), source);
    if (!isFlatType(source.headers.get("content-type"))) {
      const value = await readBody(source);
      yield* jsonRows(value);
      return value as JsonValue;
    }
    if (!source.body) return {};
    body = source.body;
  } else {
    body = source;
  }

  const queue: TableRow[] = [];
  const decoder = createDecoder({ strict: options.strict, keepRows: false, onRow: (row) => queue.push(row) });
  const text = new TextDecoder();
  // Hand over the whole batch at once (Array#shift per row would be quadratic on big chunks).
  const drain = (): TableRow[] => queue.splice(0, queue.length);
  for await (const chunk of chunks(body)) {
    decoder.write(typeof chunk === "string" ? chunk : text.decode(chunk, { stream: true }));
    yield* drain();
  }
  decoder.write(text.decode());
  const rest = decoder.end();
  yield* drain();
  return rest;
}
