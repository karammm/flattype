import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { api } from "./api";

export default defineConfig({
  plugins: [
    solid(),
    {
      name: "flattype-example-api",
      configureServer(server) {
        server.middlewares.use("/api", api);
      },
    },
  ],
  server: { port: 5182, strictPort: true },
});
