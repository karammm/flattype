import { encode } from "@flattype/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { streamRows } from "../src/index.js";
import { serve } from "./helpers.js";

const rows = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `User ${i}` }));
let server: Awaited<ReturnType<typeof serve>>;
let release: () => void;
const gate = new Promise<void>((r) => (release = r));

beforeAll(async () => {
  server = await serve(async (req, res) => {
    if (req.url === "/json") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ total: 50, rows }));
      return;
    }
    const text = encode({ total: 50, rows });
    const cut = text.indexOf("User 10");
    res.writeHead(200, { "content-type": "text/x-flat" });
    res.write(text.slice(0, cut)); // first 10 rows, then wait
    await gate;
    res.end(text.slice(cut));
  });
});
afterAll(() => server.close());

describe("streamRows", () => {
  it("yields rows before the response has finished", async () => {
    const it = streamRows(`${server.url}/flat`);
    const first: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await it.next();
      first.push((r.value as unknown as { value: { id: number } }).value.id);
    }
    expect(first).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    release(); // only now does the server send the rest
    const rest: number[] = [];
    let r = await it.next();
    while (!r.done) {
      rest.push((r.value as unknown as { value: { id: number } }).value.id);
      r = await it.next();
    }
    expect(rest).toHaveLength(40);
    expect(r.value).toEqual({ total: 50, rows: [] });
  });

  it("works with a JSON response too", async () => {
    const out = [];
    for await (const row of streamRows(`${server.url}/json`)) out.push(row);
    expect(out).toHaveLength(50);
    expect(out[3]).toEqual({ path: "rows", index: 3, value: { id: 3, name: "User 3" } });
  });

  it("decodes multi-byte characters split across chunks", async () => {
    const bytes = new TextEncoder().encode('t[1]{name}:\n  "Zoë 🌍"');
    async function* oneByteAtATime() {
      for (const b of bytes) yield new Uint8Array([b]);
    }
    const out = [];
    for await (const row of streamRows(oneByteAtATime())) out.push(row.value);
    expect(out).toEqual([{ name: "Zoë 🌍" }]);
  });
});
