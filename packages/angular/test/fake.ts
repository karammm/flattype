import { encode } from "@flattype/core";

export interface Route {
  body: unknown;
  /** Serve as JSON instead of Flat Notation. */
  json?: boolean;
  status?: number;
  delay?: number;
  /** Stream the body in this many chunks, waiting `delay` ms between them. */
  chunks?: number;
}

/** An in-memory `fetch` that serves Flat Notation (or JSON) and honours abort signals. */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; accept: string | null; aborted: () => boolean }> = [];
  const wait = (ms: number, signal?: AbortSignal | null) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });

  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const signal = init.signal;
    calls.push({ url, accept: new Headers(init.headers).get("accept"), aborted: () => !!signal?.aborted });
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    const text = route.json ? JSON.stringify(route.body) : encode(route.body);
    const headers = { "content-type": route.json ? "application/json" : "text/x-flat; charset=utf-8" };
    if (route.chunks) {
      const size = Math.ceil(text.length / route.chunks);
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (let i = 0; i < text.length; i += size) {
            controller.enqueue(new TextEncoder().encode(text.slice(i, i + size)));
            await wait(route.delay ?? 0);
          }
          controller.close();
        },
      });
      return new Response(stream, { status: route.status ?? 200, headers });
    }
    await wait(route.delay ?? 0, signal);
    return new Response(text, { status: route.status ?? 200, headers });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}
