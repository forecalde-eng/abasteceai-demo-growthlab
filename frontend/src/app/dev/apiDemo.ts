/**
 * Capa de datos temporal del frontend — ⚠️ SOLO MIENTRAS NO EXISTA `src/data/` (J-1.1).
 *
 * Imita el contrato C2 (`docs/06_PLAN_EQUIPO.md` §3) con las **mismas firmas**, para que
 * las pantallas no cambien cuando llegue lo real:
 *   - lecturas  → `useProducts()`, `useOrders(filtro)`, `useLocations(scope)`  (hoy `@/mocks`, B-0.1)
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

import { locations, orders, products, type Location, type Order, type Product } from "@/mocks";

import { FECHA_REFERENCIA, PUNTOS_POR_STAFF } from "@/app/dev/datosDemo";
import { STAFF_ID_POR_ROL, rolActual, useSession } from "@/app/dev/session";

/** Latencia simulada, para que se vean los estados de carga. */
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pedidos creados en esta sesión de demo (arriba de los 26 del seed). */
const creados: Order[] = [];
/** Índice por `idempotency_key` → devuelve el mismo pedido si se repite la clave. */
const creadosPorClave = new Map<string, Order>();
let siguienteNumero = orders.length + 1; // 27 → PED-DEMO-027

/**
 * Error con la forma del contrato (`schemas.Error`: `{ error: { code, message, details } }`).
 * `code` es uno del enum del openapi; `status` y `details` son de la capa temporal.
 */
export class ErrorApi extends Error {
  status: number;
  /** `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | INVALID_STATE | VALIDATION | CONFLICT | UPSTREAM_AI`. */
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ErrorApi";
    this.status = status;
    this.code = code;
    this.details = details;
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

/**
 * Lista de lectura: pedidos visibles, con filtro opcional por punto y mes.
 *
 * Visibilidad = mímica de RLS (invariante I8): quien tiene puntos asignados solo ve los suyos
 * (`useSession().points`); los roles de alcance total (sin asignaciones explícitas) ven todo.
 * Incluye los pedidos creados en esta sesión de demo, con el más reciente primero.
 */
export function useOrders(filtro?: FiltroPedidos) {
  const { data: sesion } = useSession();
  const puntos = sesion?.points ?? [];
  const verTodos = puntos.length === 0;
  const ids = puntos.map((punto) => punto.id);

  return useQuery<Order[]>({
    queryKey: [
      "demo",
      "pedidos",
      verTodos ? "todos" : ids,
      filtro?.locationId ?? null,
      filtro?.cycleMonth ?? null,
    ],
    // Sin caché: así una pantalla abierta después ve los pedidos creados en esta sesión.
    staleTime: 0,
    queryFn: async () => {
      await esperar(200);
      return [...orders, ...creados]
        .filter((pedido) => verTodos || ids.includes(pedido.location_id))
        .filter((pedido) => (!filtro?.locationId || pedido.location_id === filtro.locationId))
        .filter((pedido) => (!filtro?.cycleMonth || pedido.cycle_month === filtro.cycleMonth))
        .sort((a, b) => b.code.localeCompare(a.code));
    },
  });
}

/**
 * Lista de lectura: puntos de servicio (`useLocations(scope)`, contrato C2).
 * `"asignados"` respeta la misma visibilidad que `useOrders`; `"todos"` da el catálogo entero.
 */
export function useLocations(scope: "asignados" | "todos" = "asignados") {
  const { data: sesion } = useSession();
  const puntos = sesion?.points ?? [];
  const verTodos = puntos.length === 0;
  const ids = puntos.map((punto) => punto.id);

  return useQuery<Location[]>({
    queryKey: ["demo", "locations", scope, verTodos ? "todos" : ids],
    staleTime: Infinity,
    queryFn: async () => {
      await esperar(100);
      if (scope === "todos" || verTodos) return locations;
      return locations.filter((punto) => ids.includes(punto.id));
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

/** Lo que devuelve `POST /orders` (`schemas.OrderResult`): **no** el pedido completo. */
export type OrderResult = { id: string; code: string; status: Order["status"] };

/**
 * Escritura: crea el pedido (`status=submitted`). Reproduce lo que valida la base en
 * `fn_crear_pedido` (HU-1.1): punto no asignado → 403 (`FORBIDDEN`); producto
 * inexistente/inactivo o repetido → 422 (`VALIDATION`); adicional sin pedido/motivo →
 * 422 (`VALIDATION`); misma `Idempotency-Key` → 200 con el pedido existente (sin duplicar).
 * Devuelve **solo** `{ id, code, status }` (`schemas.OrderResult`); el detalle se lee con `useOrders`.
 */
export async function createOrder(datos: NuevoPedido): Promise<OrderResult> {
  await esperar(600);

  // 1) Idempotencia: la misma clave devuelve el pedido ya creado (no duplica).
  const yaCreado = creadosPorClave.get(datos.idempotency_key);
  if (yaCreado) return yaCreado;

  // 2) El punto tiene que estar asignado al usuario.
  const staffId = STAFF_ID_POR_ROL[rolActual()];
  const asignados = PUNTOS_POR_STAFF[staffId] ?? [];
  if (!asignados.includes(datos.location_id)) {
    throw new ErrorApi(403, "FORBIDDEN", "Ese punto no está entre los que tienes asignados.");
  }

  // 3) Ítems: producto existente y activo, sin repetir.
  const vistos = new Set<string>();
  for (const item of datos.items) {
    const producto = products.find((p) => p.id === item.product_id);
    if (!producto || !producto.active) {
      throw new ErrorApi(
        422,
        "VALIDATION",
        "El pedido tiene un producto inexistente o inactivo.",
        { product_id: item.product_id },
      );
    }
    if (vistos.has(item.product_id)) {
      throw new ErrorApi(422, "VALIDATION", "El pedido tiene un producto repetido.", {
        product_id: item.product_id,
      });
    }
    vistos.add(item.product_id);
  }

  // 4) Un adicional necesita pedido original y motivo (lo exige la base).
  if (datos.order_type === "additional") {
    if (!datos.related_order_id) {
      throw new ErrorApi(422, "VALIDATION", "Un pedido adicional necesita el pedido original.", {
        field: "related_order_id",
      });
    }
    if (!datos.reason || datos.reason.trim() === "") {
      throw new ErrorApi(422, "VALIDATION", "Un pedido adicional necesita un motivo.", {
        field: "reason",
      });
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
  // `201`/`200` del contrato: solo el resultado, no el pedido completo.
  return { id: pedido.id, code: pedido.code, status: pedido.status };
}
