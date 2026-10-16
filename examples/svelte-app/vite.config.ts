import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { api } from "./api";

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: "flattype-example-api",
      configureServer(server) {
        server.middlewares.use("/api", api);
      },
    },
  ],
  server: { port: 5181, strictPort: true },
});
