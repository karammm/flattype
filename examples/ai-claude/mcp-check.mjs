// Starts mcp-server.mjs, calls its tool over stdio like an MCP client would, and checks the result.
// No API key needed:  node mcp-check.mjs
import assert from "node:assert/strict";
import { decode } from "@flattype/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { orders } from "./data.mjs";

const client = new Client({ name: "flattype-check", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("./mcp-server.mjs", import.meta.url))] }),
);
try {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["list_orders"]);

  const result = await client.callTool({ name: "list_orders", arguments: { status: "refunded" } });
  const text = result.content[0].text;
  const body = text.replace(/^<data[^>]*>\n/, "").replace(/\n<\/data>$/, "");
  const decoded = decode(body);
  assert.deepEqual(decoded, { orders: orders.filter((o) => o.status === "refunded") });

  const json = JSON.stringify({ orders: orders.filter((o) => o.status === "refunded") });
  console.log(text.split("\n").slice(0, 5).join("\n") + "\n  …");
  console.log(`\nMCP tool result OK: ${decoded.orders.length} orders, ${text.length} characters as Flat Notation vs ${json.length} as JSON.`);
} finally {
  await client.close();
}
