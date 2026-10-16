/**
 * Capa de datos temporal del frontend — ⚠️ SOLO MIENTRAS NO EXISTA `src/data/` (J-1.1).
 *
 * Imita el contrato C2 (`docs/06_PLAN_EQUIPO.md` §3) con las **mismas firmas**, para que
 * las pantallas no cambien cuando llegue lo real:
 *   - lecturas  → `useProducts()`, `useOrders(filtro)`, `useOrder(id)`, `useLocations(scope)`,
 *                 `useIncidents(filtro)`, `useAnalysis(orderId)`   (hoy `@/mocks`, B-0.1)
 *   - escrituras → `createOrder(datos)`, `analyzeOrder(id)`, `decideOrder(id, datos)` (J-1.4)
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

import {
  incidents,
  locations,
  orderItems,
  orders,
  products,
  type Incident,
  type Location,
  type Order,
  type OrderItem,
  type Product,
} from "@/mocks";

import { FECHA_REFERENCIA, PUNTOS_POR_STAFF } from "@/app/dev/datosDemo";
import { STAFF_ID_POR_ROL, rolActual, useSession } from "@/app/dev/session";

/** Latencia simulada, para que se vean los estados de carga. */
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pedidos creados en esta sesión de demo (arriba de los 26 del seed). */
const creados: Order[] = [];
/** Índice por `idempotency_key` → devuelve el mismo pedido si se repite la clave. */
const creadosPorClave = new Map<string, Order>();
let siguienteNumero = orders.length + 1; // 27 → PED-DEMO-027

// --- J-1.4 · análisis y decisión (estado temporal) -------------------------------------
// temporal: reemplazar por `decision_logs` + `incidents` (lectura `useAnalysis` de `@/data`)
// temporal: y por `fn_analizar_reglas` / `fn_decidir_pedido` (D-1.2, D-1.3).

/** Incidencias creadas por el análisis en esta sesión de demo (arriba de las del seed). */
const incidenciasAnalisis: Incident[] = [];
/** Último análisis por pedido (`useAnalysis(orderId)`); la base lo guarda en `decision_logs`. */
const analisisPorPedido = new Map<string, AnalysisResult>();
/** Estado nuevo de los pedidos decididos en esta sesión (`id` → estado). */
const estadosDecididos = new Map<string, Order["status"]>();
let siguienteIncidenciaDemo = 1;

/**
 * `response.answers` de `db/jev_respuesta_SIMULADA.json` (provider `mock` → SIMULADO).
 * temporal: reemplazar por la respuesta real de Jev que guarda `decision_logs`.
 */
const RESPUESTA_JEV: Record<string, unknown> = {
  urgency: {
    type: "choice",
    choice: "urgent",
    probabilities: { routine: 0.04, urgent: 0.91, review: 0.05 },
    confidence: 0.865,
  },
  additional_reason: {
    type: "choice",
    choice: "review",
    probabilities: { supported: 0.2, possible_duplicate: 0.2, review: 0.6 },
    confidence: 0.4,
  },
  needs_human_review: { type: "noul", noul: 0.9 },
};

/** Los dos tipos de alerta que produce el análisis (`fn_analizar_reglas`). */
const KINDS_ANALISIS: Incident["kind"][] = ["possible_duplicate", "missing_from_kit"];

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
        // Refleja las decisiones tomadas en esta sesión (el estado real lo manda la base).
        .map((pedido) => ({ ...pedido, status: estadosDecididos.get(pedido.id) ?? pedido.status }))
        .filter((pedido) => verTodos || ids.includes(pedido.location_id))
        .filter((pedido) => (!filtro?.locationId || pedido.location_id === filtro.locationId))
        .filter((pedido) => (!filtro?.cycleMonth || pedido.cycle_month === filtro.cycleMonth))
        .sort((a, b) => b.code.localeCompare(a.code));
    },
  });
}

/**
 * Detalle de lectura: un pedido con sus ítems y el producto de cada uno
 * (`useOrder(id)`, contrato C2 → `orders` + `order_items` + `products`).
 *
 * La pantalla navega por código (`/admin/:code`), así que primero resuelve el `id` con
 * `useOrders()` y aquí pide el detalle. El UUID nunca se muestra (AGENTS.md §12).
 */
export function useOrder(orderId: string | undefined) {
  return useQuery<DetallePedido | null>({
    queryKey: ["demo", "pedido", orderId ?? null],
    enabled: !!orderId,
    staleTime: 0,
    queryFn: async () => {
      await esperar(200);
      const base = pedidoPorId(orderId as string);
      if (!base) return null;
      return { order: conEstadoActual(base), items: itemsDe(base.id) };
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

/** Filtro de incidencias (`useIncidents(filtro)`, contrato C2). */
export type FiltroIncidencias = {
  orderId?: string;
  locationId?: string;
  status?: Incident["status"];
  kind?: Incident["kind"];
};

/**
 * Lista de lectura: incidencias visibles (`useIncidents(filtro)`, contrato C2).
 *
 * Misma visibilidad que `useOrders`/`useLocations`: la política RLS `incidents_read`
 * filtra por `location_id`, así que quien tiene puntos asignados solo ve las suyas.
 * Sin filtro devuelve las del alcance del usuario (el admin ve todas).
 */
export function useIncidents(filtro?: FiltroIncidencias) {
  const { data: sesion } = useSession();
  const puntos = sesion?.points ?? [];
  const verTodos = puntos.length === 0;
  const ids = puntos.map((punto) => punto.id);

  return useQuery<Incident[]>({
    queryKey: [
      "demo",
      "incidencias",
      verTodos ? "todos" : ids,
      filtro?.orderId ?? null,
      filtro?.locationId ?? null,
      filtro?.status ?? null,
      filtro?.kind ?? null,
    ],
    staleTime: 0,
    queryFn: async () => {
      await esperar(150);
      return [...incidents, ...incidenciasAnalisis]
        .filter((incidencia) => verTodos || ids.includes(incidencia.location_id))
        .filter((incidencia) => !filtro?.orderId || incidencia.order_id === filtro.orderId)
        .filter((incidencia) => !filtro?.locationId || incidencia.location_id === filtro.locationId)
        .filter((incidencia) => !filtro?.status || incidencia.status === filtro.status)
        .filter((incidencia) => !filtro?.kind || incidencia.kind === filtro.kind);
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

// --- J-1.4 · análisis del pedido y decisión (contrato C2, capa temporal) ---------------

/** `AnalysisResult` de `POST /orders/{id}/analyze` (`specs/000-contratos/openapi.yaml`). */
export type AnalysisResult = {
  order_id: string;
  duplicates: { order_id: string; order_code: string }[];
  missing_kit: { product_id: string; sku: string }[];
  incidents: { id: string; code: string; kind: "possible_duplicate" | "missing_from_kit" }[];
  proposal: AiProposal;
};

/** `AiProposal` del contrato: la IA solo propone, nunca decide (invariante I2). */
export type AiProposal = {
  source: "SIMULADO" | "API_REAL";
  model: string;
  status: "proposed" | "human_review";
  answers: Record<string, unknown>;
  decision_log_id: string;
};

/** `DecisionRequest` de `POST /orders/{id}/decision`. */
export type DecisionInput = {
  decision: "approve" | "return" | "cancel";
  reason?: string;
  items?: { product_id: string; approved_qty: number }[];
};

/** Pedido con sus ítems resueltos contra `products` (`useOrder(id)`, contrato C2). */
export type DetallePedido = {
  order: Order;
  items: (OrderItem & { product: Product })[];
};

function pedidoPorId(orderId: string): Order | undefined {
  return [...orders, ...creados].find((pedido) => pedido.id === orderId);
}

/** Aplica el estado decidido en esta sesión (el real vive en la base). */
function conEstadoActual(pedido: Order): Order {
  return { ...pedido, status: estadosDecididos.get(pedido.id) ?? pedido.status };
}

/** `order_items` del pedido con su `product`, sin duplicar tablas. */
function itemsDe(orderId: string): (OrderItem & { product: Product })[] {
  return orderItems
    .filter((item) => item.order_id === orderId)
    .map((item) => ({
      ...item,
      product: products.find((producto) => producto.id === item.product_id),
    }))
    .filter((item): item is OrderItem & { product: Product } => item.product !== undefined);
}

function productoPorSku(sku: string): Product | undefined {
  return products.find((producto) => producto.sku === sku);
}

/** Huella de composición: mismo producto y misma cantidad solicitada (`db/04`, PITCH-1). */
function huellaComposicion(orderId: string): string {
  return orderItems
    .filter((item) => item.order_id === orderId)
    .map((item) => `${item.product_id}:${item.requested_qty}`)
    .sort()
    .join(",");
}

function incidenciaAbierta(orderId: string, kind: Incident["kind"]): boolean {
  return [...incidents, ...incidenciasAnalisis].some(
    (incidencia) =>
      incidencia.order_id === orderId && incidencia.kind === kind && incidencia.status === "open",
  );
}

function crearIncidencia(
  pedido: Order,
  code: string,
  kind: Incident["kind"],
  severity: Incident["severity"],
  description: string,
): Incident {
  return {
    id: `demo-incidencia-${String(siguienteIncidenciaDemo++).padStart(3, "0")}`,
    code,
    location_id: pedido.location_id,
    order_id: pedido.id,
    shipment_id: null,
    kind,
    severity,
    status: "open",
    description,
    created_at: FECHA_REFERENCIA,
    created_by: STAFF_ID_POR_ROL[rolActual()],
    provenance: "synthetic",
  };
}

/**
 * Lectura del análisis: `decision_logs` + `incidents` abiertas del pedido
 * (`useAnalysis(orderId)`, contrato C2). `null` si el pedido todavía no se analizó.
 */
export function useAnalysis(orderId: string | undefined) {
  return useQuery<AnalysisResult | null>({
    queryKey: ["demo", "analisis", orderId ?? null],
    enabled: !!orderId,
    staleTime: 0,
    queryFn: async () => {
      await esperar(120);
      return analisisPorPedido.get(orderId as string) ?? null;
    },
  });
}

/**
 * `analyzeOrder(id)` (POST `/orders/{id}/analyze`, contrato).
 *
 * // temporal: reemplazar por `fn_analizar_reglas` (D-1.2) + la propuesta real de Jev.
 * Reproduce dos reglas: duplicado exacto por punto/mes/composición (`db/04`, PITCH-1) y el
 * caso del kit del seed (PED-DEMO-002 omite INS-016, PITCH-2). Las alertas no cancelan ni
 * bloquean, y volver a llamarlo no duplica incidencias (idempotente).
 */
export async function analyzeOrder(orderId: string): Promise<AnalysisResult> {
  await esperar(500);
  const pedido = pedidoPorId(orderId);
  if (!pedido) throw new ErrorApi(404, "NOT_FOUND", "El pedido no existe.");

  // Duplicado: mismo punto, mismo `cycle_month`, tipo `regular` y misma composición.
  const huella = huellaComposicion(pedido.id);
  const duplicates = [...orders, ...creados]
    .filter((otro) => otro.id !== pedido.id)
    .filter((otro) => otro.status !== "cancelled")
    .filter((otro) => otro.order_type === "regular" && pedido.order_type === "regular")
    .filter(
      (otro) => otro.location_id === pedido.location_id && otro.cycle_month === pedido.cycle_month,
    )
    .filter((otro) => huellaComposicion(otro.id) === huella)
    .map((otro) => ({ order_id: otro.id, order_code: otro.code }));

  // Kit: `replenishment_policies.required_in_kit` todavía no es un fixture.
  // temporal: reemplazar por la consulta real; por ahora, el caso del seed (PITCH-2).
  const missing_kit =
    pedido.code === "PED-DEMO-002"
      ? [{ product_id: productoPorSku("INS-016")?.id ?? "", sku: "INS-016" }]
      : [];

  if (duplicates.length > 0 && !incidenciaAbierta(pedido.id, "possible_duplicate")) {
    const cuantos = orderItems.filter((item) => item.order_id === pedido.id).length;
    incidenciasAnalisis.push(
      crearIncidencia(
        pedido,
        "INC-DUPLICADO",
        "possible_duplicate",
        "high",
        `${pedido.code} repite los ${cuantos} ítems de ${duplicates[0].order_code}, mismo punto y período.`,
      ),
    );
  }
  if (missing_kit.length > 0 && !incidenciaAbierta(pedido.id, "missing_from_kit")) {
    incidenciasAnalisis.push(
      crearIncidencia(
        pedido,
        "INC-OMISION",
        "missing_from_kit",
        "medium",
        `${missing_kit[0].sku} figura en el kit ficticio y no aparece en el pedido.`,
      ),
    );
  }

  const resultado: AnalysisResult = {
    order_id: pedido.id,
    duplicates,
    missing_kit,
    incidents: [...incidents, ...incidenciasAnalisis]
      .filter(
        (incidencia) =>
          incidencia.order_id === pedido.id &&
          incidencia.status === "open" &&
          KINDS_ANALISIS.includes(incidencia.kind),
      )
      .map((incidencia) => ({
        id: incidencia.id,
        code: incidencia.code,
        kind: incidencia.kind as "possible_duplicate" | "missing_from_kit",
      })),
    proposal: {
      source: "SIMULADO", // `decision_logs.provider = mock` → SIMULADO (I6)
      model: "jev-1.13.0",
      status: "human_review", // `decision_logs.status` del seed (< 0.80 → revisión humana)
      answers: RESPUESTA_JEV,
      decision_log_id: `demo-decision-log-${pedido.id}`,
    },
  };
  analisisPorPedido.set(pedido.id, resultado);
  return resultado;
}

/**
 * `decideOrder(id, datos)` (POST `/orders/{id}/decision`, contrato).
 *
 * // temporal: reemplazar por `fn_decidir_pedido` (D-1.3).
 * `approve` → `approved`; `return` → `draft`; `cancel` → `cancelled`. Solo desde
 * `submitted` (si no, 409); el autor no puede decidir su propio pedido (403); devolver,
 * cancelar o aprobar con cantidades corregidas sin `reason` → 422.
 */
export async function decideOrder(orderId: string, datos: DecisionInput): Promise<OrderResult> {
  await esperar(500);
  const pedido = pedidoPorId(orderId);
  if (!pedido) throw new ErrorApi(404, "NOT_FOUND", "El pedido no existe.");

  const estadoActual = estadosDecididos.get(pedido.id) ?? pedido.status;
  if (estadoActual !== "submitted") {
    throw new ErrorApi(409, "INVALID_STATE", "Solo se puede decidir un pedido enviado.");
  }
  // El autor no puede decidir su propio pedido (lo impone la base; invariante I8).
  if (pedido.requested_by === STAFF_ID_POR_ROL[rolActual()]) {
    throw new ErrorApi(403, "FORBIDDEN", "No puedes decidir un pedido que tú mismo creaste.");
  }

  const cambiaCantidades =
    datos.decision === "approve" &&
    (datos.items ?? []).some((item) => {
      const original = orderItems.find(
        (oi) => oi.order_id === pedido.id && oi.product_id === item.product_id,
      );
      return !original || original.requested_qty !== item.approved_qty;
    });

  const exigeMotivo =
    datos.decision === "return" || datos.decision === "cancel" || cambiaCantidades;
  if (exigeMotivo && (!datos.reason || datos.reason.trim() === "")) {
    throw new ErrorApi(422, "VALIDATION", "Esta decisión necesita un motivo.", {
      field: "reason",
    });
  }
  for (const item of datos.items ?? []) {
    if (!Number.isInteger(item.approved_qty) || item.approved_qty < 0) {
      throw new ErrorApi(422, "VALIDATION", "La cantidad aprobada no es válida.", {
        field: "approved_qty",
      });
    }
  }

  const nuevoEstado: Order["status"] =
    datos.decision === "approve"
      ? "approved"
      : datos.decision === "return"
        ? "draft"
        : "cancelled";
  estadosDecididos.set(pedido.id, nuevoEstado);
  return { id: pedido.id, code: pedido.code, status: nuevoEstado };
}
