# C3 · Contratos SQL de pedidos (D-0.6) — borrador para Jorge y Omar

Estado: **acuerdos de C3 cerrados** para las tres funciones de pedidos. Las
convenciones de `fn_crear_pedido` registran decisiones de los PR #93 y #114; los
pendientes 3–8 y 10 los decidió Omar en el PR #113 y David confirmó su
incorporación a este documento. Este documento no crea funciones. El cambio de
`openapi.yaml` del PR #93 declara el 404 ya acordado para `POST /orders`. Los
acuerdos **11** y **12** (sobre interno de `p_proposal` y caso no `submitted` sin
log de IA) los proponen Jorge y David para cerrar D-1.2 (#29); este PR los
incorpora **con la revisión de Omar registrada como pendiente**.
Fuentes: `openapi.yaml` (`POST /orders`,
`/orders/{id}/analyze`, `/orders/{id}/decision` y sus schemas),
`docs/06_PLAN_EQUIPO.md §3 C3`,
`docs/04_SPEC_MAESTRA.md §5 F1 y §8`, `db/01_esquema.sql`,
`db/02_reglas_y_accesos.sql`, `db/07_integridad_preseed.sql` y
`db/04_consultas_demo.sql`. El *Registro de acuerdos* del final recoge las
decisiones ya cerradas; **no se deben implementar como supuestos silenciosos**
distintos.

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
  502 `UPSTREAM_AI` pertenecen a FastAPI, no a estas funciones. El formato de
  `Error.error.details` para señalar un ítem es
  `{field, index?, product_id?, message?}` (acuerdo 10).
- No se agregan campos de respuesta HTTP a los schemas congelados. Los nombres
  `p_*` son parámetros internos SQL, no claves nuevas de la API.

## 1. `fn_crear_pedido`

**Firma SQL acordada** (coincide en orden y tipos conceptuales con C3):

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
FastAPI señala el ítem inválido en `Error.error.details` con
`{field, index?, product_id?, message?}` (acuerdo 10), conforme a OpenAPI. Si
otro actor reutiliza una `Idempotency-Key`, `P0404` se traduce a HTTP 404 con
`NotFound` porque el pedido no es visible. `POST /orders` no anuncia 409.

**Transacción:** comprobar autorización e idempotencia, insertar pedido e ítems
en una misma llamada. Cualquier error revierte la inserción completa. La clave
única de `orders.idempotency_key` protege también llamadas concurrentes.

## 2. `fn_analizar_reglas`

**Firma SQL acordada** (acuerdos 3 y 4; sustituye a `fn_analizar_reglas(order)`
de C3, cuya fila se actualiza en `docs/06_PLAN_EQUIPO.md`):

```sql
abastece.fn_analizar_reglas(
  p_staff uuid, p_order uuid, p_proposal jsonb
) RETURNS jsonb
```

Con la conexión privilegiada del backend, `p_order` solo no identifica al actor
y no permite aplicar la regla de autoría de OpenAPI dentro de la función; por
eso se añade `p_staff`. No se aceptará un `staff` enviado por el cliente.

**Entrada:** `p_order` UUID obligatorio, tomado de `{id}`; `p_staff` UUID
obligatorio e interno, resuelto del JWT; `p_proposal` JSONB con la propuesta de
IA ya obtenida por FastAPI dentro del endpoint (presente cuando el pedido está en
`submitted`). El endpoint no tiene cuerpo: `p_proposal` no es una clave de la
API, sino el parámetro interno con el que el backend entrega a SQL el log de IA
(`mock`/`typesafe`/`openai`), **nunca** el log de `rules`. La llamada externa a
Jev ocurre fuera de la transacción y **fuera de la función**: el backend
comprueba el estado del pedido **antes** de invocar a Jev, de modo que si el
pedido no está en `submitted` **no se llama a Jev** y la función recibe
`p_proposal = NULL`. En esa rama la función **ignora** `p_proposal` (en
PostgreSQL un parámetro `jsonb` admite nulo); si el estado cambiara entre la
comprobación de FastAPI y la llamada a la función, esta vuelve a decidir bajo
bloqueo y también ignora la propuesta (acuerdo 12).

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
  impide mezclar pedido y punto. «Abierta» = `open` o `under_review`; la
  deduplicación es por `(order_id, kind)`; `code` es `INC-NNN` siguiente al
  máximo, conforme a `db/08` (acuerdo 5).

**Salida JSONB acordada:** el `AnalysisResult` completo (acuerdo 4). La función
devuelve `order_id`, los tres arreglos `duplicates`, `missing_kit` e
`incidents` (vacíos si no hay nada) y `proposal` con `source`, `model`,
`status`, `answers` y `decision_log_id`, a partir del log de IA recibido en
`p_proposal`. El backend presenta este objeto como respuesta de
`POST /orders/{id}/analyze`; ya no compone la `proposal` fuera de SQL. La
`proposal` puede ser `null` cuando el pedido no está en `submitted` y no existe
un log de IA reutilizable (acuerdo 12).

**Persistencia y transacción:** las incidencias nuevas, el registro
`decision_logs` de proveedor `rules` (no IA) y el log de IA
(`mock`/`typesafe`/`openai`) tomado de `p_proposal` (con su `decision_log_id`) se
escriben junto al análisis
en la misma transacción, sin duplicarse indebidamente. Si Jev falla, el backend
pasa un `p_proposal` de fallo; la función **no lanza error**: guarda
`provider='typesafe'`, `status='human_review'`, `response {"error":"timeout"}`,
las reglas y las incidencias, y devuelve el resultado. Qué HTTP se responde lo
decide FastAPI, no el SQL: `openapi.yaml` (congelado) declara 502
`UPSTREAM_AI` para `/analyze` con la propuesta ya guardada en `human_review`.
La función de reglas no transforma alertas en decisiones humanas.

**Errores:** `P0403` → 403, `P0404` → 404; 502 lo emite FastAPI ante el
proveedor externo. OpenAPI no anuncia 409 ni 422 para este endpoint. Analizar
un pedido que no está en `submitted` no es un error (acuerdo 6): devuelve 200
con los tres arreglos vacíos, sin llamar a Jev. En ese caso la `proposal`
reutiliza el log de IA más reciente del pedido; si nunca hubo un log de IA,
`proposal` es `null` (acuerdo 12).

## 3. `fn_decidir_pedido`

**Firma SQL acordada** (C3):

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
| `p_items` | Opcional; solo para `approve`, arreglo JSONB (`items`) | Cada objeto exige `product_id` UUID y `approved_qty` numérico `>= 0`, representable en `numeric(12,3)`; pertenece al pedido y no se repite. Sin la lista se aprueba `requested_qty`; con lista parcial, las líneas ausentes se aprueban por `requested_qty`; `approved_qty > requested_qty` → `P0422` (acuerdo 7). |

Forma del JSONB `p_items` si está presente:
`Array<{ product_id: uuid; approved_qty: numeric(12,3) >= 0 }>`.

Perfil activo con rol `administrador`; `orders.requested_by <> p_staff`.
Se bloquea la fila del pedido con `FOR UPDATE` y se exige estado
`submitted`. `approve` escribe `approved_qty` conforme a la lista acordada,
`approved_by=p_staff`, `approved_at=reference_at` y estado `approved`;
`return` pasa a `draft`; `cancel` pasa a `cancelled`. Se escribe un
`audit_events` con `actor_id=p_staff`, `location_id` del pedido,
`entity_type`/`entity_id`, estado anterior y posterior, acción y
`occurred_at=reference_at`. El estado resultante se conserva en `after_state`
como `{status, decision, reason, items}`, donde `status` es el estado final del
pedido (`approved` | `draft` | `cancelled`), `reason` el motivo e `items` las
cantidades aprobadas. En `return` y `cancel`, `items` es `[]` porque no se
aprueban cantidades (acuerdo 8); **no** se sobrescribe `orders.reason`, que
pertenece a la justificación de un pedido adicional, ni se toca
`decision_logs.status`. La propuesta IA nunca ejecuta la decisión.

**Salida JSONB:** exactamente `OrderResult`: `id` UUID, `code` texto y
`status="approved" | "draft" | "cancelled"`, según `p_decision`. FastAPI
responde 200 con ese objeto.

**Errores:** `P0403` → 403 si el rol no es administrador o intenta decidir
su propio pedido; `P0404` → 404 si el pedido no existe/no es visible;
`P0409` → 409 `INVALID_STATE` si no está en `submitted`;
`P0422` → 422 por decisión, motivo, lista, producto o cantidad inválidos.
El 401 por JWT inválido lo devuelve FastAPI. El detalle de qué ítem falló usa
`Error.error.details` con `{field, index?, product_id?, message?}` (acuerdo 10).

**Transacción:** autorización, bloqueo, validaciones, actualización de
`order_items`/`orders` y `audit_events` en una sola llamada. Cualquier error
revierte todas las escrituras; dos decisiones concurrentes no pueden aprobar
el mismo pedido dos veces.

## Registro de acuerdos de C3

1. **Código nuevo de pedido — acordado para la demo.** `PED-DEMO-NNN` siguiente
   al máximo, protegido por un advisory lock transaccional global. La
   serialización global se acepta por el volumen de la demostración.
2. **Idempotencia y código HTTP — acordado.** Mismo actor y misma clave,
   incluso con otro cuerpo: devuelve el pedido original e ignora el cuerpo
   nuevo. Otro actor: `P0404` → 404, sin revelar el pedido. El booleano interno
   `created` distingue HTTP 201 de 200 y FastAPI lo retira de `OrderResult`.
3. **Identidad en análisis — acordado.** `fn_analizar_reglas` recibe `p_staff`
   además de `p_order`: con la conexión privilegiada del backend, `p_order`
   solo no identifica al actor. Se actualiza la fila de C3 en
   `docs/06_PLAN_EQUIPO.md`.
4. **Jev, `proposal` y atomicidad — acordado.** FastAPI llama a Jev fuera de la
   transacción y entrega el log de IA en `p_proposal`
   (`mock`/`typesafe`/`openai`, **nunca** el de `rules`). Si el pedido no está en
   `submitted`, FastAPI **no llama a Jev** y pasa `p_proposal` nulo. La función
   escribe en la misma transacción las incidencias, el log `rules` y la propuesta
   de IA, y devuelve el
   `AnalysisResult` completo con su `decision_log_id`. Si Jev falla, `p_proposal`
   llega como fallo y la función guarda `provider='typesafe'`,
   `status='human_review'` y `response {"error":"timeout"}`, devuelve el
   resultado sin lanzar error; el 502 lo emite FastAPI (OpenAPI congelado).
5. **Incidencias repetidas — acordado.** «Abierta» = `open` o `under_review`;
   se deduplica por `(order_id, kind)`; `code` es `INC-NNN` siguiente al máximo,
   conforme a `db/08`.
6. **Estado en análisis — acordado.** Un pedido que no está en `submitted` se
   analiza igual: 200 con los arreglos vacíos, sin llamar a Jev y sin 409.
7. **Cantidades al aprobar — acordado.** Sin `items`, aprobado =
   `requested_qty`; con lista parcial, las líneas ausentes quedan en
   `requested_qty`; `approved_qty > requested_qty` → `P0422`.
8. **Motivo y auditoría — acordado.** El estado resultante se audita en
   `audit_events.after_state` como `{status, decision, reason, items}`, con
   `status` = estado final del pedido; **no** se toca `orders.reason` ni
   `decision_logs.status`.
9. **Pedido relacionado — acordado.** `additional` exige un pedido existente
   del mismo punto y ciclo y un motivo no vacío. `regular` con enlace o motivo
   relleno → `P0422`.
10. **Detalles de validación — acordado.** `P0422` se traduce a
    `Error.error.details` como `{field, index?, product_id?, message?}`, sin
    cambiar OpenAPI.
11. **Sobre interno de `p_proposal` — propuesto en este PR para D-1.2 (#29);
    revisión de Omar pendiente.** FastAPI entrega en `p_proposal` el log de IA
    con la **forma de las columnas** de `decision_logs`; SQL valida los datos,
    **genera él mismo el `id`** (nunca lo recibe) y persiste la fila junto al
    análisis en la misma transacción. Claves del sobre y reglas:

    | Clave | Tipo | Regla |
    |---|---|---|
    | `provider` | texto | `mock` \| `typesafe` \| `openai`; **nunca** `rules`. |
    | `model_version` | texto | No vacío; si falta, SQL usa `response.model`. |
    | `input_state` | objeto | Estado **real** enviado a Jev (no `{}`); trazabilidad. |
    | `response` | objeto | Éxito: `{model, answers, usage}`. Fallo: `{error: "timeout"}`. |
    | `proposed_action` | texto | Token no vacío; en el fallo, `human_review`. |
    | `status` | texto | `proposed` \| `human_review`; nunca `accepted`/`rejected`. |
    | `input_tokens` | entero | `>= 0`; con `provider='mock'`, exactamente `0`. |
    | `estimated_cost_usd` | numeric | `>= 0` y finito; con `mock`, exactamente `0`. |

    SQL deriva además `id` (`gen_random_uuid()`, el `decision_log_id` público),
    `order_id=p_order`, `location_id` del pedido, `created_at=reference_at`,
    `task` (`classify_notes` para el log de IA; `detect_rules` para el log
    `rules`) y el `source` público (`mock` → `SIMULADO`; `typesafe`/`openai` →
    `API_REAL`; `rules` **no** es una `proposal` válida). La validación debe
    **ramificar por `response ? 'error'`**, no por `status`: con `error` no se
    exigen `answers`; sin `error` se exigen `response.model` y
    `response.answers`. El log de proveedor `rules` es una fila **separada**
    (`task='detect_rules'`, `model_version` p. ej. `rules-v1`, `input_tokens` y
    `estimated_cost_usd` `0`, `response` = hallazgos de las reglas) y **nunca**
    es la `proposal` pública.
12. **Pedido no `submitted` — propuesto en este PR para D-1.2 (#29); revisión de
    Omar pendiente.** Analizar un pedido que no está en `submitted` no es un
    error (acuerdo 6): 200, los tres arreglos vacíos, sin llamar a Jev y sin
    escribir. **FastAPI comprueba el estado antes de invocar a Jev**: si no está
    en `submitted`, no llama a Jev y pasa `p_proposal = NULL`. La `proposal`
    pública se resuelve así: si el pedido tiene algún log
    de IA (`mock`/`typesafe`/`openai`), se **reutiliza el más reciente** como
    `{source, model, status, answers, decision_log_id}` (sin crear otra fila); si
    **nunca** hubo log de IA, `proposal` es `null`. Este último caso exige que
    `AnalysisResult.proposal` admita nulo en `openapi.yaml` (cambio incluido en
    este PR); `p_proposal` se ignora y puede llegar `NULL` sin cambiar la firma.

Los acuerdos 1–2 y 9 documentan los PR #93 y #114; los acuerdos 3–8 y 10
quedaron decididos por Omar en el PR #113 y confirmados por David para este
documento. Los acuerdos **11** y **12** los proponen Jorge y David en un PR
aparte para desbloquear D-1.2 (#29); **la revisión de Omar queda registrada como
pendiente** y no modifican las firmas ni la semántica ya acordada. Con esto, los
contratos de `fn_analizar_reglas` y `fn_decidir_pedido` quedan cerrados y son la
base de D-1.2 (#29) y D-1.3 (#30). `09_fn_pedidos.sql` (D-1.1) ya está en
`main`; las funciones de análisis y decisión se añaden por separado.
