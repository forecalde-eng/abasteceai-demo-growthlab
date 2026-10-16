import { shipments, orders, locations } from "@/mocks";
import type { EnvioDetalle } from "../useShipments";
import type { DispatchService } from "../dispatchShipment";

export function seedShipment(code = "ENV-DEMO-004"): EnvioDetalle {
  const shipment = shipments.find((row) => row.code === code)!;
  return { ...shipment, order: orders.find((row) => row.id === shipment.order_id)!, location: locations.find((row) => row.id === shipment.location_id)! };
}

// SOLO prueba UI: mismo envío/guía/QR del CSV en un estado anterior controlado.
// No modifica fixtures ni afirma que ese estado exista en el seed.
export function createdShipment(): EnvioDetalle {
  const shipment = seedShipment();
  return { ...shipment, status: "created", dispatched_at: null, delivered_at: null, order: { ...shipment.order, status: "ready" } };
}

export const calls: string[] = [];
export let mode: "success" | "error" | "invalid" = "success";
export function setMode(value: typeof mode) { mode = value; }
export function controlledDispatch(shipment: EnvioDetalle): DispatchService {
  return async (id) => {
    calls.push(id);
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (mode === "error") throw new Error("El envío ya no está creado. Consulta su estado.");
    return {
      id: mode === "invalid" ? "respuesta-de-otro-envio" : id,
      code: shipment.code, status: "dispatched", order_id: shipment.order_id,
      order_status: "shipped", guide_code: shipment.guide_code,
    };
  };
}
