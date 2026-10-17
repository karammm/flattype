import { defineModel } from "@flattype/models";
import { describe, expect, it } from "vitest";
import { createClient, flatFetch } from "../src/index.js";

const BIG = "18446744073709551617";
const hasSource = (() => {
  let seen = false;
  JSON.parse("1", (_k, v, ctx?: { source?: string }) => ((seen = ctx?.source === "1"), v));
  return seen;
})();

const respond = (body: string, type: string) => async () => new Response(body, { headers: { "content-type": type } });
const Order = defineModel({ id: "bigint", total: "number" });

describe("big integers over HTTP", () => {
  it("rounds by default without a model, like JSON", async () => {
    expect(await flatFetch("http://x/", { fetch: respond(`id: ${BIG}`, "text/x-flat") })).toEqual({ id: 18446744073709552000 });
  });

  it("keeps them exact with { bigint: true }", async () => {
    expect(await flatFetch("http://x/", { fetch: respond(`id: ${BIG}`, "text/x-flat"), bigint: true })).toEqual({ id: 2n ** 64n + 1n });
  });

  it("keeps them exact by default with a model, for Flat Notation", async () => {
    const order = await flatFetch("http://x/", { fetch: respond(`id: ${BIG}\ntotal: 3`, "text/x-flat"), model: Order });
    expect(order).toEqual({ id: 2n ** 64n + 1n, total: 3 });
  });

  it.runIf(hasSource)("and for JSON", async () => {
    const order = await flatFetch("http://x/", { fetch: respond(`{"id":${BIG},"total":3}`, "application/json"), model: Order });
    expect(order).toEqual({ id: 2n ** 64n + 1n, total: 3 });
  });

  it("sends BigInts in request bodies as digits", async () => {
    let sent = "";
    const api = createClient({
      fetch: async (_url, init) => {
        sent = String(init?.body);
        return new Response(null, { status: 204 });
      },
    });
    await api.post("http://x/orders", { id: 2n ** 64n + 1n });
    expect(sent).toBe(`{"id":${BIG}}`);
  });
});
