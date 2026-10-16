import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PanelDespacho } from "../PanelDespacho";
import { controlledDispatch, createdShipment } from "./fixture";
import "../../../index.css";

if (import.meta.env.DEV) {
  const shipment = createdShipment();
  if (new URLSearchParams(window.location.search).get("pedido") === "approved") shipment.order.status = "approved";
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={new QueryClient()}>
      <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">DEMO FICTICIA · PRUEBA UI · Estado controlado · No mueve stock</div>
      <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6"><h1 className="text-2xl font-semibold">Prueba de despacho</h1><PanelDespacho shipment={shipment} service={controlledDispatch(shipment)} /></main>
    </QueryClientProvider>,
  );
}
