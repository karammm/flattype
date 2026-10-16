// Serves the production build (dist/browser) and a real Express API on one port:
//   node e2e/server.mjs 4185
// flatExpress() answers in Flat Notation when the client asks for it, JSON otherwise.
import { encode } from "@flattype/core";
import { CONTENT_TYPE, flatExpress, prefersFlat } from "@flattype/http";
import express from "express";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? 4185);
const cities = ["Paris", "Delhi", "Tokyo", "Lagos", "Lima"];
const names = ["Alice Martin", "Bob Singh", "Chen Wei", "Dara Okafor", "Eva Rossi", "Femi Ade", "Gita Rao", "Hugo Lind"];
const users = names.map((full_name, i) => ({
  id: String(i + 1),
  full_name,
  created_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  address: { city: cities[i % cities.length] },
}));

const api = express.Router();
api.use(flatExpress());
api.get("/users", (_req, res) => res.json({ page: 1, data: users }));
api.get("/users/:id", (req, res) => {
  const user = users.find((u) => u.id === req.params.id);
  if (user) res.json(user);
  else res.status(404).json({ error: "not found" });
});
// 200 rows sent in 10 pieces, 150 ms apart, so the page can render rows before the download finishes.
api.get("/export", async (req, res) => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, event: i % 3 ? "view" : "click", ms: (i * 37) % 900 }));
  if (!prefersFlat(req.headers.accept)) return void res.json({ total: rows.length, rows });
  const text = encode({ total: rows.length, rows });
  res.setHeader("content-type", CONTENT_TYPE);
  const piece = Math.ceil(text.length / 10);
  for (let i = 0; i < text.length; i += piece) {
    res.write(text.slice(i, i + piece));
    await new Promise((r) => setTimeout(r, 150));
  }
  res.end();
});

const app = express();
app.use("/api", api);
const root = fileURLToPath(new URL("../dist/browser/", import.meta.url));
app.use(express.static(root));
app.use((_req, res) => res.sendFile("index.html", { root }));
app.listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}`));
