import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "./demo.css";
import { AgentDemo } from "./AgentDemo";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AgentDemo />
  </StrictMode>,
);
