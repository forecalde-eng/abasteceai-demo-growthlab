/**
 * Datos de la demo para el frontend (J-1.1) — ⚠️ TEMPORAL.
 *
 * Copiados a mano de `db/datos/*.csv` (que es la fuente de verdad). **No se inventa nada**:
 * los 30 productos, los puntos asignados, los 26 pedidos y el mes de la demo salen tal cual
 * de esos archivos.
 *
 * Esto lo reemplaza la capa de datos real:
 *   - datos → `src/mocks/` de Bruno (B-0.1)
 *   - hooks → `src/data/` de David (contrato C2, `docs/06_PLAN_EQUIPO.md` §3)
 * Cuando lleguen, se cambia el import en `apiDemo.ts` y las pantallas no se tocan.
 */

export type Producto = {
  id: string;
  /** Código visible (nunca el UUID). */
  sku: string;
  nombre: string;
  categoria: string;
  /** `products.inventory_unit`. */
  unidad: string;
  /** Presentación legible: "1 L", "12 rollos"… */
  contenido: string;
  activo: boolean;
  /** `products.has_expiry`. */
  caduca: boolean;
};

export type PuntoAsignado = {
  id: string;
  code: string;
  nombre: string;
  ciudad: string;
};

export type PedidoDemo = {
  id: string;
  code: string;
  location_id: string;
  cycle_month: string;
  requested_by: string;
  status: string;
  order_type: "regular" | "additional";
  related_order_id: string | null;
  reason: string | null;
  observations: string | null;
  requested_at: string;
};

/** `demo_metadata.reference_at` — el reloj de la demo (regla 11 de AGENTS.md). */
export const FECHA_REFERENCIA = "2026-10-10T22:00:00Z";

/** Mes de la demo, tal como aparece en `orders.cycle_month` (oct-2026). */
export const MES_DEMO = "2026-10-01";

/** Los 30 productos de `db/datos/products.csv`. */
export const PRODUCTOS: Producto[] = [
  { id: "75ac4254-6b55-5129-9486-858495711eb2", sku: "INS-001", nombre: "Detergente neutro DEMO 1 L", categoria: "quimico", unidad: "BOTELLA", contenido: "1 L", activo: true, caduca: true },
  { id: "1578897a-a18a-5c6d-8103-3c9af2955dc2", sku: "INS-002", nombre: "Desinfectante DEMO 1 L", categoria: "quimico", unidad: "BOTELLA", contenido: "1 L", activo: true, caduca: true },
  { id: "57cb80a7-75c3-551a-b50b-3267e300eec1", sku: "INS-003", nombre: "Limpiavidrios DEMO 1 L", categoria: "quimico", unidad: "BOTELLA", contenido: "1 L", activo: true, caduca: true },
  { id: "844a77da-5b3c-582d-bbb6-14b4538753b6", sku: "INS-004", nombre: "Desengrasante DEMO 1 L", categoria: "quimico", unidad: "BOTELLA", contenido: "1 L", activo: true, caduca: true },
  { id: "2069c53e-2c08-59ea-bb28-d3a8e59dfb87", sku: "INS-005", nombre: "Limpiador de pisos DEMO 5 L", categoria: "quimico", unidad: "ENVASE", contenido: "5 L", activo: true, caduca: true },
  { id: "d791a1c7-4254-5eb9-a74a-aad6d7ed2af2", sku: "INS-006", nombre: "Jabón de manos DEMO 1 L", categoria: "quimico", unidad: "BOTELLA", contenido: "1 L", activo: true, caduca: true },
  { id: "34f6571f-baf2-5e09-9337-dfb9f7ed1c34", sku: "INS-007", nombre: "Lavavajillas DEMO 750 mL", categoria: "quimico", unidad: "BOTELLA", contenido: "750 mL", activo: true, caduca: true },
  { id: "adcb7644-3b24-5b73-a989-9c29f8514d39", sku: "INS-008", nombre: "Limpiador sanitario DEMO 1 L", categoria: "quimico", unidad: "BOTELLA", contenido: "1 L", activo: true, caduca: true },
  { id: "7da0868d-863c-583f-8fe3-393f906a859a", sku: "INS-009", nombre: "Cera para pisos DEMO 5 L", categoria: "quimico", unidad: "ENVASE", contenido: "5 L", activo: true, caduca: true },
  { id: "f99bf69d-a515-560c-9139-2b5115d01aac", sku: "INS-010", nombre: "Detergente para ropa DEMO 1 kg", categoria: "quimico", unidad: "BOLSA", contenido: "1 kg", activo: true, caduca: true },
  { id: "229f5090-e2fa-5fa4-b28e-1b22c6c3d8de", sku: "INS-011", nombre: "Papel higiénico DEMO paquete x12", categoria: "papel", unidad: "PAQUETE", contenido: "12 rollos", activo: true, caduca: false },
  { id: "b97686fb-2528-572d-a5ee-fba37b426369", sku: "INS-012", nombre: "Papel de manos DEMO x200", categoria: "papel", unidad: "PAQUETE", contenido: "200 hojas", activo: true, caduca: false },
  { id: "46421788-a9fa-5f43-8ef4-d52328727ca0", sku: "INS-013", nombre: "Paños desechables DEMO x10", categoria: "consumible", unidad: "PAQUETE", contenido: "10 paños", activo: true, caduca: false },
  { id: "6f3f2d78-8f5c-5e7b-b24a-c454975f4646", sku: "INS-014", nombre: "Servilletas DEMO x100", categoria: "papel", unidad: "PAQUETE", contenido: "100 servilletas", activo: true, caduca: false },
  { id: "4499eaed-3134-5c64-a81d-562604b12d0c", sku: "INS-015", nombre: "Bolsas de residuos DEMO 50 L x10", categoria: "consumible", unidad: "PAQUETE", contenido: "10 bolsas", activo: true, caduca: false },
  { id: "e442d042-d0a9-54fa-b33f-9b9f077c7c12", sku: "INS-016", nombre: "Bolsas de residuos DEMO 100 L x10", categoria: "consumible", unidad: "PAQUETE", contenido: "10 bolsas", activo: true, caduca: false },
  { id: "979d014c-5cfc-576c-a851-71e9f747f0bb", sku: "INS-017", nombre: "Guantes reutilizables DEMO par", categoria: "proteccion", unidad: "PAR", contenido: "2 guantes", activo: true, caduca: false },
  { id: "73af3db2-68a3-51b0-9321-c55f96d75e30", sku: "INS-018", nombre: "Guantes desechables DEMO x100", categoria: "proteccion", unidad: "CAJA", contenido: "100 guantes", activo: true, caduca: false },
  { id: "52d5c153-aee9-53f4-ab52-ab098c49270d", sku: "INS-019", nombre: "Mascarillas DEMO x50", categoria: "proteccion", unidad: "CAJA", contenido: "50 mascarillas", activo: true, caduca: false },
  { id: "0d7892fe-475d-5a97-a910-ec4fe3fbf168", sku: "INS-020", nombre: "Esponjas DEMO x10", categoria: "consumible", unidad: "PAQUETE", contenido: "10 esponjas", activo: true, caduca: false },
  { id: "c4c3ec28-38aa-5e03-ab0a-6c086bb04f10", sku: "INS-021", nombre: "Fibras de limpieza DEMO x10", categoria: "consumible", unidad: "PAQUETE", contenido: "10 fibras", activo: true, caduca: false },
  { id: "8ad5eae1-dd09-56e2-b0ad-a2cad07c9764", sku: "INS-022", nombre: "Microfibras DEMO x3", categoria: "herramienta", unidad: "PAQUETE", contenido: "3 paños", activo: true, caduca: false },
  { id: "0f4115d0-92a6-5e92-b062-4d9e18bff870", sku: "INS-023", nombre: "Mopa DEMO unidad", categoria: "herramienta", unidad: "UNIDAD", contenido: "1 unidad", activo: true, caduca: false },
  { id: "d592cec6-c8b7-5c94-891e-350b4d98a63b", sku: "INS-024", nombre: "Escoba DEMO unidad", categoria: "herramienta", unidad: "UNIDAD", contenido: "1 unidad", activo: true, caduca: false },
  { id: "1a6b5a62-f2cf-5351-915b-a8d551f07dff", sku: "INS-025", nombre: "Recogedor DEMO unidad", categoria: "herramienta", unidad: "UNIDAD", contenido: "1 unidad", activo: true, caduca: false },
  { id: "6e1b5558-89f1-5140-808c-40e6d45c2d38", sku: "INS-026", nombre: "Balde DEMO 10 L vacío", categoria: "herramienta", unidad: "UNIDAD", contenido: "10 L (capacidad)", activo: true, caduca: false },
  { id: "67d398c2-e016-5b0d-94ef-aab372601bc7", sku: "INS-027", nombre: "Atomizador DEMO 500 mL vacío", categoria: "herramienta", unidad: "UNIDAD", contenido: "500 mL (capacidad)", activo: true, caduca: false },
  { id: "300c24b0-ca1c-5621-a939-cbf412159fb9", sku: "INS-028", nombre: "Cepillo DEMO unidad", categoria: "herramienta", unidad: "UNIDAD", contenido: "1 unidad", activo: true, caduca: false },
  { id: "26e30c6f-ba35-5c2d-ad8c-b5b3a3a6bbee", sku: "INS-029", nombre: "Dispensador DEMO unidad", categoria: "herramienta", unidad: "UNIDAD", contenido: "1 unidad", activo: true, caduca: false },
  { id: "d1cdb729-38e2-5483-92a8-f4da7cc0c958", sku: "INS-030", nombre: "Carro de limpieza DEMO unidad", categoria: "equipo", unidad: "UNIDAD", contenido: "1 unidad", activo: true, caduca: false },
];

const P = (id: string, code: string, nombre: string, ciudad: string): PuntoAsignado => ({ id, code, nombre, ciudad });

/**
 * Puntos asignados por `staff_id` (`db/datos/point_assignments.csv` + `locations.csv`).
 * El auxiliar (Ana) ve 3; el supervisor (Luis) ve 24; el resto no tiene filas en
 * `point_assignments` y por eso la lista queda vacía.
 */
export const PUNTOS_POR_STAFF: Record<string, PuntoAsignado[]> = {
  // Ana Demo (auxiliar) → Q-001, Q-005, Q-008
  "054ae798-96a3-56e2-b309-336a4f88b772": [
    P("704dfcd6-b98d-56ce-8661-bfc410332be8", "Q-001", "Oficina DEMO Quito Centro 001", "Quito"),
    P("85ffdf07-af4c-54ec-8829-1003b49a6879", "Q-005", "Oficina DEMO Quito Centro 005", "Quito"),
    P("e12cbeb4-3490-5f21-921d-16d94fa7d5c5", "Q-008", "Oficina DEMO Quito Este 008", "Quito"),
  ],
  // Luis Demo (supervisor) → los 24 puntos detallados
  "aca13b82-3dc4-538e-8e99-f7760d016163": [
    P("704dfcd6-b98d-56ce-8661-bfc410332be8", "Q-001", "Oficina DEMO Quito Centro 001", "Quito"),
    P("50756d9d-9267-5fc0-ac92-4ea8f6abdc1a", "Q-002", "Local comercial DEMO Quito Norte 002", "Quito"),
    P("83ceb3cf-e00e-5994-8a74-84812eecb588", "Q-003", "Centro educativo DEMO Quito Sur 003", "Quito"),
    P("ba44ff75-f5e0-59ad-a1fa-a7dc032c35e6", "Q-004", "Bodega del cliente DEMO Quito Este 004", "Quito"),
    P("85ffdf07-af4c-54ec-8829-1003b49a6879", "Q-005", "Oficina DEMO Quito Centro 005", "Quito"),
    P("191e60d9-e04d-5f6b-ae71-18833915b11d", "Q-006", "Local comercial DEMO Quito Norte 006", "Quito"),
    P("26f20a3b-ed43-5992-bacf-2d747abc8a85", "Q-007", "Centro educativo DEMO Quito Sur 007", "Quito"),
    P("e12cbeb4-3490-5f21-921d-16d94fa7d5c5", "Q-008", "Oficina DEMO Quito Este 008", "Quito"),
    P("04a3bad0-73e4-53ef-8c50-ecdd7fe14243", "Q-009", "Local comercial DEMO Quito Centro 009", "Quito"),
    P("b99a8bfa-409f-5cef-83e0-c282401ba4f2", "Q-010", "Centro educativo DEMO Quito Norte 010", "Quito"),
    P("ac257a20-9323-575f-8ec8-1ceef8a5e999", "G-001", "Bodega del cliente DEMO Guayaquil Centro 001", "Guayaquil"),
    P("65dc8678-f7b0-5047-8920-0449f98c7edf", "G-002", "Bodega del cliente DEMO Guayaquil Norte 002", "Guayaquil"),
    P("5278b347-937a-56af-a04c-7f328772d459", "G-003", "Oficina DEMO Guayaquil Sur 003", "Guayaquil"),
    P("0b3db3fb-db17-5171-b818-710783741bcf", "G-004", "Local comercial DEMO Guayaquil Este 004", "Guayaquil"),
    P("2b5243d4-361a-5922-9f5f-7653a670bb10", "G-005", "Centro educativo DEMO Guayaquil Centro 005", "Guayaquil"),
    P("1be05b48-d856-5cd1-b1e8-bfef1eeee7e7", "G-006", "Bodega del cliente DEMO Guayaquil Norte 006", "Guayaquil"),
    P("c3d0444f-de56-5e32-b275-854c516b7d5c", "G-007", "Oficina DEMO Guayaquil Sur 007", "Guayaquil"),
    P("4f4f47cc-c97b-5d6f-853c-aa04962c3850", "G-008", "Local comercial DEMO Guayaquil Este 008", "Guayaquil"),
    P("418e8c63-c23d-5f71-95a9-da65f2b0c23a", "C-001", "Centro educativo DEMO Cuenca Centro 001", "Cuenca"),
    P("1fd87662-12ef-5c13-ae5c-b245317ec657", "C-002", "Bodega del cliente DEMO Cuenca Norte 002", "Cuenca"),
    P("61982fca-0fb1-56cb-8eaf-36c1e4e8fa2d", "C-003", "Oficina DEMO Cuenca Sur 003", "Cuenca"),
    P("755fa63c-a56a-5d66-ac3e-1d1f99d4251e", "C-004", "Local comercial DEMO Cuenca Este 004", "Cuenca"),
    P("840711da-8638-51f6-b1f1-d09c4bca88aa", "C-005", "Centro educativo DEMO Cuenca Centro 005", "Cuenca"),
    P("5947e50e-ab5b-5baa-8e06-84a67e6f9197", "C-006", "Bodega del cliente DEMO Cuenca Norte 006", "Cuenca"),
  ],
};

/** Los 26 pedidos de `db/datos/orders.csv` (para el selector de "pedido original"). */
export const PEDIDOS: PedidoDemo[] = [
  { id: "e554f1c3-989e-542f-9b2a-81eb1fbe0cfe", code: "PED-DEMO-001", location_id: "704dfcd6-b98d-56ce-8661-bfc410332be8", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "submitted", order_type: "regular", related_order_id: null, reason: null, observations: "Nos falta desinfectante y tenemos una jornada adicional mañana.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "4f0e7cb2-7f23-52a8-9dd3-0c2885bae6fa", code: "PED-DEMO-002", location_id: "50756d9d-9267-5fc0-ac92-4ea8f6abdc1a", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "submitted", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual; se omitió una bolsa del kit.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "3fc22a86-c42c-57eb-8a95-e93a509013f4", code: "PED-DEMO-003", location_id: "83ceb3cf-e00e-5994-8a74-84812eecb588", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "preparing", order_type: "regular", related_order_id: null, reason: null, observations: "Se prepararon menos botellas que las aprobadas.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "54e5eeb1-7d15-50fd-ba9d-e6eee8b0ea7a", code: "PED-DEMO-004", location_id: "ba44ff75-f5e0-59ad-a1fa-a7dc032c35e6", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "delivered_unchecked", order_type: "regular", related_order_id: null, reason: null, observations: "Se dejó la guía; el auxiliar todavía no verificó el contenido.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "e01ed5b7-f287-5728-9033-1452b2cc4eb7", code: "PED-DEMO-005", location_id: "85ffdf07-af4c-54ec-8829-1003b49a6879", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "with_difference", order_type: "regular", related_order_id: null, reason: null, observations: "Se contaron ocho botellas donde la guía decía diez.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "882616bd-37be-594d-a2a8-6cc96bdf9048", code: "PED-DEMO-006", location_id: "191e60d9-e04d-5f6b-ae71-18833915b11d", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "approved", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "7ee0e60e-f94b-56a7-97a9-fad19e7e4d06", code: "PED-DEMO-007", location_id: "26f20a3b-ed43-5992-bacf-2d747abc8a85", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "ready", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "05a31f45-d89d-52b6-b87c-da40f1464bbc", code: "PED-DEMO-008", location_id: "ac257a20-9323-575f-8ec8-1ceef8a5e999", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "shipped", order_type: "regular", related_order_id: null, reason: null, observations: "Courier DEMO, entrega todavía pendiente.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "52b34c13-a8a2-5a0f-9ce4-2a1b88c81d56", code: "PED-DEMO-009", location_id: "e12cbeb4-3490-5f21-921d-16d94fa7d5c5", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "reconciled", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "70d673aa-c8be-53d5-be58-ff088247475f", code: "PED-DEMO-010", location_id: "04a3bad0-73e4-53ef-8c50-ecdd7fe14243", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "approved", order_type: "regular", related_order_id: null, reason: null, observations: "Abastecimiento pendiente de disponibilidad en bodega.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "43cd3e48-f44a-529f-822e-c9e722588e95", code: "PED-DEMO-011", location_id: "b99a8bfa-409f-5cef-83e0-c282401ba4f2", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "355798a7-5ed5-5a97-99f2-3b520ac91c7c", code: "PED-DEMO-012", location_id: "65dc8678-f7b0-5047-8920-0449f98c7edf", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "127d96be-9b6b-59a0-8b44-0f334fbf588f", code: "PED-DEMO-013", location_id: "5278b347-937a-56af-a04c-7f328772d459", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "3480b829-2cba-59db-a968-b7e468ed160d", code: "PED-DEMO-014", location_id: "0b3db3fb-db17-5171-b818-710783741bcf", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "b84164c7-86db-55c5-9e79-31999f6f74d5", code: "PED-DEMO-015", location_id: "2b5243d4-361a-5922-9f5f-7653a670bb10", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "c5f56a6d-f5b9-53e5-a135-3d6fa5a44dbf", code: "PED-DEMO-016", location_id: "1be05b48-d856-5cd1-b1e8-bfef1eeee7e7", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "95ee95a9-aaef-5109-b5e3-a23a9939ddc8", code: "PED-DEMO-017", location_id: "c3d0444f-de56-5e32-b275-854c516b7d5c", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "ed25c33d-3471-567c-b78f-a3bbb7bad1db", code: "PED-DEMO-018", location_id: "4f4f47cc-c97b-5d6f-853c-aa04962c3850", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "01cac203-8634-5296-8c73-ca962a9a3562", code: "PED-DEMO-019", location_id: "418e8c63-c23d-5f71-95a9-da65f2b0c23a", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "1fb4bac9-2559-5ded-8efb-ce585a07ae7c", code: "PED-DEMO-020", location_id: "1fd87662-12ef-5c13-ae5c-b245317ec657", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "9bc6e44e-39ae-5448-b33b-b3ab7c56d393", code: "PED-DEMO-021", location_id: "61982fca-0fb1-56cb-8eaf-36c1e4e8fa2d", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "2b894f6e-752b-54fd-8b67-82520a498063", code: "PED-DEMO-022", location_id: "755fa63c-a56a-5d66-ac3e-1d1f99d4251e", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "f6919d57-fd45-5d7d-bc1b-718d73e11cea", code: "PED-DEMO-023", location_id: "840711da-8638-51f6-b1f1-d09c4bca88aa", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "74496fb2-13e7-5ab0-af51-9d58be6aaf92", code: "PED-DEMO-024", location_id: "5947e50e-ab5b-5baa-8e06-84a67e6f9197", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "draft", order_type: "regular", related_order_id: null, reason: null, observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "115b2c00-4875-5463-a679-df955d15846f", code: "PED-DEMO-025", location_id: "704dfcd6-b98d-56ce-8661-bfc410332be8", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "submitted", order_type: "regular", related_order_id: "e554f1c3-989e-542f-9b2a-81eb1fbe0cfe", reason: null, observations: "Reenvío del mismo pedido, sin motivo adicional registrado.", requested_at: "2026-10-08T13:00:00Z" },
  { id: "58179a52-540d-5333-bb3f-76a9602ef2d7", code: "PED-DEMO-026", location_id: "e12cbeb4-3490-5f21-921d-16d94fa7d5c5", cycle_month: "2026-10-01", requested_by: "aca13b82-3dc4-538e-8e99-f7760d016163", status: "approved", order_type: "additional", related_order_id: "52b34c13-a8a2-5a0f-9ce4-2a1b88c81d56", reason: "Evento adicional y extensión del turno; supuesto de la demo.", observations: "Pedido mensual ficticio.", requested_at: "2026-10-08T13:00:00Z" },
];

/** Todos los puntos conocidos, por id (para traducir `location_id` → código). */
const PUNTOS_POR_ID: Record<string, PuntoAsignado> = Object.values(PUNTOS_POR_STAFF)
  .flat()
  .reduce<Record<string, PuntoAsignado>>((acc, punto) => {
    acc[punto.id] = punto;
    return acc;
  }, {});

export function puntoPorId(id: string): PuntoAsignado | undefined {
  return PUNTOS_POR_ID[id];
}

export function productoPorId(id: string): Producto | undefined {
  return PRODUCTOS.find((p) => p.id === id);
}
