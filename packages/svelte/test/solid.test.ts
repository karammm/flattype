import { defineModel } from "@flattype/models";
import { createRoot, createSignal, from } from "solid-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import { flatStore } from "../src/index.js";
import { createFlatResource, createFlatStream } from "../src/solid.js";
import { fakeFetch } from "./fake.js";

const User = defineModel({ id: "number", fullName: "string" });
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

describe("Solid", () => {
  it("createFlatResource fetches, follows its source and aborts the old request", async () => {
    const fake = fakeFetch({
      "https://api.test/users/1": { body: { id: "1", full_name: "Alice" } },
      "https://api.test/users/2": { body: { id: "2", full_name: "Bob" }, delay: 50 },
      "https://api.test/users/3": { body: { id: "3", full_name: "Chen" } },
    });
    await createRoot(async (dispose) => {
      const [id, setId] = createSignal(1);
      const [user] = createFlatResource(() => `/users/${id()}`, { baseURL: "https://api.test", fetch: fake.fetch, model: User });
      expectTypeOf(user()).toEqualTypeOf<{ id: number; fullName: string } | undefined>();
      await until(() => user()?.fullName === "Alice");
      setId(2);
      setId(3);
      await until(() => user()?.fullName === "Chen");
      expect(fake.calls.find((c) => c.url.endsWith("/2"))!.aborted()).toBe(true);
      dispose();
    });
  });

  it("createFlatResource exposes errors", async () => {
    const fake = fakeFetch({ "/x": { body: {}, status: 500 } });
    await createRoot(async (dispose) => {
      const [res] = createFlatResource(() => "/x", { fetch: fake.fetch });
      await until(() => res.state === "errored");
      expect(String(res.error)).toBe("HttpError: HTTP 500");
      dispose();
    });
  });

  it("createFlatStream shows rows while downloading", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i }));
    const fake = fakeFetch({ "/export": { body: { rows }, chunks: 8, delay: 15 } });
    await createRoot(async (dispose) => {
      const s = createFlatStream(() => "/export", { fetch: fake.fetch, table: "rows" });
      await until(() => s.rows().length > 0);
      expect(s.done()).toBe(false);
      await until(() => s.done());
      expect(s.rows()).toEqual(rows);
      dispose();
    });
  });

  it("Svelte stores work in Solid through from()", async () => {
    const fake = fakeFetch({ "/me": { body: { id: 1, full_name: "Zoë" } } });
    await createRoot(async (dispose) => {
      const state = from(flatStore("/me", { fetch: fake.fetch, model: User }));
      await until(() => state()?.loading === false);
      expect(state()!.data).toEqual({ id: 1, fullName: "Zoë" });
      dispose();
    });
  });
});
