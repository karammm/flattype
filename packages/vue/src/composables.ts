import type { JsonValue } from "@flattype/core";
import { flatFetch, streamRows, type Parser } from "@flattype/http";
import { computed, ref, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type Ref, type ShallowRef } from "vue";
import { mergeInit, resolveURL, useFlatConfig } from "./config.js";

type Url = MaybeRefOrGetter<string | null | undefined>;

export interface UseFlatOptions {
  /** Extra `fetch` options (method, headers, credentials…). */
  init?: RequestInit;
  /** `false` (or a ref that is `false`) skips the request. Default `true`. */
  enabled?: MaybeRefOrGetter<boolean>;
}

export interface FlatState<T> {
  /** The latest data. The previous data stays here while a new request loads. */
  data: ShallowRef<T | undefined>;
  /** The error from the latest request (`HttpError`, `ModelError`, network errors), if it failed. */
  error: ShallowRef<unknown>;
  loading: Ref<boolean>;
  /** Loads the URL again. */
  refetch: () => void;
}

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

function start(url: Url, options: UseFlatOptions & { model?: Parser<unknown>; list?: boolean }) {
  const config = useFlatConfig();
  const data = shallowRef<unknown>();
  const error = shallowRef<unknown>();
  const loading = ref(false);
  const tick = ref(0);
  let settled: Promise<void> = Promise.resolve();

  watch(
    [() => toValue(url), () => toValue(options.enabled) !== false, tick],
    ([u, enabled], _old, onCleanup) => {
      if (u == null || !enabled) {
        loading.value = false;
        return;
      }
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      loading.value = true;
      error.value = undefined;
      const { model, list, init } = options;
      settled = flatFetch(resolveURL(config, u), {
        ...mergeInit(config, init, controller.signal),
        ...(config.fetch ? { fetch: config.fetch } : {}),
        ...(model ? { model, list: list === true } : {}),
      } as Parameters<typeof flatFetch>[1]).then(
        (value) => {
          if (controller.signal.aborted) return;
          data.value = value;
          loading.value = false;
        },
        (e: unknown) => {
          if (controller.signal.aborted || isAbort(e)) return;
          error.value = e;
          loading.value = false;
        },
      );
    },
    { immediate: true },
  );

  return { state: { data, error, loading, refetch: () => void tick.value++ }, settled: () => settled };
}

/**
 * Fetches a URL (asking for Flat Notation, accepting JSON) and keeps `data`, `error` and `loading` as refs.
 * The URL can be a ref or a getter: when it changes, the old request is aborted and the new one starts.
 *
 * ```ts
 * const { data: user, loading } = useFlat(() => `/users/${props.id}`, { model: User });
 * ```
 */
export function useFlat(url: Url, options?: UseFlatOptions): FlatState<JsonValue>;
export function useFlat<T>(url: Url, options: UseFlatOptions & { model: Parser<T>; list?: false }): FlatState<T>;
export function useFlat<T>(url: Url, options: UseFlatOptions & { model: Parser<T>; list: true }): FlatState<T[]>;
export function useFlat(url: Url, options: UseFlatOptions & { model?: Parser<unknown>; list?: boolean } = {}): FlatState<unknown> {
  return start(url, options).state;
}

export interface FlatSuspenseState<T> extends Omit<FlatState<T>, "data"> {
  data: ShallowRef<T>;
}

/**
 * For `async setup()` inside `<Suspense>`: waits for the first response, so `data` is always set.
 * A failed first request throws (catch it with `onErrorCaptured`). Later URL changes update the refs.
 *
 * ```ts
 * const { data: user } = await useFlatSuspense("/me", { model: User });
 * ```
 */
export function useFlatSuspense(url: Url, options?: Pick<UseFlatOptions, "init">): Promise<FlatSuspenseState<JsonValue>>;
export function useFlatSuspense<T>(url: Url, options: Pick<UseFlatOptions, "init"> & { model: Parser<T>; list?: false }): Promise<FlatSuspenseState<T>>;
export function useFlatSuspense<T>(url: Url, options: Pick<UseFlatOptions, "init"> & { model: Parser<T>; list: true }): Promise<FlatSuspenseState<T[]>>;
export async function useFlatSuspense(
  url: Url,
  options: Pick<UseFlatOptions, "init"> & { model?: Parser<unknown>; list?: boolean } = {},
): Promise<FlatSuspenseState<unknown>> {
  const { state, settled } = start(url, options);
  await settled();
  if (state.error.value !== undefined) throw state.error.value;
  return state as FlatSuspenseState<unknown>;
}

/** Maps data you already have (props, a store, a WebSocket message) to a model, as a computed ref. Throws `ModelError`. */
export function useModel<T>(input: MaybeRefOrGetter<unknown>, model: Parser<T>): ComputedRef<T | undefined>;
export function useModel<T>(input: MaybeRefOrGetter<unknown>, model: Parser<T>, options: { list: true }): ComputedRef<T[] | undefined>;
export function useModel<T>(
  input: MaybeRefOrGetter<unknown>,
  model: Parser<T>,
  options: { list?: boolean } = {},
): ComputedRef<T | T[] | undefined> {
  return computed(() => {
    const v = toValue(input);
    if (v == null) return undefined;
    return options.list ? model.parseList(v) : model.parse(v);
  });
}

export interface FlatStreamState<T> {
  /** Rows received so far, in order. */
  rows: ShallowRef<T[]>;
  /** True once the whole response has arrived. */
  done: Ref<boolean>;
  error: ShallowRef<unknown>;
  /** Starts the download again from the beginning. */
  restart: () => void;
}

/**
 * Renders a big list while it downloads: rows of the response's tables appear as they arrive, one update
 * per network chunk. Works with JSON responses too (rows appear at the end).
 *
 * ```ts
 * const { rows, done } = useFlatStream("/export", { model: Row, table: "rows" });
 * ```
 */
export function useFlatStream(url: Url, options?: UseFlatOptions & { table?: string }): FlatStreamState<JsonValue>;
export function useFlatStream<T>(url: Url, options: UseFlatOptions & { table?: string; model: Parser<T> }): FlatStreamState<T>;
export function useFlatStream(
  url: Url,
  options: UseFlatOptions & { table?: string; model?: Parser<unknown> } = {},
): FlatStreamState<unknown> {
  const config = useFlatConfig();
  const rows = shallowRef<unknown[]>([]);
  const done = ref(false);
  const error = shallowRef<unknown>();
  const tick = ref(0);

  watch(
    [() => toValue(url), () => toValue(options.enabled) !== false, tick],
    ([u, enabled], _old, onCleanup) => {
      rows.value = [];
      error.value = undefined;
      done.value = u == null || !enabled;
      if (done.value) return;
      const controller = new AbortController();
      let buffer: unknown[] = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flush = (): void => {
        timer = undefined;
        if (!buffer.length || controller.signal.aborted) return;
        rows.value = rows.value.concat(buffer);
        buffer = [];
      };
      onCleanup(() => {
        controller.abort();
        if (timer) clearTimeout(timer);
      });
      const { model, table, init } = options;
      (async () => {
        for await (const row of streamRows(resolveURL(config, u!), {
          init: mergeInit(config, init, controller.signal),
          ...(config.fetch ? { fetch: config.fetch } : {}),
        })) {
          if (table !== undefined && row.path !== table) continue;
          buffer.push(model ? model.parse(row.value) : row.value);
          timer ??= setTimeout(flush, 0);
        }
        if (timer) clearTimeout(timer);
        flush();
        if (!controller.signal.aborted) done.value = true;
      })().catch((e: unknown) => {
        if (timer) clearTimeout(timer);
        if (controller.signal.aborted || isAbort(e)) return;
        error.value = e;
        done.value = true;
      });
    },
    { immediate: true },
  );

  return { rows, done, error, restart: () => void tick.value++ };
}
