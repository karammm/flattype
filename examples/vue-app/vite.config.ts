import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { api } from "./api";

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "flattype-example-api",
      configureServer(server) {
        server.middlewares.use("/api", api);
      },
    },
  ],
  server: { port: 5180, strictPort: true },
});
