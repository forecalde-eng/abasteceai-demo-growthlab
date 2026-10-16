import { demoMetadata, mapLocations, orders, routePlans, routeStops, vehicles } from '@/mocks'
import type { RoutingData } from './useRoutingData'
import { demoDispatchDate } from './routing-model'
import type { RoutePlanProposal, RoutePlanRequest } from './planRoutes'

/** Solo para pruebas unitarias: registros del seed, con PED-DEMO-009 en estado ready.
 * Los 8.5 km / 27 min son valores de prueba, NO estimaciones calculadas.
 */
export const routingTestData: RoutingData = {
  orders: orders.map((order) => order.code === 'PED-DEMO-009' ? { ...order, status: 'ready' } : order),
  locations: mapLocations, vehicles, routePlans, routeStops, referenceAt: demoMetadata[0].reference_at,
}
export const plannedOrder = routingTestData.orders.find((order) => order.code === 'PED-DEMO-009')!
export const unassignedOrder = routingTestData.orders.find((order) => order.code === 'PED-DEMO-007')!
export const fixtureRequest: RoutePlanRequest = {
  dispatch_date: demoDispatchDate(routingTestData.referenceAt),
  order_ids: [unassignedOrder.id, plannedOrder.id],
}

export function fixtureProposal(): RoutePlanProposal {
  const vehicle = vehicles.find((entry) => entry.code === 'VEH-DEMO-2')!
  const point = mapLocations.find((entry) => entry.id === plannedOrder.location_id)!
  return {
    matrix_source: 'synthetic', planning_method: 'ortools_vrptw',
    routes: [{ vehicle_id: vehicle.id, vehicle_code: vehicle.code, estimated_km: 8.5, estimated_minutes: 27,
      stops: [{ location_id: point.id, location_code: point.code, sequence: 1,
        planned_arrival: routeStops.find((stop) => stop.location_id === point.id)!.planned_arrival,
        order_ids: [plannedOrder.id] }],
    }],
    unassigned: [{ order_id: unassignedOrder.id, order_code: unassignedOrder.code, reason: 'capacity' }],
  }
}
