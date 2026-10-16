# AbasteceAI — Plan del equipo por roles y fases

> Versión 1.1 · 14-oct-2026 · **Reemplaza el reparto A/B/C/D** de `00-handoffs/02_PLAN_EQUIPO_SDD.md` y de `05_PLAN_IMPLEMENTACION.md §4`.
> Qué se construye: `04_SPEC_MAESTRA.md`. Decisiones técnicas (D1–D12) y riesgos: `05_PLAN_IMPLEMENTACION.md`.
> Hoja de tareas de cada uno: `docs/equipo/<nombre>.md`, y cada tarea es un **ticket** en GitHub ([issues](https://github.com/forecalde-eng/abasteceai-demo-growthlab/issues), [hitos por fase](https://github.com/forecalde-eng/abasteceai-demo-growthlab/milestones)). **Cada persona le da a su IA `AGENTS.md` + su hoja.**
> v1.1: Omar toma FastAPI; David pasa la lógica de escritura a **funciones SQL**. Ciclo en vivo (PED-DEMO-001) y migración 07 confirmados.

---

## 1. El equipo

| Persona (GitHub) | Rol | IA / IDE | Es dueño de |
|---|---|---|---|
| **Omar** `@forecalde-eng` | Líder · FastAPI · auth · IA/RAG · rutas | Claude Code | Contrato API, FastAPI (delgado: valida y llama a la base), verificación de JWT y permisos, Jev, asistente + RAG, OR-Tools/ORS, integración con el backend, **presenta el pitch** |
| **David** `@Dawid878` | Base de datos | Codex · VS Code/Antigravity | Supabase (proyecto, cuentas), migraciones, **funciones SQL de cada acción** (crear, analizar, decidir, preparar, despachar, recibir…), sus pruebas locales, capa de datos del frontend (`frontend/src/data/`) |
| **Jorge** `@JorgeRevelo23` | Frontend: shell y pedidos | Claude Code · VS Code/Antigravity | Esqueleto web, login, layout por rol, sistema visual, pedidos, bandeja admin, supervisor, tablero, incidencias, chat. **Integrador:** revisa y mergea los PRs a `main` |
| **Bruno** `@bruno7890` | Frontend: operación y logística | OpenCode Go · VS Code/Antigravity | Bodega, inventario, despacho, recepción móvil QR, trazabilidad, mapa y rutas, courier |

**Por qué este corte:** cada uno trabaja en lo que domina y en carpetas distintas. Las fronteras son **tres contratos** (§3) que se fijan en la Fase 0.

**Cómo fluye una acción:**

```
Pantalla (Jorge/Bruno) → hook de src/data/ (David) → FastAPI (Omar) → función SQL (David) → tablas
                                                      valida JWT,      revisa estado, mueve stock,
                                                      rol y punto      audita; todo o nada
```

## 2. Mapa de carpetas y dueños

```
AGENTS.md, CLAUDE.md, docs/, specs/000-contratos/    → Omar (contratos con David)
db/01…06 (originales, no se tocan)                   → —
db/07+ (migraciones y funciones nuevas)              → David
db/verificar_funciones.mjs (pruebas de funciones)    → David
backend/ (todo FastAPI)                              → Omar
frontend/
├── src/App.tsx, src/app/ (router, layout, auth)     → Jorge
├── src/ui/ (componentes compartidos, estilos)       → Jorge
├── src/data/ (cliente Supabase, hooks, api.ts)      → David
├── src/mocks/ (fixtures desde db/datos/*.csv)       → Bruno
├── src/features/pedidos/, admin/, supervisor/,
│   tablero/, incidencias/, asistente/               → Jorge
└── src/features/bodega/, despacho/, recepcion/,
    trazabilidad/, logistica/                        → Bruno
```

Tocar una carpeta ajena = PR pequeño; `.github/CODEOWNERS` pide la revisión del dueño solo.

## 3. Los tres contratos

### C1 — API REST · `specs/000-contratos/openapi.yaml` (Omar, Fase 0)

Los 13 endpoints de la spec §8, más `GET /me`, `POST /orders/{id}/prepare?dry_run=true` y `POST /admin/reset-demo`. Congelado al merge.

### C2 — Capa de datos del frontend · `frontend/src/data/` (David, Fase 0–1)

Los componentes **nunca** llaman a Supabase ni a `fetch` directo: usan estos hooks (React Query). Jorge y Bruno arrancan con mocks y David cambia a datos reales sin tocar pantallas.

| Lecturas (Supabase + RLS) | Fuente |
|---|---|
| `useSession()` | `staff_members` + `point_assignments` del usuario |
| `useOrders(filtro)`, `useOrder(id)` | `orders` + `order_items` + `products` |
| `useOrderTrace(code)` | `v_order_trace` |
| `useAnalysis(orderId)` | `decision_logs` + `incidents` del pedido |
| `useInventory(locationCode)` | `v_inventory` |
| `useLots(productId)` | `v_lot_balances` |
| `useShipments(filtro)`, `useShipmentByQr(token)` | `shipments` + `shipment_items` |
| `useReplenishment(city?)` | `v_replenishment` |
| `useIncidents(filtro)` | `incidents` |
| `useLocations(scope)`, `useVehicles()`, `useRoutePlans()`, `useProducts()`, `usePurchases()` | tablas |

| Escrituras (`api.ts` → FastAPI) | Endpoint |
|---|---|
| `createOrder`, `analyzeOrder`, `decideOrder` | `/orders…` |
| `prepareOrder(id, {dryRun})`, `dispatchShipment`, `markDelivered`, `submitReceipt` | `/orders/{id}/prepare`, `/shipments/…` |
| `planRoutes`, `confirmRoutes`, `createCourier` | `/routes/…`, `/shipments/courier` |
| `askAssistant`, `resetDemo` | `/assistant`, `/admin/reset-demo` |

`VITE_USE_MOCKS=true` → los hooks devuelven `src/mocks/`. Tipos: `src/data/database.types.ts` (`supabase gen types`).

### C3 — Funciones SQL · `specs/000-contratos/funciones.md` (David + Omar, Fase 0)

FastAPI valida JWT, rol y punto, y luego llama **una** función. Cada función es una transacción: si algo falla, no queda nada a medias.

| Función (esquema `abastece`) | Archivo | La llama |
|---|---|---|
| `fn_crear_pedido(staff, location, cycle_month, order_type, related_order, reason, observations, items jsonb, idempotency_key)` | `09_fn_pedidos.sql` | `POST /orders` |
| `fn_analizar_reglas(order)` → `{duplicates, missing_kit}` + incidencias sin duplicar | `09_fn_pedidos.sql` | `POST /orders/{id}/analyze` |
| `fn_decidir_pedido(staff, order, decision, items jsonb, reason)` — `approve` \| `return` \| `cancel` | `09_fn_pedidos.sql` | `POST /orders/{id}/decision` |
| `fn_preparar(staff, order, items jsonb, dry_run)` — FEFO adentro | `10_fn_bodega.sql` | `POST /orders/{id}/prepare` |
| `fn_confirmar_ruta(staff, vehicle, dispatch_date, stops jsonb, km, minutes, method)` → crea plan, paradas y envíos | `11_fn_envios.sql` | `POST /routes/confirm` |
| `fn_envio_courier(staff, order, carrier, guide, promised_at)` | `11_fn_envios.sql` | `POST /shipments/courier` |
| `fn_despachar(staff, shipment)` | `11_fn_envios.sql` | `POST /shipments/{id}/dispatch` |
| `fn_marcar_entregado(staff, shipment)` | `11_fn_envios.sql` | `POST /shipments/{id}/delivered` |
| `fn_recibir(staff, shipment, items jsonb, notes)` | `11_fn_envios.sql` | `POST /shipments/{id}/receipt` |
| `12_reset_demo.sql` (TRUNCATE de las 27 tablas) + plantilla de re-vinculación | `12_reset_demo.sql` | `POST /admin/reset-demo` (corre este archivo + `03`) |

Reglas de todas las funciones:
- Devuelven `jsonb` con el resultado (lo que FastAPI responde tal cual).
- Errores con códigos propios que FastAPI traduce a HTTP: `P0403` → 403, `P0404` → 404, `P0409` → 409, `P0422` → 422 (`RAISE EXCEPTION USING ERRCODE='P0409', MESSAGE='…'`).
- Fechas nuevas = `demo_metadata.reference_at` (reloj de demo).
- Revisan rol, punto y estado **también** adentro (doble candado).
- **Cada archivo termina con `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`.** Si no, cualquiera con sesión podría llamarlas desde el navegador vía `/rpc` y saltarse FastAPI.

## 4. Fases

Horario Ecuador. Cada fase termina en una **integración**: todos mergean, reset, Omar corre el guion con las 7 cuentas.

### Fase 0 — Cimientos · Mié 14, 22:30 → 01:30

| Quién | Entrega | Hecho cuando |
|---|---|---|
| Todos | Herramientas, clonar repo, IA configurada, leer `AGENTS.md` + su hoja | Su IA responde "qué tarea tengo" correctamente |
| Omar | `gh` + `main` protegida, `openapi.yaml`, esqueleto FastAPI, cuentas OpenAI/TypeSafe/HeiGIT | `/health` OK; contrato mergeado |
| David | Supabase (01→03 + 07, 7 cuentas), `.env` por canal privado, `database.types.ts`, `funciones.md` con Omar, `verificar_funciones.mjs` vacío corriendo | Auxiliar ve 3 puntos desde el cliente |
| Jorge | Esqueleto Vite + React + TS + Tailwind, login real, layout por rol, banner | Las 7 cuentas entran y ven su menú |
| Bruno | `src/mocks/` desde `db/datos/*.csv`; prototipo de lector QR en el teléfono | Fixtures tipados; la cámara lee un QR |

### Fase 1 — Pedidos · Jue 15, 08:00 → 13:00 · **I#1**

| Quién | Entrega |
|---|---|
| Omar | `auth.py` + `/me`; endpoints `/orders`, `/analyze` (función + Jev SIMULADO + `decision_logs`), `/decision` |
| David | `09_fn_pedidos.sql` + pruebas; hooks de lectura reales y `api.ts` |
| Jorge | Crear pedido, mis pedidos, bandeja admin (alertas, evidencia lado a lado, propuesta Jev, decidir) |
| Bruno | Trazabilidad (6 etapas), inventario de bodega (INS-005) |

**I#1:** login 7 roles · PITCH 1, 2, 3 (SIMULADO) · PITCH 5 en pantalla.

### Fase 2 — Bodega, envíos y recepción · Jue 15, 14:00 → 18:00 · **I#2**

| Quién | Entrega |
|---|---|
| Omar | Endpoints de preparar, confirmar ruta, courier, despachar, entregar, recibir; solver OR-Tools + `/routes/plan` |
| David | `10_fn_bodega.sql`, `11_fn_envios.sql` (**`fn_confirmar_ruta` primero**) + pruebas de PITCH 4, 5, 7, 8, 9 |
| Jorge | Supervisor (marcar entregado), tablero, incidencias |
| Bruno | Preparación (vista previa FEFO), confirmar ruta mínima, despacho con QR, recepción móvil |

**I#2:** PITCH 4, 5, 7, 8 · preparar → confirmar → despachar un pedido nuevo.

### Fase 3 — Ciclo en vivo · Jue 15, 19:00 → 22:30 · **I#3 (puerta de los MUST)**

| Quién | Entrega |
|---|---|
| Omar | `/admin/reset-demo`; corre el ciclo PED-DEMO-001 dos veces; bugs con dueño |
| David | `12_reset_demo.sql`; arreglos en funciones; prueba local del ciclo completo |
| Jorge | Arreglos en pedidos/admin/tablero |
| Bruno | Recepción **en el teléfono** por IP LAN con HTTPS |

### Fase 4 — IA, rutas y pulido · Vie 16, 09:00 → 20:00 · **I#4 14:00 · Freeze 20:00**

| Quién | Entrega |
|---|---|
| Omar | Jev real, asistente (FTS + Luna + citas), pgvector y ORS si sobra tiempo |
| David | Función de escenario CONTINGENCIA (solo lectura, COULD); respaldo SIMULADO precargado |
| Jorge | Chat del asistente; pulido visual |
| Bruno | Mapa Leaflet, ruta precargada vs calculada, no asignados; courier retrasado |

### Fase 5 — Pitch · Sáb 17

**Omar presenta y vende la idea**; cada uno muestra su parte en 1–2 min durante la demo:

| Momento | Quién muestra | Qué |
|---|---|---|
| Apertura | Omar | Problema, solución, por qué la IA solo propone |
| Escenas 1–2 | Jorge | Duplicado 001/025, admin cancela 025 y aprueba 001 con INS-005 = 1, propuesta Jev |
| Escena 3 | Bruno | Bodega prepara; el lote vencido se salta solo |
| Escena 4 | Omar | Ruta OR-Tools vs ruta precargada |
| Escenas 5–6 | Bruno | Despacho y recepción **desde el teléfono** con faltante |
| Integridad | David | Trazabilidad de 6 etapas; por qué el stock no se puede inventar (reglas en la base); tablero que cambió |
| Cierre | Omar | Asistente citando DEMO-1.1; qué falta para producción |

Antes: 2 ensayos con reset. Respaldo: video del guion y resultados SIMULADO precargados.

## 5. Dependencias críticas

| Espera | Qué | De | Para cuándo | Mientras tanto |
|---|---|---|---|---|
| Todos | URL, publishable key, 7 cuentas | David | Mié 23:30 | Mocks |
| Bruno | Esqueleto y layout | Jorge | Mié 01:00 | Fixtures |
| Jorge, Bruno | Hooks reales | David | Jue 10:00 | `VITE_USE_MOCKS=true` |
| Omar | Funciones de pedidos | David | Jue 10:30 | Endpoints contra el contrato con datos fijos |
| Omar, Bruno | `fn_confirmar_ruta` | David | Jue 15:00 | — |
| Bruno (mapa) | `/routes/plan` | Omar | Jue 18:00 | Ruta precargada |
| Jorge (chat) | `/assistant` | Omar | Vie 12:00 | Respuesta de plantilla |

## 6. Ritmo del equipo

- **Sync de 10 min** a las 08:00, 13:00, 18:00 y 22:00: qué terminé, qué me bloquea, qué sigue.
- **Canal privado** para claves y bloqueos. Nunca claves en GitHub ni en el chat con la IA.
- **Ramas cortas, PR pequeños.** Revisión al menos 2 veces por fase; ningún PR espera más de 1 hora.
- **Integrador: Jorge.** Revisa cada PR (corre sus pruebas, no solo lee el diff) y lo mergea a `main` con squash. Si toca `db/` o `specs/000-contratos/`, espera también la revisión de Omar o David (CODEOWNERS).
- **Quien rompe `main`, lo arregla primero.**

## 7. Reglas para trabajar con IAs distintas

- `AGENTS.md` es la única fuente de reglas. Claude Code (Omar, Jorge) lo lee vía `CLAUDE.md`; Codex (David) y OpenCode (Bruno) lo leen directo. Si tu IA no lo carga, empieza con: *"Lee AGENTS.md y docs/equipo/<tu-nombre>.md"*.
- Una tarea por sesión de IA, con su ID (ej. `B-2.5`). La IA corre las pruebas antes de commitear.
- La IA **no** inventa endpoints, columnas ni datos: si algo no está en el contrato o en `db/`, se pregunta en el canal.
- No se usa Spec Kit: la spec maestra + las hojas por persona cumplen ese papel.

## 8. Definición de "hecho" (cada tarea)

1. Cumple su criterio en la hoja de la persona (y el `[PITCH-n]` si aplica).
2. Pruebas verdes: backend `uv run pytest && uv run ruff check .` · funciones SQL `node db/verificar_funciones.mjs` · frontend `npx tsc --noEmit && npm run build`.
3. Pantallas: banner DEMO FICTICIA, estados de carga/vacío/error, usable en 375 px si se usa en el teléfono.
4. PR con la plantilla, revisado y mergeado en `main`.

## 9. Pendiente de confirmar

| # | Qué | Estado |
|---|---|---|
| E1 | Usuarios de GitHub | ✅ en CODEOWNERS |
| E2 | Quién hace FastAPI | ✅ Omar; David hace la lógica en funciones SQL |
| E3 | IAs | ✅ Omar Claude Code · David Codex · Jorge Claude Code · Bruno OpenCode Go |
| E4 | Pitch | ✅ Omar presenta; cada uno muestra su parte (§4 Fase 5) |
| E5 | Ciclo en vivo PED-DEMO-001 y migración 07 | ✅ confirmados |
