import { describe, expect, it } from "vitest";
import { ACCEPT, flatVersion, negotiate, prefersFlat, responseOptions } from "../src/index.js";
import { decode } from "@flattype/core";

describe("prefersFlat", () => {
  it.each([
    [ACCEPT, true],
    ["text/x-flat", true],
    ["application/json, text/x-flat", true],
    ["text/x-flat;q=0.5, application/json", false],
    ["application/json", false],
    ["*/*", false],
    ["text/x-flat;q=0", false],
    ["", false],
    [undefined, false],
  ])("%s → %s", (accept, expected) => {
    expect(prefersFlat(accept)).toBe(expected);
  });
});

describe("flatVersion", () => {
  it.each([
    [ACCEPT, "1.1"],
    ["text/x-flat; version=1.1", "1.1"],
    ['text/x-flat;version="1.2"', "1.1"],
    ["text/x-flat; version=2.0", "1.1"],
    ["text/x-flat; version=1.0", "1.0"],
    // What clients before 1.14 send.
    ["text/x-flat, application/json;q=0.9, */*;q=0.1", "1.0"],
    ["application/json; version=1.1", "1.0"],
    ["text/x-flat; version=x", "1.0"],
    [undefined, "1.0"],
  ])("%s → %s", (accept, expected) => {
    expect(flatVersion(accept)).toBe(expected);
  });

  it("keeps a server's own 1.0 target", () => {
    expect(responseOptions(ACCEPT, { target: "1.0", indent: 4 })).toEqual({ target: "1.0", indent: 4 });
    expect(responseOptions(ACCEPT)).toEqual({ target: "1.1" });
  });

  it("writes 1.0 text for clients that don't say they read 1.1", async () => {
    const events = [{ id: 1, phone: "5" }, { id: 2 }];
    const old = await negotiate("text/x-flat", Response.json({ events }));
    expect(await old.text()).toBe('events[0].id: 1\nevents[0].phone: "5"\nevents[1].id: 2');
    const now = await negotiate(ACCEPT, Response.json({ events }));
    expect(await now.text()).toBe('events[2]{id,phone?}:\n  1, "5"\n  2,');
    expect(decode(await (await negotiate(ACCEPT, Response.json({ events }))).text())).toEqual({ events });
  });
});
