// Gives Claude an API response as Flat Notation, asks for an answer in Flat Notation, and reads that
// answer back into typed models. Needs credentials: ANTHROPIC_API_KEY (or `ant auth login`).
//   node ask.mjs
import Anthropic from "@anthropic-ai/sdk";
import { fromModelOutput, LEGEND, outputInstructions, toPrompt } from "@flattype/ai";
import { defineModel } from "@flattype/models";
import { page } from "./data.mjs";

const client = new Anthropic();
const Total = defineModel({ customer: "string", orders: "integer", spent: "number" });

// The legend goes into the system prompt once, so each data block can leave it out.
const system = `You analyse business data. Data arrives in <data> tags as Flat Notation.\n${LEGEND.slice(2)}`;

const question = [
  toPrompt(page, { name: "orders", legend: false }),
  "For each customer, count their paid or shipped orders and sum quantity × unit_price for those orders.",
  outputInstructions([{ customer: "Alice Martin", orders: 3, spent: 512.48 }]),
].join("\n\n");

try {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium" },
    // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: question }],
  });

  if (response.stop_reason === "refusal") {
    console.error("Claude declined:", response.stop_details?.explanation ?? "no details");
    process.exit(1);
  }
  const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  console.log("Claude replied:\n" + reply + "\n");

  const totals = fromModelOutput(reply, { model: Total, list: true });
  console.log("Parsed into typed models:");
  console.table(totals);
  console.log(`input tokens: ${response.usage.input_tokens}, output tokens: ${response.usage.output_tokens}`);
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
