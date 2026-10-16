import type { JsonValue } from "@flattype/core";
import type { Parser } from "@flattype/http";
import { createEffect, createResource, createSignal, on, onCleanup, type Accessor, type ResourceReturn } from "solid-js";
import { load, stream, type FlatOptions } from "./runner.js";

export type { FlatOptions } from "./runner.js";

type Source = () => string | false | null | undefined;

/**
 * A Solid resource that fetches a URL (asking for Flat Notation, accepting JSON) and maps it to a model.
 * `source` is tracked: when it changes the old request is aborted; a falsy value waits. Works with
 * `<Suspense>` and `<ErrorBoundary>` like any resource.
 *
 * ```tsx
 * const [user] = createFlatResource(() => `/users/${props.id}`, { model: User });
 * <Show when={user()}>{(u) => <h2>{u().fullName}</h2>}</Show>
 * ```
 */
export function createFlatResource(source: Source, options?: FlatOptions): ResourceReturn<JsonValue>;
export function createFlatResource<T>(source: Source, options: FlatOptions & { model: Parser<T>; list?: false }): ResourceReturn<T>;
export function createFlatResource<T>(source: Source, options: FlatOptions & { model: Parser<T>; list: true }): ResourceReturn<T[]>;
export function createFlatResource(
  source: Source,
  options: FlatOptions & { model?: Parser<unknown>; list?: boolean } = {},
  // `any`: ResourceReturn is invariant in its type, so the overloads can't share a narrower one.
): ResourceReturn<any> {
  let controller: AbortController | undefined;
  onCleanup(() => controller?.abort());
  return createResource(source, (url: string) => {
    controller?.abort();
    controller = new AbortController();
    return load(url, options, controller.signal);
  });
}

export interface FlatStream<T> {
  /** Rows received so far, in order. */
  rows: Accessor<T[]>;
  /** True once the whole response has arrived. */
  done: Accessor<boolean>;
  error: Accessor<unknown>;
  /** Starts the download again from the beginning. */
  restart: () => void;
}

/**
 * Renders a big list while it downloads: rows of the response's tables appear as they arrive.
 *
 * ```tsx
 * const events = createFlatStream(() => "/api/export", { model: Row, table: "rows" });
 * <For each={events.rows()}>{(r) => <li>{r.event}</li>}</For>
 * ```
 */
export function createFlatStream(source: Source, options?: FlatOptions & { table?: string }): FlatStream<JsonValue>;
export function createFlatStream<T>(source: Source, options: FlatOptions & { table?: string; model: Parser<T> }): FlatStream<T>;
export function createFlatStream(source: Source, options: FlatOptions & { table?: string; model?: Parser<unknown> } = {}): FlatStream<unknown> {
  const [rows, setRows] = createSignal<unknown[]>([]);
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal<unknown>(undefined);
  const [tick, setTick] = createSignal(0);
  createEffect(
    on([source, tick], ([url]) => {
      setRows([]);
      setError(undefined);
      setDone(!url);
      if (!url) return;
      const stop = stream(url, options, {
        rows: (batch) => setRows((r) => r.concat(batch)),
        done: () => setDone(true),
        error: (e) => {
          setError(() => e);
          setDone(true);
        },
      });
      onCleanup(stop);
    }),
  );
  return { rows, done, error, restart: () => setTick((n) => n + 1) };
}
