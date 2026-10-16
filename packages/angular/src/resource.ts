import { HttpClient } from "@angular/common/http";
import { assertInInjectionContext, DestroyRef, effect, inject, signal, untracked, type Signal } from "@angular/core";
import type { JsonValue } from "@flattype/core";
import { streamRows, withAccept, type Parser } from "@flattype/http";
import { map, type OperatorFunction, type Subscription } from "rxjs";
import { FLAT_TYPE_CONFIG, resolveURL } from "./config";

/** RxJS operator: maps each value to a model. Throws `ModelError` into the stream. */
export function mapModel<T>(model: Parser<T>): OperatorFunction<unknown, T> {
  return map((value) => model.parse(value));
}

/** RxJS operator: maps each array value to a list of models. */
export function mapModelList<T>(model: Parser<T>): OperatorFunction<unknown, T[]> {
  return map((value) => model.parseList(value));
}

export interface FlatResource<T> {
  /** The latest data. The previous data stays while a new request loads. */
  value: Signal<T | undefined>;
  /** The error from the latest request (`HttpErrorResponse`, `ModelError`…), if it failed. */
  error: Signal<unknown>;
  isLoading: Signal<boolean>;
  /** Loads the URL again. */
  reload: () => void;
}

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

/**
 * Signal-based loader on top of HttpClient (so your interceptors run). `url` is a function that may read
 * signals: when it changes, the old request is cancelled and the new one starts. Return `undefined` to wait.
 * Call it in an injection context (a field initializer or the constructor).
 *
 * ```ts
 * users = flatResource(() => `/users?page=${this.page()}`, { model: UsersPage });
 * // template: @for (u of users.value()?.data; track u.id) { … }
 * ```
 */
export function flatResource(url: () => string | null | undefined): FlatResource<JsonValue>;
export function flatResource<T>(url: () => string | null | undefined, options: { model: Parser<T>; list?: false }): FlatResource<T>;
export function flatResource<T>(url: () => string | null | undefined, options: { model: Parser<T>; list: true }): FlatResource<T[]>;
export function flatResource(
  url: () => string | null | undefined,
  options: { model?: Parser<unknown>; list?: boolean } = {},
): FlatResource<unknown> {
  assertInInjectionContext(flatResource);
  const http = inject(HttpClient);
  const config = inject(FLAT_TYPE_CONFIG);
  const value = signal<unknown>(undefined);
  const error = signal<unknown>(undefined);
  const isLoading = signal(false);
  const tick = signal(0);
  let sub: Subscription | undefined;

  effect(() => {
    const u = url();
    tick();
    untracked(() => {
      sub?.unsubscribe();
      if (u == null) {
        isLoading.set(false);
        return;
      }
      isLoading.set(true);
      error.set(undefined);
      const { model, list } = options;
      sub = http.get(resolveURL(config, u)).subscribe({
        next: (body) => {
          try {
            value.set(model ? (list ? model.parseList(body) : model.parse(body)) : body);
          } catch (e) {
            error.set(e);
          }
          isLoading.set(false);
        },
        error: (e: unknown) => {
          error.set(e);
          isLoading.set(false);
        },
      });
    });
  });
  inject(DestroyRef).onDestroy(() => sub?.unsubscribe());

  return { value: value.asReadonly(), error: error.asReadonly(), isLoading: isLoading.asReadonly(), reload: () => tick.update((n) => n + 1) };
}

export interface FlatStream<T> {
  /** Rows received so far, in order. */
  rows: Signal<T[]>;
  /** True once the whole response has arrived. */
  done: Signal<boolean>;
  error: Signal<unknown>;
  /** Starts the download again from the beginning. */
  restart: () => void;
}

/**
 * Renders a big list while it downloads: rows of the response's tables appear as they arrive, one update
 * per network chunk. Uses `fetch` (HttpClient can't stream); set `baseURL`, `headers` and `fetch` with
 * `provideFlatType`. Works with JSON responses too (rows appear at the end).
 *
 * ```ts
 * events = flatStream(() => "/export", { model: Event, table: "rows" });
 * ```
 */
export function flatStream(url: () => string | null | undefined, options?: { table?: string; init?: RequestInit }): FlatStream<JsonValue>;
export function flatStream<T>(url: () => string | null | undefined, options: { table?: string; init?: RequestInit; model: Parser<T> }): FlatStream<T>;
export function flatStream(
  url: () => string | null | undefined,
  options: { table?: string; init?: RequestInit; model?: Parser<unknown> } = {},
): FlatStream<unknown> {
  assertInInjectionContext(flatStream);
  const config = inject(FLAT_TYPE_CONFIG);
  const rows = signal<unknown[]>([]);
  const done = signal(false);
  const error = signal<unknown>(undefined);
  const tick = signal(0);
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    controller?.abort();
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  effect(() => {
    const u = url();
    tick();
    untracked(() => {
      stop();
      rows.set([]);
      error.set(undefined);
      done.set(u == null);
      if (u == null) return;
      const ctrl = (controller = new AbortController());
      let buffer: unknown[] = [];
      const flush = (): void => {
        timer = undefined;
        if (!buffer.length || ctrl.signal.aborted) return;
        const batch = buffer;
        buffer = [];
        rows.update((r) => r.concat(batch));
      };
      const { model, table, init } = options;
      const headers = new Headers(typeof config.headers === "function" ? config.headers() : config.headers);
      new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
      (async () => {
        for await (const row of streamRows(resolveURL(config, u), {
          init: withAccept({ ...init, headers, signal: ctrl.signal }),
          ...(config.fetch ? { fetch: config.fetch } : {}),
        })) {
          if (table !== undefined && row.path !== table) continue;
          buffer.push(model ? model.parse(row.value) : row.value);
          timer ??= setTimeout(flush, 0);
        }
        if (timer) clearTimeout(timer);
        flush();
        if (!ctrl.signal.aborted) done.set(true);
      })().catch((e: unknown) => {
        if (ctrl.signal.aborted || isAbort(e)) return;
        error.set(e);
        done.set(true);
      });
    });
  });
  inject(DestroyRef).onDestroy(stop);

  return { rows: rows.asReadonly(), done: done.asReadonly(), error: error.asReadonly(), restart: () => tick.update((n) => n + 1) };
}
