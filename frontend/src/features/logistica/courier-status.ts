import type { EnvioDetalle } from '@/app/dev/apiDemo'
import type { CourierDelay } from '@/mocks'

export type CourierEnvio = EnvioDetalle & { isDelayed: boolean }

/** El retraso procede de la consulta SQL; aquí solo se cruza por código.
 * Si la sesión de demo marca una entrega, se retira el aviso del snapshot.
 * Nunca se compara la fecha prometida con Date.now() ni con el reloj del cliente.
 */
export function courierRows(shipments: EnvioDetalle[], delays: CourierDelay[]): CourierEnvio[] {
  const delayedCodes = new Set(delays.map((row) => row.code))
  return shipments.filter((row) => row.mode === 'courier')
    .map((row) => ({
      ...row,
      isDelayed: delayedCodes.has(row.code) && row.delivered_at === null && row.promised_delivery_at !== null,
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}
