// SOLO pruebas de UI: cantidades y lotes del seed combinados en una respuesta
// controlada. No afirma que PED-DEMO-003 tenga reservas ni implementa FEFO.
import lotsCsv from "../../../../../db/datos/product_lots.csv?raw";
import reservationsCsv from "../../../../../db/datos/inventory_reservations.csv?raw";
import { orders, orderItems, products } from "@/mocks";
import type { PrepareResult, PrepareService } from "../prepareOrder";

// Estos dos CSV contienen únicamente campos simples, sin textos con comas.
function rows(text: string) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [keys[index], value])));
}
const lots = rows(lotsCsv);
const reservations = rows(reservationsCsv);

export function seedPreparation(code: "PED-DEMO-003" | "PED-DEMO-006" = "PED-DEMO-003") {
  const order = orders.find((row) => row.code === code)!;
  const lines = orderItems.filter((row) => row.order_id === order.id).map((item) => ({
    ...item, product: products.find((product) => product.id === item.product_id)!,
  }));
  const result: PrepareResult = {
    order_id: order.id, code: order.code, status: order.status, dry_run: true,
    lines: lines.map((item) => {
      const prepared = code === "PED-DEMO-003" ? item.prepared_qty : item.approved_qty!;
      const reservation = reservations.find((row) => row.product_id === item.product_id && row.status === "active")!;
      const lot = lots.find((entry) => entry.id === reservation.lot_id)!;
      return {
        product_id: item.product_id, sku: item.product.sku, approved_qty: item.approved_qty!,
        prepared_qty: prepared,
        lots: prepared ? [{ lot_id: lot.id, batch_code: lot.batch_code, expires_on: lot.expires_on || null, qty: prepared }] : [],
      };
    }),
  };
  const expired = lots.find((lot) => lot.batch_code === "DEMO-002-VENC")!;
  return { order, lines, result, expired };
}

export const calls: { id: string; dryRun: boolean }[] = [];
export let mode: "normal" | "expired" | "error" = "normal";
export function setMode(value: typeof mode) { mode = value; }

// Se inyecta por props exclusivamente en preparar.html. No escribe en los fixtures.
export function controlledService(seed: ReturnType<typeof seedPreparation>): PrepareService {
  return async (id, options) => {
    calls.push({ id, dryRun: options.dryRun });
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (mode === "error") throw new Error("El pedido cambió de estado. Solicita una nueva vista previa.");
    const result = structuredClone(seed.result);
    result.dry_run = options.dryRun;
    if (!options.dryRun) {
      result.status = seed.order.code === "PED-DEMO-006" ? "ready" : "preparing";
      if (result.status === "preparing") result.incident_code = "INC-EMPAQUE";
    }
    if (mode === "expired") {
      const line = result.lines.find((row) => row.sku === "INS-002")!;
      line.lots[0] = { ...line.lots[0], lot_id: seed.expired.id, batch_code: seed.expired.batch_code, expires_on: seed.expired.expires_on };
    }
    return result;
  };
}
