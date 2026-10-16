import type { JsonValue } from "@flattype/core";
import type { Parser } from "@flattype/http";
import { isAbort, load, stream, type FlatOptions } from "./runner.js";

export type { FlatOptions } from "./runner.js";

/**
 * The store contract: `subscribe` calls `run` with the current value now and on every change, and
 * returns an unsubscribe function. Svelte reads it with `$store`, Solid with `from(store)`.
 */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

type Source = string | null | undefined | Readable<string | null | undefined>;

function isReadable(v: unknown): v is Readable<string | null | undefined> {
  return typeof v === "object" && v !== null && typeof (v as Readable<unknown>).subscribe === "function";
}

/** A store that starts its work on the first subscriber and stops after the last one leaves. */
function lazyStore<T>(initial: T, start: (set: (update: (v: T) => T) => void) => () => void): Readable<T> {
  let value = initial;
  const subscribers = new Set<(v: T) => void>();
  let stop: (() => void) | undefined;
  const set = (update: (v: T) => T): void => {
    value = update(value);
    for (const run of [...subscribers]) run(value);
  };
  return {
    subscribe(run) {
      subscribers.add(run);
      run(value);
      if (subscribers.size === 1) stop = start(set);
      return () => {
        subscribers.delete(run);
        if (subscribers.size === 0) {
          stop?.();
          stop = undefined;
        }
      };
    },
  };
}

/** Subscribes to a URL that may be a plain string or a store of strings. */
function watchURL(url: Source, run: (u: string | null | undefined) => void): () => void {
  if (isReadable(url)) return url.subscribe(run);
  run(url);
  return () => {};
}

export interface FlatState<T> {
  /** The latest data. The previous data stays here while a new request loads. */
  data: T | undefined;
  /** The error from the latest request (`HttpError`, `ModelError`, network errors), if it failed. */
  error: unknown;
  loading: boolean;
}

export interface FlatStore<T> extends Readable<FlatState<T>> {
  /** Loads the URL again (while the store has subscribers). */
  refetch: () => void;
}

/**
 * A store that fetches a URL (asking for Flat Notation, accepting JSON) and maps it to a model.
 * `url` can be a string or a store: when it changes, the old request is aborted. Requests run only
 * while the store has subscribers.
 *
 * ```svelte
 * <script>
 *   const users = flatStore("/api/users", { model: User, list: true });
 * </script>
 * {#each $users.data ?? [] as user}<li>{user.fullName}</li>{/each}
 * ```
 */
export function flatStore(url: Source, options?: FlatOptions): FlatStore<JsonValue>;
export function flatStore<T>(url: Source, options: FlatOptions & { model: Parser<T>; list?: false }): FlatStore<T>;
export function flatStore<T>(url: Source, options: FlatOptions & { model: Parser<T>; list: true }): FlatStore<T[]>;
export function flatStore(url: Source, options: FlatOptions & { model?: Parser<unknown>; list?: boolean } = {}): FlatStore<unknown> {
  let reload: (() => void) | undefined;
  const store = lazyStore<FlatState<unknown>>({ data: undefined, error: undefined, loading: true }, (set) => {
    let controller: AbortController | undefined;
    let current: string | null | undefined;
    const run = (u: string | null | undefined): void => {
      current = u;
      controller?.abort();
      controller = undefined;
      if (u == null) {
        set((s) => ({ ...s, loading: false }));
        return;
      }
      const ctrl = (controller = new AbortController());
      set((s) => ({ data: s.data, error: undefined, loading: true }));
      load(u, options, ctrl.signal).then(
        (data) => !ctrl.signal.aborted && set(() => ({ data, error: undefined, loading: false })),
        (error: unknown) => !ctrl.signal.aborted && !isAbort(error) && set((s) => ({ data: s.data, error, loading: false })),
      );
    };
    reload = () => run(current);
    const unwatch = watchURL(url, run);
    return () => {
      unwatch();
      controller?.abort();
      reload = undefined;
    };
  });
  return { subscribe: store.subscribe, refetch: () => reload?.() };
}

export interface FlatStreamState<T> {
  /** Rows received so far, in order. */
  rows: T[];
  /** True once the whole response has arrived. */
  done: boolean;
  error: unknown;
}

export interface FlatStreamStore<T> extends Readable<FlatStreamState<T>> {
  /** Starts the download again from the beginning. */
  restart: () => void;
}

/**
 * Renders a big list while it downloads: rows of the response's tables appear as they arrive, one
 * update per network chunk. Works with JSON responses too (rows appear at the end).
 *
 * ```svelte
 * <script>const events = flatStreamStore("/api/export", { model: Row, table: "rows" });</script>
 * <p>{$events.done ? "Done" : `Loading… ${$events.rows.length}`}</p>
 * ```
 */
export function flatStreamStore(url: Source, options?: FlatOptions & { table?: string }): FlatStreamStore<JsonValue>;
export function flatStreamStore<T>(url: Source, options: FlatOptions & { table?: string; model: Parser<T> }): FlatStreamStore<T>;
export function flatStreamStore(
  url: Source,
  options: FlatOptions & { table?: string; model?: Parser<unknown> } = {},
): FlatStreamStore<unknown> {
  let reload: (() => void) | undefined;
  const store = lazyStore<FlatStreamState<unknown>>({ rows: [], done: false, error: undefined }, (set) => {
    let stop: (() => void) | undefined;
    let current: string | null | undefined;
    const run = (u: string | null | undefined): void => {
      current = u;
      stop?.();
      set(() => ({ rows: [], done: u == null, error: undefined }));
      if (u == null) return;
      stop = stream(u, options, {
        rows: (batch) => set((s) => ({ ...s, rows: s.rows.concat(batch) })),
        done: () => set((s) => ({ ...s, done: true })),
        error: (error) => set((s) => ({ ...s, done: true, error })),
      });
    };
    reload = () => run(current);
    const unwatch = watchURL(url, run);
    return () => {
      unwatch();
      stop?.();
      reload = undefined;
    };
  });
  return { subscribe: store.subscribe, restart: () => reload?.() };
}

/** Maps another store's value (props, a WebSocket store…) to a model. `undefined` for null input. */
export function modelStore<T>(source: Readable<unknown>, model: Parser<T>): Readable<T | undefined>;
export function modelStore<T>(source: Readable<unknown>, model: Parser<T>, options: { list: true }): Readable<T[] | undefined>;
export function modelStore<T>(source: Readable<unknown>, model: Parser<T>, options: { list?: boolean } = {}): Readable<T | T[] | undefined> {
  return lazyStore<T | T[] | undefined>(undefined, (set) =>
    source.subscribe((v) => set(() => (v == null ? undefined : options.list ? model.parseList(v) : model.parse(v)))),
  );
}

/**
 * Shares options (base URL, headers, fetch) between stores:
 *
 * ```ts
 * export const api = createFlat({ baseURL: "/api", headers: () => ({ authorization: `Bearer ${get(token)}` }) });
 * const users = api.store("/users", { model: User, list: true });
 * ```
 */
export function createFlat(defaults: FlatOptions) {
  const merge = <O extends FlatOptions>(o?: O): O => ({ ...defaults, ...o }) as O;
  return {
    store: ((url: Source, options?: FlatOptions) => flatStore(url, merge(options) as never)) as typeof flatStore,
    streamStore: ((url: Source, options?: FlatOptions) => flatStreamStore(url, merge(options) as never)) as typeof flatStreamStore,
  };
}
