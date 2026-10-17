import { useMocks } from "./supabase";
import { postBackend } from "./backend";
import type {
  NuevoPedido,
  DecisionInput,
  OrderResult,
  ShipmentResult,
  AnalysisResult,
} from "./models";
export { ErrorApi } from "./backend";

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown, keys: string[]) =>
  object(value) && keys.every((k) => typeof value[k] === "string");
const validOrder = (value: unknown) => strings(value, ["id", "code", "status"]);
const validShipment = (value: unknown) =>
  strings(value, [
    "id",
    "code",
    "status",
    "order_id",
    "order_status",
    "guide_code",
  ]);
const validAnalysis = (value: unknown) =>
  object(value) &&
  typeof value.order_id === "string" &&
  ["duplicates", "missing_kit", "incidents"].every((k) =>
    Array.isArray(value[k]),
  ) &&
  (value.proposal === null ||
    (strings(value.proposal, [
      "source",
      "model",
      "status",
      "decision_log_id",
    ]) &&
      object(value.proposal) &&
      object(value.proposal.answers)));

export async function createOrder(input: NuevoPedido): Promise<OrderResult> {
  if (useMocks) return (await import("./mock-state")).mockCreate(input);
  // El formulario legado usa null; OpenAPI permite omitir estos campos, no null.
  const body = {
    location_id: input.location_id,
    cycle_month: input.cycle_month,
    order_type: input.order_type,
    items: input.items,
    ...(input.related_order_id != null
      ? { related_order_id: input.related_order_id }
      : {}),
    ...(input.reason != null ? { reason: input.reason } : {}),
    ...(input.observations != null ? { observations: input.observations } : {}),
  };
  return postBackend("/orders", body, input.idempotency_key, validOrder);
}
export async function analyzeOrder(id: string): Promise<AnalysisResult> {
  if (useMocks) return (await import("./mock-state")).mockAnalyze(id);
  return postBackend(
    `/orders/${encodeURIComponent(id)}/analyze`,
    undefined,
    undefined,
    validAnalysis,
  );
}
export async function decideOrder(
  id: string,
  input: DecisionInput,
): Promise<OrderResult> {
  if (useMocks) return (await import("./mock-state")).mockDecide(id, input);
  return postBackend(
    `/orders/${encodeURIComponent(id)}/decision`,
    input,
    undefined,
    validOrder,
  );
}
export async function markDelivered(id: string): Promise<ShipmentResult> {
  if (useMocks) return (await import("./mock-state")).mockDelivered(id);
  return postBackend(
    `/shipments/${encodeURIComponent(id)}/delivered`,
    undefined,
    undefined,
    validShipment,
  );
}
