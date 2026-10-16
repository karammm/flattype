import { defineConfig } from "vite";

// Served from GitHub Pages at https://karammm.github.io/flattype/
export default defineConfig({ base: "/flattype/", server: { port: 5190, strictPort: true }, preview: { port: 4173, strictPort: true } });
