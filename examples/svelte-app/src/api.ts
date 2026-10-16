import { createFlat } from "@flattype/svelte";

// Shared options for every store in the app.
export const api = createFlat({ baseURL: "/api" });
