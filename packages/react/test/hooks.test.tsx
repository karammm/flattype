import { defineModel } from "@flattype/models";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { Component, StrictMode, Suspense, type ReactNode } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { FlatCache, FlatProvider, useFlat, useFlatStream, useFlatSuspense, useModel } from "../src/index.js";
import { fakeFetch } from "./fake.js";

const User = defineModel({ id: "number", fullName: "string" });
const users = [
  { id: "1", full_name: "Alice" },
  { id: "2", full_name: "Bob" },
];

function setup(routes: Parameters<typeof fakeFetch>[0], cache = new FlatCache()) {
  const fake = fakeFetch(routes);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FlatProvider baseURL="https://api.test" fetch={fake.fetch} headers={{ "x-app": "test" }} cache={cache}>
      {children}
    </FlatProvider>
  );
  return { ...fake, wrapper, cache };
}

describe("useFlat", () => {
  it("loads Flat Notation into a typed model", async () => {
    const { wrapper, calls } = setup({ "https://api.test/users": { body: users } });
    const { result } = renderHook(() => useFlat("/users", { model: User, list: true }), { wrapper });
    expectTypeOf(result.current.data).toEqualTypeOf<{ id: number; fullName: string }[] | undefined>();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([
      { id: 1, fullName: "Alice" },
      { id: 2, fullName: "Bob" },
    ]);
    expect(calls[0]!.accept).toMatch(/^text\/x-flat/);
  });

  it("reads JSON responses too", async () => {
    const { wrapper } = setup({ "https://api.test/users": { body: users, json: true } });
    const { result } = renderHook(() => useFlat("/users"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(users));
  });

  it("reports HTTP and model errors", async () => {
    const { wrapper } = setup({
      "https://api.test/missing": { body: { error: "nope" }, status: 404 },
      "https://api.test/bad": { body: [{ id: "x" }] },
    });
    const http = renderHook(() => useFlat("/missing"), { wrapper });
    await waitFor(() => expect(http.result.current.error).toMatchObject({ status: 404, body: { error: "nope" } }));
    const model = renderHook(() => useFlat("/bad", { model: User, list: true }), { wrapper });
    await waitFor(() => expect(String(model.result.current.error)).toMatch(/\[0\]\.id: Expected number/));
  });

  it("aborts the old request when the URL changes, and keeps old data while loading", async () => {
    const { wrapper, calls } = setup({
      "https://api.test/a": { body: { v: "a" } },
      "https://api.test/slow": { body: { v: "slow" }, delay: 50 },
      "https://api.test/b": { body: { v: "b" } },
    });
    const { result, rerender } = renderHook(({ url }) => useFlat(url), { wrapper, initialProps: { url: "/a" } });
    await waitFor(() => expect(result.current.data).toEqual({ v: "a" }));
    rerender({ url: "/slow" });
    expect(result.current.data).toEqual({ v: "a" });
    rerender({ url: "/b" });
    await waitFor(() => expect(result.current.data).toEqual({ v: "b" }));
    expect(calls.find((c) => c.url.endsWith("/slow"))!.aborted()).toBe(true);
  });

  it("skips the request when disabled or the URL is null, and refetches on demand", async () => {
    const { wrapper, calls } = setup({ "https://api.test/n": { body: { n: 1 } } });
    const off = renderHook(() => useFlat(null), { wrapper });
    expect(off.result.current.loading).toBe(false);
    const { result } = renderHook(() => useFlat("/n", { enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.refetch());
    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it("doesn't refetch when the provider re-renders with equal inline headers", async () => {
    const { wrapper, calls } = setup({ "https://api.test/n": { body: { n: 1 } } });
    const { result, rerender } = renderHook(() => useFlat("/n"), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender();
    rerender();
    expect(calls).toHaveLength(1);
  });
});

class Boundary extends Component<{ children: ReactNode }, { error?: unknown }> {
  override state: { error?: unknown } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    return this.state.error ? <p>failed: {String(this.state.error)}</p> : this.props.children;
  }
}

describe("useFlatSuspense", () => {
  it("suspends, then renders typed data, and caches it", async () => {
    const { wrapper, calls, cache } = setup({ "https://api.test/users": { body: users, delay: 10 } });
    function Names() {
      const { data } = useFlatSuspense("/users", { model: User, list: true });
      expectTypeOf(data).toEqualTypeOf<{ id: number; fullName: string }[]>();
      return <p>{data.map((u) => u.fullName).join(", ")}</p>;
    }
    const Wrapper = wrapper;
    const view = render(
      <StrictMode>
        <Wrapper>
          <Suspense fallback={<p>loading</p>}>
            <Names />
            <Names />
          </Suspense>
        </Wrapper>
      </StrictMode>,
    );
    expect(screen.getByText("loading")).toBeTruthy();
    await screen.findAllByText("Alice, Bob");
    expect(calls).toHaveLength(1); // two components, StrictMode, one request
    cache.invalidate();
    view.unmount();
  });

  it("sends errors to the error boundary", async () => {
    const { wrapper } = setup({ "https://api.test/x": { body: {}, status: 500 } });
    function X() {
      useFlatSuspense("/x");
      return null;
    }
    const Wrapper = wrapper;
    render(
      <Wrapper>
        <Boundary>
          <Suspense fallback={null}>
            <X />
          </Suspense>
        </Boundary>
      </Wrapper>,
    );
    await screen.findByText("failed: HttpError: HTTP 500");
  });
});

describe("useModel", () => {
  it("maps and memoizes", () => {
    const input = { id: "7", full_name: "Zoë" };
    const { result, rerender } = renderHook(({ v }) => useModel(v, User), { initialProps: { v: input as unknown } });
    const first = result.current;
    expect(first).toEqual({ id: 7, fullName: "Zoë" });
    rerender({ v: input });
    expect(result.current).toBe(first);
    rerender({ v: null });
    expect(result.current).toBeUndefined();
    const list = renderHook(() => useModel(users, User, { list: true }));
    expect(list.result.current).toHaveLength(2);
  });
});

describe("useFlatStream", () => {
  it("shows rows before the response has finished", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    const { wrapper } = setup({ "https://api.test/export": { body: { total: 40, rows }, chunks: 8, delay: 15 } });
    const Row = defineModel({ id: "number", name: "string" });
    const { result } = renderHook(() => useFlatStream("/export", { model: Row, table: "rows" }), { wrapper });
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));
    expect(result.current.done).toBe(false);
    expect(result.current.rows.length).toBeLessThan(40);
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.rows).toEqual(rows);
    expectTypeOf(result.current.rows).toEqualTypeOf<{ id: number; name: string }[]>();
  });

  it("falls back to JSON", async () => {
    const { wrapper } = setup({ "https://api.test/export": { body: { rows: [{ a: 1 }, { a: 2 }] }, json: true } });
    const { result } = renderHook(() => useFlatStream("/export"), { wrapper });
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.rows).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
