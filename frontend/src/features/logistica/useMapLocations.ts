import { useQuery } from '@tanstack/react-query'
import { useMocks, useSession, useLocations as useDataLocations } from '@/data'

// Lectura de ubicaciones para el mapa y el planificador desde la capa de datos.
// En modo real devuelve todo lo visible bajo RLS (703 para logística). En mocks, el catálogo
// completo de mapLocations: el fixture compacto de @/data solo trae 27 filas.
export function useLocations(scope: 'asignados' | 'todos' = 'todos') {
  const session = useSession()
  const profile = session.data
  const allowed = profile?.role === 'logistica'
  const real = useDataLocations(scope)
  const mock = useQuery({
    queryKey: ['bruno', 'map-locations', scope],
    enabled: useMocks && allowed,
    retry: false,
    queryFn: async () => (await import('@/mocks/mapLocations')).mapLocations,
  })
  const locations = useMocks ? mock : real
  const error = session.isError || (!session.isLoading && !profile)
    ? new Error('No se pudo cargar tu perfil operativo.')
    : !session.isLoading && !allowed
      ? new Error('Necesitas una sesión de logística para consultar el mapa.')
      : locations.error
  return {
    data: !error && allowed ? locations.data : undefined,
    isLoading: session.isLoading || (!error && allowed && locations.isLoading),
    isFetching: locations.isFetching,
    isError: !!error,
    error,
    refetch: locations.refetch,
  }
}
