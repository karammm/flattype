import { encode } from "@flattype/core";
import { defineModel } from "@flattype/models";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { HttpError, createClient, flatFetch } from "../src/index.js";
import { serve } from "./helpers.js";

const users = [
  { id: "1", full_name: "Alice" },
  { id: "2", full_name: "Bob" },
];
const User = defineModel({ id: "number", fullName: "string" });

let server: Awaited<ReturnType<typeof serve>>;
const seen: Array<{ method?: string; url?: string; accept?: string; body: string; type?: string }> = [];

beforeAll(async () => {
  server = await serve((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, accept: req.headers.accept, body, type: req.headers["content-type"] });
      const json = req.url!.startsWith("/json");
      if (req.url!.includes("missing")) {
        res.writeHead(404, { "content-type": "text/x-flat" }).end(encode({ error: "not found" }));
      } else if (req.url!.includes("empty")) {
        res.writeHead(204).end();
      } else if (json) {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(users));
      } else {
        res.writeHead(200, { "content-type": "text/x-flat; charset=utf-8" }).end(encode(users));
      }
    });
  });
});
afterAll(() => server.close());

describe("flatFetch", () => {
  it("asks for Flat Notation and decodes it", async () => {
    expect(await flatFetch(`${server.url}/users`)).toEqual(users);
    expect(seen.at(-1)!.accept).toBe("text/x-flat; version=1.1, application/json;q=0.9, */*;q=0.1");
  });

  it("falls back to JSON", async () => {
    expect(await flatFetch(`${server.url}/json/users`)).toEqual(users);
  });

  it("maps to a model, typed", async () => {
    const list = await flatFetch(`${server.url}/users`, { model: User, list: true });
    expectTypeOf(list).toEqualTypeOf<{ id: number; fullName: string }[]>();
    expect(list).toEqual([
      { id: 1, fullName: "Alice" },
      { id: 2, fullName: "Bob" },
    ]);
  });

  it("throws HttpError with the decoded body", async () => {
    const err = await flatFetch(`${server.url}/missing`).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
    expect((err as HttpError).body).toEqual({ error: "not found" });
  });

  it("returns null for empty responses", async () => {
    expect(await flatFetch(`${server.url}/empty`)).toBeNull();
  });

  it("keeps a caller's own Accept header", async () => {
    await flatFetch(`${server.url}/json/x`, { headers: { accept: "application/json" } });
    expect(seen.at(-1)!.accept).toBe("application/json");
  });
});

describe("createClient", () => {

  it("joins the base URL, query, headers and JSON body", async () => {
    const client = createClient({ baseURL: `${server.url}/`, headers: { "x-app": "demo" } });
    const out = await client.post("/users", { name: "Chen" }, { query: { page: 2, skip: undefined } });
    expect(out).toEqual(users);
    expect(seen.at(-1)).toMatchObject({ method: "POST", url: "/users?page=2", body: '{"name":"Chen"}', type: "application/json" });
  });

  it("maps responses to models with types", async () => {
    const client = createClient({ baseURL: server.url });
    const list = await client.get("/users", { model: User, list: true });
    expectTypeOf(list).toEqualTypeOf<{ id: number; fullName: string }[]>();
    expect(list[1]).toEqual({ id: 2, fullName: "Bob" });
    const raw = await client.get("/users");
    expectTypeOf(raw).toEqualTypeOf<import("@flattype/core").JsonValue>();
  });
});
