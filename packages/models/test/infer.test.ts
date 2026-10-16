import { describe, expect, it } from "vitest";
import { infer, toSource } from "../src/index.js";

const sample = {
  data: [
    { id: 1, full_name: "Alice", created_at: "2026-01-01T00:00:00Z", address: { city: "Paris" }, tags: ["a"], bio: null },
    { id: 2, full_name: "Bob", created_at: "2026-01-02T00:00:00Z", address: { city: "Delhi" }, tags: [], bio: "hi", vip: true },
  ],
};

describe("infer", () => {
  it("builds a working model from a sample response", () => {
    const Page = infer(sample);
    const page = Page.parse(sample) as { data: Array<Record<string, unknown>> };
    expect(page.data[0]).toEqual({
      id: 1,
      fullName: "Alice",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      address: { city: "Paris" },
      tags: ["a"],
      bio: null,
    });
    expect(page.data[1]!.vip).toBe(true);
  });

  it("accepts an array of objects and Flat Notation", () => {
    const Row = infer("[2]{id,name}:\n  1, A\n  2, B");
    expect(Row.parseList([{ id: 3, name: "C" }])).toEqual([{ id: 3, name: "C" }]);
  });

  it("prints TypeScript source with named nested models", () => {
    expect(toSource(infer(sample), "UsersPage")).toBe(`import { defineModel, type Infer } from "@flattype/models";

export const UsersPageDataAddress = defineModel({
  city: "string",
});
export type UsersPageDataAddress = Infer<typeof UsersPageDataAddress>;

export const UsersPageData = defineModel({
  id: "number",
  fullName: "string",
  createdAt: "date",
  address: UsersPageDataAddress,
  tags: ["string"],
  bio: "string?",
  vip: { type: "boolean", optional: true },
}, { keys: "snake" });
export type UsersPageData = Infer<typeof UsersPageData>;

export const UsersPage = defineModel({
  data: [UsersPageData],
});
export type UsersPage = Infer<typeof UsersPage>;
`);
  });

  it("rejects samples that are not objects", () => {
    expect(() => infer(5)).toThrow(TypeError);
  });
});

describe("toSource with several models", () => {
  it("names shared models once and references them", async () => {
    const { defineModel } = await import("../src/index.js");
    const Address = defineModel({ city: "string" });
    const User = defineModel({ id: "number", address: Address });
    const Order = defineModel({ id: "number", buyer: User, ship_to: Address });
    expect(toSource({ Order, User, Address })).toBe(`import { defineModel, type Infer } from "@flattype/models";

export const Address = defineModel({
  city: "string",
});
export type Address = Infer<typeof Address>;

export const User = defineModel({
  id: "number",
  address: Address,
});
export type User = Infer<typeof User>;

export const Order = defineModel({
  id: "number",
  buyer: User,
  ship_to: Address,
});
export type Order = Infer<typeof Order>;
`);
  });
});
