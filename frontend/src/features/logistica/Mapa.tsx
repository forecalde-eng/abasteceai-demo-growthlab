import { lazy, Suspense, useMemo, useState } from 'react'
import { MapPinnedIcon, RefreshCwIcon } from 'lucide-react'
import {
  Alert, AlertDescription, AlertTitle, Button, Card, CardContent,
  CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, Label,
  LoadingState, PageHeader, Select,
} from '@/ui'
// temporal: reemplazar por @/data
import { useLocations } from './useMapLocations'
import { MAP_STYLE, focusPoints, mapPoints, pointKind, type MapPointKind } from './mapa-model'

const MapaPuntos = lazy(() => import('./MapaPuntos').then((module) => ({ default: module.MapaPuntos })))
const CITIES = ['Quito', 'Guayaquil', 'Cuenca'] as const

function LegendItem({ kind, children }: { kind: MapPointKind; children: string }) {
  const style = MAP_STYLE[kind]
  return <li className="flex items-center gap-2 text-sm"><svg width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r={style.radius} fill={style.fillColor} stroke={style.stroke ? style.color : 'none'} strokeWidth={style.weight} /></svg>{children}</li>
}

export function Mapa() {
  const query = useLocations('todos')
  const [city, setCity] = useState<string | null>(null)
  const [selectedCode, setSelectedCode] = useState('')
  const [focusKey, setFocusKey] = useState(0)
  const [tileError, setTileError] = useState(false)
  const points = useMemo(() => mapPoints(query.data ?? []), [query.data])
  const choices = useMemo(() => [...points].sort((a, b) => a.code.localeCompare(b.code)), [points])
  const catalog = points.filter((point) => pointKind(point) === 'catalog').length
  const detailed = points.filter((point) => pointKind(point) === 'detailed').length
  const warehouse = points.filter((point) => pointKind(point) === 'warehouse').length
  const missing = (query.data?.length ?? 0) - points.length
  function focus(cityName: string | null) {
    setSelectedCode(''); setCity(cityName); setFocusKey((value) => value + 1)
  }
  function selectPoint(code: string) { setSelectedCode(code); setFocusKey((value) => value + 1) }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader icon={<MapPinnedIcon />} title="Mapa de puntos" description="Catálogo ficticio de puntos de servicio y bodega central, sin indicadores de stock inferidos." actions={<Button variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch() }}><RefreshCwIcon data-icon="inline-start" />{query.isFetching ? 'Actualizando…' : 'Actualizar'}</Button>} />
      {query.isLoading ? <LoadingState label="Cargando ubicaciones…" /> : query.isError ? <ErrorState title="No se pudo cargar el mapa" description={query.error?.message} onRetry={() => { void query.refetch() }} /> : !points.length ? <EmptyState icon={<MapPinnedIcon />} title="Sin ubicaciones para mostrar" description="No hay puntos con coordenadas válidas en los datos disponibles." /> : (
        <>
          <Alert><AlertTitle>Coordenadas ficticias para la demo</AlertTitle><AlertDescription>Los puntos provienen de los CSV oficiales. Catálogo no significa desabastecimiento: este mapa no calcula cobertura ni inventario.</AlertDescription></Alert>
          <div className="flex flex-wrap items-center gap-2" aria-label="Enfocar mapa por ciudad">
            <Button onClick={() => focus(null)}>Ver todos</Button>
            {CITIES.map((name) => <Button key={name} variant="outline" onClick={() => focus(name)} disabled={!focusPoints(points, name).length}>{`Ver ${name}`}</Button>)}
          </div>
          <div className="flex w-full max-w-lg flex-col gap-2"><Label htmlFor="map-point">Localizar punto por código</Label><Select id="map-point" value={selectedCode} onChange={(event) => selectPoint(event.target.value)}><option value="">Selecciona un punto</option>{choices.map((point) => <option key={point.id} value={point.code}>{point.code} · {point.city} · {point.name}</option>)}</Select></div>
          {missing > 0 ? <Alert><AlertTitle>Ubicaciones sin coordenadas válidas</AlertTitle><AlertDescription>{missing} ubicaciones no se pueden dibujar. No se reemplazan por coordenadas inventadas.</AlertDescription></Alert> : null}
          {tileError ? <Alert><AlertTitle>Fondo de mapa no disponible</AlertTitle><AlertDescription>No se pudieron cargar algunas imágenes de OpenStreetMap. Los puntos de demo siguen disponibles; revisa la conexión o recarga para reintentar el fondo.</AlertDescription></Alert> : null}
          <Card className="min-w-0">
            <CardHeader><CardTitle>Ubicaciones del catálogo</CardTitle><CardDescription>{catalog + detailed} puntos de servicio ficticios y {warehouse} bodega central. Pulsa un punto o selecciónalo por código para ver su detalle.</CardDescription></CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <p className="text-sm text-muted-foreground" role="status">{selectedCode ? `Punto seleccionado: ${selectedCode}` : city ? `Vista de ${city}` : 'Vista conjunta: Quito, Guayaquil y Cuenca'}. Los controles cambian la vista, no eliminan puntos del catálogo.</p>
              <Suspense fallback={<LoadingState label="Preparando mapa…" />}><MapaPuntos points={points} city={city} selectedCode={selectedCode} focusKey={focusKey} onSelect={selectPoint} onTileError={() => setTileError(true)} /></Suspense>
              <ul className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Leyenda de puntos"><LegendItem kind="catalog">{`${catalog} de catálogo`}</LegendItem><LegendItem kind="detailed">{`${detailed} detallados`}</LegendItem><LegendItem kind="warehouse">BOD-DEMO</LegendItem></ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
