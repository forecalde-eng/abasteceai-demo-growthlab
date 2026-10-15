# AbasteceAI — Plan de implementación

> Versión 0.3 · 14-oct-2026 · Implementa `04_SPEC_MAESTRA.md` v0.3.
> **El reparto por persona y las fases están en `06_PLAN_EQUIPO.md`** (Omar, David, Jorge, Bruno) y reemplazan los dueños A/B/C/D de §4. Este archivo conserva el estado de partida, decisiones D1–D12, pruebas, cronograma y riesgos.
> Cada tarea tiene un **"hecho cuando"** verificable. Ninguna tarea dura más de ~2 h; si crece, se parte.
> **Cambio clave (14-oct):** se permite traer código hecho. La demo llega **construida y ensayada**; en el evento solo se pule y se presenta.

---

## 0. Estado de partida (verificado 14-oct)

### Lo que ya tenemos

| Pieza | Estado | Evidencia |
|---|---|---|
| Esquema `abastece` (27 tablas) | ✅ Listo | `db/01_esquema.sql` |
| Integridad + RLS + vistas | ✅ Listo | `db/02_reglas_y_accesos.sql`: ledger inmutable, sin stock negativo, sin reservar vencidos ni más de lo aprobado, envío ≤ preparado, recepción ≤ enviado, RLS por rol/punto, escritura directa bloqueada |
| Cálculo de cobertura y reposición | ✅ Listo en SQL | Vista `v_replenishment` (no hay que programarlo) |
| Saldos, disponible, trazabilidad | ✅ Listo en SQL | `v_inventory`, `v_lot_balances`, `v_order_trace` |
| Seed con **todos** los casos del pitch | ✅ Listo | PED-001/025 duplicado, PED-002 sin INS-016, PED-003 preparando, INS-005 = 1 libre, COMPRA-DEMO-001 pendiente, PED-004 sin conteo, PED-005 10/8/2, courier G-001 retrasado, 2 lotes vencidos, 8 documentos, 7 incidencias |
| Pruebas de la base | ✅ **61/61 OK** | `node verificar_postgres.mjs` (PGlite local) |
| Consultas de duplicado, kit, retraso, búsqueda textual | ✅ Listo en SQL | `db/04_consultas_demo.sql`: el backend las reutiliza |
| Contrato y respuesta simulada de Jev | ✅ Listo | `db/jev_solicitud_ejemplo.json`, `db/jev_respuesta_SIMULADA.json`, `db/integracion_jev.py` |
| Documentos RAG (8) con FTS en español | ✅ Listo | `document_chunks.search_vector` + índice GIN |
| Variables de entorno previstas | ✅ Listo | `db/config_*.env.example` |
| Spec y plan | ✅ v0.3 | Este archivo y `04_SPEC_MAESTRA.md` |

### Lo que falta

| Pieza | Tipo | Dónde en este plan |
|---|---|---|
| Proteger `main` (repo y `AGENTS.md` ya están) | Setup | T0.3 |
| `uv` y `gh` en esta Mac (y verificar en las otras 3) | Setup | T0.2 |
| Proyecto Supabase + 7 usuarios Auth vinculados | Setup | T0.4 |
| Cuentas OpenAI, TypeSafe, HeiGIT con límite de gasto | Setup | T0.10 |
| Backend completo (13 endpoints) | Código | A, B, C, D |
| Frontend completo (7 pantallas por rol) | Código | A, B, C, D |
| **Crear envíos**: el paquete no tiene endpoint que los cree | Hueco del diseño | `POST /routes/confirm`, `POST /shipments/courier` (C2b, C3) |
| `decision_logs.provider` no admite `openai` | Hueco del esquema | Migración `07` (T0.5) |
| Reset de la demo (seed + re-vincular Auth) | Código | T0.9 |
| OR-Tools: no hay km reales; rutas precargadas sin optimizar | Código | C1, C2 |
| Ningún pedido arranca en `critical` (0 en el seed) | Dato | Aceptado: el tablero muestra attention/excess; CONTINGENCIA puede generar critical |

## 1. Arquitectura

```
 Navegador (React + TS + Vite)                 Teléfono (misma app, IP LAN, https)
   │  lecturas: supabase-js + JWT (tablas y vistas v_*) ──►  Supabase (Postgres + Auth + RLS)
   │  escrituras: fetch + JWT (+ Idempotency-Key en /orders)        ▲   esquema `abastece`
   ▼                                                                │
 FastAPI (laptop)                                                   │
   ├─ auth.py      JWT → staff_member, rol, puntos                  │
   ├─ orders.py    crear · analizar · decidir                       │  psycopg, una transacción
   ├─ warehouse.py preparar · despachar · entregar · recibir        │  por acción, SELECT … FOR UPDATE
   ├─ routes.py    plan (OR-Tools) · confirmar · courier            │
   ├─ ai.py        classify_notes (Jev) · asistente                 │
   ├─ clock.py     reloj de demo = demo_metadata.reference_at ──────┘
   └─ rules/       funciones puras: duplicado, kit, FEFO, VRPTW
                         ├─► TypeSafe Jev   (solo si AI_CALLS_ENABLED=true)
                         └─► OpenAI Luna    (solo si AI_CALLS_ENABLED=true)
```

### Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Lecturas** del frontend directo a Supabase con el JWT; tablero con `v_replenishment`, bodega con `v_inventory`, trazabilidad con `v_order_trace` | El SQL ya trae RLS y los cálculos; no se duplica lógica |
| D2 | ✅ **Escrituras** por FastAPI con **psycopg** (pooler Supabase, modo sesión), `BEGIN … COMMIT` explícito. Variable nueva `DATABASE_URL` | Transacciones multi-tabla sin tocar `db/*.sql` |
| D3 | JWT con `supabase.auth.get_user(token)`; rol y puntos con `SELECT` a `staff_members`/`point_assignments` | Simple y correcto |
| D4 | Reglas como **funciones puras** en `backend/app/rules/` | Se testean sin base |
| D5 | `SELECT … FOR UPDATE` sobre el pedido/envío al inicio de cada escritura | Evita doble despacho; los triggers de la base ya usan advisory locks por lote |
| D6 | **Idempotencia sin tabla nueva:** `/orders` usa `orders.idempotency_key` (UNIQUE); despacho, entrega y recepción por estado (`receipts.shipment_id` ya es UNIQUE) | El esquema ya lo resuelve |
| D7 | OR-Tools con matriz **haversine × 1,3** [Supuesto] a 25 km/h [Supuesto]; `matrix_source=synthetic`. ORS solo si sobra tiempo | Sin depender de cuota externa en el pitch |
| D8 | Asistente: `websearch_to_tsquery('spanish', …)` sobre `document_chunks` **con el JWT del usuario** (RLS filtra `allowed_roles`) + funciones de lectura | Sin embeddings; respeta permisos |
| D9 | QR = `shipments.qr_token`; lector con cámara [Supuesto: `html5-qrcode`] + tipeo de `guide_code`; `vite --https` con certificado local | La cámara exige HTTPS |
| D10 | **Reloj de demo:** `occurred_at`, `created_at`, `approved_at`, `dispatched_at`, etc. = `demo_metadata.reference_at` (+ segundos crecientes para ordenar) | Las vistas y triggers solo cuentan movimientos `≤ reference_at`; con `now()` lo nuevo no aparecería |
| D11 | Migración `db/07_proveedor_openai.sql`: agrega `openai` al CHECK de `decision_logs.provider` | Registrar el asistente (I6) |
| D12 | **Reset:** `TRUNCATE` de las 27 tablas → `03_datos_ficticios.sql` → `UPDATE staff_members SET auth_user_id` para los 7 emails (mapa en `backend/.env`) | Repetir el guion idéntico, sin recrear usuarios |

## 2. Estrategia de pruebas

| Nivel | Qué | Dónde corre |
|---|---|---|
| Unitarias | `rules/`: duplicado, kit, FEFO, armado VRPTW | `pytest`, sin base, en CI |
| Integración | Cada escritura contra Postgres **dentro de una transacción que se revierte** (fixture `db_tx`) | `pytest -m integration` local; en CI se salta sin `DATABASE_URL` |
| Esquema | `node db/verificar_postgres.mjs` | CI (ya pasa 61/61) |
| Aceptación | Guion §6 de la spec con las 7 cuentas, tras `reset_demo` | Laptop de A, en cada integración |

Regla: cada `[PITCH-n]` tiene un test `test_pitch_<n>_*`.

## 3. Cronograma

| Cuándo | Meta | Puerta de salida |
|---|---|---|
| **Mié 14 noche** | Fase 0 completa (setup) | Repo con scaffold y CI verde; Supabase con 7 cuentas; contrato congelado |
| **Jue 15** | Todos los **MUST** + ciclo en vivo | I#1 (13:00), I#2 (18:00), I#3 (22:00): pasos 1–5, 7, 8 y ciclo en vivo |
| **Vie 16** (evento, día 1) | **SHOULD**: Jev, asistente, OR-Tools, courier. Pulido visual | I#4 (14:00): pasos 3, 6, 9, 10. **Freeze 20:00** |
| **Sáb 17** (pitch) | Solo bugs. Respaldo offline. 2 ensayos con reset | Guion completo 2 veces seguidas sin fallar |

Si el jueves a las 22:00 falta algún MUST, el viernes por la mañana se trabaja solo en eso y los SHOULD se recortan en este orden: ORS → asistente con Luna (queda plantilla) → OR-Tools (queda ruta precargada).

## 4. Tareas

### Fase 0 — Setup (mié 14 noche) · dueños en `06_PLAN_EQUIPO.md`

| ID | Tarea | Depende | Hecho cuando |
|---|---|---|---|
| T0.1 | ✅ Paquete en `db/` y verificado | — | 61/61 OK |
| T0.2 | Instalar `uv`, `gh` (faltan aquí), Node 20+, Python 3.11+ — **los 4** | — | `uv --version`, `gh auth status` OK en las 4 máquinas |
| T0.3 | ✅ Repo creado y subido; `AGENTS.md` + `CLAUDE.md` (sustituyen Spec Kit y constitución). Falta proteger `main` | T0.2 | Los 4 leen `AGENTS.md` |
| T0.4 | Supabase Free: SQL 01→03, exponer `abastece`, 7 usuarios Auth, vincular `auth_user_id`, guardar `DATABASE_URL` (pooler sesión) | — | Auxiliar ve 3 puntos, supervisor 24, admin 703 — **probado desde el cliente** |
| T0.5 | `specs/000-contratos/`: `openapi.yaml` (13 endpoints, columnas reales), `estados.md`, `roles.md`; `db/07_proveedor_openai.sql` aplicada | T0.3 | PR aprobado; contrato **congelado** |
| T0.6 | Scaffold backend: FastAPI, `/health`, routers vacíos, `rules/`, `db.py` (pool psycopg + `db_tx`), `clock.py`, `auth.py` con `get_current_staff()` y `require_role()` | T0.5 | `pytest` + `ruff` verdes; `/health` y `/me` responden con el JWT del auxiliar |
| T0.7 | Scaffold frontend: Vite + React + TS, Supabase `schema: 'abastece'`, login, layout por rol, banner DEMO FICTICIA, una ruta vacía por feature, cliente `api.ts` con JWT | T0.5 | Login con las 7 cuentas muestra el menú correcto |
| T0.8 | CI, CODEOWNERS, plantilla de PR, `.gitignore`, README de 5 comandos | T0.6, T0.7 | CI verde en `main` |
| T0.9 | `POST /admin/reset-demo` (solo administrador) + script CLI equivalente | T0.6 | Guion → reset → guion idéntico |
| T0.10 | Cuentas OpenAI, TypeSafe, HeiGIT con límite de gasto (cualquier miembro) | — | Claves en el `.env` de A; nunca en el repo |
| T0.11 | Ramas `001…004` con `specs/00X/README.md`; cada dueño corre `/speckit.specify` | T0.5 | 4 specs de feature en PR |

### Fase 1 — MUST (jue 15)

**A — Pedidos (F0, F1) + integración**

| ID | Tarea | Depende | Hecho cuando |
|---|---|---|---|
| A1 | `rules/orders.py`: `find_duplicates` (huella producto:cantidad, mismo punto y mes), `missing_kit_items` | T0.6 | Unitarias: 001/025 duplicado; 002 → INS-016 |
| A2 | `POST /orders` (rol, punto, productos, adicional con motivo, idempotencia) | A1 | Punto ajeno 403; misma clave no duplica |
| A3 | `POST /orders/{id}/analyze`: reglas + `classify_notes` (stub SIMULADO) + `decision_logs` + `incidents` sin duplicar | A1 | `test_pitch_1`, `test_pitch_2` |
| A4 | `POST /orders/{id}/decision` (aprobar con `approved_qty` / devolver / cancelar; motivo; no autoaprobación; `audit_events`) | A3 | 409 fuera de `submitted`; 403 autoaprobación; 422 sin motivo |
| A5 | UI: crear pedido, mis pedidos, bandeja admin (alertas + propuesta + evidencia + decisión) | A2–A4 | Pasos 1–3 en pantalla |
| A6 | UI trazabilidad de un pedido (`v_order_trace`), compartida por todas las features | T0.7 | Las 6 etapas visibles en PED-DEMO-005 |

**B — Bodega y recepción (F2)**

| ID | Tarea | Depende | Hecho cuando |
|---|---|---|---|
| B1 | `rules/stock.py`: FEFO sobre `v_lot_balances` (`usable`), reparto de cantidad entre lotes | T0.6 | Unitaria: nunca elige DEMO-002-VENC |
| B2 | `POST /orders/{id}/prepare`: reservas + `prepared_qty` + `ready`/`preparing` + incidencia | B1, A4 | `test_pitch_4`, `test_pitch_5` |
| B3 | `POST /shipments/{id}/dispatch`: reservas → `fulfilled`, BOD → TRA con `transfer_group`, estados, audit | B2, C2b | Doble llamada = un despacho; fallo inyectado = 0 movimientos |
| B4 | `POST /shipments/{id}/delivered` | B3 | `test_pitch_7`: stock del punto sin cambio |
| B5 | `POST /shipments/{id}/receipt`: aceptadas → punto, dañadas → CUA, faltantes quedan en TRA + incidencia | B3 | `test_pitch_8`; segundo intento 409 |
| B6 | UI bodega: cola de aprobados, preparación por lote, disponible/reservado (`v_inventory`), despachar | B2, B3 | Pasos 4–5 en pantalla |
| B7 | UI recepción móvil: QR (cámara + tipeo), conteo por ítem, aceptar | B5 | Recepción hecha desde el teléfono vía IP LAN |

**C — Logística (F3)**: en el camino crítico solo por C2b (crear envíos)

| ID | Tarea | Depende | Hecho cuando |
|---|---|---|---|
| C2b | `POST /routes/confirm` **versión mínima**: recibe pedidos `ready` + vehículo + orden de paradas, crea `route_plans`, `route_stops`, `shipments` `created` | T0.6 | Envío creado con `qr_token` y `guide_code` → desbloquea a B |
| C1 | `rules/routing.py`: matriz haversine, armado VRPTW (peso, volumen, capacidad, ventanas, servicio, horario vehículo) | T0.6 | Unitaria: pedido imposible → "no asignado" con motivo |
| C3 | `POST /shipments/courier` + cálculo de retraso (`promised_delivery_at < reloj`) | T0.6 | `test_pitch_9` |
| C5 | UI courier y envíos retrasados | C3 | Paso 9 en pantalla |

**D — Tablero (F4, parte MUST)**

| ID | Tarea | Depende | Hecho cuando |
|---|---|---|---|
| D1 | UI tablero: 24 puntos desde `v_replenishment` (cobertura, estado, recomendado, entradas confirmadas aparte), filtro por ciudad | T0.7 | Gerencia ve el tablero; Q-001 cambia tras el ciclo en vivo |
| D2 | UI de incidencias abiertas (las 7 del seed + nuevas) | T0.7 | Admin las ve con su pedido/envío |

### Fase 2 — SHOULD (vie 16)

| ID | Dueño | Tarea | Hecho cuando |
|---|---|---|---|
| C2 | C | `POST /routes/plan` con OR-Tools sobre pedidos `ready` de Quito | `test_pitch_6`: plan válido, nada escrito |
| C4 | C | UI Leaflet: catálogo de 700 puntos, RUTA-DEMO-2 vs calculada, no asignados, botón confirmar (usa C2b) | Paso 6 en pantalla, km "estimado haversine" |
| D3 | D | `classify_notes` real: cliente Jev (basado en `db/integracion_jev.py`), umbral 0,80, timeout → `human_review` | `false` → SIMULADO; `true` → API_REAL probado 1 vez con 001 |
| D4 | D | `POST /assistant`: FTS con JWT del usuario + funciones de lectura + Luna (o plantilla si IA apagada) + `decision_logs` | `test_pitch_10`; sin fuente → "no tengo una fuente" |
| D5 | D | UI chat con fuentes y etiqueta | Paso 10 en pantalla |
| A7 | A | Pulido visual y textos del guion; banner; estados vacíos | Revisión de los 4 |

### Fase 3 — Cierre (vie 16 noche – sáb 17)

| ID | Tarea | Hecho cuando |
|---|---|---|
| Z1 | Respaldo: cada paso con IA o red tiene resultado precargado SIMULADO | Pitch completo con APIs apagadas |
| Z2 | Plan B sin internet: video del guion completo | Archivo en la laptop |
| Z3 | Ensayo × 2 con `reset_demo` entre ensayos | Dentro del tiempo del jurado |
| Z4 | COULD solo si Z1–Z3 están: CONTINGENCIA, ORS, pgvector | — |

### Integraciones

Procedimiento: todos hacen merge → `reset_demo` → A corre el guion con las 7 cuentas → lo que falla se vuelve tarea con dueño.

| Checkpoint | Cuándo | Debe correr |
|---|---|---|
| I#1 | Jue 13:00 | Login 7 roles · pasos 1, 2 · tablero |
| I#2 | Jue 18:00 | Pasos 1–5, 7 · envío creado por C2b |
| I#3 | Jue 22:00 | **Todos los MUST + ciclo en vivo** (§6.2 de la spec) |
| I#4 | Vie 14:00 | SHOULD: pasos 3 (Jev), 6, 9, 10 |
| Freeze | Vie 20:00 | Solo bugs |

## 5. Camino crítico

```
T0.4 Supabase ─┐
T0.3 repo ─► T0.5 contrato ─► T0.6/T0.7 scaffold ─► A1–A4 ─► B2 preparar ─┬─► B3 despachar ─► B5 recibir ─► I#3
                                                     C2b crear envíos ─────┘
```

C2b es corto pero bloquea el despacho: C lo hace **primero** el jueves.

## 6. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Escrituras con `now()` no aparecen en las vistas | Alta si se olvida | Ciclo en vivo "no hace nada" | D10 reloj de demo + test I11 |
| Pooler de Supabase / límite de conexiones Free | Media | Escrituras | Pool ≤ 5, modo sesión; probar en T0.6 |
| Cámara QR no abre en el móvil | Alta | Paso en vivo de recepción | `vite --https` + tipeo de guía |
| Triggers rechazan una operación válida (saldo, reservas) | Media | Despacho/recepción | Liberar reservas **antes** del movimiento en la misma transacción (lo exige `check_stock_balance`); tests de integración tempranos |
| Un día para todos los MUST es justo | Media | Pitch incompleto | Casos precargados ya cubren 4, 5, 7, 8, 9: el ciclo en vivo es el único MUST nuevo de punta a punta |
| Wifi del evento caído | Media | Supabase y APIs | Z1 + Z2; hotspot del celular |
| Base compartida ensuciada por pruebas | Media | Guion roto | `db_tx` con rollback + `reset_demo` |
| Jev rinde peor en español | Media | Paso 3 | Umbral 0,80 → revisión manual; se presenta como diseño, no como falla |

## 7. Próximos pasos inmediatos

1. **Omar:** confirmar Q7 (ciclo en vivo con PED-DEMO-001) y Q8 (migración 07); pasar usuarios GitHub de David, Jorge y Bruno.
2. Instalar `uv` y `gh` (T0.2) y crear el proyecto Supabase (T0.4).
3. Arrancar la Fase 0 de `06_PLAN_EQUIPO.md`: contrato congelado, Supabase y esqueletos.
