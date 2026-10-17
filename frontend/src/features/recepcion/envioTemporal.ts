import { shipments, shipmentItems } from "@/mocks";
import type { Shipment, ShipmentItem } from "@/mocks";

// temporal: reemplazar por el envío real del ciclo en vivo (/routes/confirm + despacho de bodega).
// Solo modo mocks. Copia el envío ENV-DEMO-005 (punto 85ffdf07, asignado al auxiliar) en estado
// `dispatched`, con código, guía y QR propios para no chocar con la semilla de PITCH-8.
const BASE = shipments.find((row) => row.code === "ENV-DEMO-005")!;
const TEMP_ID = "temp-envio-recepcion-001";

export const envioTemporal: Shipment = {
  ...BASE,
  id: TEMP_ID,
  code: "ENV-TEMP-001",
  guide_code: "GUIA-TEMP-001",
  qr_token: "temp-qr-recepcion-001",
  status: "dispatched",
  delivered_at: null,
};

// temporal: reemplazar por los ítems reales del envío del ciclo en vivo.
export const itemsEnvioTemporal: ShipmentItem[] = shipmentItems
  .filter((row) => row.shipment_id === BASE.id)
  .map((row) => ({ ...row, id: `${row.id}-temp`, shipment_id: TEMP_ID }));
