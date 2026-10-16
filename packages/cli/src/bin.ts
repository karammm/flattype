import { readFile, writeFile } from "node:fs/promises";
import { run } from "./cli.js";

declare const __VERSION__: string;

async function stdin(): Promise<string> {
  if (process.stdin.isTTY) {
    process.stderr.write("Reading from stdin… (pass a file, or pipe data in)\n");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const code = await run(
  process.argv.slice(2),
  {
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, text) => writeFile(path, text),
    stdin,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  typeof __VERSION__ === "string" ? __VERSION__ : "0.0.0",
);
process.exitCode = code;
