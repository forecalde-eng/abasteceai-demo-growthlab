import { getSupabaseClient, useMocks } from "@/data";
import type { Order, Shipment } from "@/mocks";

export type ShipmentResult = {
  id: string; code: string; status: Shipment["status"];
  order_id: string; order_status: Order["status"]; guide_code?: string;
};
export type DispatchService = (id: string) => Promise<ShipmentResult>;

// temporal: reemplazar por @/data
// C1: POST sin body ni rol/staff; la transacción e idempotencia son del servidor.
export const dispatchShipment: DispatchService = async (id) => {
  if (useMocks) throw new Error("El servicio de despacho aún no está disponible en la demo. No se ha movido stock.");
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) throw new Error("Inicia sesión para despachar el envío.");
  const base = import.meta.env.VITE_BACKEND_URL;
  if (!base) throw new Error("Falta configurar la URL del backend.");
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/shipments/${encodeURIComponent(id)}/dispatch`, {
      method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
  } catch {
    throw new Error("No se recibió respuesta del servicio de despacho. Consulta el estado del envío antes de reintentar.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof body?.error?.message === "string" ? body.error.message : "El servicio rechazó el despacho.");
  }
  return body;
};

export function validateDispatchResult(value: unknown, shipment: Shipment): ShipmentResult {
  const result = value as ShipmentResult | null;
  if (!result || result.id !== shipment.id || result.code !== shipment.code ||
      result.order_id !== shipment.order_id || result.status !== "dispatched" ||
      result.order_status !== "shipped" ||
      (result.guide_code !== undefined && result.guide_code !== shipment.guide_code)) {
    throw new Error("La respuesta no confirma el despacho de este envío. Consulta su estado antes de reintentar.");
  }
  return result;
}
