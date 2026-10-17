// Contratos de presentación existentes; las consultas usan Database generado desde SQL.
export type {
  Order,
  OrderItem,
  Product,
  Location,
  Incident,
  Shipment,
  Replenishment,
} from "@/mocks";
import type {
  Order,
  OrderItem,
  Product,
  Location,
  Incident,
  Shipment,
  ShipmentItem,
} from "@/mocks";

export type FiltroPedidos = { locationId?: string; cycleMonth?: string };
export type FiltroIncidencias = {
  orderId?: string;
  locationId?: string;
  status?: Incident["status"];
  kind?: Incident["kind"];
};
export type FiltroEnvios = {
  locationId?: string;
  orderId?: string;
  status?: Shipment["status"];
};
export type DetallePedido = {
  order: Order;
  items: (OrderItem & { product: Product })[];
};
export type EnvioDetalle = Shipment & {
  order: Order;
  location: Location;
  items: ShipmentItem[];
};
export type OrderResult = Pick<Order, "id" | "code" | "status">;
export type ShipmentResult = Pick<
  Shipment,
  "id" | "code" | "status" | "order_id" | "guide_code"
> & { order_status: Order["status"] };
export type NuevoPedido = {
  location_id: string;
  cycle_month: string;
  order_type: "regular" | "additional";
  related_order_id?: string | null;
  reason?: string | null;
  observations?: string | null;
  items: { product_id: string; requested_qty: number }[];
  idempotency_key: string;
};
export type DecisionInput = {
  decision: "approve" | "return" | "cancel";
  reason?: string;
  items?: { product_id: string; approved_qty: number }[];
};
export type AiProposal = {
  source: "SIMULADO" | "API_REAL";
  model: string;
  status: "proposed" | "human_review";
  answers: Record<string, unknown>;
  decision_log_id: string;
};
export type AnalysisResult = {
  order_id: string;
  duplicates: { order_id: string; order_code: string }[];
  missing_kit: { product_id: string; sku: string }[];
  incidents: {
    id: string;
    code: string;
    kind: "possible_duplicate" | "missing_from_kit";
  }[];
  proposal: AiProposal | null;
};
