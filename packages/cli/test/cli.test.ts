import { readFileSync } from "node:fs";
import { decode, encode } from "@flattype/core";
import { describe, expect, it } from "vitest";
import { fromOpenAPI, run, type IO } from "../src/index.js";
import { Customer, Order } from "./fixtures/expected-models.js";

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** Runs the CLI in memory: files from a map, stdin from a string. */
async function cli(argv: string[], { files = {}, stdin = "" }: { files?: Record<string, string>; stdin?: string } = {}) {
  let out = "";
  let err = "";
  const written: Record<string, string> = {};
  const io: IO = {
    readFile: async (path) => {
      if (path in files) return files[path]!;
      throw new Error(`ENOENT: no such file, open '${path}'`);
    },
    writeFile: async (path, text) => void (written[path] = text),
    stdin: async () => stdin,
    stdout: (t) => void (out += t),
    stderr: (t) => void (err += t),
  };
  const code = await run(argv, io, "9.9.9");
  return { code, out, err, written };
}

const users = { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] };

describe("encode / decode", () => {
  it("encodes JSON from stdin and a file", async () => {
    expect((await cli(["encode"], { stdin: JSON.stringify(users) })).out).toBe(encode(users) + "\n");
    const r = await cli(["encode", "u.json", "--delimiter", "tab", "--indent", "1"], { files: { "u.json": JSON.stringify(users) } });
    expect(r.out).toBe("users[2\t]{id\tname}:\n 1\tAlice\n 2\tBob\n");
    expect((await cli(["encode", "--no-tables"], { stdin: JSON.stringify(users) })).out).toContain("users[0].id: 1");
  });

  it("decodes to pretty or compact JSON, and writes files", async () => {
    const flat = encode(users);
    expect(JSON.parse((await cli(["decode"], { stdin: flat })).out)).toEqual(users);
    expect((await cli(["decode", "--compact"], { stdin: flat })).out).toBe(JSON.stringify(users) + "\n");
    const r = await cli(["decode", "-o", "out.json"], { stdin: flat });
    expect(r.out).toBe("");
    expect(JSON.parse(r.written["out.json"]!)).toEqual(users);
  });

  it("reports bad input clearly", async () => {
    const bad = await cli(["encode"], { stdin: "{oops" });
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/^flattype encode: stdin is not valid JSON/);
    const strict = await cli(["decode"], { stdin: "a: 1\na: 2" });
    expect(strict.code).toBe(1);
    expect(strict.err).toMatch(/Duplicate key 'a' \(line 2/);
    const lenient = await cli(["decode", "--lenient"], { stdin: "a: 1\na: 2" });
    expect(JSON.parse(lenient.out)).toEqual({ a: 2 });
    expect(lenient.err).toBe("warning: stdin:2:1: Duplicate key 'a': the last value is kept\n");
    expect((await cli(["encode", "missing.json"])).err).toMatch(/ENOENT/);
  });

  it("decodes references only with --refs", async () => {
    const text = "a.x: 1\nb = a";
    expect((await cli(["decode"], { stdin: text })).err).toMatch(/References need/);
    expect(JSON.parse((await cli(["decode", "--refs"], { stdin: text })).out)).toEqual({ a: { x: 1 }, b: { x: 1 } });
    const cycle = await cli(["decode", "--refs"], { stdin: "a.x: 1\na.me = a" });
    expect(cycle.code).toBe(1);
    expect(cycle.err).toMatch(/cycle/);
  });
});

describe("stats", () => {
  it("compares bytes and gzip", async () => {
    const big = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `User ${i}`, city: "Paris" })) };
    const { out, code } = await cli(["stats"], { stdin: JSON.stringify(big) });
    expect(code).toBe(0);
    expect(out).toMatch(/^ {16}bytes {6}gzip\nJSON +\d+ +\d+\nFlat +\d+ +\d+\nsaved +\d+% +-?\d+%\n$/);
  });
});

describe("gen --sample", () => {
  it("prints models inferred from a JSON response", async () => {
    const { out } = await cli(["gen", "--sample", "s.json", "--name", "UsersPage"], { files: { "s.json": fixture("sample.json") } });
    expect(out).toContain("export const UsersPageData = defineModel({");
    expect(out).toContain('  vip: { type: "boolean", optional: true },');
    expect(out).toContain("export type UsersPage = Infer<typeof UsersPage>;");
  });

  it("accepts a Flat Notation sample too", async () => {
    const { out } = await cli(["gen", "--sample", "s.flat"], { files: { "s.flat": encode(users) } });
    expect(out).toContain("export const ModelUser = defineModel({");
  });
});

describe("gen --openapi", () => {
  it("generates the models in fixtures/expected-models.ts (which the typecheck compiles)", async () => {
    const { out, err, code } = await cli(["gen", "--openapi", "spec.yaml"], { files: { "spec.yaml": fixture("openapi.yaml") } });
    expect(code).toBe(0);
    expect(out).toBe(fixture("expected-models.ts"));
    expect(err).toBe('warning: Category.parent: recursive reference to Category is typed as "any"\n');
  });

  it("produces models that parse real API data", () => {
    const order = Order.parse({
      updated_at: "2026-01-01T00:00:00Z",
      id: "7",
      status: "paid",
      customer: { id: 1, full_name: "Alice", created_at: "2026-01-01T00:00:00Z", address: { city: "Paris", zip_code: null } },
      lines: [{ sku: "A1", qty: 2, unit_price: 9.5 }],
      discount: null,
    });
    expect(order.id).toBe(7);
    expect(order.customer.fullName).toBe("Alice");
    expect(order.customer.address?.zipCode).toBeNull();
    expect(order.lines[0]!.unitPrice).toBe(9.5);
    expect(order.updatedAt).toBeInstanceOf(Date);
    expect(() => Customer.parse({ id: 1 })).toThrow(/fullName: Required/);
  });

  it("reads JSON specs and Swagger 2 definitions, and can pick schemas", async () => {
    const swagger = { swagger: "2.0", definitions: { Pet: { type: "object", required: ["name"], properties: { name: { type: "string" } } }, Tag: { type: "object", properties: { label: { type: "string" } } } } };
    const { out } = await cli(["gen", "--openapi", "s.json", "--schema", "Pet"], { files: { "s.json": JSON.stringify(swagger) } });
    expect(out).toContain("export const Pet = defineModel({\n  name: \"string\",\n});");
    expect(out).not.toContain("Tag");
    expect(fromOpenAPI(swagger, { schemas: ["Nope"] }).warnings).toEqual(["No schema named Nope"]);
  });

  it("fails clearly when there is nothing to generate", async () => {
    const r = await cli(["gen", "--openapi", "s.json"], { files: { "s.json": '{"openapi":"3.0.0","components":{"schemas":{}}}' } });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/No object schemas found/);
  });
});

describe("usage", () => {
  it("prints help, version and usage errors", async () => {
    expect((await cli(["--help"])).out).toMatch(/^flattype: JSON <-> Flat Notation/);
    expect(await cli([])).toMatchObject({ code: 2 });
    expect((await cli(["-v"])).out).toBe("9.9.9\n");
    expect(await cli(["frobnicate"])).toMatchObject({ code: 2, err: expect.stringMatching(/Unknown command "frobnicate"/) });
    expect(await cli(["encode", "--bogus"])).toMatchObject({ code: 2 });
    expect((await cli(["gen"])).err).toMatch(/needs --sample <file> or --openapi <file>/);
  });
});

describe("round trip through the CLI", () => {
  it("encode then decode gives the original JSON back", async () => {
    const value = JSON.parse(fixture("sample.json"));
    const flat = (await cli(["encode"], { stdin: JSON.stringify(value) })).out;
    expect(decode(flat)).toEqual(value);
    expect(JSON.parse((await cli(["decode"], { stdin: flat })).out)).toEqual(value);
  });
});
