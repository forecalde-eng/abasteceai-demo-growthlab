import { getSupabaseClient } from '@/data'
import type { RoutePlan, RouteStopRecord, Vehicle } from '@/mocks'

// temporal: reemplazar por @/data (useVehicles, useRoutePlans y useRouteStops aún no están exportados).
// Solo lecturas con RLS de la sesión. No calcula rutas ni crea envíos.
export async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await getSupabaseClient().from('vehicles').select('*').order('code')
  if (error) throw error
  return data as Vehicle[]
}

export async function fetchRoutePlans(): Promise<RoutePlan[]> {
  const { data, error } = await getSupabaseClient().from('route_plans').select('*').order('code')
  if (error) throw error
  return data as RoutePlan[]
}

export async function fetchRouteStops(): Promise<RouteStopRecord[]> {
  const { data, error } = await getSupabaseClient().from('route_stops').select('route_id, location_id, sequence, planned_arrival').order('sequence')
  if (error) throw error
  return data as RouteStopRecord[]
}
