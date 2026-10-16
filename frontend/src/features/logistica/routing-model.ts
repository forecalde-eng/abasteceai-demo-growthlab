import type { Location, Order, RoutePlan, RouteStopRecord, Vehicle } from '@/mocks'
import type { RoutePlanProposal as ConfirmationProposal } from './ConfirmarRuta'
import type { PlannedRoute, RoutePlanProposal, RoutePlanRequest } from './planRoutes'
import { isLocated } from './mapa-model'

export const UNASSIGNED_LABEL = { capacity: 'Capacidad insuficiente', window: 'Ventana horaria incompatible', no_vehicle: 'Sin vehículo disponible' } as const

export function demoDispatchDate(referenceAt: string): string {
  const date = new Date(referenceAt)
  if (!Number.isFinite(date.getTime())) throw new Error('No se pudo leer el reloj de demo.')
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function readyQuitoOrders(orders: Order[], locations: Location[]): Order[] {
  const quito = new Set(locations.filter((point) => point.city === 'Quito' && point.kind === 'service_point').map((point) => point.id))
  return orders.filter((order) => order.status === 'ready' && quito.has(order.location_id)).sort((a, b) => a.code.localeCompare(b.code))
}

export function isPlanDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
}

export function validateRoutePlanProposal(value: unknown, request: RoutePlanRequest, context: {
  orders: Order[]; locations: Location[]; vehicles: Vehicle[];
}): RoutePlanProposal {
  const fail = () => { throw new Error('La propuesta de rutas está incompleta o no coincide con los pedidos y vehículos solicitados.') }
  const result = value as RoutePlanProposal | null
  if (!result || !['synthetic', 'openrouteservice'].includes(result.matrix_source) ||
      typeof result.planning_method !== 'string' || !result.planning_method.trim() ||
      !Array.isArray(result.routes) || !Array.isArray(result.unassigned) || !isPlanDate(request.dispatch_date) ||
      !request.order_ids.length || new Set(request.order_ids).size !== request.order_ids.length) return fail()
  const ready = new Map(readyQuitoOrders(context.orders, context.locations).map((order) => [order.id, order]))
  const selected = new Set(request.order_ids)
  if (request.order_ids.some((id) => !ready.has(id))) return fail()
  const seen = new Set<string>()
  const vehicleIds = new Set<string>()
  for (const route of result.routes) {
    if (!route || typeof route !== 'object' || !Array.isArray(route.stops) ||
        !Number.isFinite(route.estimated_km) || route.estimated_km < 0 ||
        !Number.isFinite(route.estimated_minutes) || route.estimated_minutes < 0) return fail()
    const vehicle = context.vehicles.find((entry) => entry.id === route.vehicle_id)
    if (!vehicle || vehicle.code !== route.vehicle_code || vehicleIds.has(vehicle.id)) return fail()
    vehicleIds.add(vehicle.id)
    const sequences = new Set<number>()
    for (const stop of route.stops) {
      if (!stop || !Number.isInteger(stop.sequence) || stop.sequence < 1 || sequences.has(stop.sequence) || !Array.isArray(stop.order_ids)) return fail()
      sequences.add(stop.sequence)
      const point = context.locations.find((entry) => entry.id === stop.location_id)
      if (!point || point.city !== 'Quito' || !isLocated(point) || (stop.location_code !== undefined && stop.location_code !== point.code)) return fail()
      if (stop.planned_arrival !== undefined && stop.planned_arrival !== null &&
          (typeof stop.planned_arrival !== 'string' || !Number.isFinite(Date.parse(stop.planned_arrival)))) return fail()
      for (const id of stop.order_ids) {
        if (!selected.has(id) || seen.has(id) || ready.get(id)?.location_id !== stop.location_id) return fail()
        seen.add(id)
      }
    }
  }
  for (const entry of result.unassigned) {
    if (!entry || !selected.has(entry.order_id) || seen.has(entry.order_id) || ready.get(entry.order_id)?.code !== entry.order_code ||
        !Object.hasOwn(UNASSIGNED_LABEL, entry.reason)) return fail()
    seen.add(entry.order_id)
  }
  if (seen.size !== selected.size) return fail()
  return result
}

export function confirmationProposal(route: PlannedRoute, result: RoutePlanProposal, dispatchDate: string, locations: Location[]): ConfirmationProposal {
  return {
    vehicle_id: route.vehicle_id, dispatch_date: dispatchDate, planning_method: result.planning_method,
    estimated_km: route.estimated_km, estimated_minutes: route.estimated_minutes,
    stops: [...route.stops].sort((a, b) => a.sequence - b.sequence).map((stop) => ({
      location: locations.find((point) => point.id === stop.location_id)!,
      order_ids: [...stop.order_ids], sequence: stop.sequence, planned_arrival: stop.planned_arrival ?? null,
    })),
  }
}

export function referenceRoute(plans: RoutePlan[], stops: RouteStopRecord[], locations: Location[]) {
  const plan = plans.find((entry) => entry.code === 'RUTA-DEMO-2')
  return plan ? { plan, stops: stops.filter((entry) => entry.route_id === plan.id)
    .sort((a, b) => a.sequence - b.sequence)
    .map((stop) => ({ ...stop, location: locations.find((point) => point.id === stop.location_id) })) } : null
}

/** Solo une las coordenadas de bodega y paradas; no estima km, minutos ni calles. */
export function routePositions(locations: Location[], stops: { location_id: string; sequence: number }[]): [number, number][] {
  const origin = locations.find((point) => point.code === 'BOD-DEMO')
  if (!origin || !isLocated(origin)) return []
  const points = [...stops].sort((a, b) => a.sequence - b.sequence).map((stop) => locations.find((point) => point.id === stop.location_id))
  if (points.some((point) => !point || !isLocated(point))) return []
  return [[origin.latitude, origin.longitude], ...points.map((point) => [point!.latitude!, point!.longitude!] as [number, number])]
}
