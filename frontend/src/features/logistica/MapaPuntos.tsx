import { useEffect, type ReactNode } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl, useMap } from 'react-leaflet'
import { Button } from '@/ui'
import { MAP_STYLE, focusPoints, pointKind, type LocatedPoint } from './mapa-model'
import 'leaflet/dist/leaflet.css'
import './mapa.css'

function MapViewport({ points, city, selectedCode, focusKey }: {
  points: LocatedPoint[]; city: string | null; selectedCode: string; focusKey: number;
}) {
  const map = useMap()
  useEffect(() => {
    const selected = points.find((point) => point.code === selectedCode)
    if (selected) {
      map.setView([selected.latitude, selected.longitude], 13, { animate: false })
    } else {
      const focused = focusPoints(points, city)
      if (focused.length) map.fitBounds(focused.map((point) => [point.latitude, point.longitude]), { padding: [32, 32], maxZoom: 13, animate: false })
    }
  }, [map, points, city, selectedCode, focusKey])
  return null
}

export function MapaPuntos({ points, city, selectedCode, focusKey, onSelect, onTileError, children }: {
  points: LocatedPoint[]; city: string | null; selectedCode: string; focusKey: number;
  onSelect: (code: string) => void; onTileError: () => void; children?: ReactNode;
}) {
  const selected = points.find((point) => point.code === selectedCode)
  if (!points.length) return null
  return (
    <div className="mapa-frame" role="region" aria-label="Mapa de puntos ficticios de Quito, Guayaquil y Cuenca">
      <MapContainer
        bounds={points.map((point) => [point.latitude, point.longitude])}
        boundsOptions={{ padding: [32, 32] }}
        className="mapa-canvas"
        zoomControl={false}
        scrollWheelZoom={false}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
        inertia={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          eventHandlers={{ tileerror: onTileError }}
        />
        <ZoomControl position="topright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
        <MapViewport points={points} city={city} selectedCode={selectedCode} focusKey={focusKey} />
        {points.map((point) => {
          const style = MAP_STYLE[pointKind(point)]
          return <CircleMarker key={point.id} center={[point.latitude, point.longitude]} radius={style.radius} pathOptions={style} eventHandlers={{ click: () => onSelect(point.code) }} />
        })}
        {selected ? <Popup key={`${selected.code}:${focusKey}`} position={[selected.latitude, selected.longitude]} closeButton={false} maxWidth={240}>
          <div className="flex flex-col gap-2 font-sans text-sm">
            <strong className="font-mono">{selected.code}</strong>
            <p>{selected.name}</p>
            <p>{selected.city} · {selected.code === 'BOD-DEMO' ? 'Bodega central' : selected.demo_scope === 'detailed' ? 'Punto detallado de demo' : 'Punto de catálogo'}</p>
            <p className="text-xs">DEMO FICTICIA · Ubicación simulada.</p>
            <Button variant="outline" size="sm" onClick={() => onSelect('')}>Cerrar detalle</Button>
          </div>
        </Popup> : null}
        {children}
      </MapContainer>
    </div>
  )
}
