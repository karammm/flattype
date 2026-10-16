// A real Express API, mounted into the Vite dev server. flatExpress() answers in Flat Notation when the
// client asks for it (the @flattype/* hooks do) and in JSON otherwise.
import { encode } from "@flattype/core";
import { CONTENT_TYPE, flatExpress, prefersFlat } from "@flattype/http";
import express from "express";

const cities = ["Paris", "Delhi", "Tokyo", "Lagos", "Lima"];
const users = Array.from({ length: 8 }, (_, i) => ({
  id: String(i + 1),
  full_name: ["Alice Martin", "Bob Singh", "Chen Wei", "Dara Okafor", "Eva Rossi", "Femi Ade", "Gita Rao", "Hugo Lind"][i],
  created_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  address: { city: cities[i % cities.length] },
}));

export const api = express();
api.use(flatExpress());

api.get("/users", (_req, res) => {
  res.json({ page: 1, data: users });
});

api.get("/users/:id", (req, res) => {
  const user = users.find((u) => u.id === req.params.id);
  if (user) res.json(user);
  else res.status(404).json({ error: "not found" });
});

// 200 rows sent in 10 pieces, 150 ms apart, so the page can render rows before the download finishes.
api.get("/export", async (req, res) => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, event: i % 3 ? "view" : "click", ms: (i * 37) % 900 }));
  if (!prefersFlat(req.headers.accept)) {
    res.json({ total: rows.length, rows });
    return;
  }
  const text = encode({ total: rows.length, rows });
  res.setHeader("content-type", CONTENT_TYPE);
  const piece = Math.ceil(text.length / 10);
  for (let i = 0; i < text.length; i += piece) {
    res.write(text.slice(i, i + piece));
    await new Promise((r) => setTimeout(r, 150));
  }
  res.end();
});
