import { getSupabaseClient, useMocks } from "@/data";

/** Una línea de recepción (`ReceiptRequest.items`). `accepted_qty <= counted_qty`. */
export type ReceiptItemInput = {
  shipment_item_id: string;
  counted_qty: number;
  accepted_qty: number;
};

export type ReceiptRequest = {
  notes?: string;
  items: ReceiptItemInput[];
};

export type ShipmentResult = {
  id: string;
  code: string;
  status: "created" | "dispatched" | "delivered_unchecked" | "reconciled" | "with_difference";
  order_id: string;
  order_status: string;
  guide_code?: string;
};

export type SubmitReceiptService = (shipmentId: string, body: ReceiptRequest) => Promise<ShipmentResult>;

// temporal: reemplazar por @/data
// C1: POST /shipments/{id}/receipt. La UI envía cantidades; el backend decide stock e incidencias.
export const submitReceipt: SubmitReceiptService = async (shipmentId, body) => {
  if (useMocks) throw new Error("La recepción aún no está disponible en la demo. No se ha movido stock.");
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) throw new Error("Inicia sesión para recibir el envío.");
  const base = import.meta.env.VITE_BACKEND_URL;
  if (!base) throw new Error("Falta configurar la URL del backend.");
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/shipments/${encodeURIComponent(shipmentId)}/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No se recibió respuesta al enviar la recepción. Revisa si ya se registró antes de reintentar.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "El servicio rechazó la recepción.");
  }
  return payload;
};

/** Valida el resultado contra el envío recibido: estado conciliado o con diferencia. */
export function validateReceiptResult(value: unknown, shipmentId: string): ShipmentResult {
  const result = value as ShipmentResult | null;
  if (!result || result.id !== shipmentId || !["reconciled", "with_difference"].includes(result.status) ||
      !["reconciled", "with_difference", "shipped", "delivered_unchecked"].includes(result.order_status)) {
    throw new Error("La respuesta no confirma la recepción de este envío. Consulta su estado antes de reintentar.");
  }
  return result;
}

/** Reglas de envío de la pantalla, separadas para comprobarlas. El backend valida de nuevo. */
export function canSubmitReceipt(lines: { counted: number; accepted: number; shipped: number }[]): boolean {
  return lines.length > 0 && lines.every((line) =>
    Number.isFinite(line.counted) && Number.isFinite(line.accepted) &&
    line.counted >= 0 && line.accepted >= 0 &&
    line.counted <= line.shipped && line.accepted <= line.counted,
  );
}
