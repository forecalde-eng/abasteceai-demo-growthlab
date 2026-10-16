import { describe, expect, it } from 'vitest'
import { mapLocations, locations } from '@/mocks'
import { MAP_STYLE, focusPoints, isLocated, mapPoints, pointKind } from './mapa-model'

describe('B-4.1: catálogo del mapa y guía de diseño', () => {
  it('muestra 700 puntos únicos y BOD-DEMO, sin tránsito ni cuarentena', () => {
    const points = mapPoints(mapLocations)
    expect(points).toHaveLength(701)
    expect(new Set(points.map((point) => point.id)).size).toBe(701)
    expect(points.filter((point) => point.kind === 'service_point')).toHaveLength(700)
    expect(points.filter((point) => pointKind(point) === 'catalog')).toHaveLength(676)
    expect(points.filter((point) => pointKind(point) === 'detailed')).toHaveLength(24)
    expect(points.filter((point) => pointKind(point) === 'warehouse').map((point) => point.code)).toEqual(['BOD-DEMO'])
    expect(points.some((point) => point.code === 'TRA-DEMO' || point.code === 'CUA-DEMO')).toBe(false)
  })

  it.each([
    ['Quito', 301, 10], ['Guayaquil', 250, 8], ['Cuenca', 150, 6],
  ])('enfoca %s usando únicamente las coordenadas del CSV', (city, count, detailed) => {
    const focused = focusPoints(mapPoints(mapLocations), city)
    expect(focused).toHaveLength(count)
    expect(focused.every((point) => point.city === city && isLocated(point))).toBe(true)
    expect(focused.filter((point) => point.demo_scope === 'detailed')).toHaveLength(detailed)
  })

  it('mantiene la vista conjunta con Quito, Guayaquil y Cuenca', () => {
    const focused = focusPoints(mapPoints(mapLocations), null)
    expect(new Set(focused.map((point) => point.city))).toEqual(new Set(['Quito', 'Guayaquil', 'Cuenca']))
    expect(focused).toHaveLength(701)
  })

  it('preserva los fixtures de 27 ubicaciones y no ordena el catálogo original en sitio', () => {
    const ids = mapLocations.map((point) => point.id)
    mapPoints(mapLocations)
    expect(mapLocations.map((point) => point.id)).toEqual(ids)
    expect(locations).toHaveLength(27)
  })

  it('no inventa coordenadas para filas nulas, no finitas o fuera de rango', () => {
    const source = mapLocations.find((point) => point.code === 'BOD-DEMO')!
    expect(mapPoints([
      { ...source, latitude: null }, { ...source, latitude: NaN },
      { ...source, latitude: 91 }, { ...source, longitude: null },
      { ...source, longitude: Infinity }, { ...source, longitude: -181 },
    ])).toHaveLength(0)
  })

  it('dibuja detallados y bodega sobre catálogo con radios y colores de la guía §8.3', () => {
    const points = mapPoints(mapLocations)
    expect(points.slice(0, 676).every((point) => pointKind(point) === 'catalog')).toBe(true)
    expect(points.slice(676, 700).every((point) => pointKind(point) === 'detailed')).toBe(true)
    expect(points.at(-1)?.code).toBe('BOD-DEMO')
    expect(MAP_STYLE.catalog).toMatchObject({ radius: 3, fillColor: '#94A3B8', stroke: false })
    expect(MAP_STYLE.detailed).toMatchObject({ radius: 6, fillColor: '#0F766E', color: '#FFFFFF' })
    expect(MAP_STYLE.warehouse).toMatchObject({ radius: 9, fillColor: '#0F172A', color: '#FFFFFF' })
  })
})
