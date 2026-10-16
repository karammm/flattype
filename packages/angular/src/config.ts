import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from "@angular/core";

export interface FlatTypeConfig {
  /** Prepended to relative URLs in `flatResource` and `flatStream`, e.g. `"/api"`. */
  baseURL?: string;
  /** The `fetch` used by `flatStream` (HttpClient doesn't stream). Defaults to the global one. */
  fetch?: typeof fetch;
  /** Extra headers for `flatStream` requests, e.g. `() => ({ authorization: … })`. */
  headers?: HeadersInit | (() => HeadersInit);
}

export const FLAT_TYPE_CONFIG = new InjectionToken<FlatTypeConfig>("FLAT_TYPE_CONFIG", { factory: () => ({}) });

/**
 * App-wide settings. Add the interceptor to HttpClient as well:
 *
 * ```ts
 * providers: [provideHttpClient(withInterceptors([flatInterceptor])), provideFlatType({ baseURL: "/api" })]
 * ```
 */
export function provideFlatType(config: FlatTypeConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: FLAT_TYPE_CONFIG, useValue: config }]);
}

export function resolveURL(config: FlatTypeConfig, url: string): string {
  if (!config.baseURL || /^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  return config.baseURL.replace(/\/+$/, "") + (url.startsWith("/") ? url : `/${url}`);
}
