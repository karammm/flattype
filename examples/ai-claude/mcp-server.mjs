// An MCP server (stdio) whose tool returns its data as Flat Notation, so the model reads fewer tokens.
// Add it to an MCP client, e.g. Claude Code:  claude mcp add flattype-orders -- node /path/to/mcp-server.mjs
import { toolResult } from "@flattype/ai";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { orders } from "./data.mjs";

const server = new McpServer({ name: "flattype-orders", version: "1.0.0" });

server.registerTool(
  "list_orders",
  {
    title: "List orders",
    description: "Lists recent orders, optionally filtered by status. Returns Flat Notation (explained in the result).",
    inputSchema: { status: z.enum(["paid", "shipped", "refunded"]).optional() },
  },
  async ({ status }) => toolResult({ orders: status ? orders.filter((o) => o.status === status) : orders }),
);

await server.connect(new StdioServerTransport());
