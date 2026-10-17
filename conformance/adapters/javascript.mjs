// The conformance adapter for @flattype/core (build it first: pnpm turbo run build --filter=@flattype/core).
//   node conformance/run.mjs -- node conformance/adapters/javascript.mjs
import { createInterface } from "node:readline";
import { decode, encode, FlatDecodeError } from "../../packages/core/dist/index.js";
import { parseJson, stringifyJson } from "../../packages/core/dist/types.js";

function answer(req) {
  const o = req.options;
  try {
    switch (req.op) {
      case "decode": {
        const warnings = [];
        // bigint: integers past 2^53 come back exactly, as the spec asks.
        const value = decode(req.text, { strict: o.strict, refs: o.refs, skipInvalidLines: o.skipInvalidLines, bigint: true, onWarning: (w) => warnings.push(w) });
        return { value, warnings };
      }
      case "encode":
        return { text: encode(req.value, { delimiter: o.delimiter, indent: o.indent, tabular: o.tabular ? "auto" : "off", refs: o.refs, target: o.target }) };
      case "reencode":
        return { text: encode(decode(req.text, { refs: true, bigint: true }), { refs: true, target: o.target }) };
      default:
        return { unsupported: true };
    }
  } catch (e) {
    if (e instanceof FlatDecodeError) return { error: { message: e.reason, line: e.line, column: e.column } };
    throw e;
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  const req = parseJson(line);
  process.stdout.write(stringifyJson({ id: req.id, ...answer(req) }) + "\n");
}
