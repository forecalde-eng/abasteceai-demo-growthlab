import { shipments, shipmentItems, products, orders, locations } from "@/mocks";
import type { RecepcionEnvio } from "../useShipmentByQr";
import type { SubmitReceiptService } from "../submitReceipt";

// SOLO prueba UI: mismo envío/guía/QR del CSV en un estado anterior controlado (dispatched).
export function receivableShipment(code = "ENV-DEMO-005"): RecepcionEnvio {
  const shipment = shipments.find((row) => row.code === code)!;
  const location = locations.find((row) => row.id === shipment.location_id)!;
  const order = orders.find((row) => row.id === shipment.order_id)!;
  return {
    ...shipment,
    status: "dispatched",
    delivered_at: null,
    order_code: order.code,
    point_code: location.code,
    point_name: location.name,
    items: shipmentItems.filter((row) => row.shipment_id === shipment.id).map((row) => ({
      ...row, product: products.find((product) => product.id === row.product_id)!,
    })),
  };
}

export const calls: string[] = [];
export let mode: "success" | "error" = "success";
export function setMode(value: typeof mode) { mode = value; }
export function controlledSubmit(shipment: RecepcionEnvio): SubmitReceiptService {
  return async (id, body) => {
    calls.push(id);
    // Contador compartido para la prueba de navegador (window es único por página).
    (window as unknown as { __recepcionCalls?: number }).__recepcionCalls = ((window as unknown as { __recepcionCalls?: number }).__recepcionCalls ?? 0) + 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (mode === "error") throw new Error("Ya existe una recepción para este envío.");
    const shippedByItem = new Map(shipment.items.map((item) => [item.id, item.shipped_qty]));
    const hasDifference = body.items.some((item) =>
      item.counted_qty < (shippedByItem.get(item.shipment_item_id) ?? 0) || item.accepted_qty < item.counted_qty,
    );
    return {
      id: shipment.id, code: shipment.code, order_id: shipment.order_id,
      status: hasDifference ? "with_difference" : "reconciled",
      order_status: hasDifference ? "with_difference" : "reconciled",
      guide_code: shipment.guide_code,
    };
  };
}
