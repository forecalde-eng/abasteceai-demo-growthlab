import { useQuery } from '@tanstack/react-query'
import { useMocks, useSession } from '@/data'
import { useOrders } from '@/app/dev/apiDemo'
import { useLocations } from './useMapLocations'

// temporal: reemplazar por @/data
// Lecturas de seed y decisiones de demo existentes; no calcula rutas ni crea envíos.
export function useRoutingData() {
  const session = useSession()
  const orders = useOrders()
  const locations = useLocations('todos')
  const allowed = session.data?.role === 'logistica'
  const seed = useQuery({
    queryKey: ['bruno', 'routing-seed', session.data?.staff_id],
    enabled: allowed && useMocks,
    retry: false,
    queryFn: async () => {
      const [{ routePlans }, { routeStops }, { vehicles }, { demoMetadata }] = await Promise.all([
        import('@/mocks/routePlans'), import('@/mocks/routeStops'), import('@/mocks/vehicles'), import('@/mocks/demoMetadata'),
      ])
      if (demoMetadata.length !== 1 || !Number.isFinite(Date.parse(demoMetadata[0]?.reference_at))) throw new Error('No se pudo cargar el reloj oficial de la demo.')
      return { routePlans, routeStops, vehicles, referenceAt: demoMetadata[0].reference_at }
    },
  })
  const error = session.isError || (!session.isLoading && !session.data)
    ? new Error('No se pudo cargar tu perfil operativo.')
    : !session.isLoading && !allowed
      ? new Error('Necesitas una sesión de logística para planificar rutas.')
      : !useMocks
        ? new Error('Las lecturas reales de planificación todavía no están conectadas en esta pantalla.')
        : orders.error ?? locations.error ?? seed.error
  const ready = !error && allowed && useMocks && orders.data && locations.data && seed.data
  return {
    data: ready ? { ...seed.data!, orders: orders.data!, locations: locations.data! } : undefined,
    sessionId: session.data?.staff_id,
    isLoading: session.isLoading || (!error && allowed && useMocks && (orders.isLoading || locations.isLoading || seed.isLoading)),
    error,
    refetch: () => Promise.all([orders.refetch(), locations.refetch(), seed.refetch()]),
  }
}
export type RoutingData = NonNullable<ReturnType<typeof useRoutingData>['data']>
