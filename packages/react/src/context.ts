import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { FlatCache } from "./cache.js";

export interface FlatConfig {
  /** Prepended to relative URLs, e.g. `"/api"` or `"https://api.example.com/v1"`. */
  baseURL?: string;
  /** Sent with every request, e.g. an `authorization` header. */
  headers?: HeadersInit;
  /** A custom `fetch` (tests, auth wrappers, polyfills). */
  fetch?: typeof fetch;
  /** Where `useFlatSuspense` keeps responses. Give each SSR request its own. */
  cache?: FlatCache;
}

/** Shared by every hook outside a `FlatProvider`. */
export const defaultCache = new FlatCache();

const Context = createContext<FlatConfig>({});

/** Optional: shared settings for every hook below it. */
export function FlatProvider({ children, baseURL, headers, fetch, cache }: FlatConfig & { children?: ReactNode }) {
  // Compare headers by content, so an inline `headers={{ … }}` doesn't refetch on every render.
  let headerKey = "";
  if (headers) new Headers(headers).forEach((v, k) => (headerKey += `${k}:${v}\n`));
  const value = useMemo(() => ({ baseURL, headers, fetch, cache }), [baseURL, headerKey, fetch, cache]);
  return createElement(Context.Provider, { value }, children);
}

export function useFlatConfig(): FlatConfig {
  return useContext(Context);
}

export function resolveURL(config: FlatConfig, url: string): string {
  if (!config.baseURL || /^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  return config.baseURL.replace(/\/+$/, "") + (url.startsWith("/") ? url : `/${url}`);
}

export function mergeInit(config: FlatConfig, init: RequestInit | undefined, signal?: AbortSignal): RequestInit {
  const headers = new Headers(config.headers);
  new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
  return { ...init, headers, ...(signal ? { signal } : {}) };
}
