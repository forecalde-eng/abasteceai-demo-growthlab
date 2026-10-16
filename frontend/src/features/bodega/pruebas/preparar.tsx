import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreparacionEditor } from "../PreparacionEditor";
import { controlledService, seedPreparation } from "./fixture";
import "../../../index.css";

if (import.meta.env.DEV) {
  const code = new URLSearchParams(window.location.search).get("pedido") === "PED-DEMO-006" ? "PED-DEMO-006" : "PED-DEMO-003";
  const seed = seedPreparation(code);
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={new QueryClient()}>
      <div className="min-h-8 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">DEMO FICTICIA · PRUEBA UI AISLADA · No escribe reservas</div>
      <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6"><h1 className="text-2xl font-semibold">Prueba de preparación</h1><PreparacionEditor order={seed.order} lines={seed.lines} service={controlledService(seed)} /></main>
    </QueryClientProvider>,
  );
}
