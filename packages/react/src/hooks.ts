import type { JsonValue } from "@flattype/core";
import { flatFetch, streamRows, type Parser } from "@flattype/http";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { defaultCache, mergeInit, resolveURL, useFlatConfig } from "./context.js";

export interface UseFlatOptions {
  /** Extra `fetch` options (method, headers, credentials…). Changing them doesn't refetch; change the URL or call `refetch`. */
  init?: RequestInit;
  /** `false` skips the request. Default `true`. */
  enabled?: boolean;
}

export interface FlatState<T> {
  /** The latest data. The previous data stays here while a new request loads. */
  data: T | undefined;
  /** The error from the latest request (`HttpError`, `ModelError`, network errors), if it failed. */
  error: unknown;
  loading: boolean;
  /** Loads the URL again. */
  refetch: () => void;
}

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

/**
 * Fetches a URL (asking for Flat Notation, accepting JSON), optionally maps it to a model, and keeps
 * `{ data, error, loading }` in state. A new URL aborts the previous request.
 *
 * ```tsx
 * const { data: users, loading } = useFlat("/api/users", { model: User, list: true });
 * ```
 */
export function useFlat(url: string | null | undefined, options?: UseFlatOptions): FlatState<JsonValue>;
export function useFlat<T>(url: string | null | undefined, options: UseFlatOptions & { model: Parser<T>; list?: false }): FlatState<T>;
export function useFlat<T>(url: string | null | undefined, options: UseFlatOptions & { model: Parser<T>; list: true }): FlatState<T[]>;
export function useFlat(
  url: string | null | undefined,
  options: UseFlatOptions & { model?: Parser<unknown>; list?: boolean } = {},
): FlatState<unknown> {
  const config = useFlatConfig();
  const enabled = url != null && options.enabled !== false;
  const latest = useRef(options);
  latest.current = options;
  const [tick, refetch] = useReducer((n: number) => n + 1, 0);
  const [state, setState] = useState<Omit<FlatState<unknown>, "refetch">>({ data: undefined, error: undefined, loading: enabled });

  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.loading ? { ...s, loading: false } : s));
      return;
    }
    const controller = new AbortController();
    const { model, list, init } = latest.current;
    setState((s) => ({ data: s.data, error: undefined, loading: true }));
    flatFetch(resolveURL(config, url), {
      ...mergeInit(config, init, controller.signal),
      ...(config.fetch ? { fetch: config.fetch } : {}),
      ...(model ? { model, list: list === true } : {}),
    } as Parameters<typeof flatFetch>[1]).then(
      (data) => !controller.signal.aborted && setState({ data, error: undefined, loading: false }),
      (error: unknown) => !controller.signal.aborted && !isAbort(error) && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => controller.abort();
  }, [url, enabled, tick, config]);

  return { ...state, refetch };
}

/**
 * Like `useFlat`, but suspends until the data is there, so `data` is never `undefined`. Errors go to the
 * nearest error boundary. Responses are cached by URL (see `FlatProvider`'s `cache`); `refetch` reloads.
 *
 * ```tsx
 * <Suspense fallback={<Spinner />}><Profile /></Suspense>
 * function Profile() { const { data: user } = useFlatSuspense("/api/me", { model: User }); … }
 * ```
 */
export function useFlatSuspense(url: string, options?: Pick<UseFlatOptions, "init">): { data: JsonValue; refetch: () => void };
export function useFlatSuspense<T>(url: string, options: Pick<UseFlatOptions, "init"> & { model: Parser<T>; list?: false }): { data: T; refetch: () => void };
export function useFlatSuspense<T>(url: string, options: Pick<UseFlatOptions, "init"> & { model: Parser<T>; list: true }): { data: T[]; refetch: () => void };
export function useFlatSuspense(
  url: string,
  options: Pick<UseFlatOptions, "init"> & { model?: Parser<unknown>; list?: boolean } = {},
): { data: unknown; refetch: () => void } {
  const config = useFlatConfig();
  const cache = config.cache ?? defaultCache;
  const key = resolveURL(config, url);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const raw = cache.read(key, () =>
    flatFetch(key, { ...mergeInit(config, options.init), ...(config.fetch ? { fetch: config.fetch } : {}) }),
  );
  const { model, list } = options;
  const data = useMemo(() => (model ? (list ? model.parseList(raw) : model.parse(raw)) : raw), [raw, model, list]);
  const refetch = useCallback(() => {
    cache.invalidate((k) => k === key);
    rerender();
  }, [cache, key]);
  return { data, refetch };
}

/** Maps data you already have (props, a store, a WebSocket message) to a model, memoized. Throws `ModelError`. */
export function useModel<T>(input: unknown, model: Parser<T>): T | undefined;
export function useModel<T>(input: unknown, model: Parser<T>, options: { list: true }): T[] | undefined;
export function useModel<T>(input: unknown, model: Parser<T>, options: { list?: boolean } = {}): T | T[] | undefined {
  const list = options.list === true;
  return useMemo(() => (input == null ? undefined : list ? model.parseList(input) : model.parse(input)), [input, model, list]);
}

export interface FlatStreamState<T> {
  /** Rows received so far, in order. */
  rows: T[];
  /** True once the whole response has arrived. */
  done: boolean;
  error: unknown;
  /** Starts the download again from the beginning. */
  restart: () => void;
}

/**
 * Renders a big list while it downloads: rows of the response's tables appear as they arrive, in
 * batches, instead of after the last byte. Works with JSON responses too (rows appear at the end).
 *
 * ```tsx
 * const { rows, done } = useFlatStream("/api/export", { model: Row });
 * ```
 */
export function useFlatStream(url: string | null | undefined, options?: UseFlatOptions & { table?: string }): FlatStreamState<JsonValue>;
export function useFlatStream<T>(url: string | null | undefined, options: UseFlatOptions & { table?: string; model: Parser<T> }): FlatStreamState<T>;
export function useFlatStream(
  url: string | null | undefined,
  options: UseFlatOptions & { table?: string; model?: Parser<unknown> } = {},
): FlatStreamState<unknown> {
  const config = useFlatConfig();
  const enabled = url != null && options.enabled !== false;
  const latest = useRef(options);
  latest.current = options;
  const [tick, restart] = useReducer((n: number) => n + 1, 0);
  const [state, setState] = useState<Omit<FlatStreamState<unknown>, "restart">>({ rows: [], done: !enabled, error: undefined });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { model, table, init } = latest.current;
    let buffer: unknown[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = (): void => {
      timer = undefined;
      if (!buffer.length || controller.signal.aborted) return;
      const batch = buffer;
      buffer = [];
      setState((s) => ({ ...s, rows: s.rows.concat(batch) }));
    };
    setState({ rows: [], done: false, error: undefined });

    (async () => {
      for await (const row of streamRows(resolveURL(config, url), {
        init: mergeInit(config, init, controller.signal),
        ...(config.fetch ? { fetch: config.fetch } : {}),
      })) {
        if (table !== undefined && row.path !== table) continue;
        buffer.push(model ? model.parse(row.value) : row.value);
        timer ??= setTimeout(flush, 0); // one render per network chunk, not per row
      }
      if (timer) clearTimeout(timer);
      flush();
      if (!controller.signal.aborted) setState((s) => ({ ...s, done: true }));
    })().catch((error: unknown) => {
      if (timer) clearTimeout(timer);
      if (!controller.signal.aborted && !isAbort(error)) setState((s) => ({ ...s, done: true, error }));
    });
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [url, enabled, tick, config]);

  return { ...state, restart };
}
