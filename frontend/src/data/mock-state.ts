// Estado temporal de la demo en memoria. Datos originales exclusivamente de @/mocks.
// No escribe en Supabase, no inventa clasificaciones IA ni modifica fixtures de Bruno.
import {
  orders,
  orderItems,
  incidents,
  shipments,
  products,
  decisionLogs,
  demoMetadata,
} from "@/mocks";
import { getMockSession } from "./session.mock";
import type { Role } from "./useSession";
import type {
  NuevoPedido,
  DecisionInput,
  OrderResult,
  ShipmentResult,
  AnalysisResult,
  AiProposal,
} from "./models";
import { ErrorApi } from "./backend";

export const mockOrders = structuredClone(orders);
export const mockItems = structuredClone(orderItems);
export const mockIncidents = structuredClone(incidents);
export const mockShipments = structuredClone(shipments);
export const mockAnalyses = new Map<string, AnalysisResult>();
const created = new Map<string, { actor: string; result: OrderResult }>();

function actor() {
  let role: Role = "administrador";
  try {
    const saved = globalThis.localStorage?.getItem("abasteceai.dev.role");
    if (
      [
        "auxiliar",
        "supervisor",
        "administrador",
        "bodega",
        "logistica",
        "compras",
        "gerencia",
      ].includes(saved ?? "")
    )
      role = saved as Role;
  } catch {
    /* Sin almacenamiento: misma selección inicial que useSession. */
  }
  return getMockSession(role);
}
function order(id: string) {
  const row = mockOrders.find((o) => o.id === id);
  if (!row) throw new ErrorApi(404, "NOT_FOUND", "Pedido no encontrado");
  return row;
}
function pointAllowed(location: string) {
  return actor().points.some((p) => p.id === location);
}
export function mockProposal(id: string): AiProposal | null {
  const log = decisionLogs.find(
    (l) => l.order_id === id && l.provider !== "rules",
  );
  if (!log) return null;
  const r = log.response as {
    model?: string;
    answers?: Record<string, unknown>;
  };
  return {
    source: log.provider === "mock" ? "SIMULADO" : "API_REAL",
    model: r.model ?? log.model_version,
    status: log.status === "proposed" ? "proposed" : "human_review",
    answers: r.answers ?? {},
    decision_log_id: log.id,
  };
}
export function mockDecide(id: string, input: DecisionInput): OrderResult {
  const s = actor(),
    o = order(id);
  if (s.role !== "administrador" || s.staff_id === o.requested_by)
    throw new ErrorApi(403, "FORBIDDEN", "No puedes decidir este pedido");
  if (o.status !== "submitted")
    throw new ErrorApi(
      409,
      "INVALID_STATE",
      "Solo se decide un pedido enviado",
    );
  const lines = mockItems.filter((i) => i.order_id === id);
  const seen = new Set<string>();
  for (const i of input.items ?? []) {
    const line = lines.find((l) => l.product_id === i.product_id);
    if (
      !line ||
      seen.has(i.product_id) ||
      !Number.isFinite(i.approved_qty) ||
      i.approved_qty < 0 ||
      i.approved_qty > line.requested_qty
    )
      throw new ErrorApi(422, "VALIDATION", "Cantidad aprobada inválida");
    seen.add(i.product_id);
  }
  const changed =
    input.decision === "approve" &&
    input.items?.some(
      (i) =>
        lines.find((l) => l.product_id === i.product_id)?.requested_qty !==
        i.approved_qty,
    );
  if ((input.decision !== "approve" || changed) && !input.reason?.trim())
    throw new ErrorApi(422, "VALIDATION", "Esta decisión necesita un motivo", {
      field: "reason",
    });
  if (input.decision === "approve")
    for (const i of lines)
      i.approved_qty =
        input.items?.find((l) => l.product_id === i.product_id)?.approved_qty ??
        i.requested_qty;
  o.status =
    input.decision === "approve"
      ? "approved"
      : input.decision === "return"
        ? "draft"
        : "cancelled";
  if (input.decision === "approve") {
    o.approved_by = s.staff_id;
    o.approved_at = demoMetadata[0].reference_at;
  }
  return { id: o.id, code: o.code, status: o.status };
}
export function mockCreate(input: NuevoPedido): OrderResult {
  const s = actor(),
    prior = created.get(input.idempotency_key);
  if (prior) {
    if (prior.actor !== s.staff_id)
      throw new ErrorApi(404, "NOT_FOUND", "Pedido no encontrado");
    return prior.result;
  }
  if (
    !["auxiliar", "supervisor"].includes(s.role) ||
    !pointAllowed(input.location_id)
  )
    throw new ErrorApi(403, "FORBIDDEN", "Punto no asignado");
  if (
    !input.idempotency_key.trim() ||
    !input.items.length ||
    new Set(input.items.map((i) => i.product_id)).size !== input.items.length ||
    input.items.some(
      (i) =>
        !products.some((p) => p.id === i.product_id && p.active) ||
        !Number.isFinite(i.requested_qty) ||
        i.requested_qty <= 0,
    )
  )
    throw new ErrorApi(422, "VALIDATION", "Ítems o clave inválidos");
  if (input.order_type === "additional") {
    const related = mockOrders.find(
      (o) =>
        o.id === input.related_order_id &&
        o.location_id === input.location_id &&
        o.cycle_month === input.cycle_month,
    );
    if (!related || !input.reason?.trim())
      throw new ErrorApi(
        422,
        "VALIDATION",
        "Un adicional requiere pedido del mismo punto/mes y motivo",
      );
  }
  const number =
    Math.max(
      ...mockOrders.map((o) =>
        Number(o.code.match(/^PED-DEMO-(\d+)$/)?.[1] ?? 0),
      ),
    ) + 1;
  const row = {
    id: crypto.randomUUID(),
    code: `PED-DEMO-${String(number).padStart(3, "0")}`,
    location_id: input.location_id,
    cycle_month: input.cycle_month,
    requested_by: s.staff_id,
    approved_by: null,
    requested_at: demoMetadata[0].reference_at,
    approved_at: null,
    status: "submitted" as const,
    order_type: input.order_type,
    related_order_id: input.related_order_id ?? null,
    reason: input.reason ?? null,
    observations: input.observations ?? "",
    idempotency_key: input.idempotency_key,
    provenance: "synthetic" as const,
  };
  mockOrders.push(row);
  mockItems.push(
    ...input.items.map((i) => ({
      ...i,
      id: crypto.randomUUID(),
      order_id: row.id,
      approved_qty: null,
      prepared_qty: 0,
    })),
  );
  const result = { id: row.id, code: row.code, status: row.status };
  created.set(input.idempotency_key, { actor: s.staff_id, result });
  return result;
}
export function mockAnalyze(id: string): AnalysisResult {
  const o = order(id),
    s = actor();
  if (
    s.role !== "administrador" &&
    !(
      ["auxiliar", "supervisor"].includes(s.role) &&
      s.staff_id === o.requested_by
    )
  )
    throw new ErrorApi(403, "FORBIDDEN", "No puedes analizar este pedido");
  if (o.status !== "submitted")
    return {
      order_id: id,
      duplicates: [],
      missing_kit: [],
      incidents: [],
      proposal: mockProposal(id),
    };
  const fingerprint = (orderId: string) =>
    mockItems
      .filter((i) => i.order_id === orderId)
      .map((i) => `${i.product_id}:${i.requested_qty}`)
      .sort()
      .join(",");
  const duplicates = mockOrders
    .filter(
      (other) =>
        other.id !== id &&
        other.status !== "cancelled" &&
        other.order_type === "regular" &&
        o.order_type === "regular" &&
        other.location_id === o.location_id &&
        other.cycle_month === o.cycle_month &&
        fingerprint(other.id) === fingerprint(id),
    )
    .map((other) => ({ order_id: other.id, order_code: other.code }));
  // temporal: el kit no tiene fixture propio; conservar el caso original 002 de Bruno/Jorge.
  const missing_kit =
    o.code === "PED-DEMO-002"
      ? products
          .filter((p) => p.sku === "INS-016")
          .map((p) => ({ product_id: p.id, sku: p.sku }))
      : [];
  for (const [kind, detected] of [
    ["possible_duplicate", duplicates.length > 0],
    ["missing_from_kit", missing_kit.length > 0],
  ] as const) {
    if (
      detected &&
      !mockIncidents.some(
        (i) => i.order_id === id && i.kind === kind && i.status !== "resolved",
      )
    )
      mockIncidents.push({
        id: crypto.randomUUID(),
        code: `INC-MOCK-${mockIncidents.length + 1}`,
        location_id: o.location_id,
        order_id: id,
        shipment_id: null,
        kind,
        severity: kind === "possible_duplicate" ? "high" : "medium",
        status: "open",
        description: `DEMO FICTICIA: ${kind}`,
        created_at: demoMetadata[0].reference_at,
        created_by: s.staff_id,
        provenance: "synthetic",
      });
  }
  const result: AnalysisResult = {
    order_id: id,
    duplicates,
    missing_kit,
    incidents: mockIncidents
      .filter(
        (i) =>
          i.order_id === id &&
          i.status !== "resolved" &&
          (i.kind === "possible_duplicate" || i.kind === "missing_from_kit"),
      )
      .map((i) => ({
        id: i.id,
        code: i.code,
        kind: i.kind as "possible_duplicate" | "missing_from_kit",
      })),
    proposal: mockProposal(id),
  };
  mockAnalyses.set(id, result);
  return result;
}
export function mockDelivered(id: string): ShipmentResult {
  const s = actor(),
    row = mockShipments.find((i) => i.id === id);
  if (s.role !== "supervisor")
    throw new ErrorApi(403, "FORBIDDEN", "Solo supervisor");
  if (!row) throw new ErrorApi(404, "NOT_FOUND", "Envío no encontrado");
  if (!pointAllowed(row.location_id))
    throw new ErrorApi(403, "FORBIDDEN", "Punto no asignado");
  const o = order(row.order_id);
  if (row.status !== "dispatched" && row.status !== "delivered_unchecked")
    throw new ErrorApi(409, "INVALID_STATE", "Envío no apto para entrega");
  if (row.status === "dispatched") {
    row.status = "delivered_unchecked";
    row.delivered_at = demoMetadata[0].reference_at;
    o.status = "delivered_unchecked";
  }
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    order_id: o.id,
    order_status: o.status,
    guide_code: row.guide_code,
  };
}
