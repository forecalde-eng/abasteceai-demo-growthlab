import { RouteIcon } from 'lucide-react'
import { ErrorState, LoadingState, PageHeader } from '@/ui'
import { PlanificadorRutas } from './PlanificadorRutas'
import { useRoutingData } from './useRoutingData'

export function PlanRutas() {
  const query = useRoutingData()
  return <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
    <PageHeader icon={<RouteIcon />} title="Plan de rutas" description="Pedidos listos de Quito, referencia precargada y propuesta del servicio con sus no asignados." />
    {query.isLoading ? <LoadingState label="Cargando datos de planificación…" /> : query.error || !query.data ? <ErrorState title="No se pudo cargar la planificación" description={query.error?.message} onRetry={() => { void query.refetch() }} /> : <PlanificadorRutas key={query.sessionId} data={query.data} />}
  </div>
}
