# C3 · Contratos SQL de pedidos (D-0.6) — borrador para Jorge y Omar

Estado: **propuesta, no congelada** para las funciones pendientes. Las
convenciones de `fn_crear_pedido` registran decisiones ya acordadas por Jorge y
Omar en el PR #93; Omar confirmará la redacción al regresar. Este documento no
crea funciones. El cambio de `openapi.yaml` en este PR solo declara el 404 ya
acordado para `POST /orders`. Fuentes: `openapi.yaml` (`POST /orders`,
`/orders/{id}/analyze`, `/orders/{id}/decision` y sus schemas),
`docs/06_PLAN_EQUIPO.md §3 C3`,
`docs/04_SPEC_MAESTRA.md §5 F1 y §8`, `db/01_esquema.sql`,
`db/02_reglas_y_accesos.sql`, `db/07_integridad_preseed.sql` y
`db/04_consultas_demo.sql`. Las decisiones que esas fuentes no cierran se
enumeran al final; **no se deben implementar como supuestos silenciosos**.

## Convenciones de las tres funciones

- FastAPI valida el JWT de Supabase y resuelve `staff_members.id` desde
  `auth_user_id`. El cliente nunca envía `staff`, rol ni asignaciones. La función
  comprueba nuevamente que el perfil está activo y autorizado. Las llamadas son
  exclusivas del backend: `SECURITY INVOKER`, `SET search_path = ''`, referencias
  calificadas, y `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` al crear
  cada función. El rol SQL del backend debe conservar permiso de ejecución.
- Cada invocación se ejecuta en **una transacción PostgreSQL**. La función bloquea
  con `SELECT ... FOR UPDATE` las filas que vaya a cambiar; una excepción revierte
  pedido, ítems, incidencias, registros de decisiones y auditoría de esa llamada.
  Una llamada externa a Jev no forma parte de una transacción PostgreSQL.
- Las fechas de negocio (`requested_at`, `approved_at`, `created_at`,
  `occurred_at`) salen de `abastece.demo_metadata.reference_at`, no de `now()`.
  Las cantidades usan `numeric(12,3)` y no se calculan con IA.
- Salida exitosa: `jsonb`. Las excepciones SQL usan `P0403` → HTTP 403
  `FORBIDDEN`, `P0404` → 404 `NOT_FOUND`, `P0409` → 409 `INVALID_STATE` o
  `CONFLICT`, y `P0422` → 422 `VALIDATION`. FastAPI convierte la excepción al
  schema `Error` de OpenAPI. El 401 `UNAUTHORIZED` por JWT ausente/inválido y el
  502 `UPSTREAM_AI` pertenecen a FastAPI, no a estas funciones. El formato
  concreto de `Error.error.details` para señalar un ítem queda pendiente.
- No se agregan campos de respuesta HTTP a los schemas congelados. Los nombres
  `p_*` son parámetros internos SQL, no claves nuevas de la API.

## 1. `fn_crear_pedido`

**Firma SQL propuesta** (coincide en orden y tipos conceptuales con C3):

```sql
abastece.fn_crear_pedido(
  p_staff uuid, p_location uuid, p_cycle_month date, p_order_type text,
  p_related_order uuid, p_reason text, p_observations text,
  p_items jsonb, p_idempotency_key text
) RETURNS jsonb
```

**Entrada.** `p_staff` es el perfil activo resuelto por FastAPI (obligatorio,
interno); `p_idempotency_key` es el encabezado obligatorio `Idempotency-Key`,
texto no vacío, guardado en `orders.idempotency_key`. Los demás parámetros
corresponden uno a uno a `CreateOrderRequest`:

| Parámetro | Requisito y tipo | Validación |
|---|---|---|
| `p_location` | Obligatorio, UUID (`location_id`) | Existe y está asignado a `p_staff`; punto ajeno → `P0403`. |
| `p_cycle_month` | Obligatorio, `date` (`cycle_month`) | Primer día del mes. |
| `p_order_type` | Obligatorio, texto (`order_type`) | `regular` o `additional`. |
| `p_related_order` | Opcional para `regular`; obligatorio para `additional`, UUID (`related_order_id`) | Pedido relacionado existente del mismo punto y ciclo en `additional`; `regular` no admite enlace. |
| `p_reason` | Opcional para `regular`; obligatorio para `additional`, texto (`reason`) | En `additional`, no nulo ni vacío tras `btrim`, conforme a `07_integridad_preseed.sql`. |
| `p_observations` | Opcional, texto (`observations`) | Si falta, `""` como en OpenAPI. |
| `p_items` | Obligatorio, arreglo JSONB no vacío (`items`) | Cada objeto exige `product_id` UUID y `requested_qty` numérico `> 0`, representable en `numeric(12,3)`; sin productos repetidos; el producto existe y está activo. |

Forma del JSONB `p_items`:
`Array<{ product_id: uuid; requested_qty: numeric(12,3) > 0 }>`.

La función revisa `role IN ('auxiliar','supervisor')` y la fila de
`point_assignments`; crea `orders` en `submitted` y sus `order_items`, con
`requested_by=p_staff` y `requested_at=reference_at`. No crea aprobación ni
movimientos de inventario. La clave de idempotencia es única: al repetirla,
devuelve el pedido ya existente **sin insertar otro pedido ni ítems**. Si el
mismo actor reutiliza la clave con otro cuerpo, se ignora ese cuerpo y se
devuelve el pedido original. Una clave de otro actor no revela el pedido.
`orders.code` usa `PED-DEMO-NNN`, siguiente al máximo, bajo un
`pg_advisory_xact_lock` global: serializar todas las altas es aceptable para
esta demostración; con más volumen se revisaría el mecanismo.

**Salida JSONB interna:** `id` UUID, `code` texto, `status="submitted"` para
uno nuevo o el estado actual del pedido existente, y `created` booleano.
FastAPI responde 201 si `created=true` y 200 si `created=false`, retirando
`created` antes de responder el `OrderResult` público (`id`, `code`, `status`).

**Errores:** `P0403` para perfil/rol no permitido o punto no asignado;
`P0422` para mes, tipo, adicional sin motivo/enlace, enlace inexistente,
ítems vacíos/repetidos, producto inexistente/inactivo o cantidad inválida.
FastAPI señala el ítem inválido en `Error.error.details`, conforme a OpenAPI;
el formato exacto de ese detalle se acuerda con Omar. Si otro actor reutiliza
una `Idempotency-Key`, `P0404` se traduce a HTTP 404 con `NotFound` porque el
pedido no es visible. `POST /orders` no anuncia 409.

**Transacción:** comprobar autorización e idempotencia, insertar pedido e ítems
en una misma llamada. Cualquier error revierte la inserción completa. La clave
única de `orders.idempotency_key` protege también llamadas concurrentes.

## 2. `fn_analizar_reglas`

**Firma SQL propuesta para poder comprobar permisos dentro de SQL:**

```sql
abastece.fn_analizar_reglas(p_staff uuid, p_order uuid) RETURNS jsonb
```

C3 escribe `fn_analizar_reglas(order)`; añadir `p_staff` es una **modificación
propuesta pendiente de acuerdo** (3). Con la conexión privilegiada del backend,
`p_order` solo no identifica al actor y no permite aplicar la regla de autoría
de OpenAPI dentro de la función. No se aceptará un `staff` enviado por el cliente.

**Entrada:** `p_order` UUID obligatorio, tomado de `{id}`; `p_staff` UUID
obligatorio e interno, resuelto del JWT. **No hay parámetro JSONB** en esta
versión: el endpoint no tiene cuerpo. El resultado de Jev se obtiene fuera de
esta función; la integración transaccional sigue pendiente (4).

**Validaciones y permisos:** perfil activo con rol `administrador`, `auxiliar`
o `supervisor`; para los dos últimos, `orders.requested_by=p_staff`. Pedido
inexistente/no visible → `P0404`; rol o autoría inválidos → `P0403`. La función
bloquea el pedido y lee sus ítems. Reutiliza las reglas de
`db/04_consultas_demo.sql`:

- `duplicates`: otros pedidos regulares no cancelados del mismo punto y
  `cycle_month`, con la misma composición de `product_id` **y cantidades
  solicitadas**; cada elemento es `{order_id: UUID, order_code: texto}`.
- `missing_kit`: para pedido regular `submitted`, productos de
  `replenishment_policies` del punto con `required_in_kit=true` ausentes de
  `order_items`; cada elemento es `{product_id: UUID, sku: texto}`.
- `incidents`: incidencias abiertas de este análisis, sin duplicarlas al
  repetir la llamada; cada elemento es `{id: UUID, code: texto,
  kind: "possible_duplicate" | "missing_from_kit"}`. Toda nueva incidencia
  lleva `location_id=orders.location_id`, `order_id=p_order`,
  `created_by=p_staff` y `created_at=reference_at`; el FK compuesto de `07`
  impide mezclar pedido y punto. El criterio exacto de «abierta» y la
  granularidad de deduplicación quedan pendientes (5).

**Salida JSONB propuesta para la parte SQL:** objeto con `order_id` UUID y
los tres arreglos `duplicates`, `missing_kit`, `incidents` anteriores, incluso
si están vacíos. Este objeto es el fragmento de reglas de `AnalysisResult`,
**no** una respuesta HTTP completa: `AnalysisResult` también exige `proposal`
con `source`, `model`, `status`, `answers` y `decision_log_id`. FastAPI no debe
presentar este fragmento como si cumpliera por sí solo el schema de OpenAPI.

**Persistencia y transacción:** las incidencias nuevas y el registro
`decision_logs` de proveedor `rules` (no IA) deben quedar junto al análisis de
reglas en la misma transacción, sin duplicarse indebidamente. La propuesta de
Jev `mock`/`typesafe` y su `decision_log_id` también deben persistirse según
HU-1.2, pero C3 no define cómo pasarla a esta única llamada SQL. La forma de
lograr la respuesta completa y el rollback coherente se decide en el pendiente
4. Si Jev falla, OpenAPI anuncia 502 `UPSTREAM_AI` y estado
`human_review`; la secuencia exacta de persistencia también forma parte de ese
acuerdo. La función de reglas no transforma alertas en decisiones humanas.

**Errores:** `P0403` → 403, `P0404` → 404; 502 lo emite FastAPI ante el
proveedor externo. OpenAPI no anuncia 409 ni 422 para este endpoint. El
comportamiento al analizar un pedido en otro estado queda pendiente (6).

## 3. `fn_decidir_pedido`

**Firma SQL propuesta** (C3):

```sql
abastece.fn_decidir_pedido(
  p_staff uuid, p_order uuid, p_decision text, p_items jsonb, p_reason text
) RETURNS jsonb
```

**Entrada:** `p_staff` UUID obligatorio e interno, resuelto del JWT;
`p_order` UUID obligatorio de `{id}`. Los otros parámetros corresponden a
`DecisionRequest`:

| Parámetro | Requisito y tipo | Validación |
|---|---|---|
| `p_decision` | Obligatorio, texto (`decision`) | `approve`, `return` o `cancel`. |
| `p_reason` | Condicional, texto (`reason`) | Obligatorio y no vacío tras `btrim` para `return`, `cancel` y `approve` con alguna cantidad corregida. |
| `p_items` | Opcional; solo para `approve`, arreglo JSONB (`items`) | Cada objeto exige `product_id` UUID y `approved_qty` numérico `>= 0`, representable en `numeric(12,3)`; pertenece al pedido y no se repite. El significado de omitir la lista o alguna línea queda pendiente (7). |

Forma del JSONB `p_items` si está presente:
`Array<{ product_id: uuid; approved_qty: numeric(12,3) >= 0 }>`.

Perfil activo con rol `administrador`; `orders.requested_by <> p_staff`.
Se bloquea la fila del pedido con `FOR UPDATE` y se exige estado
`submitted`. `approve` escribe `approved_qty` conforme a la lista acordada,
`approved_by=p_staff`, `approved_at=reference_at` y estado `approved`;
`return` pasa a `draft`; `cancel` pasa a `cancelled`. Se escribe un
`audit_events` con `actor_id=p_staff`, `location_id` del pedido,
`entity_type`/`entity_id`, estado anterior y posterior, acción y
`occurred_at=reference_at`. El motivo de la decisión debe quedar auditable;
**no debe sobrescribir** `orders.reason`, que pertenece a la justificación de
un pedido adicional. La estructura interna exacta del evento queda pendiente
(8). La propuesta IA nunca ejecuta la decisión.

**Salida JSONB:** exactamente `OrderResult`: `id` UUID, `code` texto y
`status="approved" | "draft" | "cancelled"`, según `p_decision`. FastAPI
responde 200 con ese objeto.

**Errores:** `P0403` → 403 si el rol no es administrador o intenta decidir
su propio pedido; `P0404` → 404 si el pedido no existe/no es visible;
`P0409` → 409 `INVALID_STATE` si no está en `submitted`;
`P0422` → 422 por decisión, motivo, lista, producto o cantidad inválidos.
El 401 por JWT inválido lo devuelve FastAPI. El detalle de qué ítem falló
debe conservar el schema `Error`, con formato interno aún por acordar.

**Transacción:** autorización, bloqueo, validaciones, actualización de
`order_items`/`orders` y `audit_events` en una sola llamada. Cualquier error
revierte todas las escrituras; dos decisiones concurrentes no pueden aprobar
el mismo pedido dos veces.

## Registro de acuerdos y pendientes de C3

1. **Código nuevo de pedido — acordado para la demo.** `PED-DEMO-NNN` siguiente
   al máximo, protegido por un advisory lock transaccional global. La
   serialización global se acepta por el volumen de la demostración.
2. **Idempotencia y código HTTP — acordado.** Mismo actor y misma clave,
   incluso con otro cuerpo: devuelve el pedido original e ignora el cuerpo
   nuevo. Otro actor: `P0404` → 404, sin revelar el pedido. El booleano interno
   `created` distingue HTTP 201 de 200 y FastAPI lo retira de `OrderResult`.
3. **Identidad en análisis.** Confirmar `p_staff` en
   `fn_analizar_reglas`; C3 enumera solo `order`, pero sus permisos no pueden
   verificarse de forma segura con ese dato bajo la conexión privilegiada.
4. **Jev, `proposal` y atomicidad.** Definir qué datos internos entrega Omar a
   SQL, cuándo llama a Jev, cómo se guardan los logs `rules` y
   `mock`/`typesafe`, cómo se obtiene `decision_log_id`, y cómo se compone el
   `AnalysisResult` completo en **una** llamada SQL de escritura. Definir
   también la persistencia de `human_review` cuando el proveedor falla y el
   endpoint responde 502, sin fingir que una transacción SQL cubre la red.
5. **Incidencias repetidas.** Acordar si «abierta» incluye `under_review`,
   si se deduplica por `(order_id, kind)` o por cada evidencia/producto, y
   cómo generar `code`, `severity` y `description` de una incidencia nueva.
   El schema solo fija el arreglo devuelto y la ausencia de duplicados al repetir.
6. **Estado en análisis.** OpenAPI no especifica si un pedido distinto de
   `submitted` se analiza, se devuelve con arreglos vacíos o se rechaza; 409
   no aparece entre las respuestas de ese endpoint.
7. **Cantidades al aprobar.** `DecisionRequest.items` es opcional y no exige
   cubrir todas las líneas. Acordar si ausencia implica `requested_qty`, si
   una lista parcial deja las demás en su cantidad solicitada y si una
   `approved_qty` puede superar la solicitada (OpenAPI solo fija el mínimo 0).
8. **Motivo y auditoría.** Definir el JSON interno de `audit_events` para
   conservar el motivo de decisión sin pisar `orders.reason`, y si aceptar o
   rechazar una propuesta actualiza también su `decision_logs.status`.
9. **Pedido relacionado — acordado.** `additional` exige un pedido existente
   del mismo punto y ciclo y un motivo no vacío. `regular` con enlace o motivo
   relleno → `P0422`.
10. **Detalles de validación.** Acordar cómo traducir `P0422` a
    `Error.error.details` para señalar campo, índice de ítem y producto sin
    cambiar OpenAPI.

Las decisiones de `fn_crear_pedido` anteriores documentan acuerdos de los PR
#93 y #114; Omar confirmará la redacción al regresar. Los contratos de análisis
y decisión siguen en revisión. `09_fn_pedidos.sql` se revisa por separado en
el PR #114.
