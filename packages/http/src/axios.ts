import { decode } from "@flattype/core";
import { ACCEPT, isFlatType } from "./negotiate.js";

interface HeadersLike {
  [key: string]: unknown;
  get?(name: string): unknown;
  set?(name: string, value: string): unknown;
  has?(name: string): boolean;
}

/** The parts of an axios instance this needs, so axios stays an optional peer. */
export interface AxiosLike {
  interceptors: {
    request: { use(onFulfilled: (config: any) => any): number };
    response: { use(onFulfilled: (response: any) => any): number };
  };
}

function header(headers: HeadersLike | undefined, name: string): unknown {
  if (!headers) return undefined;
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()];
}

/**
 * Makes an axios instance ask for Flat Notation and decode it, so `response.data` is a plain value
 * whichever format the server answers in.
 *
 * ```ts
 * const api = flatAxios(axios.create({ baseURL: "/api" }));
 * const { data } = await api.get("/users");
 * ```
 */
export function flatAxios<A extends AxiosLike>(instance: A): A {
  instance.interceptors.request.use((config: { headers?: HeadersLike }) => {
    const headers = (config.headers ??= {});
    if (header(headers, "Accept") == null || header(headers, "Accept") === "application/json, text/plain, */*") {
      if (typeof headers.set === "function") headers.set("Accept", ACCEPT);
      else headers.Accept = ACCEPT;
    }
    return config;
  });
  instance.interceptors.response.use((response: { data: unknown; headers?: HeadersLike }) => {
    const type = header(response.headers, "content-type");
    if (typeof response.data === "string" && isFlatType(typeof type === "string" ? type : undefined)) {
      response.data = decode(response.data);
    }
    return response;
  });
  return instance;
}
