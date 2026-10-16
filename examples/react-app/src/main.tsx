import { FlatProvider } from "@flattype/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FlatProvider baseURL="/api">
      <App />
    </FlatProvider>
  </StrictMode>,
);
