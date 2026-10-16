import { getSupabaseClient, useMocks } from "@/data";
import type { Order } from "@/mocks";
import metadata from "../../../../db/datos/demo_metadata.csv?raw";

export type PrepareItem = { product_id: string; prepared_qty: number };
export type PrepareOptions = { dryRun: boolean; items: PrepareItem[] };
export type PrepareResult = {
  order_id: string;
  code: string;
  status: Order["status"];
  dry_run: boolean;
  incident_code?: string | null;
  lines: {
    product_id: string; sku: string; approved_qty: number; prepared_qty: number;
    lots: { lot_id: string; batch_code: string; expires_on: string | null; qty: number }[];
  }[];
};
export type PrepareService = (id: string, options: PrepareOptions) => Promise<PrepareResult>;

// La fecha sale del CSV oficial: no del reloj del dispositivo.
export const referenceDate = metadata.trim().split(/\r?\n/)[1].split(',')[1].slice(0, 10);

// temporal: reemplazar por @/data
// Adaptador C1. No calcula FEFO ni simula reservas; el backend realiza la operación.
export const prepareOrder: PrepareService = async (id, { dryRun, items }) => {
  if (useMocks) {
    throw new Error("La preparación todavía no tiene un servicio de demo. No se ha reservado ni modificado stock.");
  }
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) throw new Error("Inicia sesión para preparar el pedido.");
  const base = import.meta.env.VITE_BACKEND_URL;
  if (!base) throw new Error("Falta configurar la URL del backend.");
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/orders/${encodeURIComponent(id)}/prepare?dry_run=${dryRun}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ items }),
    });
  } catch {
    throw new Error("No se pudo contactar al servicio de preparación. Revisa el pedido antes de reintentar.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof body?.error?.message === "string" ? body.error.message : "El servicio rechazó la preparación.");
  }
  return body;
};

/** Validación de respuesta, no algoritmo de selección de lotes ni cálculo de saldos. */
export function validatePrepareResult(
  value: unknown,
  order: Pick<Order, "id" | "code">,
  requested: PrepareItem[],
  approved: Map<string, { sku: string; approved_qty: number }>,
  dryRun: boolean,
): PrepareResult {
  const result = value as PrepareResult | null;
  const fail = () => { throw new Error("La respuesta de preparación no es válida. Solicita una nueva vista previa."); };
  if (!result || result.order_id !== order.id || result.code !== order.code || result.dry_run !== dryRun ||
      !Array.isArray(result.lines) || result.lines.length !== requested.length ||
      !["approved", "preparing", "ready"].includes(result.status)) return fail();
  if (!dryRun && !["preparing", "ready"].includes(result.status)) return fail();
  if (result.incident_code != null && (typeof result.incident_code !== "string" || !result.incident_code.startsWith("INC-"))) return fail();
  const seen = new Set<string>();
  for (const line of result.lines) {
    if (!line || typeof line !== "object") return fail();
    const item = requested.find((entry) => entry.product_id === line.product_id);
    const approval = approved.get(line.product_id);
    if (!item || !approval || seen.has(line.product_id) || line.sku !== approval.sku ||
        line.approved_qty !== approval.approved_qty || !Number.isFinite(line.prepared_qty) ||
        line.prepared_qty < 0 || line.prepared_qty > item.prepared_qty || !Array.isArray(line.lots)) return fail();
    seen.add(line.product_id);
    let allocated = 0;
    for (const lot of line.lots) {
      if (!lot || typeof lot.lot_id !== "string" || typeof lot.batch_code !== "string" ||
          !Number.isFinite(lot.qty) || lot.qty <= 0) return fail();
      if (lot.expires_on !== null && (typeof lot.expires_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(lot.expires_on))) return fail();
      if (lot.expires_on !== null && lot.expires_on < referenceDate) {
        throw new Error("El servicio devolvió un lote vencido al reloj de demo. No se puede confirmar este plan.");
      }
      allocated += lot.qty;
    }
    if (Math.abs(allocated - line.prepared_qty) > 0.000001) return fail();
  }
  return result;
}
