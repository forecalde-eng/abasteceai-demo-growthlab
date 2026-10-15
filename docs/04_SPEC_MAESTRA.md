# AbasteceAI — Especificación maestra (SPEC)

> Versión 0.3 · 14-oct-2026 · Estado: **BORRADOR para revisión del equipo** · Alcance MoSCoW confirmado por Omar (líder)
> Fuentes: `01_CONTEXTO_PROYECTO.md`, `02_PLAN_EQUIPO_SDD.md`, `03_ARRANQUE_CLAUDE_CODE.md` y el paquete `db/` (DEMO-1.1), verificado: **61/61 pruebas OK**.
> Esta spec define **qué** se construye y **cómo se comprueba**. El **cómo se construye** está en `05_PLAN_IMPLEMENTACION.md`.
> **Dueños:** las historias F0–F5 se reparten por capa (front/back/IA) en `06_PLAN_EQUIPO.md`; los "dueño A/B/C/D" de §5 quedan solo como referencia.
> Lo marcado **[Supuesto]** es una decisión razonable sin confirmar.

---

## 1. Objetivo

Prototipo funcional que demuestra, sobre datos **ficticios** y una simulación reproducible, que AbasteceAI:

1. Detecta pedidos **duplicados** y **omisiones** del kit antes de aprobar.
2. Mantiene **trazabilidad** del insumo: solicitado → aprobado → preparado → enviado → contado → aceptado.
3. **No inventa stock**: reservar, marcar entregado o registrar una compra no suben inventario.
4. Propone **rutas** que respetan capacidad y ventanas horarias, y explica lo no asignado.
5. **Explica** cada decisión con datos registrados y documentos citados, con la IA solo proponiendo.

**Éxito** = el guion del pitch (§6) corre de punta a punta, con 7 cuentas y sin tocar la base a mano. Se combinan:
- **Casos precargados** (ya en el seed): se abren y se muestran. Son rápidos y no fallan.
- **Un ciclo en vivo** (§6.2): un pedido recorre todo el flujo con escrituras reales durante el pitch.

Se llega al evento con la demo **ya construida y ensayada** (se permite código previo, confirmado 14-oct).

## 2. Usuarios

7 cuentas demo, una por rol. Identidades del seed (`staff_members`):

| Rol | Nombre demo | Email | Puntos visibles (RLS) | Pantalla principal | Dispositivo |
|---|---|---|---|---|---|
| auxiliar | Ana Demo | auxiliar@abasteceai.example | Q-001, Q-005, Q-008 | Mis pedidos · Recepción QR | **Móvil** (IP LAN) |
| supervisor | Luis Demo | supervisor@abasteceai.example | los 24 detallados | Pedidos de mis puntos · Marcar entrega | Laptop/móvil |
| administrador | Carla Demo | administrador@abasteceai.example | 703 | Bandeja de revisión y aprobación | Laptop |
| bodega | Diego Demo | bodega@abasteceai.example | 703 | Preparación por lote · Despacho | Laptop |
| logistica | Elena Demo | logistica@abasteceai.example | 703 | Mapa y plan de rutas · Courier | Laptop |
| compras | Fabian Demo | compras@abasteceai.example | 703 | Compras pendientes (COULD) | Laptop |
| gerencia | Gabriela Demo | gerencia@abasteceai.example | 703 | Tablero · Asistente | Laptop |

Permisos completos: `01_CONTEXTO_PROYECTO.md §4`. Costos (`product_costs`) solo para administrador, compras y gerencia.

## 3. Alcance (MoSCoW)

| | Incluye |
|---|---|
| **MUST** | Login 7 roles + RLS · crear pedido · análisis por reglas (duplicado, kit, unidades) · aprobación admin · preparación por lote con reservas · despacho transaccional idempotente · marcar entrega sin conteo · recepción QR con faltante · tablero de cobertura · etiqueta DEMO FICTICIA · reset de la demo |
| **SHOULD** | Jev en modo SIMULADO con switch a real · asistente con búsqueda textual y citas · OR-Tools VRPTW con los 10 puntos Quito + matriz haversine · confirmar plan → crea envíos · guía courier con retraso |
| **COULD** | ORS real · pgvector + embeddings · simulador CONTINGENCIA (demanda ×1,2 y sin VEH-DEMO-2) · llegada de la compra a bodega |
| **WON'T** | Deploy público · matriz de 700 puntos · API real de courier · modelos predictivos de demanda |

Regla: ningún COULD empieza hasta que todos los MUST corran integrados en `main`.

## 4. Invariantes (constitución)

Romper una = bug bloqueante. Varias ya las hace cumplir la base (columna "Base").

| # | Invariante | Base | Cómo se comprueba en la app |
|---|---|---|---|
| I1 | Aritmética, fechas, cantidades, cobertura y vencimientos se calculan en código, nunca con un LLM | Vista `v_replenishment` | Ningún número de una respuesta IA se guarda como cantidad |
| I2 | La IA solo propone; aprobar, excepciones, reposición y despacho son humanos | — | Ningún endpoint IA escribe en `orders`, `stock_movements`, `shipments` |
| I3 | Secretos solo en `backend/.env` | — | `grep` en CI de patrones de clave en `frontend/` y repo |
| I4 | `stock_movements` inmutable; corregir = movimiento compensatorio | ✅ trigger `stock_history_immutable` | No hay `UPDATE`/`DELETE` sobre esa tabla en el backend |
| I5 | Despacho y recepción: una transacción + idempotencia | ✅ triggers de saldo/reserva | Test: doble llamada = un solo set de movimientos |
| I6 | Toda salida IA lleva `source: SIMULADO \| API_REAL` y queda en `decision_logs` | ✅ CHECK `mock` ⇒ costo 0 | Tests de `/analyze` y `/assistant` |
| I7 | `db/*.sql` es el contrato; cambiarlo = migración nueva + PR a `specs/000-contratos` | — | CODEOWNERS |
| I8 | Rol y puntos se leen de la base con el JWT; nunca del cliente | ✅ RLS + `private.abastece_*` | Test: body con `role: administrador` desde auxiliar → 403 |
| I9 | Reservar reduce el disponible, no el físico · `delivered_unchecked` no sube stock · registrar compra no crea stock · lotes vencidos no se reservan | ✅ `v_inventory`, trigger `reservation_integrity` | Tests PED-DEMO-004, INS-005, FEFO |
| I10 | Toda pantalla muestra **DEMO FICTICIA**; sin métricas de ahorro reales | — | Banner en el layout raíz |
| I11 | **Reloj de demo:** toda fecha de negocio nueva usa `demo_metadata.reference_at` (2026-10-10 22:00 UTC), no `now()` | Las vistas solo cuentan movimientos `≤ reference_at` | Test: un despacho nuevo aparece en `v_inventory` |
| I12 | No se aprueba el propio pedido | ✅ CHECK `approved_by<>requested_by` | Test 403 antes de llegar al CHECK |

## 5. Historias de usuario y criterios de aceptación

Formato: *Dado / Cuando / Entonces*. Cada **[PITCH-n]** reproduce un paso del guion (§6) y necesita un test con ese nombre.

### F0 — Acceso y shell (dueño A)

- **HU-0.1** Como usuario, inicio sesión y veo solo las pantallas de mi rol.
  - Cuenta auxiliar → la app lee rol y puntos **de la base** y lista solo **Q-001, Q-005, Q-008**.
  - Cuenta supervisor → 24 puntos. Administrador, bodega, logística, compras y gerencia → 703.
  - Usuario Auth sin `staff_members` vinculado → "Cuenta sin perfil operativo" y ningún dato.
- **HU-0.2** Toda pantalla muestra el banner **DEMO FICTICIA**.
- **HU-0.3** Un administrador puede **resetear la demo** (vuelve al seed y re-vincula las 7 cuentas) para repetir el guion.

### F1 — Pedidos (dueño A)

- **HU-1.1 Crear pedido.** Como auxiliar/supervisor, creo un pedido (`status=submitted`) para un punto asignado: mes (`cycle_month`), productos, cantidades, observaciones. Un adicional (`order_type=additional`) enlaza `related_order_id` y exige `reason` (la base ya lo obliga).
  - Punto no asignado → `403`. Producto inexistente o inactivo → `422` con el ítem señalado. Producto repetido en el pedido → `422`.
  - Misma `Idempotency-Key` (`orders.idempotency_key`, UNIQUE) → devuelve el pedido existente, no crea otro.
- **HU-1.2 Analizar.** Compara con pedidos del mismo punto y `cycle_month`, detecta omisiones del kit (`replenishment_policies.required_in_kit`) y pide propuesta a `classify_notes`.
  - **[PITCH-1]** PED-DEMO-001 y PED-DEMO-025 (Q-001, oct-2026, mismos 16 ítems y cantidades) → alerta "posible duplicado" con el otro pedido como evidencia.
  - **[PITCH-2]** PED-DEMO-002 (Q-002) → alerta "omisión de kit: INS-016".
  - Las alertas son **de revisión**: no cancelan ni bloquean. Se registran como `incidents` (`possible_duplicate`, `missing_from_kit`) si no existe ya una abierta para ese pedido.
  - El análisis queda en `decision_logs` (provider `rules` + provider `mock`/`typesafe`); abrir la pantalla no lo recalcula.
- **HU-1.3 Decidir.** Como administrador, veo alertas + propuesta IA + evidencia y elijo:
  - **Aprobar**: guarda `approved_qty` por ítem (puede diferir de `requested_qty`), `approved_by`, `approved_at` → `approved`.
  - **Devolver**: vuelve a `draft` con motivo.
  - **Cancelar**: `cancelled` con motivo (caso PED-DEMO-025).
  - Solo desde `submitted`; otro estado → `409`. Pedido propio → `403`. Corregir, devolver o cancelar sin motivo → `422`. Todo queda en `audit_events`.
  - **[PITCH-3]** La pantalla muestra la propuesta (etiquetada SIMULADO/API_REAL), la evidencia y quién decidió.

### F2 — Bodega y recepción (dueño B)

- **HU-2.1 Preparar.** Como bodega, preparo un pedido `approved` por producto y lote en BOD-DEMO.
  - Sugerencia de lotes: excluye vencidos (DEMO-002-VENC, DEMO-003-VENC) y aplica **vencimiento más próximo primero** (FEFO).
  - Crea `inventory_reservations` (`active`) y actualiza `prepared_qty`. Reserva reduce el **disponible**, no el físico.
  - Todo preparado = aprobado → `ready`. Si no → queda `preparing` y abre incidencia `packing_difference`.
  - **[PITCH-4]** PED-DEMO-003 (precargado): 16 ítems con preparado < aprobado → `preparing` + INC-EMPAQUE.
  - **[PITCH-5]** INS-005 en BOD-DEMO: físico 8, reservado 7, **disponible 1**; COMPRA-DEMO-001 (`ordered`, 100 u.) **no** suma al disponible.
- **HU-2.2 Despachar.** Como bodega/logística, despacho un envío `created` cuyo pedido está `ready`, en **una transacción**:
  1. reservas del pedido → `fulfilled`;
  2. por ítem: movimiento `dispatch` −qty en BOD-DEMO y +qty en TRA-DEMO, mismo `transfer_group`;
  3. envío → `dispatched`, `dispatched_at`; pedido → `shipped`; `audit_events`.
  - Falla a mitad → rollback total. Envío ya `dispatched` → devuelve el estado actual sin repetir movimientos (idempotente).
- **HU-2.3 Marcar entrega.** Como supervisor asignado, marco el envío entregado sin conteo → envío y pedido `delivered_unchecked`, `delivered_at`.
  - **[PITCH-7]** PED-DEMO-004 (precargado): `delivered_unchecked`, sin cantidades contadas; stock de Q-004 sin entrada.
- **HU-2.4 Recibir.** Como auxiliar asignado, escaneo el QR (`shipments.qr_token`) o tipeo la guía, cuento y acepto por ítem.
  - QR sin sesión o sin asignación → `401/403`. Ya existe recepción (`receipts.shipment_id` UNIQUE) → `409`.
  - En una transacción: `receipts` + `receipt_items` (`counted_qty`, `accepted_qty`); movimientos `receipt`: aceptadas TRA-DEMO → punto; dañadas (contadas − aceptadas) TRA-DEMO → CUA-DEMO; faltantes (enviadas − contadas) **se quedan en tránsito** con incidencia `receipt_shortage`.
  - Todo aceptado → `reconciled`; si no → `with_difference` (envío y pedido).
  - **[PITCH-8]** PED-DEMO-005 (precargado): INS-002 enviados 10, contados y aceptados 8, faltante 2 (INC-RECEPCION); Q-005 recibió +8.

### F3 — Logística (dueño C)

- **HU-3.1 Planificar.** Como planificador, elijo fecha y pedidos `ready` de Quito y obtengo una propuesta OR-Tools (peso = qty × `gross_weight_kg`, volumen = qty × `package_volume_m3`, `capacity_kg/m3`, ventanas `window_start/end`, `service_minutes`, horario del vehículo 07:30–17:30).
  - Calcular **no** escribe nada. Pedido que no cabe → "no asignado" con motivo (capacidad, ventana, sin vehículo).
  - **[PITCH-6]** Mapa Leaflet: RUTA-DEMO-2 (precargada, Q-006 → Q-007, sin km) vs ruta calculada; km etiquetados "estimado haversine".
- **HU-3.2 Confirmar plan.** El planificador confirma → `route_plans` (`approved`, `matrix_source=synthetic`, `planning_method=ortools_vrptw`, km y minutos estimados), `route_stops` y un `shipments` `created` por pedido (`mode=own`, `guide_code`, `qr_token`).
- **HU-3.3 Courier.** Registro envío courier (`carrier_name`, `guide_code`, `promised_delivery_at`).
  - **[PITCH-9]** ENV-DEMO-008 (precargado, Quito → G-001): `dispatched`, prometido 10-oct 20:00 < reloj de demo → **retrasado** (INC-COURIER). El retraso se calcula en SQL, no con IA.

### F4 — IA y tablero (dueño D)

- **HU-4.1 Clasificar notas (Jev).** `classify_notes(order) -> Proposal` usa las 3 preguntas de `db/jev_solicitud_ejemplo.json` (`urgency`, `additional_reason`, `needs_human_review`).
  - `AI_CALLS_ENABLED=false` (default) → respuesta de `db/jev_respuesta_SIMULADA.json`, provider `mock`, `source: SIMULADO`.
  - `confidence < 0.80` o `needs_human_review.noul ≥ 0.5` [Supuesto] → `status=human_review`. Error/timeout → `human_review`, **nunca** una decisión.
  - Alertas de código (duplicado, kit, stock, vencimiento) mantienen prioridad sobre la etiqueta de Jev.
- **HU-4.2 Asistente.** Pregunto en lenguaje natural; responde con funciones de lectura (con mi JWT) y documentos que mi rol puede ver (`documents.allowed_roles`), citando título y versión.
  - **[PITCH-10]** "¿Cuál es la regla de recepción?" → cita *"Recepción con diferencias DEMO" · DEMO-1.1*.
  - Sin documento relevante → "no tengo una fuente para eso". Auxiliar no recibe *"Costos y compras DEMO"*.
  - No ejecuta escrituras.
- **HU-4.3 Tablero de cobertura.** Como gerencia/admin, veo los 24 puntos desde la vista **`v_replenishment`** (ya calcula cobertura, `recommended_qty`, `confirmed_inbound_qty` y `coverage_status`: `critical/attention/covered/excess`). La app **no recalcula** las fórmulas.
  - Seed actual: 179 `attention`, 204 `covered`, 1 `excess`, 0 `critical`.
  - Puntos `demo_scope=catalog` no aparecen como desabastecidos.

### F5 — Simulador (COULD)

- **[PITCH-11]** Escenario CONTINGENCIA: demanda ×1,2 y sin VEH-DEMO-2 → recalcula cantidades y rutas **en memoria**, sin escribir en la operación.

## 6. Guion del pitch = pruebas de aceptación

### 6.1 Pasos

| Paso | Caso | Modo | Criterio | Feature |
|---|---|---|---|---|
| 1 | PED-DEMO-001 / 025 duplicado | **En vivo** | HU-1.2 | F1 |
| 2 | PED-DEMO-002 sin INS-016 | Precargado + análisis | HU-1.2 | F1 |
| 3 | Propuesta Jev + evidencia + decisión humana | **En vivo** | HU-1.3, HU-4.1 | F1+F4 |
| 4 | PED-DEMO-003 en preparación | Precargado | HU-2.1 | F2 |
| 5 | INS-005: 1 libre + compra pendiente | Precargado | HU-2.1 | F2 |
| 6 | Ruta referencia vs OR-Tools | **En vivo** | HU-3.1 | F3 |
| 7 | PED-DEMO-004 entregado sin verificar | Precargado | HU-2.3 | F2 |
| 8 | PED-DEMO-005 10/8/2 | Precargado + **en vivo** | HU-2.4 | F2 |
| 9 | Courier Quito–Guayaquil retrasado | Precargado | HU-3.3 | F3 |
| 10 | Asistente cita DEMO-1.1 | **En vivo** | HU-4.2 | F4 |
| 11 | CONTINGENCIA | En vivo | F5 | COULD |

### 6.2 Ciclo en vivo (confirmado)

Pedido **PED-DEMO-001** (Q-001, punto del auxiliar → la recepción se puede hacer desde el teléfono):

1. **Admin** analiza 001 y 025 → ve el duplicado → **cancela 025** con motivo.
2. **Admin** aprueba 001 corrigiendo **INS-005 de 3 a 1** (solo hay 1 disponible) con motivo "esperar COMPRA-DEMO-001".
3. **Bodega** prepara 001: FEFO salta el lote vencido de INS-002 → `ready`.
4. **Logística** planifica 001 + otros `ready` de Quito, confirma → se crea el envío.
5. **Bodega** despacha (doble clic no duplica).
6. **Auxiliar**, en el teléfono, escanea el QR y cuenta **un faltante** → `with_difference` + incidencia; el tablero de Q-001 cambia.

Así los pasos 1, 3, 5, 6 y 8 se ven ocurrir, no solo como datos precargados.

## 7. Máquinas de estado

**Pedido** (`orders.status`):

```
draft → submitted → approved → preparing → ready → shipped → delivered_unchecked → reconciled
  ▲         │                                          └──────────────────────────→ with_difference
  └─devolver┤
            └→ cancelled
```

| Transición | Quién | Endpoint |
|---|---|---|
| (nuevo) → submitted | Auxiliar / Supervisor | `POST /orders` |
| submitted → approved \| draft \| cancelled | Administrador (no el autor) | `POST /orders/{id}/decision` |
| approved → preparing \| ready | Bodega | `POST /orders/{id}/prepare` |
| ready → shipped | Bodega / Logística | `POST /shipments/{id}/dispatch` |
| shipped → delivered_unchecked | Supervisor asignado | `POST /shipments/{id}/delivered` |
| shipped \| delivered_unchecked → reconciled \| with_difference | Auxiliar asignado | `POST /shipments/{id}/receipt` |

**Envío** (`shipments.status`): `created → dispatched → delivered_unchecked → reconciled | with_difference`.
**Plan de ruta** (`route_plans.status`): `draft → approved → dispatched → finished`.

Transición no listada → `409 INVALID_STATE`.

## 8. Contrato de API

13 endpoints: los 11 de `01 §6` con `approve` renombrado a `decision` (aprobar/devolver/cancelar), más 2 que faltaban para crear envíos:

| Acción | Endpoint | Roles |
|---|---|---|
| Crear pedido | `POST /orders` | auxiliar, supervisor |
| Analizar | `POST /orders/{id}/analyze` | administrador (y autor) |
| Decidir | `POST /orders/{id}/decision` | administrador |
| Preparar | `POST /orders/{id}/prepare` | bodega |
| Planificar | `POST /routes/plan` | logistica |
| **Confirmar plan** (nuevo) | `POST /routes/confirm` | logistica |
| **Envío courier** (nuevo) | `POST /shipments/courier` | logistica |
| Despachar | `POST /shipments/{id}/dispatch` | bodega, logistica |
| Marcar entrega | `POST /shipments/{id}/delivered` | supervisor |
| Recibir | `POST /shipments/{id}/receipt` | auxiliar |
| Proponer compra | `POST /purchases` | compras (COULD) |
| Asistente | `POST /assistant` | todos |
| Simular | `POST /scenarios/run` | administrador, logistica, gerencia (COULD) |

Reglas comunes:
- `Authorization: Bearer <JWT Supabase>`. El backend resuelve `staff_members` por `auth_user_id`, con rol y `point_assignments`.
- **Idempotencia:** `POST /orders` exige `Idempotency-Key` (se guarda en `orders.idempotency_key`). Despacho, entrega y recepción son idempotentes **por estado**, con `SELECT … FOR UPDATE` (repetir devuelve el estado actual o `409`). No hace falta tabla nueva.
- Respuestas IA: `source: "SIMULADO" | "API_REAL"` y `model`. En base: `mock` → SIMULADO, `typesafe`/`openai` → API_REAL, `rules` → REGLAS (no es IA).
- Error uniforme: `{ "error": { "code": "FORBIDDEN|NOT_FOUND|INVALID_STATE|VALIDATION|CONFLICT|UPSTREAM_AI", "message": "...", "details": {} } }`.
- **Lecturas:** el frontend lee directo de Supabase con el JWT del usuario (RLS), incluidas las vistas `v_inventory`, `v_order_trace`, `v_replenishment` y `v_lot_balances`. Solo las escrituras pasan por FastAPI.

El detalle (`openapi.yaml`) vive en `specs/000-contratos/` y queda **congelado** tras su merge.

### Migraciones nuevas

- `db/08…11`: funciones SQL `abastece.fn_*` con la lógica de cada escritura (ver `06_PLAN_EQUIPO.md §3 C3`). FastAPI valida y las llama.

#### `db/07_proveedor_openai.sql`

`decision_logs.provider` solo admite `mock | typesafe | rules`. Para registrar el asistente (I6) se agrega `openai` al CHECK. Va por PR a `specs/000-contratos`.

## 9. Requisitos no funcionales

- **Seguridad:** la secret key / conexión Postgres del backend salta RLS; cada escritura verifica usuario, rol, punto y estado antes de escribir. La IA no escribe en la base.
- **Costos:** `AI_CALLS_ENABLED=false` por defecto; ninguna pantalla dispara llamadas pagadas al abrirse. Límite de gasto en OpenAI/TypeSafe.
- **Resiliencia:** si cae internet o una API → resultado precargado etiquetado SIMULADO. Un error de conexión nunca se vuelve decisión.
- **Móvil:** la recepción funciona en `http(s)://<IP-LAN-laptop>:<puerto>`. La cámara QR requiere HTTPS → `vite --https` con certificado local; **siempre** existe ingreso manual de la guía.
- **Datos:** cantidades `NUMERIC`, fechas `timestamptz`, zona Ecuador continental; dataset < 100 MB (hoy 4,32 MB).
- **Calidad:** CI verde (ruff + pytest, tsc + vite build, `verificar_postgres.mjs`).

## 10. Fuera de alcance

Deploy público · integración ERP · API de courier · predicción estadística · matriz de 700 puntos · notificaciones · edición de catálogo/usuarios desde la app.

## 11. Preguntas abiertas

| # | Pregunta | Estado |
|---|---|---|
| Q1 | Paquete `db/` | ✅ Resuelto 14-oct: en `db/`, 61/61 pruebas OK |
| Q2 | ¿Código antes del 16? | ✅ Sí. La demo llega construida |
| Q3 | Usuarios GitHub | ✅ Resuelto 14-oct: en `.github/CODEOWNERS` |
| Q4 | Idempotencia y `cancelled` en el esquema | ✅ `cancelled` existe; `orders.idempotency_key` existe; el resto es por estado |
| Q5 | Escrituras | ✅ psycopg directo |
| Q6 | ¿Quién toma F5 (simulador)? | Abierta — solo si sobra tiempo |
| Q7 | ¿Ciclo en vivo con PED-DEMO-001 (§6.2)? | ✅ Confirmado 14-oct |
| Q8 | ¿Se acepta la migración 07 (`openai` en `decision_logs.provider`)? | ✅ Confirmado 14-oct |
