import { flatFetch, streamRows, withAccept, type Parser } from "@flattype/http";

export interface FlatOptions {
  /** Prepended to relative URLs, e.g. `"/api"`. */
  baseURL?: string;
  /** Sent with every request. A function is called per request (for fresh tokens). */
  headers?: HeadersInit | (() => HeadersInit);
  /** A custom `fetch` (SvelteKit's `load` fetch, tests, auth wrappers). */
  fetch?: typeof fetch;
  /** Extra `fetch` options (method, credentials…). */
  init?: RequestInit;
}

export const isAbort = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

export function resolveURL(options: FlatOptions, url: string): string {
  if (!options.baseURL || /^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  return options.baseURL.replace(/\/+$/, "") + (url.startsWith("/") ? url : `/${url}`);
}

function requestInit(options: FlatOptions, signal: AbortSignal): RequestInit {
  const headers = new Headers(typeof options.headers === "function" ? options.headers() : options.headers);
  new Headers(options.init?.headers).forEach((v, k) => headers.set(k, v));
  return { ...options.init, headers, signal };
}

/** One request, mapped to a model if given. */
export function load(url: string, options: FlatOptions & { model?: Parser<unknown>; list?: boolean }, signal: AbortSignal): Promise<unknown> {
  const { model, list } = options;
  return flatFetch(resolveURL(options, url), {
    ...requestInit(options, signal),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(model ? { model, list: list === true } : {}),
  } as Parameters<typeof flatFetch>[1]);
}

/**
 * Streams the rows of `url`, calling `onRows` once per network chunk (not once per row). Returns a
 * function that stops it.
 */
export function stream(
  url: string,
  options: FlatOptions & { model?: Parser<unknown>; table?: string },
  on: { rows: (batch: unknown[]) => void; done: () => void; error: (e: unknown) => void },
): () => void {
  const controller = new AbortController();
  let buffer: unknown[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = (): void => {
    timer = undefined;
    if (!buffer.length || controller.signal.aborted) return;
    const batch = buffer;
    buffer = [];
    on.rows(batch);
  };
  (async () => {
    for await (const row of streamRows(resolveURL(options, url), {
      init: withAccept(requestInit(options, controller.signal)),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })) {
      if (options.table !== undefined && row.path !== options.table) continue;
      buffer.push(options.model ? options.model.parse(row.value) : row.value);
      timer ??= setTimeout(flush, 0);
    }
    if (timer) clearTimeout(timer);
    flush();
    if (!controller.signal.aborted) on.done();
  })().catch((e: unknown) => {
    if (timer) clearTimeout(timer);
    if (!controller.signal.aborted && !isAbort(e)) on.error(e);
  });
  return () => {
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}
