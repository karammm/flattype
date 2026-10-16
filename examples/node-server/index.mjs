// An Express API that answers in Flat Notation when asked (JSON otherwise), and a client that reads it.
import express from "express";
import { ACCEPT, createClient, flatExpress, streamRows } from "@flattype/http";
import { defineModel } from "@flattype/models";

const app = express();
app.use(flatExpress());
app.get("/users", (_req, res) => {
  res.json({
    page: 1,
    data: Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), full_name: `User ${i + 1}`, created_at: "2026-01-01T09:00:00Z" })),
  });
});

const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;

  // Plain clients still get JSON.
  console.log("curl:", (await (await fetch(`${base}/users`)).text()).slice(0, 60), "…");

  // Clients that send the FlatType Accept header get Flat Notation…
  console.log((await (await fetch(`${base}/users`, { headers: { accept: ACCEPT } })).text()));

  // …which createClient decodes and maps straight to typed models.
  const User = defineModel({ id: "number", fullName: "string", createdAt: "date" });
  const page = await createClient({ baseURL: base }).get("/users");
  console.log("models:", User.parseList(page.data).slice(0, 2));

  // Big lists: handle rows while they are still downloading.
  for await (const row of streamRows(`${base}/users`)) console.log("row", row.index, row.value.full_name);

  server.close();
});
