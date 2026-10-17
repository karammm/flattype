import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoder, decode, encode, flatten, unflatten } from "../src/index.js";

const BIG = "18446744073709551617"; // 2^64 + 1

describe("exact integers", () => {
  it("rounds integers beyond 2^53 by default, like JSON.parse", () => {
    expect(decode(`id: ${BIG}`)).toEqual({ id: 18446744073709552000 });
  });

  it("reads them as BigInt with { bigint: true }, everywhere a value can be", () => {
    const text = `id: ${BIG}\nneg: -${BIG}\nids[]: ${BIG}, 7\nusers[2]{id,name}:\n  ${BIG}, Alice\n  9007199254740993, Bob`;
    expect(decode(text, { bigint: true })).toEqual({
      id: 2n ** 64n + 1n,
      neg: -(2n ** 64n + 1n),
      ids: [2n ** 64n + 1n, 7],
      users: [
        { id: 2n ** 64n + 1n, name: "Alice" },
        { id: 9007199254740993n, name: "Bob" },
      ],
    });
  });

  it("keeps safe integers, floats, exponents and quoted digits as they were", () => {
    expect(decode(`a: 9007199254740991\nb: 1.5\nc: 1e30\nd: "${BIG}"\ne: -0\nf: 12345678901234567890.5`, { bigint: true })).toEqual({
      a: 9007199254740991,
      b: 1.5,
      c: 1e30,
      d: BIG,
      e: -0,
      f: 12345678901234567890.5,
    });
  });

  it("reads 2^53 + 1 exactly, which a number can't hold", () => {
    expect(decode("n: 9007199254740993", { bigint: true })).toEqual({ n: 9007199254740993n });
    expect(decode("n: 9007199254740992", { bigint: true })).toEqual({ n: 9007199254740992n });
  });

  it("stops at 4,300 characters, like Python", () => {
    const long = "9".repeat(4300);
    expect(decode(`n: ${long}`, { bigint: true })).toEqual({ n: BigInt(long) });
    expect(decode(`n: ${long}9`, { bigint: true })).toEqual({ n: Infinity });
  });

  it("works in the streaming decoder and in lenient mode", () => {
    const d = createDecoder({ bigint: true, strict: false });
    for (const ch of `rows[2]{id}:\n  ${BIG}\n  ${BIG}, extra`) d.write(ch);
    expect(d.end()).toEqual({ rows: [{ id: 2n ** 64n + 1n }, { id: 2n ** 64n + 1n }] });
  });

  it("round-trips any BigInt", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(2n ** 200n), max: 2n ** 200n }), (n) => {
        const back = (decode(encode({ n }), { bigint: true }) as { n: unknown }).n;
        expect(back).toEqual(n >= -(2n ** 53n) + 1n && n <= 2n ** 53n - 1n ? Number(n) : n);
      }),
    );
  });

  it("keeps BigInt leaves in flatten and unflatten", () => {
    expect(flatten({ a: { id: 5n } })).toEqual({ "a.id": 5n });
    expect(unflatten({ "a.id": 5n })).toEqual({ a: { id: 5n } });
  });
});
