import { defineModel } from "@flattype/models";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFlat, flatStore, flatStreamStore, modelStore, type Readable } from "../src/index.js";
import { fakeFetch } from "./fake.js";

const User = defineModel({ id: "number", fullName: "string" });
const users = [
  { id: "1", full_name: "Alice" },
  { id: "2", full_name: "Bob" },
];

/** A minimal writable store, like Svelte's `writable`. */
function writable<T>(value: T) {
  const subs = new Set<(v: T) => void>();
  return {
    subscribe(run: (v: T) => void) {
      subs.add(run);
      run(value);
      return () => subs.delete(run);
    },
    set(v: T) {
      value = v;
      for (const s of subs) s(v);
    },
    count: () => subs.size,
  };
}

/** Subscribes and records every value. */
function watch<T>(store: Readable<T>) {
  const values: T[] = [];
  const stop = store.subscribe((v) => values.push(v));
  return { values, last: () => values.at(-1)!, stop };
}
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

describe("flatStore", () => {
  it("fetches on first subscribe and maps to a model", async () => {
    const fake = fakeFetch({ "https://api.test/users": { body: users } });
    const store = flatStore("/users", { baseURL: "https://api.test", fetch: fake.fetch, model: User, list: true });
    expect(fake.calls).toHaveLength(0); // lazy
    const w = watch(store);
    expectTypeOf(w.last().data).toEqualTypeOf<{ id: number; fullName: string }[] | undefined>();
    expect(w.last().loading).toBe(true);
    await until(() => !w.last().loading);
    expect(w.last().data).toEqual([
      { id: 1, fullName: "Alice" },
      { id: 2, fullName: "Bob" },
    ]);
    expect(fake.calls[0]!.accept).toMatch(/^text\/x-flat/);
    w.stop();
  });

  it("follows a URL store, aborts the old request and keeps old data while loading", async () => {
    const fake = fakeFetch({
      "/a": { body: { v: "a" } },
      "/slow": { body: { v: "slow" }, delay: 50 },
      "/b": { body: { v: "b" } },
    });
    const url = writable<string | null>("/a");
    const w = watch(flatStore(url, { fetch: fake.fetch }));
    await until(() => w.last().data !== undefined);
    url.set("/slow");
    expect(w.last()).toMatchObject({ data: { v: "a" }, loading: true });
    url.set("/b");
    await until(() => (w.last().data as { v: string }).v === "b");
    expect(fake.calls.find((c) => c.url === "/slow")!.aborted()).toBe(true);
    url.set(null);
    expect(w.last().loading).toBe(false);
    w.stop();
    expect(url.count()).toBe(0); // stops watching the URL store
  });

  it("aborts when the last subscriber leaves, and refetches", async () => {
    const fake = fakeFetch({ "/n": { body: { n: 1 }, delay: 30 } });
    const store = flatStore("/n", { fetch: fake.fetch });
    const a = watch(store);
    a.stop();
    expect(fake.calls[0]!.aborted()).toBe(true);
    const b = watch(store);
    await until(() => !b.last().loading);
    store.refetch();
    await until(() => fake.calls.length === 3);
    b.stop();
  });

  it("reports HTTP and model errors", async () => {
    const fake = fakeFetch({ "/missing": { body: { error: "nope" }, status: 404 }, "/bad": { body: [{ id: "x" }] } });
    const http = watch(flatStore("/missing", { fetch: fake.fetch }));
    await until(() => !http.last().loading);
    expect(http.last().error).toMatchObject({ status: 404, body: { error: "nope" } });
    const model = watch(flatStore("/bad", { fetch: fake.fetch, model: User, list: true }));
    await until(() => !model.last().loading);
    expect(String(model.last().error)).toMatch(/\[0\]\.id: Expected number/);
  });

  it("createFlat shares options and calls header functions per request", async () => {
    let token = "one";
    const fake = fakeFetch({ "https://api.test/me": { body: { id: 1, full_name: "Zoë" } } });
    const seen: string[] = [];
    const api = createFlat({
      baseURL: "https://api.test",
      headers: () => ({ authorization: token }),
      fetch: (url, init) => {
        seen.push(new Headers(init?.headers).get("authorization")!);
        return fake.fetch(url, init);
      },
    });
    const me = api.store("/me", { model: User });
    const w = watch(me);
    await until(() => !w.last().loading);
    expect(w.last().data).toEqual({ id: 1, fullName: "Zoë" });
    token = "two";
    me.refetch();
    await until(() => seen.length === 2);
    expect(seen).toEqual(["one", "two"]);
  });
});

describe("flatStreamStore", () => {
  it("shows rows before the response has finished", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    const fake = fakeFetch({ "/export": { body: { total: 40, rows }, chunks: 8, delay: 15 } });
    const Row = defineModel({ id: "number", name: "string" });
    const w = watch(flatStreamStore("/export", { fetch: fake.fetch, model: Row, table: "rows" }));
    await until(() => w.last().rows.length > 0);
    expect(w.last().done).toBe(false);
    expect(w.last().rows.length).toBeLessThan(40);
    await until(() => w.last().done);
    expect(w.last().rows).toEqual(rows);
    expectTypeOf(w.last().rows).toEqualTypeOf<{ id: number; name: string }[]>();
    w.stop();
  });
});

describe("modelStore", () => {
  it("maps another store", () => {
    const raw = writable<unknown>({ id: "7", full_name: "Zoë" });
    const w = watch(modelStore(raw, User));
    expect(w.last()).toEqual({ id: 7, fullName: "Zoë" });
    raw.set(null);
    expect(w.last()).toBeUndefined();
    w.stop();
    expect(raw.count()).toBe(0);
  });
});
