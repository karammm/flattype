import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { api } from "./api";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "flattype-example-api",
      configureServer(server) {
        server.middlewares.use("/api", api);
      },
    },
  ],
  server: { port: 5179, strictPort: true },
});
