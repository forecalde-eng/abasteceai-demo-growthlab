import { useMemo, useState } from 'react'
import { CircleMarker, Pane, Polyline, Popup, useMap } from 'react-leaflet'
import { Alert, AlertDescription, AlertTitle, Button, Label } from '@/ui'
import type { Location, Order } from '@/mocks'
import type { PlannedRoute, RoutePlanProposal } from './planRoutes'
import { UNASSIGNED_LABEL, routePositions } from './routing-model'
import { isLocated, mapPoints } from './mapa-model'
import { MapaPuntos } from './MapaPuntos'

function UnassignedPoints({ unassigned, orders, locations }: {
  unassigned: RoutePlanProposal['unassigned']; orders: Order[]; locations: Location[];
}) {
  const map = useMap()
  const pointIds = [...new Set(unassigned.map((entry) => orders.find((order) => order.id === entry.order_id)?.location_id))]
  return <>{pointIds.map((id) => {
    const point = locations.find((location) => location.id === id)
    if (!point || !isLocated(point)) return null
    const entries = unassigned.filter((entry) => orders.find((order) => order.id === entry.order_id)?.location_id === id)
    return <CircleMarker key={point.id} center={[point.latitude, point.longitude]} radius={6} pathOptions={{ color: '#FFFFFF', weight: 1.5, fillColor: '#DC2626', fillOpacity: 1, className: 'mapa-no-asignado' }}>
      <Popup closeButton={false}><div className="flex flex-col gap-2 font-sans text-sm"><strong className="font-mono">{point.code}</strong>{entries.map((entry) => <p key={entry.order_id}><span className="font-mono">{entry.order_code}</span>: {UNASSIGNED_LABEL[entry.reason]}</p>)}<Button size="sm" variant="outline" onClick={() => map.closePopup()}>Cerrar detalle</Button></div></Popup>
    </CircleMarker>
  })}</>
}

export function MapaRutas({ locations, orders, referenceStops, route, unassigned }: {
  locations: Location[]; orders: Order[]; referenceStops: { location_id: string; sequence: number }[];
  route: PlannedRoute | null; unassigned: RoutePlanProposal['unassigned'];
}) {
  const points = useMemo(() => mapPoints(locations), [locations])
  const reference = routePositions(locations, referenceStops)
  const calculated = route ? routePositions(locations, route.stops) : []
  const [showReference, setShowReference] = useState(true)
  const [showCalculated, setShowCalculated] = useState(true)
  const [selectedCode, setSelectedCode] = useState('')
  const [focusKey, setFocusKey] = useState(0)
  const [tileError, setTileError] = useState(false)
  return <div className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center gap-4">
      <Label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={showReference} onChange={(event) => setShowReference(event.target.checked)} />Mostrar referencia precargada</Label>
      <Label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={showCalculated} onChange={(event) => setShowCalculated(event.target.checked)} disabled={!route} />Mostrar ruta propuesta</Label>
      <Button variant="outline" size="sm" onClick={() => { setSelectedCode(''); setFocusKey((key) => key + 1) }}>Ver Quito completo</Button>
    </div>
    {tileError ? <Alert><AlertTitle>Fondo de mapa no disponible</AlertTitle><AlertDescription>Los puntos y trazos del plan siguen disponibles aunque falten imágenes de OpenStreetMap.</AlertDescription></Alert> : null}
    {points.length ? <MapaPuntos points={points} city="Quito" selectedCode={selectedCode} focusKey={focusKey} onSelect={(code) => { setSelectedCode(code); setFocusKey((key) => key + 1) }} onTileError={() => setTileError(true)}>
      <Pane name="planning-lines" style={{ zIndex: 350 }}>
        {showReference && reference.length > 1 ? <Polyline positions={reference} pathOptions={{ color: '#94A3B8', weight: 3, dashArray: '6 6', className: 'ruta-referencia' }} /> : null}
        {showCalculated && calculated.length > 1 ? <Polyline positions={calculated} pathOptions={{ color: '#0F766E', weight: 4, className: 'ruta-propuesta' }} /> : null}
      </Pane>
      <UnassignedPoints unassigned={unassigned} orders={orders} locations={locations} />
    </MapaPuntos> : null}
    <p className="text-sm text-muted-foreground">Referencia: gris discontinua · Propuesta: teal continua · No asignados: rojo. Los trazos unen bodega y paradas del plan; no son geometría de calles ni calculan distancias. DEMO FICTICIA.</p>
  </div>
}
