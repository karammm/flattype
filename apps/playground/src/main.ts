import { decode, encode, FlatDecodeError, type Delimiter } from "@flattype/core";
import { infer, toSource } from "@flattype/models";
import { samples } from "./samples";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>("input");
const output = $<HTMLPreElement>("output");
const model = $<HTMLPreElement>("model");
const error = $<HTMLParagraphElement>("error");
const delimiter = $<HTMLSelectElement>("delimiter");
const tables = $<HTMLInputElement>("tables");
const utf8 = new TextEncoder();
const mode = (): "encode" | "decode" => (document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value as "encode" | "decode");

/** Gzipped size with the browser's CompressionStream, where available. */
async function gzipBytes(text: string): Promise<number | undefined> {
  if (typeof CompressionStream === "undefined") return undefined;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

const fmt = (n: number): string => `${n.toLocaleString("en-US")} B`;
const pct = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((1 - a / b) * 100)}%`);

let run = 0;
async function update(): Promise<void> {
  const id = ++run;
  const text = input.value;
  let value: unknown;
  let json = "";
  let flat = "";
  try {
    if (mode() === "encode") {
      value = JSON.parse(text);
      json = JSON.stringify(value);
      flat = encode(value, { delimiter: delimiter.value as Delimiter, tabular: tables.checked ? "auto" : "off" });
      output.textContent = flat;
    } else {
      value = decode(text, { strict: true });
      flat = text;
      json = JSON.stringify(value);
      output.textContent = JSON.stringify(value, null, 2);
    }
    error.hidden = true;
  } catch (e) {
    const where = e instanceof FlatDecodeError ? "" : mode() === "encode" ? "JSON: " : "";
    error.textContent = where + (e as Error).message;
    error.hidden = false;
    return;
  }
  try {
    model.textContent = typeof value === "object" && value !== null ? toSource(infer(value), "Model") : "// A model needs an object or an array of objects.";
  } catch (e) {
    model.textContent = `// ${(e as Error).message}`;
  }
  const jb = utf8.encode(json).length;
  const fb = utf8.encode(flat).length;
  $("jsonBytes").textContent = fmt(jb);
  $("flatBytes").textContent = fmt(fb);
  $("saved").textContent = pct(fb, jb);
  $("barJson").style.width = "100%";
  $("barFlat").style.width = `${Math.min(100, (fb / Math.max(jb, 1)) * 100)}%`;
  const [jg, fg] = await Promise.all([gzipBytes(json), gzipBytes(flat)]);
  if (id !== run || jg === undefined || fg === undefined) return;
  $("jsonGz").textContent = `${fmt(jg)} gzipped`;
  $("flatGz").textContent = `${fmt(fg)} gzipped`;
  $("savedGz").textContent = `${pct(fg, jg)} gzipped`;
}

function load(name: string): void {
  const value = samples[name];
  input.value = mode() === "encode" ? JSON.stringify(value, null, 2) : encode(value);
  void update();
}

input.addEventListener("input", () => void update());
delimiter.addEventListener("change", () => void update());
tables.addEventListener("change", () => void update());
document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) =>
  r.addEventListener("change", () => {
    // Carry the current data over to the other direction.
    const current = output.textContent ?? "";
    $("inLabel").textContent = mode() === "encode" ? "JSON input" : "Flat Notation input";
    $("tab-out").textContent = mode() === "encode" ? "Flat Notation" : "JSON";
    if (error.hidden && current) input.value = current;
    void update();
  }),
);
document.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((b) => b.addEventListener("click", () => load(b.dataset.sample!)));

// Tabs (arrow keys move between them, per the ARIA tabs pattern).
const tabs = [$<HTMLButtonElement>("tab-out"), $<HTMLButtonElement>("tab-model")];
const select = (i: number): void => {
  tabs.forEach((t, j) => {
    t.setAttribute("aria-selected", String(i === j));
    t.tabIndex = i === j ? 0 : -1;
  });
  output.hidden = i !== 0;
  model.hidden = i !== 1;
};
tabs.forEach((t, i) => {
  t.addEventListener("click", () => select(i));
  t.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    select(next);
    tabs[next]!.focus();
  });
});

$<HTMLButtonElement>("copy").addEventListener("click", async (e) => {
  const button = e.currentTarget as HTMLButtonElement;
  await navigator.clipboard.writeText((output.hidden ? model : output).textContent ?? "");
  button.textContent = "Copied";
  setTimeout(() => (button.textContent = "Copy"), 1200);
});

load("list");
