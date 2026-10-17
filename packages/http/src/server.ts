import { encode, type EncodeOptions } from "@flattype/core";
import { addVary, CONTENT_TYPE, prefersFlat, responseOptions } from "./negotiate.js";

/**
 * For any fetch-API server (Hono, Bun, Deno, Next.js route handlers, Cloudflare Workers…):
 * re-encodes a JSON response as Flat Notation when the request asked for it. Other responses pass through.
 * `Vary: Accept` is always added so caches keep the two formats apart.
 */
export async function negotiate(request: Request | string | null | undefined, response: Response, options?: EncodeOptions): Promise<Response> {
  const accept = typeof request === "string" || request == null ? request : request.headers.get("accept");
  const headers = new Headers(response.headers);
  headers.set("vary", addVary(headers.get("vary")));
  const type = headers.get("content-type") ?? "";
  if (!prefersFlat(accept) || !/[/+]json\b/i.test(type) || !response.body) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const body = encode(await response.json(), responseOptions(accept, options));
  headers.set("content-type", CONTENT_TYPE);
  headers.delete("content-length");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/** Hono middleware: `app.use(flatHono())`. Every `c.json(...)` answers in Flat Notation when asked. */
export function flatHono(options?: EncodeOptions) {
  return async (c: { req: { raw: Request }; res: Response }, next: () => Promise<void>): Promise<void> => {
    await next();
    c.res = await negotiate(c.req.raw, c.res, options);
  };
}

interface ExpressRequest {
  headers: { accept?: string };
}
interface ExpressResponse {
  json(body: unknown): unknown;
  send(body: string): unknown;
  getHeader(name: string): unknown;
  setHeader(name: string, value: string): unknown;
}

/** Express middleware: `app.use(flatExpress())`. Every `res.json(...)` answers in Flat Notation when asked. */
export function flatExpress(options?: EncodeOptions) {
  return (req: ExpressRequest, res: ExpressResponse, next: () => void): void => {
    const vary = res.getHeader("Vary");
    res.setHeader("Vary", addVary(typeof vary === "string" ? vary : undefined));
    if (prefersFlat(req.headers.accept)) {
      res.json = (body: unknown) => {
        res.setHeader("Content-Type", CONTENT_TYPE);
        return res.send(encode(body, responseOptions(req.headers.accept, options)));
      };
    }
    next();
  };
}

interface FastifyLike {
  addHook(
    name: "preSerialization",
    hook: (request: { headers: { accept?: string } }, reply: FastifyReply, payload: unknown) => Promise<unknown>,
  ): unknown;
  addHook(name: "onSend", hook: (request: unknown, reply: FastifyReply, payload: unknown) => Promise<unknown>): unknown;
}
interface FastifyReply {
  header(name: string, value: string): unknown;
  serializer(fn: (payload: unknown) => string): unknown;
  getHeader(name: string): unknown;
}

/**
 * Fastify plugin: `app.register(flatFastify)`. Object replies answer in Flat Notation when asked.
 * It applies to the whole app (it is not encapsulated).
 */
export const flatFastify = Object.assign(
  async function flatFastify(app: FastifyLike, options?: EncodeOptions): Promise<void> {
    // Runs only for object payloads, right before Fastify serializes them: swap in our serializer.
    app.addHook("preSerialization", async (request, reply, payload) => {
      if (prefersFlat(request.headers.accept)) {
        reply.header("content-type", CONTENT_TYPE);
        const encodeOptions = responseOptions(request.headers.accept, options);
        reply.serializer((value: unknown) => encode(value, encodeOptions));
      }
      return payload;
    });
    app.addHook("onSend", async (_request, reply, payload) => {
      const vary = reply.getHeader("vary");
      reply.header("vary", addVary(typeof vary === "string" ? vary : undefined));
      return payload;
    });
  },
  { [Symbol.for("skip-override")]: true },
);
