# Estados (contrato) · DEMO FICTICIA

Fuente de verdad: los `CHECK` de `db/01_esquema.sql` y `docs/04_SPEC_MAESTRA.md §7`. Si algo no cuadra, gana `db/`.
Una transición que no está en estas tablas → `409 INVALID_STATE`.
El color de cada estado en pantalla está en `docs/07_GUIA_DISENO.md §3.1`.

## Pedido · `orders.status`

```
draft → submitted → approved → preparing → ready → shipped → delivered_unchecked → reconciled
  ▲         │           └──────────→ ready             │                └──────────→ with_difference
  └─devolver┤                                          └─────────────────────────→ reconciled | with_difference
            └→ cancelled
```

| Desde | Hacia | Quién | Endpoint → función |
|---|---|---|---|
| (nuevo) | `submitted` | auxiliar, supervisor (punto asignado) | `POST /orders` → `fn_crear_pedido` |
| `submitted` | `approved` · `draft` (devolver) · `cancelled` | administrador, nunca el autor | `POST /orders/{id}/decision` → `fn_decidir_pedido` |
| `approved` | `ready` (todo preparado) · `preparing` (diferencia + incidencia `packing_difference`) | bodega | `POST /orders/{id}/prepare` → `fn_preparar` |
| `ready` | `shipped` | bodega, logística | `POST /shipments/{id}/dispatch` → `fn_despachar` |
| `shipped` | `delivered_unchecked` | supervisor asignado | `POST /shipments/{id}/delivered` → `fn_marcar_entregado` |
| `shipped` / `delivered_unchecked` | `reconciled` (todo aceptado) · `with_difference` | auxiliar asignado | `POST /shipments/{id}/receipt` → `fn_recibir` |

Reglas de la base que no cambian:
- `additional` exige `related_order_id` y `reason` no vacío.
- Desde `approved` en adelante hay `approved_by` y `approved_at`, y `approved_by ≠ requested_by`.
- `delivered_unchecked` **no** suma stock al punto. Solo la recepción mueve stock de tránsito al punto.

## Envío · `shipments.status`

`created → dispatched → delivered_unchecked → reconciled | with_difference` (desde `dispatched` también se puede recibir directo).

| Hacia | Endpoint |
|---|---|
| `created` | `POST /routes/confirm` (`mode=own`) o `POST /shipments/courier` (`mode=courier`) |
| `dispatched` | `POST /shipments/{id}/dispatch` |
| `delivered_unchecked` | `POST /shipments/{id}/delivered` |
| `reconciled` / `with_difference` | `POST /shipments/{id}/receipt` |

Despacho, entrega y recepción son idempotentes por estado: repetir devuelve el estado actual o `409`.
**Retrasado** no es un estado: se calcula en SQL (`promised_delivery_at < demo_metadata.reference_at` y sin entregar).

## Plan de ruta · `route_plans.status`

`draft → approved → dispatched → finished`. `POST /routes/confirm` lo crea ya en `approved`. `POST /routes/plan` no crea nada.

## Otros estados (solo lectura en la app)

| Tabla · columna | Valores |
|---|---|
| `inventory_reservations.status` | `active` (reduce el disponible) · `released` · `fulfilled` (al despachar) |
| `purchase_orders.status` | `draft` · `ordered` · `partially_received` · `received` · `cancelled`. Ninguno crea stock por sí solo |
| `incidents.kind` | `possible_duplicate` · `missing_from_kit` · `packing_difference` · `receipt_shortage` · `delay` · `excess_stock` · `expiry` |
| `incidents.severity` | `low` · `medium` · `high` |
| `incidents.status` | `open` · `under_review` · `resolved` |
| `decision_logs.provider` | `mock` → **SIMULADO** · `typesafe`, `openai` (migración del proveedor OpenAI, D-0.1) → **API_REAL** · `rules` → **REGLAS** (no es IA) |
| `decision_logs.status` | `proposed` · `human_review` · `accepted` · `rejected` |
| `v_replenishment.coverage_status` | `critical` · `attention` · `covered` · `excess` (lo calcula la vista; la app no lo recalcula) |
