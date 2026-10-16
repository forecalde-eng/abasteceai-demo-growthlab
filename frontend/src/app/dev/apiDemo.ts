/**
 * Capa de datos temporal del frontend — ⚠️ SOLO MIENTRAS NO EXISTA `src/data/` (J-1.1).
 *
 * Imita el contrato C2 (`docs/06_PLAN_EQUIPO.md` §3) con las **mismas firmas**, para que
 * las pantallas no cambien cuando llegue lo real:
 *   - lecturas  → `useProducts()`, `useOrders(filtro)`   (hoy devuelven `@/mocks`, B-0.1)
 *   - escritura → `createOrder(datos)`                    (hoy valida y guarda en memoria)
 *
 * Los componentes NUNCA llaman a Supabase ni a `fetch` directamente (AGENTS.md §12): usan
 * estas funciones. `createOrder` es una función, no un hook: se envuelve con `useMutation`,
 * igual que hará `src/data/api.ts` de David.
 *
 * Para pasar a datos reales:
 *   1. Cambiar los imports de `@/app/dev/apiDemo` por `@/data` en las pantallas.
 *   2. Borrar este archivo y `datosDemo.ts`.
 */

import { useQuery } from "@tanstack/react-query";

import { orders, products, type Order, type Product } from "@/mocks";

import { FECHA_REFERENCIA, PUNTOS_POR_STAFF } from "@/app/dev/datosDemo";
import { STAFF_ID_POR_ROL, rolActual } from "@/app/dev/session";

/** Latencia simulada, para que se vean los estados de carga. */
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pedidos creados en esta sesión de demo (arriba de los 26 del seed). */
const creados: Order[] = [];
/** Índice por `idempotency_key` → devuelve el mismo pedido si se repite la clave. */
const creadosPorClave = new Map<string, Order>();
let siguienteNumero = orders.length + 1; // 27 → PED-DEMO-027

/** Error con la misma forma que el backend (`specs/000-contratos/openapi.yaml` §8). */
export class ErrorApi extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ErrorApi";
    this.status = status;
    this.code = code;
  }
}

export type FiltroPedidos = {
  locationId?: string;
  cycleMonth?: string;
};

/** Lista de lectura: catálogo de los 30 productos (`db/datos/products.csv`). */
export function useProducts() {
  return useQuery<Product[]>({
    queryKey: ["demo", "productos"],
    queryFn: async () => {
      await esperar(250);
      return products;
    },
    staleTime: Infinity,
  });
}

/** Lista de lectura: pedidos, con filtro opcional por punto y mes. */
export function useOrders(filtro?: FiltroPedidos) {
  return useQuery<Order[]>({
    queryKey: ["demo", "pedidos", filtro?.locationId ?? null, filtro?.cycleMonth ?? null],
    // Sin caché: así una pantalla abierta después ve los pedidos creados en esta sesión.
    staleTime: 0,
    queryFn: async () => {
      await esperar(200);
      return [...orders, ...creados].filter(
        (pedido) =>
          (!filtro?.locationId || pedido.location_id === filtro.locationId) &&
          (!filtro?.cycleMonth || pedido.cycle_month === filtro.cycleMonth),
      );
    },
  });
}

/** Lo que manda el formulario. Coincide con el cuerpo de `POST /orders`. */
export type NuevoPedido = {
  location_id: string;
  cycle_month: string;
  order_type: "regular" | "additional";
  related_order_id?: string | null;
  reason?: string | null;
  observations?: string | null;
  items: { product_id: string; requested_qty: number }[];
  /** Se genera una sola vez por formulario: repetirla no crea otro pedido. */
  idempotency_key: string;
};

/**
 * Escritura: crea el pedido (`status=submitted`). Reproduce lo que valida la base en
 * `fn_crear_pedido` (HU-1.1): punto no asignado → 403; producto inexistente/inactivo o
 * repetido → 422; mismo `Idempotency-Key` → devuelve el pedido existente.
 */
export async function createOrder(datos: NuevoPedido): Promise<Order> {
  await esperar(600);

  // 1) Idempotencia: la misma clave devuelve el pedido ya creado (no duplica).
  const yaCreado = creadosPorClave.get(datos.idempotency_key);
  if (yaCreado) return yaCreado;

  // 2) El punto tiene que estar asignado al usuario.
  const staffId = STAFF_ID_POR_ROL[rolActual()];
  const asignados = PUNTOS_POR_STAFF[staffId] ?? [];
  if (!asignados.includes(datos.location_id)) {
    throw new ErrorApi(403, "punto_no_asignado", "Ese punto no está entre los que tienes asignados.");
  }

  // 3) Ítems: producto existente y activo, sin repetir.
  const vistos = new Set<string>();
  for (const item of datos.items) {
    const producto = products.find((p) => p.id === item.product_id);
    if (!producto || !producto.active) {
      throw new ErrorApi(422, "producto_invalido", "El pedido tiene un producto inexistente o inactivo.");
    }
    if (vistos.has(item.product_id)) {
      throw new ErrorApi(422, "producto_repetido", "El pedido tiene un producto repetido.");
    }
    vistos.add(item.product_id);
  }

  // 4) Un adicional necesita pedido original y motivo (lo exige la base).
  if (datos.order_type === "additional") {
    if (!datos.related_order_id) {
      throw new ErrorApi(422, "adicional_sin_pedido", "Un pedido adicional necesita el pedido original.");
    }
    if (!datos.reason || datos.reason.trim() === "") {
      throw new ErrorApi(422, "adicional_sin_motivo", "Un pedido adicional necesita un motivo.");
    }
  }

  // El reloj de la demo es fijo (regla 11): nunca `now()`.
  const pedido: Order = {
    id: `demo-${datos.idempotency_key}`,
    code: `PED-DEMO-${String(siguienteNumero++).padStart(3, "0")}`,
    location_id: datos.location_id,
    cycle_month: datos.cycle_month,
    requested_by: staffId,
    approved_by: null,
    requested_at: FECHA_REFERENCIA,
    approved_at: null,
    status: "submitted",
    order_type: datos.order_type,
    related_order_id: datos.related_order_id ?? null,
    reason: datos.reason ?? null,
    observations: datos.observations ?? "",
    idempotency_key: datos.idempotency_key,
    provenance: "synthetic",
  };

  creados.push(pedido);
  creadosPorClave.set(datos.idempotency_key, pedido);
  return pedido;
}
