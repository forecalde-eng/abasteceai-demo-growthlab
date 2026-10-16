import { getSupabaseClient, useMocks } from '@/data'

export type RoutePlanRequest = { dispatch_date: string; order_ids: string[] }
export type PlannedStop = {
  location_id: string; location_code?: string; sequence: number;
  planned_arrival?: string | null; order_ids: string[];
}
export type PlannedRoute = {
  vehicle_id: string; vehicle_code: string; stops: PlannedStop[];
  estimated_km: number; estimated_minutes: number;
}
/** RoutePlanResult de OpenAPI. Propuesta del servicio, nunca cálculo de la UI. */
export type RoutePlanProposal = {
  matrix_source: 'synthetic' | 'openrouteservice'; planning_method: string;
  routes: PlannedRoute[];
  unassigned: { order_id: string; order_code: string; reason: 'capacity' | 'window' | 'no_vehicle' }[];
}
export type PlanRoutesService = (request: RoutePlanRequest) => Promise<RoutePlanProposal>

// temporal: reemplazar por @/data
// POST /routes/plan propone en memoria; no confirma ni crea envíos.
export const planRoutes: PlanRoutesService = async (request) => {
  if (useMocks) throw new Error('El planificador todavía no está disponible en la demo. No se han calculado km ni minutos ni creado envíos.')
  const { data, error } = await getSupabaseClient().auth.getSession()
  if (error || !data.session) throw new Error('Inicia sesión para solicitar un plan de rutas.')
  const base = import.meta.env.VITE_BACKEND_URL
  if (!base) throw new Error('Falta configurar la URL del backend.')
  let response: Response
  try {
    response = await fetch(`${base.replace(/\/$/, '')}/routes/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ dispatch_date: request.dispatch_date, order_ids: request.order_ids }),
    })
  } catch {
    throw new Error('No se pudo contactar al planificador. No se ha confirmado ninguna ruta.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof body?.error?.message === 'string' ? body.error.message : 'El servicio rechazó la planificación.')
  return body
}
