import { defineModel } from "@flattype/models";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, expectTypeOf, it } from "vitest";
import { defineComponent, h, nextTick, onErrorCaptured, ref, Suspense, type Ref } from "vue";
import { createFlat, useFlat, useFlatStream, useFlatSuspense, useModel } from "../src/index.js";
import { fakeFetch, type Route } from "./fake.js";

const User = defineModel({ id: "number", fullName: "string" });
const users = [
  { id: "1", full_name: "Alice" },
  { id: "2", full_name: "Bob" },
];

/** Mounts a component that runs `setup` and exposes what it returns. */
function withSetup<T>(routes: Record<string, Route>, setup: () => T) {
  const fake = fakeFetch(routes);
  let result!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup();
        return () => null;
      },
    }),
    { global: { plugins: [createFlat({ baseURL: "https://api.test", fetch: fake.fetch, headers: () => ({ "x-app": "test" }) })] } },
  );
  return { result, wrapper, ...fake };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

describe("useFlat", () => {
  it("loads Flat Notation into a typed model", async () => {
    const { result, calls } = withSetup({ "https://api.test/users": { body: users } }, () => useFlat("/users", { model: User, list: true }));
    expectTypeOf(result.data.value).toEqualTypeOf<{ id: number; fullName: string }[] | undefined>();
    expect(result.loading.value).toBe(true);
    await until(() => !result.loading.value);
    expect(result.data.value).toEqual([
      { id: 1, fullName: "Alice" },
      { id: 2, fullName: "Bob" },
    ]);
    expect(calls[0]!.accept).toMatch(/^text\/x-flat/);
  });

  it("follows a reactive URL, aborts the old request and keeps old data while loading", async () => {
    const id = ref("a");
    const { result, calls } = withSetup(
      {
        "https://api.test/a": { body: { v: "a" } },
        "https://api.test/slow": { body: { v: "slow" }, delay: 50 },
        "https://api.test/b": { body: { v: "b" } },
      },
      () => useFlat(() => `/${id.value}`),
    );
    await until(() => result.data.value !== undefined);
    id.value = "slow";
    await nextTick();
    expect(result.data.value).toEqual({ v: "a" });
    id.value = "b";
    await until(() => (result.data.value as { v: string }).v === "b");
    expect(calls.find((c) => c.url.endsWith("/slow"))!.aborted()).toBe(true);
  });

  it("reports HTTP and model errors", async () => {
    const routes = { "https://api.test/missing": { body: { error: "nope" }, status: 404 }, "https://api.test/bad": { body: [{ id: "x" }] } };
    const http = withSetup(routes, () => useFlat("/missing"));
    await until(() => !http.result.loading.value);
    expect(http.result.error.value).toMatchObject({ status: 404, body: { error: "nope" } });
    const model = withSetup(routes, () => useFlat("/bad", { model: User, list: true }));
    await until(() => !model.result.loading.value);
    expect(String(model.result.error.value)).toMatch(/\[0\]\.id: Expected number/);
  });

  it("skips while disabled and refetches on demand", async () => {
    const enabled = ref(false);
    const { result, calls } = withSetup({ "https://api.test/n": { body: { n: 1 } } }, () => useFlat("/n", { enabled }));
    await flushPromises();
    expect(calls).toHaveLength(0);
    enabled.value = true;
    await until(() => result.data.value !== undefined);
    result.refetch();
    await until(() => calls.length === 2);
  });

  it("aborts when the component unmounts", async () => {
    const { wrapper, calls } = withSetup({ "https://api.test/slow": { body: {}, delay: 50 } }, () => useFlat("/slow"));
    wrapper.unmount();
    expect(calls[0]!.aborted()).toBe(true);
  });
});

describe("useFlatSuspense", () => {
  it("waits for data inside <Suspense>", async () => {
    const fake = fakeFetch({ "https://api.test/users": { body: users, delay: 10 } });
    const Names = defineComponent({
      async setup() {
        const { data } = await useFlatSuspense("/users", { model: User, list: true });
        expectTypeOf(data.value).toEqualTypeOf<{ id: number; fullName: string }[]>();
        return () => h("p", data.value.map((u) => u.fullName).join(", "));
      },
    });
    const wrapper = mount(
      defineComponent({ setup: () => () => h(Suspense, null, { default: () => h(Names), fallback: () => h("p", "loading") }) }),
      { global: { plugins: [createFlat({ baseURL: "https://api.test", fetch: fake.fetch })] } },
    );
    expect(wrapper.text()).toBe("loading");
    await until(() => wrapper.text() === "Alice, Bob");
  });

  it("throws the first error to onErrorCaptured", async () => {
    const fake = fakeFetch({ "https://api.test/x": { body: {}, status: 500 } });
    const captured: Ref<string> = ref("");
    const X = defineComponent({
      async setup() {
        await useFlatSuspense("/x");
        return () => null;
      },
    });
    mount(
      defineComponent({
        setup() {
          onErrorCaptured((e) => {
            captured.value = String(e);
            return false;
          });
          return () => h(Suspense, null, { default: () => h(X) });
        },
      }),
      { global: { plugins: [createFlat({ baseURL: "https://api.test", fetch: fake.fetch })] } },
    );
    await until(() => captured.value !== "");
    expect(captured.value).toBe("HttpError: HTTP 500");
  });
});

describe("useModel", () => {
  it("maps reactively", () => {
    const raw = ref<unknown>({ id: "7", full_name: "Zoë" });
    const { result } = withSetup({}, () => useModel(raw, User));
    expect(result.value).toEqual({ id: 7, fullName: "Zoë" });
    raw.value = null;
    expect(result.value).toBeUndefined();
    const list = withSetup({}, () => useModel(users, User, { list: true }));
    expect(list.result.value).toHaveLength(2);
  });
});

describe("useFlatStream", () => {
  it("shows rows before the response has finished", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    const Row = defineModel({ id: "number", name: "string" });
    const { result } = withSetup({ "https://api.test/export": { body: { total: 40, rows }, chunks: 8, delay: 15 } }, () =>
      useFlatStream("/export", { model: Row, table: "rows" }),
    );
    await until(() => result.rows.value.length > 0);
    expect(result.done.value).toBe(false);
    expect(result.rows.value.length).toBeLessThan(40);
    await until(() => result.done.value);
    expect(result.rows.value).toEqual(rows);
    expectTypeOf(result.rows.value).toEqualTypeOf<{ id: number; name: string }[]>();
  });

  it("falls back to JSON", async () => {
    const { result } = withSetup({ "https://api.test/export": { body: { rows: [{ a: 1 }, { a: 2 }] }, json: true } }, () => useFlatStream("/export"));
    await until(() => result.done.value);
    expect(result.rows.value).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
