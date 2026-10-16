// Counts real Claude tokens for the same API response as JSON and as Flat Notation.
// count_tokens is free, but needs credentials: ANTHROPIC_API_KEY (or `ant auth login`).
//   node tokens.mjs
import Anthropic from "@anthropic-ai/sdk";
import { countTokens } from "@flattype/ai";
import { page } from "./data.mjs";

const client = new Anthropic();

try {
  const cases = [
    { label: "60 orders, with the legend", value: page, options: {} },
    { label: "60 orders, legend in the system prompt instead", value: page, options: { legend: false } },
    { label: "one order", value: page.data[0], options: { legend: false } },
  ];
  for (const { label, value, options } of cases) {
    const r = await countTokens(client, value, options);
    console.log(`${label.padEnd(48)} JSON ${String(r.json).padStart(5)}  Flat ${String(r.flat).padStart(5)}  saved ${Math.round(r.saved * 100)}%`);
  }
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("No valid credentials: set ANTHROPIC_API_KEY or run `ant auth login`.");
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error("Rate limited: try again in a moment.");
  } else if (error instanceof Anthropic.APIError) {
    console.error(`API error ${error.status}: ${error.message}`);
  } else {
    // Thrown before any request, e.g. when no credentials are configured at all.
    console.error(`Could not call the API: ${error instanceof Error ? error.message : error}`);
    console.error("Set ANTHROPIC_API_KEY or run `ant auth login`, then try again.");
  }
  process.exitCode = 1;
}
