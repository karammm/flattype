import { inject, type App, type InjectionKey } from "vue";

export interface FlatConfig {
  /** Prepended to relative URLs, e.g. `"/api"` or `"https://api.example.com/v1"`. */
  baseURL?: string;
  /** Sent with every request, e.g. an `authorization` header. A function is called per request. */
  headers?: HeadersInit | (() => HeadersInit);
  /** A custom `fetch` (tests, auth wrappers, polyfills). */
  fetch?: typeof fetch;
}

export const FLAT_CONFIG: InjectionKey<FlatConfig> = Symbol("flattype");

/**
 * Vue plugin with shared settings for every composable in the app.
 *
 * ```ts
 * app.use(createFlat({ baseURL: "/api", headers: () => ({ authorization: `Bearer ${token.value}` }) }));
 * ```
 */
export function createFlat(config: FlatConfig = {}) {
  return {
    install(app: App) {
      app.provide(FLAT_CONFIG, config);
    },
  };
}

export function useFlatConfig(): FlatConfig {
  return inject(FLAT_CONFIG, {});
}

export function resolveURL(config: FlatConfig, url: string): string {
  if (!config.baseURL || /^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  return config.baseURL.replace(/\/+$/, "") + (url.startsWith("/") ? url : `/${url}`);
}

export function mergeInit(config: FlatConfig, init: RequestInit | undefined, signal: AbortSignal): RequestInit {
  const headers = new Headers(typeof config.headers === "function" ? config.headers() : config.headers);
  new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
  return { ...init, headers, signal };
}
