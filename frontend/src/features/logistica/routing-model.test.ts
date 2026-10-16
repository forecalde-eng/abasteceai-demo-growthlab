import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoMetadata, mapLocations, orders, routePlans, routeStops, vehicles } from '@/mocks'
import {
  confirmationProposal, demoDispatchDate, readyQuitoOrders, referenceRoute,
  routePositions, validateRoutePlanProposal,
} from './routing-model'
import { canConfirmRoute } from './ConfirmarRuta'
import { fixtureProposal, fixtureRequest, routingTestData } from './routing-test-fixture'

afterEach(() => vi.useRealTimers())

describe('B-4.2: datos y reloj oficiales', () => {
  it('el seed tiene solo PED-DEMO-007 listo de Quito', () => {
    expect(readyQuitoOrders(orders, mapLocations).map((order) => order.code)).toEqual(['PED-DEMO-007'])
  })
  it('la fecha predeterminada usa reference_at, incluso con otro reloj del equipo', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2040-01-01T00:00:00Z'))
    expect(demoDispatchDate(demoMetadata[0].reference_at)).toBe('2026-10-10')
    expect(demoDispatchDate('2026-10-11T02:00:00Z')).toBe('2026-10-10')
  })
  it('conserva RUTA-DEMO-2 Q-006 → Q-007 sin km ni minutos inventados', () => {
    const reference = referenceRoute(routePlans, routeStops, mapLocations)!
    expect(reference.stops.map((stop) => stop.location?.code)).toEqual(['Q-006', 'Q-007'])
    expect(reference.plan.estimated_km).toBeNull()
    expect(reference.plan.estimated_minutes).toBeNull()
    expect(referenceRoute([], routeStops, mapLocations)).toBeNull()
  })
  it('los trazos solo usan coordenadas de bodega y paradas del CSV en orden', () => {
    const reference = referenceRoute(routePlans, routeStops, mapLocations)!
    const positions = routePositions(mapLocations, [...reference.stops].reverse())
    const origin = mapLocations.find((point) => point.code === 'BOD-DEMO')!
    expect(positions[0]).toEqual([origin.latitude, origin.longitude])
    expect(positions.slice(1)).toEqual(reference.stops.map((stop) => [stop.location!.latitude, stop.location!.longitude]))
    expect(routePositions([], reference.stops)).toEqual([])
  })
})

describe('validación de la propuesta del backend', () => {
  const result = fixtureProposal()
  const validate = (value: unknown) => validateRoutePlanProposal(value, fixtureRequest, routingTestData)
  it('acepta la partición completa de asignados y no asignados', () => {
    expect(validate(result)).toBe(result)
  })
  it('acepta una respuesta sin rutas cuando todos quedan no asignados', () => {
    const value = { ...result, routes: [], unassigned: fixtureRequest.order_ids.map((id) => ({
      order_id: id, order_code: routingTestData.orders.find((order) => order.id === id)!.code, reason: 'no_vehicle',
    })) }
    expect(validate(value)).toEqual(value)
  })
  it.each([
    { name: 'matriz desconocida', value: { ...result, matrix_source: 'inventada' } },
    { name: 'método ausente', value: { ...result, planning_method: '' } },
    { name: 'rutas no es arreglo', value: { ...result, routes: {} } },
    { name: 'sin no asignados', value: { ...result, unassigned: [] } },
    { name: 'vehículo ajeno', value: { ...result, routes: [{ ...result.routes[0], vehicle_id: 'ajeno' }] } },
    { name: 'código de vehículo incoherente', value: { ...result, routes: [{ ...result.routes[0], vehicle_code: 'VEH-AJENO' }] } },
    { name: 'km negativos', value: { ...result, routes: [{ ...result.routes[0], estimated_km: -1 }] } },
    { name: 'minutos no finitos', value: { ...result, routes: [{ ...result.routes[0], estimated_minutes: NaN }] } },
    { name: 'parada sin ubicación válida', value: { ...result, routes: [{ ...result.routes[0], stops: [{ ...result.routes[0].stops[0], location_id: 'ajeno' }] }] } },
    { name: 'secuencia no entera', value: { ...result, routes: [{ ...result.routes[0], stops: [{ ...result.routes[0].stops[0], sequence: 1.5 }] }] } },
    { name: 'pedido repetido', value: { ...result, unassigned: [...result.unassigned, { order_id: result.routes[0].stops[0].order_ids[0], order_code: 'PED-DEMO-009', reason: 'capacity' }] } },
    { name: 'motivo desconocido', value: { ...result, unassigned: [{ ...result.unassigned[0], reason: 'inventado' }] } },
    { name: 'código de pedido incoherente', value: { ...result, unassigned: [{ ...result.unassigned[0], order_code: 'PED-AJENO' }] } },
  ])('rechaza $name', ({ value }) => {
    expect(() => validate(value)).toThrow('La propuesta de rutas está incompleta')
  })
  it('no acepta planificación para un pedido que dejó de estar listo', () => {
    expect(() => validateRoutePlanProposal(result, fixtureRequest, { ...routingTestData, orders })).toThrow('no coincide')
  })
  it('no envía confirmación con una fecha imposible o sin selección', () => {
    expect(() => validateRoutePlanProposal(result, { ...fixtureRequest, dispatch_date: '2026-02-30' }, routingTestData)).toThrow()
    expect(() => validateRoutePlanProposal(result, { ...fixtureRequest, order_ids: [] }, routingTestData)).toThrow()
  })
  it('conserva vehículo, orden, tiempos y métricas recibidos al confirmar', () => {
    const route = result.routes[0]
    const proposal = confirmationProposal(route, result, fixtureRequest.dispatch_date, mapLocations)
    expect(proposal.vehicle_id).toBe(route.vehicle_id)
    expect(proposal.dispatch_date).toBe(fixtureRequest.dispatch_date)
    expect(proposal.estimated_km).toBe(route.estimated_km)
    expect(proposal.estimated_minutes).toBe(route.estimated_minutes)
    expect(proposal.stops[0].planned_arrival).toBe(route.stops[0].planned_arrival)
    expect(canConfirmRoute({ readyOrders: routingTestData.orders, selectedVehicleId: route.vehicle_id, proposal, busy: false, confirmed: false })).toBe(true)
    expect(canConfirmRoute({ readyOrders: routingTestData.orders, selectedVehicleId: vehicles[0].id, proposal, busy: false, confirmed: false })).toBe(false)
  })
})
