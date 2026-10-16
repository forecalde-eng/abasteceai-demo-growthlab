import type { Location } from '@/mocks'

export type LocatedPoint = Location & { latitude: number; longitude: number }
export type MapPointKind = 'catalog' | 'detailed' | 'warehouse'

// Valores exactos de docs/07_GUIA_DISENO.md §8.3; colores solo del mapa.
export const MAP_STYLE = {
  catalog: { radius: 3, fillColor: '#94A3B8', stroke: false, color: '#94A3B8', weight: 0, fillOpacity: 1, className: 'mapa-punto mapa-catalogo' },
  detailed: { radius: 6, fillColor: '#0F766E', stroke: true, color: '#FFFFFF', weight: 1.5, fillOpacity: 1, className: 'mapa-punto mapa-detallado' },
  warehouse: { radius: 9, fillColor: '#0F172A', stroke: true, color: '#FFFFFF', weight: 2, fillOpacity: 1, className: 'mapa-punto mapa-bodega' },
} as const

export function pointKind(point: Location): MapPointKind {
  if (point.code === 'BOD-DEMO') return 'warehouse'
  return point.demo_scope === 'detailed' ? 'detailed' : 'catalog'
}

export function isLocated(point: Location): point is LocatedPoint {
  return typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
}

export function mapPoints(locations: Location[]): LocatedPoint[] {
  const rank = { catalog: 0, detailed: 1, warehouse: 2 }
  return locations.filter((point) => point.kind === 'service_point' || point.code === 'BOD-DEMO')
    .filter(isLocated)
    // Detallados y bodega se dibujan al final para no taparlos con puntos de catálogo.
    .sort((a, b) => rank[pointKind(a)] - rank[pointKind(b)] || a.code.localeCompare(b.code))
}

export function focusPoints(points: LocatedPoint[], city: string | null): LocatedPoint[] {
  return city ? points.filter((point) => point.city === city) : points
}
