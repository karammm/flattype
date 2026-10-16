// @vitest-environment node
import { defineModel } from "@flattype/models";
import { describe, expect, it } from "vitest";
import { createSSRApp, defineComponent, h, Suspense } from "vue";
import { renderToString } from "vue/server-renderer";
import { createFlat, useFlat, useFlatSuspense } from "../src/index.js";
import { fakeFetch } from "./fake.js";

const User = defineModel({ fullName: "string" });

describe("server-side rendering", () => {
  it("useFlatSuspense renders the data on the server", async () => {
    const fake = fakeFetch({ "https://api.test/me": { body: { full_name: "Alice" }, delay: 10 } });
    const Me = defineComponent({
      async setup() {
        const { data } = await useFlatSuspense("/me", { model: User });
        return () => h("b", data.value.fullName);
      },
    });
    const app = createSSRApp({ render: () => h(Suspense, null, { default: () => h(Me) }) });
    app.use(createFlat({ baseURL: "https://api.test", fetch: fake.fetch }));
    expect(await renderToString(app)).toBe("<b>Alice</b>");
    expect(fake.calls).toHaveLength(1);
  });

  it("useFlat renders its loading state on the server without throwing", async () => {
    const fake = fakeFetch({ "https://api.test/me": { body: { full_name: "Alice" } } });
    const app = createSSRApp(
      defineComponent({
        setup() {
          const { data, loading } = useFlat("/me", { model: User });
          return () => h("p", loading.value ? "loading" : (data.value?.fullName ?? ""));
        },
      }),
    );
    app.use(createFlat({ baseURL: "https://api.test", fetch: fake.fetch }));
    expect(await renderToString(app)).toBe("<p>loading</p>");
  });
});
