# AbasteceAI — Plan del equipo por roles y fases

> Versión 1.0 · 14-oct-2026 · **Reemplaza el reparto A/B/C/D** de `00-handoffs/02_PLAN_EQUIPO_SDD.md` y de `05_PLAN_IMPLEMENTACION.md §4`.
> Qué se construye: `04_SPEC_MAESTRA.md`. Decisiones técnicas (D1–D12) y riesgos: `05_PLAN_IMPLEMENTACION.md`.
> Hoja de tareas de cada uno: `docs/equipo/<nombre>.md`. **Cada persona le da a su IA `AGENTS.md` + su hoja.**

---

## 1. El equipo

| Persona (GitHub) | Rol | IA / IDE | Es dueño de |
|---|---|---|---|
| **Omar** `@forecalde-eng` | Líder · APIs externas · auth · IA/RAG · rutas | Claude Code · [IDE a elección] | Contrato API, verificación de JWT y permisos, Jev, asistente + RAG (texto y pgvector), OR-Tools/ORS, integración y merges a `main` |
| **David** `@Dawid878` | Backend y base de datos | [IA a elección] · VS Code/Antigravity | Supabase (proyecto, cuentas, migraciones), FastAPI (esqueleto y endpoints de escritura), transacciones, capa de datos del frontend (`frontend/src/data/`) |
| **Jorge** `@JorgeRevelo23` | Frontend: shell y flujo de pedidos | Claude Code · VS Code/Antigravity | Esqueleto web, login, layout por rol, sistema visual, pedidos, bandeja admin, supervisor, tablero, incidencias, chat |
| **Bruno** `@bruno7890` | Frontend: operación y logística | OpenCode Go · VS Code/Antigravity | Bodega, inventario, despacho, recepción móvil QR, trazabilidad, mapa y rutas, courier |

**Por qué este corte:** cada uno toca carpetas distintas, así casi no hay conflictos de merge. Las fronteras entre personas son **tres contratos** (§3) que se fijan en la Fase 0 y no cambian sin avisar.

## 2. Mapa de carpetas y dueños

```
AGENTS.md, CLAUDE.md, docs/, specs/000-contratos/    → Omar
db/ (migraciones nuevas 07+)                         → David (Omar revisa)
backend/
├── app/main.py, db.py, clock.py, errors.py          → David
├── app/routers/orders.py, warehouse.py,
│   shipments.py, admin.py                           → David
├── app/rules/ (duplicado, kit, FEFO)                → David
├── app/auth.py                                      → Omar
├── app/ai/ (jev.py, assistant.py, rag.py)           → Omar
├── app/routing/ (vrptw.py, matrix.py)               → Omar
├── app/routers/ai.py, routes.py (/routes/plan)      → Omar
│   (/routes/confirm vive en shipments.py: David)
└── tests/                                           → cada uno, junto a su código
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

Tocar una carpeta ajena = PR pequeño mencionando al dueño. Está en `.github/CODEOWNERS`: GitHub pide revisión al dueño automáticamente.

## 3. Los tres contratos (la frontera entre personas)

### C1 — API REST · `specs/000-contratos/openapi.yaml` (Omar + David, Fase 0)

Los 13 endpoints de la spec §8, más:
- `GET /me` → `{ staff_id, full_name, role, point_ids[] }` (Omar)
- `POST /orders/{id}/prepare?dry_run=true` → plan de lotes FEFO sin escribir (David): la UI de bodega lo muestra antes de confirmar.
- `POST /admin/reset-demo` (David)

Congelado al merge. Cambiarlo = PR a `specs/000-contratos/` aprobado por Omar **antes** del código.

### C2 — Capa de datos del frontend · `frontend/src/data/` (David, Fase 0–1)

Los componentes **nunca** llaman a Supabase ni a `fetch` directo: usan estos hooks (React Query). Así Jorge y Bruno trabajan con mocks desde el minuto uno y David cambia a datos reales sin tocar las pantallas.

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
| `useLocations(scope)`, `useVehicles()`, `useRoutePlans()`, `useProducts()` | tablas |
| `usePurchases()` | `purchase_orders` + ítems |

| Escrituras (FastAPI, `api.ts`) | Endpoint |
|---|---|
| `createOrder`, `analyzeOrder`, `decideOrder` | `/orders…` |
| `prepareOrder(id, {dryRun})`, `dispatchShipment`, `markDelivered`, `submitReceipt` | `/orders/{id}/prepare`, `/shipments/…` |
| `planRoutes`, `confirmRoutes`, `createCourier` | `/routes/…`, `/shipments/courier` |
| `askAssistant`, `resetDemo` | `/assistant`, `/admin/reset-demo` |

`VITE_USE_MOCKS=true` → los hooks devuelven `src/mocks/`. Tipos: `src/data/database.types.ts` generado con `supabase gen types`.

### C3 — Funciones internas del backend (Omar → David)

```python
# app/auth.py  (Omar)
get_current_staff() -> Staff          # Depends(): valida JWT, lee staff_members + point_assignments
require_role(*roles) -> Depends       # 403 si el rol no está
ensure_point(staff, location_id)      # 403 si el punto no está asignado (roles con alcance)

# app/ai/jev.py  (Omar)
classify_notes(conn, order_snapshot: dict) -> Proposal   # SIMULADO o API_REAL; escribe decision_logs
```

Hasta que Omar los entregue (Jue 09:00), David usa stubs con la misma firma (`STAFF_DEV` por header `X-Dev-Staff` **solo** si `APP_ENV=dev`).

## 4. Fases

Horario Ecuador. Cada fase termina en una **integración**: todos mergean, `reset-demo`, Omar corre el guion con las 7 cuentas.

### Fase 0 — Cimientos · Mié 14, 22:30 → 01:30

| Quién | Entrega | Hecho cuando |
|---|---|---|
| Todos | Herramientas, clonar repo, IA configurada, leer `AGENTS.md` + su hoja | Su IA responde "qué tarea tengo" correctamente |
| Omar | `openapi.yaml`, `AGENTS.md` final, proteger `main`, cuentas OpenAI/TypeSafe/HeiGIT | Contrato mergeado |
| David | Supabase listo (01→03 + 07, 7 cuentas vinculadas), `.env` compartidos por canal privado, `database.types.ts`, esqueleto FastAPI | Auxiliar ve 3 puntos desde el cliente; `/health` OK |
| Jorge | Esqueleto Vite + React + TS + Tailwind, router, login real, layout por rol, banner DEMO FICTICIA | Las 7 cuentas entran y ven su menú |
| Bruno | `src/mocks/` desde `db/datos/*.csv` (pedidos, ítems, inventario, envíos, puntos, productos, reposición) | Fixtures tipados con `database.types.ts` |

### Fase 1 — Pedidos de punta a punta · Jue 15, 08:00 → 13:00 · **Integración I#1**

| Quién | Entrega |
|---|---|
| Omar | `auth.py` real + `GET /me`; `classify_notes` SIMULADO con `decision_logs` |
| David | Hooks de lectura reales; `POST /orders`, `/analyze` (reglas duplicado/kit + `classify_notes`), `/decision` |
| Jorge | Crear pedido, mis pedidos, bandeja admin (alertas, evidencia lado a lado, propuesta Jev, aprobar/devolver/cancelar) |
| Bruno | Trazabilidad (6 etapas), inventario de bodega (INS-005: físico/reservado/disponible + compra pendiente) |

**I#1 debe correr:** login 7 roles · PITCH 1, 2, 3 (con SIMULADO) · PITCH 5 en pantalla.

### Fase 2 — Bodega, envíos y recepción · Jue 15, 14:00 → 18:00 · **Integración I#2**

| Quién | Entrega |
|---|---|
| Omar | Solver OR-Tools (`routing/`) + `POST /routes/plan` con haversine |
| David | `prepare` (+`dry_run`), `routes/confirm` (crea envíos), `dispatch`, `delivered`, `receipt`, `shipments/courier` |
| Jorge | Pantalla supervisor (marcar entregado), tablero de cobertura (`v_replenishment`), incidencias |
| Bruno | Preparación por lote (vista previa FEFO → confirmar), despacho con etiqueta QR, recepción móvil (cámara + tipeo de guía) |

**I#2 debe correr:** PITCH 4, 5, 7, 8 (precargados) · preparar → confirmar ruta mínima → despachar un pedido nuevo.

### Fase 3 — Ciclo en vivo · Jue 15, 19:00 → 22:30 · **Integración I#3 (puerta MUST)**

| Quién | Entrega |
|---|---|
| Omar | Corre el ciclo en vivo (spec §6.2) 2 veces con reset; lista de bugs con dueño |
| David | `reset-demo`; tests `test_pitch_*` de su parte; arreglos de transacciones |
| Jorge | Pulido de pedidos/admin/tablero según bugs de I#3 |
| Bruno | Recepción probada **en el teléfono** por IP LAN con HTTPS; pulido de bodega |

**I#3 debe correr:** todos los MUST + ciclo PED-DEMO-001 completo. Si algo falla, el viernes a la mañana es solo para eso.

### Fase 4 — IA, rutas y pulido · Vie 16 (evento), 09:00 → 20:00 · **I#4 14:00 · Freeze 20:00**

| Quién | Entrega |
|---|---|
| Omar | Jev real (switch), asistente con FTS + Luna + citas, pgvector + embeddings (si sobra), ORS (si sobra) |
| David | Endpoint `scenarios/run` en memoria (COULD), endurecer errores y logs |
| Jorge | Chat del asistente con fuentes y etiqueta; pulido visual general |
| Bruno | Mapa Leaflet: 700 puntos, RUTA-DEMO-2 vs calculada, no asignados, confirmar; courier retrasado |

**I#4 debe correr:** PITCH 3 (API_REAL), 6, 9, 10.

### Fase 5 — Pitch · Sáb 17

| Quién | Entrega |
|---|---|
| Omar | Guion y narración; 2 ensayos con reset; decide qué se muestra en vivo vs precargado |
| David | Respaldo: resultados SIMULADO precargados para todo paso con red; video del guion completo |
| Jorge + Bruno | Operan las pantallas en el ensayo (laptop + teléfono); solo arreglan bugs |

## 5. Dependencias críticas (quién espera a quién)

| Espera | Qué | De | Para cuándo | Mientras tanto |
|---|---|---|---|---|
| Jorge, Bruno | URL + publishable key + 7 cuentas | David | Mié 23:30 | Mocks |
| Bruno | Esqueleto y layout | Jorge | Mié 01:00 | Fixtures en `src/mocks/` |
| Jorge, Bruno | Hooks reales | David | Jue 10:00 | `VITE_USE_MOCKS=true` |
| David | `get_current_staff`, `classify_notes` | Omar | Jue 09:00 | Stubs con la misma firma |
| David (despacho) | Envíos creados | David (`routes/confirm`) | Jue 15:00 | — |
| Bruno (mapa) | `POST /routes/plan` | Omar | Jue 18:00 | Ruta precargada |
| Jorge (chat) | `POST /assistant` | Omar | Vie 12:00 | Respuesta de plantilla |

## 6. Ritmo del equipo

- **Sync de 10 min** a las 08:00, 13:00, 18:00 y 22:00: qué terminé, qué me bloquea, qué sigue.
- **Un canal privado** (WhatsApp/Discord) para claves y bloqueos. Nunca claves en GitHub ni en el chat con la IA.
- **Ramas cortas, PR pequeños.** Revisión de PRs al menos 2 veces por fase; ningún PR espera más de 1 hora.
- **Quien rompe `main`, lo arregla primero.**

## 7. Reglas para trabajar con IAs distintas

- `AGENTS.md` es la única fuente de reglas. Claude Code lo lee vía `CLAUDE.md`; OpenCode lo lee directo. Si tu IDE o IA no lo carga solo, empieza cada sesión con: *"Lee AGENTS.md y docs/equipo/<tu-nombre>.md"*.
- Una tarea por sesión de IA, con su ID (ej. `B-2.3`). Pide a la IA que corra las pruebas antes de commitear.
- La IA **no** inventa endpoints, columnas ni datos: si algo no está en el contrato o en `db/`, se pregunta en el canal.
- No se usa Spec Kit: la spec maestra + las hojas por persona cumplen ese papel y evitan configurar dos agentes distintos.

## 8. Definición de "hecho" (cada tarea)

1. Cumple su criterio en la hoja de la persona (y el `[PITCH-n]` si aplica).
2. Pruebas verdes: backend `uv run pytest && uv run ruff check .` · frontend `npx tsc --noEmit && npm run build`.
3. Pantallas: banner DEMO FICTICIA, estados de carga/vacío/error, usable en 375 px si la usa el teléfono.
4. PR con la plantilla, revisado y mergeado en `main`.

## 9. Pendiente de confirmar

| # | Qué | Quién |
|---|---|---|
| E1 | ~~Usuarios de GitHub~~ ✅ en CODEOWNERS (14-oct) | — |
| E2 | ¿David trabaja cómodo en **Python/FastAPI**? Si no, conviene decidirlo hoy | David |
| E3 | IA de David y de Omar si no es Claude | David, Omar |
| E4 | ¿Quién presenta el pitch y quién opera el teléfono? | Equipo |
| E5 | Ciclo en vivo con PED-DEMO-001 y migración 07 (Q7, Q8 de la spec) | Omar |
