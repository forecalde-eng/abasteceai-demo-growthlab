import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RouteIcon } from 'lucide-react'
import {
  Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent,
  CardDescription, CardHeader, CardTitle, EmptyState, Input, Label,
  LoadingState, Select, Table, TableBody, TableCell, TableHead, TableHeader,
  TableRow, TONO,
} from '@/ui'
import { ConfirmarRuta } from './ConfirmarRuta'
// temporal: reemplazar por @/data
import { confirmRoutes, type ConfirmRoutesService, type RouteConfirmResult } from './confirmRoutes'
import { planRoutes, type PlanRoutesService, type RoutePlanProposal } from './planRoutes'
import { confirmationProposal, demoDispatchDate, isPlanDate, readyQuitoOrders, referenceRoute, UNASSIGNED_LABEL, validateRoutePlanProposal } from './routing-model'
import type { RoutingData } from './useRoutingData'

const MapaRutas = lazy(() => import('./MapaRutas').then((module) => ({ default: module.MapaRutas })))
const dateTime = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Guayaquil' })

export function PlanificadorRutas({ data, service = planRoutes, confirmationService = confirmRoutes }: {
  data: RoutingData; service?: PlanRoutesService; confirmationService?: ConfirmRoutesService;
}) {
  const readyOrders = useMemo(() => readyQuitoOrders(data.orders, data.locations), [data.orders, data.locations])
  const [selectedIds, setSelectedIds] = useState(() => readyOrders.map((order) => order.id))
  const [dispatchDate, setDispatchDate] = useState(() => demoDispatchDate(data.referenceAt))
  const [response, setResponse] = useState<{ key: string; result: RoutePlanProposal } | null>(null)
  const [vehicleId, setVehicleId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState<Record<string, RouteConfirmResult>>({})
  const locked = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [])
  const selected = readyOrders.filter((order) => selectedIds.includes(order.id))
  const request = { dispatch_date: dispatchDate, order_ids: selected.map((order) => order.id) }
  const signature = JSON.stringify(request)
  const latest = useRef({ signature, data })
  latest.current = { signature, data }
  const proposal = response?.key === signature ? response.result : null
  const selectedRoute = proposal?.routes.find((route) => route.vehicle_id === vehicleId) ?? null
  const assignedCount = selectedRoute?.stops.flatMap((stop) => stop.order_ids).length ?? 0
  const reference = referenceRoute(data.routePlans, data.routeStops, data.locations)
  const hasConfirmed = Object.keys(confirmed).length > 0
  const formLocked = busy || confirming || hasConfirmed
  const canCalculate = selected.length > 0 && isPlanDate(dispatchDate) && !formLocked
  const activeConfirmation = confirmed[vehicleId]
  const proposalForConfirmation = selectedRoute && proposal ? confirmationProposal(selectedRoute, proposal, dispatchDate, data.locations) : null

  function invalidate() { setResponse(null); setVehicleId(''); setError(null) }
  async function calculate() {
    if (locked.current || !canCalculate) return
    locked.current = true; setBusy(true); setError(null); setResponse(null); setVehicleId('')
    try {
      const result = await service(request)
      if (!mounted.current || latest.current.signature !== signature) return
      const validated = validateRoutePlanProposal(result, request, latest.current.data)
      setResponse({ key: signature, result: validated })
      setVehicleId(validated.routes[0]?.vehicle_id ?? '')
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'No se pudo obtener la propuesta de rutas.')
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return <div className="flex min-w-0 flex-col gap-6">
    <Alert><AlertTitle>Planificar no crea envíos</AlertTitle><AlertDescription>
      <p>Reloj de demo: <time dateTime={data.referenceAt}>{dateTime.format(new Date(data.referenceAt))}</time> · Ecuador. La fecha inicial sale de esa referencia.</p>
      <p>Km, minutos y no asignados se toman solo de la respuesta del planificador. La referencia precargada no se presenta como una optimización ejecutada.</p>
    </AlertDescription></Alert>

    <Card className="min-w-0"><CardHeader><CardTitle>Seleccionar pedidos listos de Quito</CardTitle><CardDescription>El planificador asigna vehículos y ordena las paradas según capacidad y ventanas; la UI no recalcula esas restricciones.</CardDescription></CardHeader><CardContent className="flex min-w-0 flex-col gap-4">
      <div className="flex w-full max-w-xs flex-col gap-2"><Label htmlFor="plan-date">Fecha de planificación</Label><Input id="plan-date" type="date" value={dispatchDate} disabled={formLocked} onChange={(event) => { setDispatchDate(event.target.value); invalidate() }} /></div>
      {!readyOrders.length ? <EmptyState icon={<RouteIcon />} title="Sin pedidos listos de Quito" description="Se necesitan pedidos listos para solicitar una propuesta; el mapa de referencia sigue disponible." /> : (
        <Table aria-label="Pedidos listos para planificar"><TableHeader><TableRow><TableHead>Seleccionar</TableHead><TableHead>Pedido</TableHead><TableHead>Punto</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{readyOrders.map((order) => <TableRow key={order.id}>
          <TableCell><input type="checkbox" className="size-4 accent-primary" aria-label={`Incluir ${order.code}`} checked={selectedIds.includes(order.id)} disabled={formLocked} onChange={(event) => { const checked = event.target.checked; setSelectedIds((previous) => checked ? [...previous, order.id] : previous.filter((id) => id !== order.id)); invalidate() }} /></TableCell>
          <TableCell className="font-mono">{order.code}</TableCell><TableCell className="font-mono">{data.locations.find((point) => point.id === order.location_id)?.code ?? 'Sin código'}</TableCell><TableCell><Badge variant="outline" className={TONO.curso}>Listo</Badge></TableCell>
        </TableRow>)}</TableBody></Table>
      )}
      <p className="text-sm text-muted-foreground">Vehículos del catálogo: {data.vehicles.map((vehicle) => vehicle.code).join(' · ')}. La confirmación usa únicamente el vehículo asignado por la propuesta.</p>
      {error ? <Alert variant="destructive"><AlertTitle>No se pudo planificar la ruta</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {hasConfirmed ? <Alert><AlertTitle>Ya hay envíos creados para esta propuesta</AlertTitle><AlertDescription>Consulta despacho. Puedes revisar y confirmar los demás vehículos propuestos, pero no volver a calcular sobre esta misma operación.</AlertDescription></Alert> : null}
      <Button variant={selectedRoute ? 'outline' : 'default'} disabled={!canCalculate} onClick={() => void calculate()}>{busy ? 'Calculando propuesta…' : 'Solicitar propuesta de rutas'}</Button>
    </CardContent></Card>

    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card className="min-w-0"><CardHeader><CardTitle>Referencia precargada</CardTitle><CardDescription>Referencia de demo; no se puede confirmar como si fuera una propuesta calculada.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
        {reference ? <>
          <span className="font-mono">{reference.plan.code}</span>
          <p className="text-sm">{reference.stops.map((stop) => stop.location?.code ?? 'Sin código').join(' → ')}</p>
          <p className="text-sm text-muted-foreground">{reference.plan.estimated_km === null ? 'Sin cálculo de km' : `${reference.plan.estimated_km} km registrados`} · {reference.plan.estimated_minutes === null ? 'Sin cálculo de minutos' : `${reference.plan.estimated_minutes} minutos registrados`}</p>
        </> : <EmptyState title="Referencia no disponible" description="No está RUTA-DEMO-2 en los datos disponibles." />}
      </CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle>Propuesta recibida</CardTitle><CardDescription>Métricas del servicio, no distancias calculadas en el navegador.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
        {!proposal ? <EmptyState title="Sin propuesta del planificador" description="Solicita una propuesta. Hasta recibirla no hay métricas ni ruta confirmable." /> : !proposal.routes.length ? <p>No se asignó ninguna ruta; revisa los motivos de los pedidos no asignados.</p> : <>
          <Label htmlFor="planned-vehicle">Ruta propuesta por vehículo</Label><Select id="planned-vehicle" value={vehicleId} disabled={confirming} onChange={(event) => setVehicleId(event.target.value)}>{proposal.routes.map((route) => <option key={route.vehicle_id} value={route.vehicle_id}>{route.vehicle_code}</option>)}</Select>
          {selectedRoute ? <><p className="font-semibold tabular-nums">{proposal.matrix_source === 'synthetic' ? 'Estimado haversine' : 'Estimado'}: {selectedRoute.estimated_km} km · {selectedRoute.estimated_minutes} min</p><p className="text-sm text-muted-foreground">Método del servicio: <code>{proposal.planning_method}</code></p></> : null}
        </>}
      </CardContent></Card>
    </div>

    <Card className="min-w-0"><CardHeader><CardTitle>Comparación de rutas</CardTitle><CardDescription>Referencia precargada frente a la ruta seleccionada del servicio. Coordenadas ficticias del catálogo oficial.</CardDescription></CardHeader><CardContent className="min-w-0">
      <Suspense fallback={<LoadingState label="Preparando comparación en mapa…" />}><MapaRutas locations={data.locations} orders={data.orders} referenceStops={reference?.stops ?? []} route={selectedRoute} unassigned={proposal?.unassigned ?? []} /></Suspense>
    </CardContent></Card>

    <Card className="min-w-0"><CardHeader><CardTitle>Pedidos no asignados</CardTitle><CardDescription>Motivos comunicados por el planificador; no inferidos por la UI.</CardDescription></CardHeader><CardContent className="min-w-0">
      {!proposal ? <p className="text-sm text-muted-foreground">Solicita una propuesta para conocer qué pedidos se asignaron.</p> : !proposal.unassigned.length ? <p>Todos los pedidos seleccionados se asignaron.</p> : <Table aria-label="Pedidos no asignados"><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Punto</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader><TableBody>{proposal.unassigned.map((entry) => {
        const order = data.orders.find((item) => item.id === entry.order_id)
        const point = data.locations.find((item) => item.id === order?.location_id)
        return <TableRow key={entry.order_id}><TableCell className="font-mono">{entry.order_code}</TableCell><TableCell className="font-mono">{point?.code ?? 'Sin código'}</TableCell><TableCell><Badge variant="outline" className={TONO.problema}>{UNASSIGNED_LABEL[entry.reason]}</Badge></TableCell></TableRow>
      })}</TableBody></Table>}
    </CardContent></Card>

    {activeConfirmation ? <Card><CardHeader><CardTitle>Envíos confirmados por el servicio</CardTitle><CardDescription><span className="font-mono">{activeConfirmation.code}</span>. La confirmación no despacha ni aumenta el stock del punto.</CardDescription></CardHeader><CardContent className="flex flex-col items-start gap-3">{activeConfirmation.shipments.map((shipment) => <Button asChild key={shipment.id} variant="outline"><Link to={`/despacho?envio=${encodeURIComponent(shipment.code)}`}>Ver <span className="font-mono">{shipment.code}</span> en despacho</Link></Button>)}</CardContent></Card> :
      selectedRoute && proposal && proposalForConfirmation && assignedCount > 0 ? (
        proposal.matrix_source !== 'synthetic' ? <Alert><AlertTitle>Origen de matriz no confirmable con el contrato actual</AlertTitle><AlertDescription>La propuesta se puede revisar, pero el contrato de confirmación registra matrix_source=synthetic. No se confirmará una propuesta con otro origen.</AlertDescription></Alert> :
        <ConfirmarRuta key={`${signature}:${selectedRoute.vehicle_id}`} readyOrders={selected} locations={data.locations} vehicles={data.vehicles.filter((vehicle) => vehicle.id === selectedRoute.vehicle_id)} proposal={proposalForConfirmation} service={confirmationService} onBusyChange={setConfirming} onConfirmed={(result) => { setConfirmed((previous) => ({ ...previous, [selectedRoute.vehicle_id]: result })) }} />
      ) : null}
  </div>
}
