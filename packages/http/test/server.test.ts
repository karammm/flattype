import { decode } from "@flattype/core";
import axios from "axios";
import express from "express";
import Fastify from "fastify";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCEPT, flatAxios, flatExpress, flatFastify, flatFetch, flatHono, negotiate } from "../src/index.js";
import { serve } from "./helpers.js";

const data = { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] };

async function check(url: string): Promise<void> {
  const flat = await fetch(url, { headers: { accept: ACCEPT } });
  expect(flat.headers.get("content-type")).toMatch(/^text\/x-flat/);
  expect(flat.headers.get("vary")).toMatch(/Accept/);
  const text = await flat.text();
  expect(text).toBe("users[2]{id,name}:\n  1, Alice\n  2, Bob");
  expect(decode(text)).toEqual(data);

  const json = await fetch(url);
  expect(json.headers.get("content-type")).toMatch(/json/);
  expect(json.headers.get("vary")).toMatch(/Accept/);
  expect(await json.json()).toEqual(data);
}

describe("express", () => {
  let s: { url: string; close(): Promise<void> };
  beforeAll(async () => {
    const app = express();
    app.use(flatExpress());
    app.get("/users", (_req, res) => {
      res.json(data);
    });
    s = await serve(app);
  });
  afterAll(() => s.close());
  it("negotiates", () => check(`${s.url}/users`));
});

describe("fastify", () => {
  let url: string;
  const app = Fastify();
  beforeAll(async () => {
    await app.register(flatFastify);
    app.get("/users", async () => data);
    url = await app.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(() => app.close());
  it("negotiates", () => check(`${url}/users`));
});

describe("hono", () => {
  let s: { url: string; close(): Promise<void> };
  beforeAll(async () => {
    const app = new Hono();
    app.use(flatHono());
    app.get("/users", (c) => c.json(data));
    app.get("/text", (c) => c.text("hello"));
    s = await serve(async (req, res) => {
      const r = await app.fetch(new Request(`http://x${req.url}`, { headers: req.headers as Record<string, string> }));
      const headers: Record<string, string> = {};
      r.headers.forEach((v, k) => (headers[k] = v));
      res.writeHead(r.status, headers);
      res.end(await r.text());
    });
  });
  afterAll(() => s.close());
  it("negotiates", () => check(`${s.url}/users`));
  it("leaves non-JSON responses alone", async () => {
    const r = await fetch(`${s.url}/text`, { headers: { accept: ACCEPT } });
    expect(await r.text()).toBe("hello");
  });
});

describe("negotiate", () => {
  it("keeps status and other headers", async () => {
    const res = Response.json(data, { status: 201, headers: { "x-id": "7", vary: "Origin" } });
    const out = await negotiate(new Request("http://x", { headers: { accept: ACCEPT } }), res);
    expect(out.status).toBe(201);
    expect(out.headers.get("x-id")).toBe("7");
    expect(out.headers.get("vary")).toBe("Origin, Accept");
    expect(decode(await out.text())).toEqual(data);
  });
});

describe("axios + end to end", () => {
  let s: { url: string; close(): Promise<void> };
  beforeAll(async () => {
    const app = express();
    app.use(flatExpress());
    app.get("/users", (_req, res) => {
      res.json(data);
    });
    s = await serve(app);
  });
  afterAll(() => s.close());

  it("flatAxios asks for and decodes Flat Notation", async () => {
    const api = flatAxios(axios.create({ baseURL: s.url }));
    const res = await api.get("/users");
    expect(res.headers["content-type"]).toMatch(/^text\/x-flat/);
    expect(res.data).toEqual(data);
  });

  it("flatFetch against flatExpress", async () => {
    expect(await flatFetch(`${s.url}/users`)).toEqual(data);
  });
});
