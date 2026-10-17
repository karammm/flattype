import { decode, encode, stats, type Delimiter } from "@flattype/core";
import { parseJson, stringifyJson } from "@flattype/core/types";
import { infer, toSource } from "@flattype/models";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { parse as parseYAML } from "yaml";
import { fromOpenAPI } from "./openapi.js";

export interface IO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  /** All of standard input. */
  stdin(): Promise<string>;
  stdout(text: string): void;
  stderr(text: string): void;
}

export const HELP = `flattype: JSON <-> Flat Notation, and typed models from real data

Usage
  flattype encode [file]                 JSON -> Flat Notation (file or stdin)
  flattype decode [file]                 Flat Notation -> JSON
  flattype stats [file]                  Size as JSON vs Flat Notation (also gzipped)
  flattype gen --sample <file> [--name User]
                                         TypeScript models inferred from an API response
  flattype gen --openapi <file> [--schema Name]...
                                         TypeScript models from an OpenAPI 3.x / Swagger 2 spec (JSON or YAML)

Options
  -o, --out <file>      Write to a file instead of stdout
  --delimiter <d>       encode: "," (default), "|" or "tab"
  --indent <n>          encode: spaces before table rows; decode: JSON indent (default 2)
  --no-tables           encode: never write arrays as tables
  --compact             decode: minified JSON
  --lenient             decode: recover from malformed input instead of failing, with a warning
                        (line and column) for every repair
  --refs                decode: accept "a = b" references (shared objects are repeated in the JSON)
  -h, --help            Show this help
  -v, --version         Show the version

Examples
  curl -s https://api.example.com/users | flattype encode
  flattype gen --openapi openapi.yaml -o src/models.ts
`;

const isFlatLike = (text: string): boolean => !/^\s*[[{"]/.test(text) || /^\s*"[^"]*"\s*:/.test(text);

/** Runs the CLI. Returns the exit code. */
export async function run(argv: string[], io: IO, version = "0.0.0"): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o" },
        delimiter: { type: "string" },
        indent: { type: "string" },
        "no-tables": { type: "boolean" },
        compact: { type: "boolean" },
        lenient: { type: "boolean" },
        refs: { type: "boolean" },
        sample: { type: "string" },
        openapi: { type: "string" },
        name: { type: "string" },
        schema: { type: "string", multiple: true },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\nRun "flattype --help" for usage.\n`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.version) {
    io.stdout(`${version}\n`);
    return 0;
  }
  const [command, file] = positionals;
  if (values.help || !command) {
    io.stdout(HELP);
    return values.help ? 0 : 2;
  }

  const input = (): Promise<string> => (file ? io.readFile(file) : io.stdin());
  const output = async (text: string): Promise<void> => {
    const body = text.endsWith("\n") ? text : text + "\n";
    if (values.out) await io.writeFile(values.out, body);
    else io.stdout(body);
  };
  // Integers beyond 2^53 stay exact both ways (JSON input needs Node 21+).
  const json = (text: string, source: string, exact = true): unknown => {
    try {
      return exact ? parseJson(text) : JSON.parse(text);
    } catch (error) {
      throw new Error(`${source} is not valid JSON: ${(error as Error).message}`);
    }
  };

  try {
    switch (command) {
      case "encode": {
        const delimiter = values.delimiter === "tab" ? "\t" : (values.delimiter ?? ",");
        if (![",", "|", "\t"].includes(delimiter)) throw new Error(`--delimiter must be ",", "|" or "tab"`);
        const indent = values.indent === undefined ? undefined : Number(values.indent);
        await output(
          encode(json(await input(), file ?? "stdin"), {
            delimiter: delimiter as Delimiter,
            ...(indent === undefined ? {} : { indent }),
            tabular: values["no-tables"] ? "off" : "auto",
          }),
        );
        return 0;
      }
      case "decode": {
        const where = file ?? "stdin";
        let warnings = 0;
        const value = decode(await input(), {
          strict: !values.lenient,
          refs: values.refs,
          bigint: true,
          onWarning: (w) => {
            // The first 50, then a count: a badly broken file shouldn't flood the terminal.
            if (++warnings <= 50) io.stderr(`warning: ${where}:${w.line}:${w.column}: ${w.message}\n`);
          },
        });
        if (warnings > 50) io.stderr(`warning: ${warnings - 50} more\n`);
        let text: string;
        try {
          text = stringifyJson(value, values.compact ? undefined : Number(values.indent ?? 2));
        } catch {
          throw new Error("The references form a cycle, which JSON can't represent");
        }
        await output(text);
        return 0;
      }
      case "stats": {
        const value = json(await input(), file ?? "stdin", false);
        const s = stats(value);
        const jsonText = JSON.stringify(value);
        const flatText = encode(value);
        const gz = (t: string): number => gzipSync(t, { level: 9 }).length;
        const pct = (a: number, b: number): string => `${Math.round((1 - a / b) * 100)}%`;
        await output(
          [
            `                bytes      gzip`,
            `JSON        ${String(s.jsonBytes).padStart(9)} ${String(gz(jsonText)).padStart(9)}`,
            `Flat        ${String(s.flatBytes).padStart(9)} ${String(gz(flatText)).padStart(9)}`,
            `saved       ${pct(s.flatBytes, s.jsonBytes).padStart(9)} ${pct(gz(flatText), gz(jsonText)).padStart(9)}`,
          ].join("\n"),
        );
        return 0;
      }
      case "gen": {
        if (values.sample && values.openapi) throw new Error("Use either --sample or --openapi, not both");
        if (values.sample) {
          const text = await io.readFile(values.sample);
          const sample = isFlatLike(text) ? decode(text, { strict: false, bigint: true }) : json(text, values.sample);
          await output(toSource(infer(sample), values.name ?? "Model"));
          return 0;
        }
        if (values.openapi) {
          const text = await io.readFile(values.openapi);
          const document = /\.ya?ml$/i.test(values.openapi) ? parseYAML(text) : json(text, values.openapi);
          const { models, warnings } = fromOpenAPI(document, values.schema ? { schemas: values.schema } : {});
          for (const w of warnings) io.stderr(`warning: ${w}\n`);
          if (!Object.keys(models).length) throw new Error("No object schemas found in the spec");
          await output(toSource(models));
          if (values.out) io.stderr(`Wrote ${Object.keys(models).length} models to ${values.out}\n`);
          return 0;
        }
        throw new Error("gen needs --sample <file> or --openapi <file>");
      }
      default:
        io.stderr(`Unknown command "${command}"\n\nRun "flattype --help" for usage.\n`);
        return 2;
    }
  } catch (error) {
    io.stderr(`flattype ${command}: ${(error as Error).message}\n`);
    return 1;
  }
}
