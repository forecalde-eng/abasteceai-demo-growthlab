import { getSupabaseClient, useMocks } from "@/data";

/** Parada del plan. Coincide con `RouteStop` de specs/000-contratos/openapi.yaml. */
export type RouteStop = {
  location_id: string;
  sequence: number;
  planned_arrival: string | null;
  order_ids: string[];
};

/** `RouteConfirmRequest`: sin rol ni staff; km y minutos vienen de la propuesta del backend. */
export type RouteConfirmRequest = {
  vehicle_id: string;
  dispatch_date: string;
  stops: RouteStop[];
  estimated_km: number;
  estimated_minutes: number;
  planning_method: string;
};

/** `RouteConfirmResult`. */
export type RouteConfirmResult = {
  route_plan_id: string;
  code: string;
  status: "approved";
  shipments: { id: string; code: string; status: "created"; order_id: string; order_status: string; guide_code: string }[];
};

export type ConfirmRoutesService = (body: RouteConfirmRequest) => Promise<RouteConfirmResult>;

// temporal: reemplazar por @/data
// C1: POST /routes/confirm. Sin propuesta del backend no hay km ni minutos que enviar.
export const confirmRoutes: ConfirmRoutesService = async (body) => {
  if (useMocks) throw new Error("La confirmación de rutas aún no está disponible en la demo. No se ha creado ningún envío.");
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) throw new Error("Inicia sesión para confirmar la ruta.");
  const base = import.meta.env.VITE_BACKEND_URL;
  if (!base) throw new Error("Falta configurar la URL del backend.");
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/routes/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No se recibió respuesta al confirmar la ruta. Revisa si ya se crearon envíos antes de reintentar.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "El servicio rechazó la ruta.");
  }
  return payload;
};

/** Valida la respuesta contra la propuesta confirmada: mismo plan, un envío created por pedido. */
export function validateRouteResult(value: unknown, request: RouteConfirmRequest): RouteConfirmResult {
  const result = value as RouteConfirmResult | null;
  const expectedOrders = request.stops.flatMap((stop) => stop.order_ids).sort();
  const actualOrders = (result?.shipments ?? []).map((row) => row.order_id).sort();
  if (!result || result.status !== "approved" || typeof result.route_plan_id !== "string" ||
      typeof result.code !== "string" || !Array.isArray(result.shipments) ||
      JSON.stringify(actualOrders) !== JSON.stringify(expectedOrders) ||
      result.shipments.some((row) => row.status !== "created" || !row.guide_code)) {
    throw new Error("La respuesta no coincide con la ruta confirmada. Revisa los envíos antes de continuar.");
  }
  return result;
}
