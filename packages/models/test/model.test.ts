import { encode } from "@flattype/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ModelError, defineModel, type Infer } from "../src/index.js";

const Address = defineModel({ city: "string", zip: "string" });

const User = defineModel({
  id: "number",
  name: "string",
  createdAt: "date",
  active: "boolean",
  bio: "string?",
  role: { type: "string", default: "viewer" },
  nickname: { type: "string", optional: true },
  address: Address,
  tags: ["string"],
});
type User = Infer<typeof User>;

const api = {
  id: "7",
  name: "John",
  created_at: "2026-01-02T03:04:05.000Z",
  active: 1,
  address: { city: "New York", zip: 10001 },
  tags: ["admin"],
  password_hash: "never copied",
};

describe("defineModel", () => {
  it("maps snake_case keys, coerces values and fills defaults", () => {
    const user = User.parse(api);
    expect(user).toEqual({
      id: 7,
      name: "John",
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
      active: true,
      bio: null,
      role: "viewer",
      address: { city: "New York", zip: "10001" },
      tags: ["admin"],
    });
    expect("nickname" in user).toBe(false);
    expect("password_hash" in user).toBe(false);
  });

  it("infers precise TypeScript types", () => {
    expectTypeOf<User>().toEqualTypeOf<{
      id: number;
      name: string;
      createdAt: Date;
      active: boolean;
      bio: string | null;
      role: string;
      address: { city: string; zip: string };
      tags: string[];
      nickname?: string;
    }>();
  });

  it("parses Flat Notation text directly", () => {
    const text = encode(api);
    expect(User.parse(text)).toEqual(User.parse(api));
  });

  it("parses lists, including Flat Notation tables", () => {
    const Row = defineModel({ id: "integer", userName: "string" });
    const text = "[2]{id,user_name}:\n  1, Alice\n  2, Bob";
    expect(Row.parseList(text)).toEqual([
      { id: 1, userName: "Alice" },
      { id: 2, userName: "Bob" },
    ]);
  });

  it("reports every problem with its path", () => {
    const bad = { id: "x", name: null, active: "maybe", address: { city: 5 }, tags: ["a", {}], created_at: "soon" };
    try {
      User.parse(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ModelError);
      expect((e as ModelError).issues).toEqual([
        { path: "id", message: 'Expected number, got string "x"' },
        { path: "name", message: "Expected string, got null" },
        { path: "createdAt", message: 'Expected date, got string "soon"' },
        { path: "active", message: 'Expected boolean, got string "maybe"' },
        { path: "address.zip", message: "Required" },
        { path: "tags[1]", message: "Expected string, got object" },
      ]);
    }
    const list = defineModel({ id: "number" });
    expect(() => list.parseList([{ id: 1 }, {}])).toThrow("[1].id: Required");
  });

  it("safeParse returns the error instead of throwing", () => {
    const r = User.safeParse({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.issues.length).toBeGreaterThan(3);
    expect(User.safeParse(api).ok).toBe(true);
  });

  it("can turn coercion off", () => {
    const Strict = defineModel({ n: "number", b: "boolean" }, { coerce: false });
    expect(() => Strict.parse({ n: "1", b: true })).toThrow(/Expected number/);
    expect(Strict.parse({ n: 1, b: false })).toEqual({ n: 1, b: false });
  });

  it("supports exact keys, from overrides and nullable fields", () => {
    const M = defineModel(
      { userId: "number", label: { type: "string", from: "display-name" }, note: { type: "string", nullable: true } },
      { keys: "exact" },
    );
    expect(() => M.parse({ user_id: 1, "display-name": "x", note: null })).toThrow("userId: Required");
    expect(M.parse({ userId: 1, "display-name": "x", note: null })).toEqual({ userId: 1, label: "x", note: null });
    expect(() => M.parse({ userId: 1, "display-name": "x" })).toThrow("note: Required");
  });

  it("calls function defaults each time", () => {
    const M = defineModel({ items: { type: ["number"], default: () => [] } });
    const a = M.parse({});
    const b = M.parse({});
    expect(a.items).toEqual([]);
    expect(a.items).not.toBe(b.items);
  });

  it("serializes back to the API shape", () => {
    const Snake = defineModel({ userId: "number", createdAt: "date" }, { keys: "snake" });
    const v = Snake.parse({ user_id: 1, created_at: "2026-01-01T00:00:00.000Z" });
    expect(Snake.serialize(v)).toEqual({ user_id: 1, created_at: "2026-01-01T00:00:00.000Z" });
    expect(Snake.encode([v, v])).toBe(
      "[2]{user_id,created_at}:\n  1, 2026-01-01T00:00:00.000Z\n  1, 2026-01-01T00:00:00.000Z",
    );
    const out = User.serialize(User.parse(api));
    expect(out.createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect("nickname" in out).toBe(false);
  });

  it("round-trips through serialize and parse", () => {
    const user = User.parse(api);
    expect(User.parse(User.serialize(user))).toEqual(user);
    expect(User.parse(User.encode(user))).toEqual(user);
  });

  it("rejects invalid shapes", () => {
    expect(() => defineModel({ x: "str" as never })).toThrow(/Invalid type/);
  });
});
