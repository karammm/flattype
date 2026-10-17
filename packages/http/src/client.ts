import { decode, type JsonValue } from "@flattype/core";
import { parseJson, stringifyJson } from "@flattype/core/types";
import { ACCEPT, isFlatType } from "./negotiate.js";

/** Anything with `parse` / `parseList`, such as a model from `@flattype/models`. */
export interface Parser<T> {
  parse(input: unknown): T;
  parseList(input: unknown): T[];
}

/** Thrown for non-2xx responses. `body` is the decoded error body when there is one. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: unknown,
    readonly response: Response,
  ) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "HttpError";
  }
}

export interface FlatRequestInit extends RequestInit {
  /** A custom `fetch`, e.g. for tests or a polyfill. Defaults to the global one. */
  fetch?: typeof fetch;
  /**
   * Read integers beyond 2^53 as exact `BigInt`s, in Flat Notation and in JSON (where the engine supports
   * JSON.parse source text access, e.g. Node 21+ and Chrome 114+). Default: on when a `model` is given,
   * since models convert them for `"number"` fields and keep them for `"bigint"` and `"string"` fields.
   */
  bigint?: boolean;
}

/** Reads a response as Flat Notation, JSON or text, based on its `Content-Type`. */
export async function readBody(res: Response, options: { bigint?: boolean } = {}): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return null;
  const text = await res.text();
  if (text === "") return null;
  const type = res.headers.get("content-type");
  const bigint = options.bigint === true;
  if (isFlatType(type)) return decode(text, { bigint });
  if (type && /[/+]json\b/i.test(type)) return bigint ? parseJson(text) : (JSON.parse(text) as JsonValue);
  return text;
}

/** Sends `Accept: text/x-flat, application/json`, so a FlatType server can answer in Flat Notation. */
export function withAccept(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", ACCEPT);
  return { ...init, headers };
}

/**
 * `fetch` that asks for Flat Notation (falling back to JSON), decodes either, throws `HttpError` on
 * non-2xx responses, and optionally maps the result to a model.
 *
 * ```ts
 * const users = await flatFetch("/api/users", { model: User, list: true }); // User[]
 * ```
 */
export function flatFetch(url: string | URL, init?: FlatRequestInit): Promise<JsonValue>;
export function flatFetch<T>(url: string | URL, init: FlatRequestInit & { model: Parser<T>; list?: false }): Promise<T>;
export function flatFetch<T>(url: string | URL, init: FlatRequestInit & { model: Parser<T>; list: true }): Promise<T[]>;
export async function flatFetch(
  url: string | URL,
  init: FlatRequestInit & { model?: Parser<unknown>; list?: boolean } = {},
): Promise<unknown> {
  const { fetch: f = fetch, model, list, bigint = model !== undefined, ...rest } = init;
  const res = await f(url, withAccept(rest));
  const body = await readBody(res, { bigint });
  if (!res.ok) throw new HttpError(res.status, res.statusText, body, res);
  if (!model) return body;
  return list ? model.parseList(body) : model.parse(body);
}

export interface ClientOptions {
  /** Prepended to every relative path, e.g. `https://api.example.com/v1`. */
  baseURL?: string;
  /** Sent with every request. */
  headers?: HeadersInit;
  fetch?: typeof fetch;
}

export interface RequestOptions<T = unknown> extends Omit<FlatRequestInit, "body" | "method"> {
  /** Added to the URL as a query string. `undefined` values are skipped. */
  query?: Record<string, string | number | boolean | undefined>;
  model?: Parser<T>;
  list?: boolean;
}

type Result<O> = O extends { model: Parser<infer T> } ? (O extends { list: true } ? T[] : T) : JsonValue;

export interface FlatClient {
  get<O extends RequestOptions<any> = {}>(path: string, options?: O): Promise<Result<O>>;
  delete<O extends RequestOptions<any> = {}>(path: string, options?: O): Promise<Result<O>>;
  post<O extends RequestOptions<any> = {}>(path: string, body?: unknown, options?: O): Promise<Result<O>>;
  put<O extends RequestOptions<any> = {}>(path: string, body?: unknown, options?: O): Promise<Result<O>>;
  patch<O extends RequestOptions<any> = {}>(path: string, body?: unknown, options?: O): Promise<Result<O>>;
}

/**
 * A small API client on top of `flatFetch`. Request bodies are sent as JSON (BigInts as their digits).
 *
 * ```ts
 * const api = createClient({ baseURL: "https://api.example.com" });
 * const user = await api.get("/users/7", { model: User });
 * ```
 */
export function createClient(options: ClientOptions = {}): FlatClient {
  const base = options.baseURL?.replace(/\/+$/, "") ?? "";

  const request = (method: string, path: string, body: unknown, opts: RequestOptions = {}): Promise<unknown> => {
    const { query, headers, model, list, ...rest } = opts;
    let url = /^[a-z][a-z\d+.-]*:/i.test(path) ? path : base + (path.startsWith("/") ? path : `/${path}`);
    if (query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.append(k, String(v));
      const s = qs.toString();
      if (s) url += (url.includes("?") ? "&" : "?") + s;
    }
    const h = new Headers(options.headers);
    new Headers(headers).forEach((v, k) => h.set(k, v));
    const init: FlatRequestInit & { model?: Parser<unknown>; list?: boolean } = {
      ...rest,
      method,
      headers: h,
      fetch: rest.fetch ?? options.fetch,
    };
    if (body !== undefined) {
      if (!h.has("content-type")) h.set("content-type", "application/json");
      init.body = stringifyJson(body);
    }
    if (model) {
      init.model = model;
      init.list = list === true;
    }
    return flatFetch(url, init as FlatRequestInit);
  };

  return {
    get: (path, o) => request("GET", path, undefined, o) as never,
    delete: (path, o) => request("DELETE", path, undefined, o) as never,
    post: (path, body, o) => request("POST", path, body, o) as never,
    put: (path, body, o) => request("PUT", path, body, o) as never,
    patch: (path, body, o) => request("PATCH", path, body, o) as never,
  };
}
