import { describe, expect, it } from "vitest";
import { flatten, unflatten } from "../src/index.js";

describe("flatten / unflatten", () => {
  it("produces dot paths and indices", () => {
    const value = { user: { name: "John", "full name": "J D" }, tags: ["a", { b: 1 }], e: {}, f: [] };
    const flat = flatten(value);
    expect(flat).toEqual({
      "user.name": "John",
      'user."full name"': "J D",
      "tags[0]": "a",
      "tags[1].b": 1,
      e: {},
      f: [],
    });
    expect(unflatten(flat)).toEqual(value);
  });

  it("handles primitive and array roots", () => {
    expect(flatten(5)).toEqual({ "": 5 });
    expect(unflatten({ "": 5 })).toBe(5);
    expect(unflatten(flatten([1, [2]]))).toEqual([1, [2]]);
    expect(flatten({})).toEqual({});
  });

  it("keeps __proto__ as a normal key", () => {
    const flat = flatten(JSON.parse('{"__proto__":{"x":1}}'));
    expect(Object.keys(flat)).toEqual(["__proto__.x"]);
    expect(Object.getPrototypeOf(flat)).toBe(Object.prototype);
  });

  it("rejects paths with table or inline markers", () => {
    expect(() => unflatten({ "a[]": 1 })).toThrow(/Invalid path/);
  });
});
