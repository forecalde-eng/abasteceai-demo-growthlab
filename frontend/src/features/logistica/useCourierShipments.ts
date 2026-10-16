import { useQuery } from '@tanstack/react-query'
import { useMocks, useSession } from '@/data'
import { useShipments as useDemoShipments, type FiltroEnvios } from '@/app/dev/apiDemo'
import { courierRows } from './courier-status'

// temporal: reemplazar por @/data
// Conserva las lecturas compartidas de Jorge y agrega el snapshot SQL de retrasos.
export function useShipments(filter?: FiltroEnvios) {
  const source = useDemoShipments(filter)
  const session = useSession()
  const profile = session.data
  const allowed = profile?.role === 'logistica'
  const snapshot = useQuery({
    queryKey: ['bruno', 'courier-status', profile?.staff_id, profile?.role],
    enabled: !!profile && allowed && useMocks,
    retry: false,
    queryFn: async () => {
      const [{ courierDelays }, { demoMetadata }] = await Promise.all([
        import('@/mocks/courierDelays'), import('@/mocks/demoMetadata'),
      ])
      const referenceAt = demoMetadata[0]?.reference_at
      if (demoMetadata.length !== 1 || !referenceAt || !Number.isFinite(Date.parse(referenceAt))) {
        throw new Error('No se pudo cargar el reloj de demo de los datos oficiales.')
      }
      return { delays: courierDelays, referenceAt }
    },
  })
  const error = session.isError || (!session.isLoading && !profile)
    ? new Error('No se pudo cargar tu perfil operativo.')
    : !session.isLoading && !allowed
      ? new Error('Necesitas una sesión de logística para consultar Courier.')
      : !useMocks
        ? new Error('La lectura real de Courier aún no está conectada. No se muestran datos simulados como reales.')
        : source.error ?? snapshot.error
  const hasData = !error && allowed && useMocks && source.data && snapshot.data
  return {
    data: hasData ? courierRows(source.data!, snapshot.data!.delays) : undefined,
    referenceAt: hasData ? snapshot.data!.referenceAt : undefined,
    isLoading: session.isLoading || (!error && allowed && useMocks && (source.isLoading || snapshot.isLoading)),
    isError: !!error,
    error,
    isFetching: source.isFetching || snapshot.isFetching,
    refetch: () => Promise.all([source.refetch(), snapshot.refetch()]),
  }
}
