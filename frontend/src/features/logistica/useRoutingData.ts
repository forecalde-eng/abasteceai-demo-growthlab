import { useQuery } from '@tanstack/react-query'
import { useMocks, useSession, useOrders, useDemoMetadata } from '@/data'
import { useLocations } from './useMapLocations'
import { fetchVehicles, fetchRoutePlans, fetchRouteStops } from './planningReads'

// Lecturas de planificación: pedidos y puntos desde la capa de datos; vehículos y planes de
// referencia desde la base (aún sin hook en src/data). No calcula rutas ni crea envíos.
export function useRoutingData() {
  const session = useSession()
  const orders = useOrders()
  const locations = useLocations('todos')
  const metadata = useDemoMetadata()
  const allowed = session.data?.role === 'logistica'

  const seed = useQuery({
    queryKey: ['bruno', 'routing-seed', useMocks ? 'mock' : 'real', session.data?.staff_id],
    enabled: allowed,
    retry: false,
    queryFn: async () => {
      if (useMocks) {
        const [{ routePlans }, { routeStops }, { vehicles }] = await Promise.all([
          import('@/mocks/routePlans'), import('@/mocks/routeStops'), import('@/mocks/vehicles'),
        ])
        return { routePlans, routeStops, vehicles }
      }
      const [vehicles, routePlans, routeStops] = await Promise.all([fetchVehicles(), fetchRoutePlans(), fetchRouteStops()])
      return { routePlans, routeStops, vehicles }
    },
  })

  const referenceAt = metadata.data?.reference_at
  const referenceError = metadata.isError ? new Error('No se pudo cargar el reloj oficial de la demo.') : null

  const error = session.isError || (!session.isLoading && !session.data)
    ? new Error('No se pudo cargar tu perfil operativo.')
    : !session.isLoading && !allowed
      ? new Error('Necesitas una sesión de logística para planificar rutas.')
      : orders.error ?? locations.error ?? seed.error ?? referenceError

  const ready = !error && allowed && orders.data && locations.data && seed.data && referenceAt
  return {
    data: ready ? { ...seed.data!, referenceAt, orders: orders.data!, locations: locations.data! } : undefined,
    sessionId: session.data?.staff_id,
    isLoading: session.isLoading || (!error && allowed && (orders.isLoading || locations.isLoading || seed.isLoading || metadata.isLoading)),
    error,
    refetch: () => Promise.all([orders.refetch(), locations.refetch(), seed.refetch(), metadata.refetch()]),
  }
}
export type RoutingData = NonNullable<ReturnType<typeof useRoutingData>['data']>
