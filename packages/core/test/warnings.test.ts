import { describe, expect, it } from "vitest";
import { createDecoder, decode, type DecodeOptions, type FlatWarning } from "../src/index.js";

function read(text: string, options: DecodeOptions = {}): { value: unknown; warnings: string[] } {
  const warnings: FlatWarning[] = [];
  const value = decode(text, { strict: false, ...options, onWarning: (w) => warnings.push(w) });
  return { value, warnings: warnings.map((w) => `${w.line}:${w.column} ${w.message}`) };
}

describe("warnings", () => {
  it("says where lenient decoding repaired the data, and how", () => {
    const { value, warnings } = read('a:\nb: "x\nt[2]{x,y}:\n  1\n  1, 2, 3\nl[2]: 1\nd: 1\nd: 2');
    expect(value).toEqual({ a: null, b: '"x', t: [{ x: 1, y: null }, { x: 1, y: 2 }], l: [null, null, 1], d: 2 });
    expect(warnings).toEqual([
      "1:3 Missing value: read as null",
      "2:3 Invalid quoted string: kept as text",
      "4:1 Expected 2 values, got 1: the missing values are null",
      "5:1 Expected 2 values, got 3: the extra values are dropped",
      "6:1 Index [2] skips [0]: the gap is filled with null",
      "8:1 Duplicate key 'd': the last value is kept",
    ]);
  });

  it("points at the damaged record of a table", () => {
    const text = "people[3]{name,language,id}:\n  Ann, Sindhi, A1\n  Noa Ervello Galician, W9FR\n  Bo, Uyghur, B2";
    const { value, warnings } = read(text);
    expect((value as { people: unknown[] }).people).toHaveLength(3);
    expect(warnings).toEqual(["3:1 Expected 3 values, got 2: the missing values are null"]);
  });

  it("reads a table header that only lacks its colon", () => {
    const { value, warnings } = read("[2]{name,id}\n  Ann, 1\n  Bo, 2");
    expect(value).toEqual([{ name: "Ann", id: 1 }, { name: "Bo", id: 2 }]);
    expect(warnings).toEqual(["1:13 Expected ':' after the table header: read as a table anyway"]);
    expect(() => decode("[2]{name,id}\n  Ann, 1\n  Bo, 2")).toThrow("Expected ':' after path (line 1, column 13)");
    expect(() => decode("t[1]{a} x\n  1", { strict: false })).toThrow("Expected ':' after path");
  });

  it("reports skipped lines once, without the warnings of the line itself", () => {
    const { value, warnings } = read("Here you go:\na:\nx.y[5000]:\nb: 2", { skipInvalidLines: true });
    expect(value).toEqual({ a: null, b: 2 });
    expect(warnings).toEqual([
      "1:5 Expected ':' after path: the line is skipped",
      "2:3 Missing value: read as null",
      "3:1 Index [5000] is too far past [0]: the line is skipped",
    ]);
  });

  it("reports short tables, dropped tables and references", () => {
    expect(read("t[3]{a}:\n  1").warnings).toEqual(["1:1 Expected 3 rows, got 1: the table has the rows that are there"]);
    expect(read("t: 1\nt.u[1]{a}:\n  1", { skipInvalidLines: true }).warnings).toEqual(["2:1 Path conflict at 't': the table is dropped"]);
    expect(read("a = b").warnings).toEqual(["1:3 References need { refs: true }: the line is skipped"]);
    expect(read("a = b", { refs: true }).warnings).toEqual(["1:1 Reference target 'b' doesn't exist: read as null"]);
  });

  it("stays silent in strict mode and on clean input, and works when streaming", () => {
    const warnings: FlatWarning[] = [];
    expect(() => decode("a:", { onWarning: (w) => warnings.push(w) })).toThrow("Missing value");
    decode("a: 1\nt[1]{x}:\n  2", { strict: false, onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([]);
    const d = createDecoder({ strict: false, onWarning: (w) => warnings.push(w) });
    d.write("t[2]{x,y}:\n  1");
    d.write("\n  2, 3\n");
    d.end();
    expect(warnings.map((w) => w.line)).toEqual([2]);
  });
});
