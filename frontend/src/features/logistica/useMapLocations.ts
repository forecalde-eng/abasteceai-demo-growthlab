import { useQuery } from '@tanstack/react-query'
import { useMocks, useSession } from '@/data'
import type { Location } from '@/mocks'

// temporal: reemplazar por @/data
// El useLocations temporal de Jorge contiene solo 27 filas; el mapa necesita el catálogo.
export function useLocations(scope: 'todos' = 'todos') {
  const session = useSession()
  const profile = session.data
  const allowed = profile?.role === 'logistica'
  const query = useQuery<Location[]>({
    queryKey: ['bruno', 'map-locations', scope, profile?.staff_id, profile?.role],
    enabled: !!profile && allowed && useMocks,
    retry: false,
    queryFn: async () => {
      const { mapLocations } = await import('@/mocks/mapLocations')
      return mapLocations
    },
  })
  const error = session.isError || (!session.isLoading && !profile)
    ? new Error('No se pudo cargar tu perfil operativo.')
    : !session.isLoading && !allowed
      ? new Error('Necesitas una sesión de logística para consultar el mapa.')
      : !useMocks
        ? new Error('La lectura real de ubicaciones aún no está conectada en este mapa.')
        : query.error
  return {
    ...query,
    data: !error && allowed && useMocks ? query.data : undefined,
    isLoading: session.isLoading || (!error && allowed && useMocks && query.isLoading),
    isError: !!error,
    error,
  }
}
