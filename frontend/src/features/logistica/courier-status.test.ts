import { afterEach, describe, expect, it, vi } from 'vitest'
import { courierDelays, demoMetadata, shipments, orders, locations } from '@/mocks'
import type { EnvioDetalle } from '@/app/dev/apiDemo'
import { courierRows } from './courier-status'

const source: EnvioDetalle[] = shipments.map((shipment) => ({
  ...shipment,
  order: orders.find((row) => row.id === shipment.order_id)!,
  location: locations.find((row) => row.id === shipment.location_id)!,
}))

afterEach(() => vi.useRealTimers())

describe('Courier: datos y alerta procedente del SQL', () => {
  it('PITCH-9: ENV-DEMO-008 a G-001, courier despachado con retraso', () => {
    const rows = courierRows(source, courierDelays)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      code: 'ENV-DEMO-008', guide_code: 'GUIA-DEMO-008', mode: 'courier',
      status: 'dispatched', isDelayed: true,
      promised_delivery_at: '2026-10-10T20:00:00Z',
      location: { code: 'G-001', city: 'Guayaquil' },
    })
    expect(demoMetadata).toEqual([{ reference_at: '2026-10-10T22:00:00.000Z' }])
  })

  it('no cambia el estado ni modifica los registros originales', () => {
    const original = structuredClone(source)
    const rows = courierRows(source, courierDelays)
    expect(source).toEqual(original)
    expect(rows[0].status).toBe('dispatched')
    expect(rows[0]).not.toBe(source.find((row) => row.code === rows[0].code))
  })

  it('sin marcador SQL no calcula el retraso en el cliente', () => {
    expect(courierRows(source, [])[0].isDelayed).toBe(false)
  })

  it.each(['2000-01-01T00:00:00Z', '2040-01-01T00:00:00Z'])('el reloj del dispositivo (%s) no cambia la alerta', (clock) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(clock))
    expect(courierRows(source, courierDelays)[0].isDelayed).toBe(true)
  })

  it('retira el aviso si la sesión compartida registra una entrega', () => {
    const delivered = source.map((row) => row.mode === 'courier'
      ? { ...row, status: 'delivered_unchecked' as const, delivered_at: demoMetadata[0].reference_at }
      : row)
    expect(courierRows(delivered, courierDelays)[0].isDelayed).toBe(false)
  })

  it('sin fecha prometida no presenta una alerta del snapshot', () => {
    const withoutDate = source.map((row) => ({ ...row, promised_delivery_at: null }))
    expect(courierRows(withoutDate, courierDelays)[0].isDelayed).toBe(false)
  })

  it('excluye envíos propios aunque figuren en la lista SQL de retrasos', () => {
    const own = source.find((row) => row.mode === 'own')!
    const delays = [...courierDelays, { code: own.code, city: own.location.city, promised_delivery_at: own.promised_delivery_at!, status: own.status }]
    expect(courierRows(source, delays).map((row) => row.code)).toEqual(['ENV-DEMO-008'])
  })
})
