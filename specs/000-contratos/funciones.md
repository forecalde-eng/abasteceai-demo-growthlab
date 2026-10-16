# Funciones SQL (contrato C3) · DEMO FICTICIA

Dueños: David (implementa en `db/09+`) y Omar (las llama desde FastAPI). Fuente: `docs/06_PLAN_EQUIPO.md §3 C3`, `docs/04_SPEC_MAESTRA.md §5 y §7`, `openapi.yaml` (C1), `estados.md`, `roles.md` y `db/01, 02, 07`.
Si algo no cuadra, gana `db/`. Lo marcado **[Propuesta]** no estaba en C3 y necesita el OK de David antes del merge.

## 1. Reglas comunes

1. **Una función por endpoint, una transacción.** FastAPI valida JWT, rol y punto, y hace `SELECT abastece.fn_x(...)` dentro de una transacción. Si la función lanza un error, no queda nada a medias.
2. **Primer parámetro = `p_staff uuid`**: el `staff_members.id` que FastAPI resolvió con el JWT (I8). La función vuelve a leer el rol de `staff_members` (`active = true`) y revisa rol, punto y estado (doble candado). Nunca recibe un rol desde el cliente.
3. **Devuelve `jsonb`** con la forma exacta del esquema de respuesta de `openapi.yaml`. FastAPI lo responde tal cual (los campos extra que se indican abajo, como `created`, los usa FastAPI y no rompen el esquema).
4. **Bloqueo:** `SELECT … FOR UPDATE` sobre el pedido o envío al inicio (D5). Los triggers ya ponen advisory locks por lote.
5. **Idempotencia por estado:** si la fila ya está en el estado destino → devuelve el estado actual sin escribir nada. Si está en cualquier otro estado que no sea el de origen → `P0409`.
6. **Seguridad:** `SECURITY INVOKER`, `SET search_path = ''` y nombres calificados (`abastece.`, `private.`). Cada archivo termina con `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon, authenticated;` (si no, cualquiera con sesión las llama por `/rpc` y se salta FastAPI).
7. **Auditoría:** toda escritura de estado deja una fila en `audit_events` (`actor_id = p_staff`, `before_state`, `after_state`, `occurred_at` = reloj). Los motivos de devolver, cancelar o corregir van en `after_state.reason`.

### 1.1 Errores

| `ERRCODE` | HTTP | `error.code` | Cuándo |
|---|---|---|---|
| `P0403` | 403 | `FORBIDDEN` | Rol no permitido, punto no asignado, staff inactivo, aprobar el propio pedido |
| `P0404` | 404 | `NOT_FOUND` | El pedido, envío, producto o vehículo no existe |
| `P0409` | 409 | `INVALID_STATE` o `CONFLICT` | Transición no permitida (`INVALID_STATE`) o registro que ya existe (`CONFLICT`) |
| `P0422` | 422 | `VALIDATION` | Datos inválidos |

```sql
RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'El pedido no está en submitted',
  HINT = 'INVALID_STATE', DETAIL = '{"status":"approved"}';
```

- `MESSAGE` → `error.message` (en español, se muestra en pantalla).
- `HINT` → `error.code` solo con `P0409` (`INVALID_STATE` | `CONFLICT`).
- `DETAIL` → `error.details`, un JSON (p. ej. `{"product_id": "…", "field": "requested_qty"}` para señalar el ítem en un 422).
- FastAPI lo lee con `e.diag.message_primary`, `message_hint` y `message_detail` (psycopg).
- Cualquier otro error (un trigger `P0001`, un CHECK `23514`, un UNIQUE `23505`) significa que la función no validó antes: es un **bug**. FastAPI hace rollback, responde 500 y lo registra.

### 1.2 Reloj de demo (I11)

Las vistas solo cuentan movimientos con `occurred_at ≤ demo_metadata.reference_at` (2026-10-10 22:00 UTC). El seed termina a las 21:00. Toda fecha de negocio nueva sale de **una** función auxiliar **[Propuesta]**:

```sql
-- db/09: secuencia + función; 12_reset_demo.sql hace ALTER SEQUENCE abastece.reloj_demo_seq RESTART.
CREATE SEQUENCE abastece.reloj_demo_seq;
CREATE FUNCTION abastece.fn_reloj() RETURNS timestamptz …
  -- reference_at − 1 h + nextval segundos; si pasa de reference_at → P0409 'Reloj de demo agotado: resetear'
```

Por qué no `reference_at` a secas: el trigger `check_stock_balance` ordena por `(occurred_at, id)`. Si el despacho (+ en TRA-DEMO) y la recepción (− en TRA-DEMO) tienen la misma hora, el orden por `id` es al azar y puede marcar un saldo negativo que no existe. Y no se puede usar `reference_at + segundos` (D10 original), porque las vistas lo dejarían fuera.

### 1.3 Códigos nuevos

La UI muestra códigos, nunca UUID. Las funciones generan el siguiente número libre con tres dígitos, siguiendo el seed:

| Tabla | Formato | Ejemplo seed |
|---|---|---|
| `orders.code` | `PED-DEMO-NNN` | PED-DEMO-025 |
| `orders.idempotency_key` | la `Idempotency-Key` del header | demo-request-001 |
| `shipments.code` / `guide_code` | `ENV-DEMO-NNN` / `GUIA-DEMO-NNN` (courier: la guía que manda logística) | ENV-DEMO-008 / GUIA-DEMO-008 |
| `route_plans.code` | `RUTA-DEMO-N` | RUTA-DEMO-2 |
| `incidents.code` | `INC-DEMO-NNN` | INC-EMPAQUE (los del seed tienen nombre) |
| `shipments.qr_token` | `gen_random_uuid()` | — |

### 1.4 Ubicaciones fijas

`BOD-DEMO` (bodega), `TRA-DEMO` (tránsito), `CUA-DEMO` (cuarentena). Se buscan por `locations.code`, no por UUID fijo.

## 2. Funciones

### 2.1 `fn_crear_pedido` · `09_fn_pedidos.sql` · `POST /orders`

```sql
abastece.fn_crear_pedido(p_staff uuid, p_location uuid, p_cycle_month date, p_order_type text,
  p_related_order uuid, p_reason text, p_observations text, p_items jsonb, p_idempotency_key text) RETURNS jsonb
-- p_items: [{"product_id": uuid, "requested_qty": numeric}]
```

| Revisa | Error |
|---|---|
| Rol `auxiliar` o `supervisor` | P0403 |
| `p_location` en `point_assignments` del staff y `kind = 'service_point'` | P0403 |
| `p_idempotency_key` ya existe: mismo autor → devuelve ese pedido (`created: false`); otro autor → error | P0409 `CONFLICT` |
| `p_cycle_month` es el día 1 del mes | P0422 |
| `p_items` no vacío; sin productos repetidos; producto existe y `active`; `requested_qty > 0` | P0422 con el `product_id` en `DETAIL` |
| `additional`: `p_related_order` existe y es del mismo punto, `p_reason` no vacío | P0422 |

Escribe: `orders` (`status = submitted`, `requested_by = p_staff`, `requested_at` = reloj), `order_items`, `audit_events`.
Devuelve `OrderResult` + `created: boolean` (FastAPI: `true` → 201, `false` → 200).

### 2.2 `fn_analizar_reglas` · `09_fn_pedidos.sql` · `POST /orders/{id}/analyze`

```sql
abastece.fn_analizar_reglas(p_staff uuid, p_order uuid) RETURNS jsonb
```

C3 decía `fn_analizar_reglas(order)`. Se agrega `p_staff` porque `incidents.created_by` es `NOT NULL` y porque hay que revisar quién la llama.

| Revisa | Error |
|---|---|
| Pedido existe | P0404 |
| Rol `administrador`, o `auxiliar`/`supervisor` si es el autor (`requested_by = p_staff`) | P0403 |

Reglas (código, no IA):
- **Duplicados** [Supuesto]: otros pedidos del mismo `location_id` y `cycle_month`, con estado distinto de `draft` y `cancelled`, y **el mismo conjunto de `(product_id, requested_qty)`**. PITCH-1: 001 ↔ 025.
- **Omisión de kit:** `replenishment_policies` del punto con `required_in_kit = true` cuyo producto no está en el pedido. PITCH-2: 002 → INS-016.
- **Incidencias:** si hay duplicados, `possible_duplicate` (`high`); si hay omisiones, `missing_from_kit` (`medium`). Solo si **no existe ya una abierta** (`status` distinto de `resolved`) de ese `kind` para ese pedido. No cancelan ni bloquean nada.

Escribe: `incidents` (si hace falta) y **un** `decision_logs` con `provider = 'rules'`, `task = 'analyze_rules'`, `status = 'proposed'`, `input_state` y `response` con lo encontrado.
Devuelve:

```json
{ "order_id": "…", "duplicates": [{"order_id": "…", "order_code": "PED-DEMO-025"}],
  "missing_kit": [{"product_id": "…", "sku": "INS-016"}],
  "incidents": [{"id": "…", "code": "INC-DUPLICADO", "kind": "possible_duplicate"}],
  "rules_decision_log_id": "…" }
```

FastAPI agrega `proposal` (Jev, §2.10) para completar `AnalysisResult`.

### 2.3 `fn_decidir_pedido` · `09_fn_pedidos.sql` · `POST /orders/{id}/decision`

```sql
abastece.fn_decidir_pedido(p_staff uuid, p_order uuid, p_decision text, p_items jsonb, p_reason text) RETURNS jsonb
-- p_decision: 'approve' | 'return' | 'cancel'
-- p_items (solo approve): [{"product_id": uuid, "approved_qty": numeric}]
```

| Revisa | Error |
|---|---|
| Pedido existe | P0404 |
| Rol `administrador` | P0403 |
| `requested_by <> p_staff` (I12, antes de que salte el CHECK) | P0403 |
| `status = 'submitted'` | P0409 `INVALID_STATE` |
| `return` o `cancel` sin `p_reason` | P0422 |
| `approve`: producto que no está en el pedido, `approved_qty < 0`, o alguna `approved_qty ≠ requested_qty` sin `p_reason` | P0422 |

- `approve`: los productos que no vienen en `p_items` quedan con `approved_qty = requested_qty`. Pone `approved_by`, `approved_at` (reloj) y pasa a `approved`. Ciclo en vivo: INS-005 de 3 a 1 con motivo.
- `return` → `draft`. `cancel` → `cancelled` (PED-DEMO-025).
- El motivo va en `audit_events.after_state.reason`. **No** se escribe en `orders.reason`, que es el motivo del pedido adicional.

Devuelve `OrderResult`.

### 2.4 `fn_preparar` · `10_fn_bodega.sql` · `POST /orders/{id}/prepare`

```sql
abastece.fn_preparar(p_staff uuid, p_order uuid, p_items jsonb, p_dry_run boolean) RETURNS jsonb
-- p_items: [{"product_id": uuid, "prepared_qty": numeric}]
```

| Revisa | Error |
|---|---|
| Pedido existe | P0404 |
| Rol `bodega` | P0403 |
| `status = 'approved'` | P0409 `INVALID_STATE` |
| Producto que no está en el pedido, `prepared_qty < 0` o `> approved_qty` | P0422 |
| No hay disponible en BOD-DEMO para cubrir `prepared_qty` | P0422 con `product_id` y `available_qty` en `DETAIL` |

FEFO dentro de la función: lotes de BOD-DEMO desde `v_lot_balances` con `usable = true`, disponible = físico − reservas `active` del lote, ordenados por `expires_on` (NULL al final) y luego `batch_code`. Salta DEMO-002-VENC y DEMO-003-VENC. Los productos que no vienen en `p_items` quedan con `prepared_qty = 0`.

- `p_dry_run = true`: misma validación y mismo cálculo, **no escribe nada**, `status` = estado actual.
- Si no es dry run: `inventory_reservations` (`active`, `location = BOD-DEMO`, `created_at` = reloj) por lote, `order_items.prepared_qty` y `audit_events`. Si todo lo preparado es igual a lo aprobado → `ready`. Si no → `preparing` + incidencia `packing_difference` (`medium`).

Devuelve `PrepareResult` (`lines[].lots[]` con `lot_id`, `batch_code`, `expires_on`, `qty`; `incident_code` o `null`).

### 2.5 `fn_confirmar_ruta` · `11_fn_envios.sql` · `POST /routes/confirm` · **va primero en Fase 2**

```sql
abastece.fn_confirmar_ruta(p_staff uuid, p_vehicle uuid, p_dispatch_date date, p_stops jsonb,
  p_km numeric, p_minutes numeric, p_method text) RETURNS jsonb
-- p_stops: [{"location_id": uuid, "sequence": int, "planned_arrival": timestamptz|null, "order_ids": [uuid]}]
```

| Revisa | Error |
|---|---|
| Rol `logistica` | P0403 |
| Vehículo existe | P0404 |
| `sequence` = 1..n sin huecos; sin `location_id` repetido; cada parada con al menos un pedido | P0422 |
| Cada pedido existe, es del `location_id` de su parada y está en `ready` | P0404 / P0422 / P0409 `INVALID_STATE` |
| El pedido no tiene ya un envío | P0409 `CONFLICT` |

Escribe:
- `route_plans` (`approved`, `matrix_source = 'synthetic'`, `planning_method = p_method`, km, minutos, `approved_by = p_staff`).
- `route_stops`.
- Por pedido, un `shipments` (`mode = 'own'`, `route_id`, `status = 'created'`, código, guía, `qr_token`).
- `shipment_items`: una fila por reserva `active` del pedido (`lot_id`, `shipped_qty = quantity`).
- `audit_events`.

El pedido sigue en `ready` hasta el despacho. Devuelve `RouteConfirmResult`.

### 2.6 `fn_envio_courier` · `11_fn_envios.sql` · `POST /shipments/courier`

```sql
abastece.fn_envio_courier(p_staff uuid, p_order uuid, p_carrier text, p_guide text, p_promised_at timestamptz) RETURNS jsonb
```

| Revisa | Error |
|---|---|
| Rol `logistica` | P0403 |
| Pedido existe | P0404 |
| Pedido en `ready` | P0409 `INVALID_STATE` |
| El pedido ya tiene un envío, o `p_guide` ya existe | P0409 `CONFLICT` |
| `p_carrier` o `p_guide` vacíos; `p_promised_at` anterior al reloj (el CHECK exige prometido ≥ despacho) | P0422 |

Escribe `shipments` (`mode = 'courier'`, `route_id = NULL`, `carrier_name`, `guide_code = p_guide`, `promised_delivery_at`, `created`), `shipment_items` (igual que en 2.5) y `audit_events`. Devuelve `ShipmentResult`.
**Retrasado** no se guarda: se calcula en SQL al leer (`promised_delivery_at < reference_at` y sin `delivered_at`, ver `db/04`).

### 2.7 `fn_despachar` · `11_fn_envios.sql` · `POST /shipments/{id}/dispatch`

```sql
abastece.fn_despachar(p_staff uuid, p_shipment uuid) RETURNS jsonb
```

| Revisa | Error |
|---|---|
| Envío existe | P0404 |
| Rol `bodega` o `logistica` | P0403 |
| `dispatched` → devuelve el estado actual, sin movimientos (doble clic) | — |
| Envío en `created` y pedido en `ready`; otro estado | P0409 `INVALID_STATE` |

En este orden (el trigger `check_stock_balance` rechaza mover stock reservado):
1. Reservas `active` del pedido → `fulfilled`.
2. Por cada `shipment_items`: `stock_movements` `reason = 'dispatch'`, −qty en BOD-DEMO y +qty en TRA-DEMO, mismo `transfer_group` (uno nuevo por ítem), `shipment_item_id`, `recorded_by = p_staff`, `occurred_at` = reloj.
3. Envío → `dispatched` (`dispatched_at` = reloj); pedido → `shipped`; `audit_events`.

Devuelve `ShipmentResult`.

### 2.8 `fn_marcar_entregado` · `11_fn_envios.sql` · `POST /shipments/{id}/delivered`

```sql
abastece.fn_marcar_entregado(p_staff uuid, p_shipment uuid) RETURNS jsonb
```

| Revisa | Error |
|---|---|
| Envío existe | P0404 |
| Rol `supervisor` y punto del envío en sus `point_assignments` | P0403 |
| `delivered_unchecked` → devuelve el estado actual | — |
| Envío en `dispatched`; otro estado | P0409 `INVALID_STATE` |

Envío y pedido → `delivered_unchecked`; `delivered_at` = reloj; `audit_events`. **Ningún** `stock_movements` (I9, PITCH-7). Devuelve `ShipmentResult`.

### 2.9 `fn_recibir` · `11_fn_envios.sql` · `POST /shipments/{id}/receipt`

```sql
abastece.fn_recibir(p_staff uuid, p_shipment uuid, p_items jsonb, p_notes text) RETURNS jsonb
-- p_items: [{"shipment_item_id": uuid, "counted_qty": numeric, "accepted_qty": numeric}]
```

| Revisa | Error |
|---|---|
| Envío existe | P0404 |
| Rol `auxiliar` y punto del envío en sus `point_assignments` (el QR solo no autoriza) | P0403 |
| Ya existe `receipts` del envío (`reconciled` / `with_difference`) | P0409 `CONFLICT` |
| Envío en `dispatched` o `delivered_unchecked`; otro estado | P0409 `INVALID_STATE` |
| Exactamente una línea por cada `shipment_items` del envío; `0 ≤ accepted_qty ≤ counted_qty ≤ shipped_qty` | P0422 con el `shipment_item_id` |

Escribe `receipts` (`checked_by = p_staff`, `checked_at` = reloj, `notes`) y `receipt_items`. Además, por ítem, `stock_movements` `reason = 'receipt'` con `occurred_at` = reloj:
- **Aceptadas:** TRA-DEMO → punto del envío.
- **Dañadas** (contadas − aceptadas): TRA-DEMO → CUA-DEMO.
- **Faltantes** (enviadas − contadas): se quedan en TRA-DEMO. Si hay faltantes, una incidencia `receipt_shortage` (`high`) con `shipment_id`.

Si todo lo aceptado es igual a lo enviado → `reconciled`; si no → `with_difference` (envío y pedido). `delivered_at` = reloj si estaba vacío. `audit_events`.
Devuelve `ShipmentResult`. PITCH-8: 10 enviados / 8 aceptados / 2 faltantes.

### 2.10 `fn_registrar_ia` · `09_fn_pedidos.sql` · **[Propuesta]** · `/analyze` y `/assistant`

C3 no decía quién escribe la fila de la IA en `decision_logs` (I6). La respuesta de Jev llega a FastAPI **después** de `fn_analizar_reglas`, y la del asistente no tiene otra función. Para no meter `INSERT` sueltos en Python:

```sql
abastece.fn_registrar_ia(p_staff uuid, p_order uuid, p_task text, p_provider text, p_model_version text,
  p_input_state jsonb, p_response jsonb, p_proposed_action text, p_status text,
  p_input_tokens integer, p_cost_usd numeric) RETURNS jsonb
```

- `p_provider` ∈ `mock`, `typesafe`, `openai` (este último requiere `08_proveedor_openai.sql`); `rules` → P0422 (lo escribe 2.2).
- `p_status` ∈ `proposed`, `human_review`. `mock` exige tokens y costo en 0 (ya lo exige el CHECK; validar antes → P0422).
- `p_order` es opcional (el asistente no tiene pedido). Con pedido, `location_id` = el del pedido y se aplican las mismas reglas de acceso que en 2.2.
- **No** escribe en `orders`, `stock_movements` ni `shipments` (I2).

Devuelve `{ "decision_log_id": "…", "source": "SIMULADO" | "API_REAL" }`.

## 3. Reset · `12_reset_demo.sql` · `POST /admin/reset-demo`

No es una función: es un archivo que FastAPI corre en una transacción.
1. `TRUNCATE` de las 27 tablas de `abastece` + `ALTER SEQUENCE abastece.reloj_demo_seq RESTART`.
2. `03_datos_ficticios.sql`.
3. Re-vincular `staff_members.auth_user_id` de los 7 emails (mapa en `backend/.env`).

Solo `administrador` (lo revisa FastAPI).

## 4. Pruebas mínimas · `node db/verificar_funciones.mjs`

Cada prueba corre en una transacción revertida, con PGlite y `01 → 02 → 07 → 03 → 08 → 09+`.

| Prueba | Función |
|---|---|
| Crear pedido; misma clave → mismo pedido; punto ajeno → P0403; producto repetido → P0422 | 2.1 |
| PITCH-1 (001 ↔ 025 duplicado); PITCH-2 (002 sin INS-016); repetir no duplica incidencias | 2.2 |
| Aprobar el propio pedido → P0403; desde `approved` → P0409; corregir sin motivo → P0422 | 2.3 |
| FEFO salta el lote vencido de INS-002; `dry_run` no escribe; PITCH-5 (INS-005 disponible 1) | 2.4 |
| Confirmar ruta crea plan, paradas y envío con `shipment_items` | 2.5 |
| Despachar dos veces = un solo set de movimientos; el despacho aparece en `v_inventory` (I5, I11) | 2.7 |
| Marcar entregado no crea movimientos (PITCH-7) | 2.8 |
| PITCH-8 10/8/2; segunda recepción → P0409 `CONFLICT` | 2.9 |
| Ciclo en vivo completo de PED-DEMO-001 (spec §6.2) | todas |

## 5. Preguntas abiertas

| # | Pregunta | Propuesta |
|---|---|---|
| F1 | Un pedido devuelto (`draft`) no tiene endpoint para volver a `submitted` | Fuera del MUST: el autor crea uno nuevo |
| F2 | ¿Se puede re-preparar un pedido en `preparing`? (`estados.md` no lo permite) | No en el MUST; PITCH-4 solo se muestra |
| F3 | ¿Quién mueve `route_plans` a `dispatched` / `finished`? | Nadie en el MUST; el plan queda `approved` |
| F4 | "Unidades" del análisis (spec §3): `order_items` no tiene columna de unidad, todo va en `products.inventory_unit` | No hay nada que validar; se quita de la regla |
| F5 | `POST /purchases` y `/scenarios/run` (COULD) | Sin función hasta que se empiecen |
