import { encode } from "@flattype/core";
import { replaceTypes } from "@flattype/core/types";
import { describe, expect, expectTypeOf, it } from "vitest";
import { defineModel, infer, ModelError } from "../src/index.js";

const BIG = "18446744073709551617";

describe("bigint fields", () => {
  const Order = defineModel({ id: "bigint", total: "number", ref: "string" });

  it("keeps big integers exact when parsing Flat Notation", () => {
    const order = Order.parse(`id: ${BIG}\ntotal: 9.5\nref: ${BIG}`);
    expectTypeOf(order.id).toEqualTypeOf<bigint>();
    expect(order).toEqual({ id: 2n ** 64n + 1n, total: 9.5, ref: BIG });
  });

  it("accepts BigInts, safe numbers and integer strings", () => {
    expect(Order.parse({ id: 5, total: 1, ref: "a" }).id).toBe(5n);
    expect(Order.parse({ id: 2n ** 70n, total: 1, ref: "a" }).id).toBe(2n ** 70n);
    expect(Order.parse({ id: ` ${BIG} `, total: 1, ref: "a" }).id).toBe(2n ** 64n + 1n);
  });

  it("refuses a number that was already rounded, and says why", () => {
    const err = (() => {
      try {
        Order.parse(JSON.parse(`{"id":${BIG},"total":1,"ref":"a"}`));
      } catch (e) {
        return e as ModelError;
      }
    })();
    expect(err).toBeInstanceOf(ModelError);
    expect(err!.issues[0]!.message).toMatch(/beyond 2\^53 and already rounded/);
    expect(() => Order.parse({ id: 1.5, total: 1, ref: "a" })).toThrow(/Expected bigint/);
    expect(() => Order.parse({ id: "12a", total: 1, ref: "a" })).toThrow(/Expected bigint/);
  });

  it("serializes back to the digits", () => {
    const order = Order.parse(`id: ${BIG}\ntotal: 9.5\nref: x`);
    expect(Order.encode(order)).toBe(`id: ${BIG}\ntotal: 9.5\nref: x`);
  });

  it("is what infer picks for big integers", () => {
    const M = infer(`rows[2]{id,n}:\n  1, 1\n  ${BIG}, 2`);
    expect((M.shape as unknown as { rows: [{ shape: Record<string, unknown> }] }).rows[0].shape).toEqual({ id: "bigint", n: "number" });
  });
});

describe("bytes fields", () => {
  const File = defineModel({ name: "string", data: "bytes" });

  it("reads base64 into a Uint8Array and writes it back", () => {
    const text = encode({ name: "a.bin", data: new Uint8Array([0, 1, 254, 255]) }, { replacer: replaceTypes });
    const file = File.parse(text);
    expectTypeOf(file.data).toEqualTypeOf<Uint8Array>();
    expect([...file.data]).toEqual([0, 1, 254, 255]);
    expect(File.encode(file)).toBe(text);
  });

  it("accepts URL-safe base64 and refuses anything else", () => {
    expect([...File.parse({ name: "x", data: "-_8" }).data]).toEqual([251, 255]);
    expect(() => File.parse({ name: "x", data: "not base64!" })).toThrow(/Expected bytes/);
    expect(() => File.parse({ name: "x", data: "A" })).toThrow(/Expected bytes/);
    expect(() => File.parse({ name: "x", data: 5 })).toThrow(/Expected bytes/);
  });
});
