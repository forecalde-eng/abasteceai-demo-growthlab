# Bruno — Frontend: operación, recepción móvil y logística

> IA: **OpenCode Go** (lee `AGENTS.md` sola). IDE: VS Code o Antigravity.
> Lee primero: `AGENTS.md`, `docs/04_SPEC_MAESTRA.md` (§5 F2, F3, §6), `docs/06_PLAN_EQUIPO.md` (§2, §3 C2), **`docs/07_GUIA_DISENO.md` (colores, patrones de pantalla, móvil y mapa)**.
> Ramas: `front/bruno/<tarea>`.

## Tu misión

Que se **vea** la trazabilidad física: qué hay en bodega, qué se preparó, qué salió, qué llegó y qué falta. Y la pantalla más vistosa del pitch: la recepción con QR desde el teléfono.

Montas tus pantallas sobre el layout de Jorge (`src/app/`) y usas sus componentes (`src/ui/`).

## Reglas que más te afectan

- Nunca llames a Supabase ni a `fetch` directo: usa los hooks de `src/data/`. Mientras no existan, `VITE_USE_MOCKS=true` con **tus** fixtures.
- La UI no calcula FEFO, saldos ni faltantes: los pide (`dry_run`, vistas) y los muestra.
- Recepción: el QR solo identifica el envío; si no hay sesión o el punto no es del usuario, mostrar el error del backend.
- Recepción y despacho: botón deshabilitado mientras la llamada está en curso. Igual, el backend ya es idempotente.

## Stack extra

`react-leaflet` (mapa), `html5-qrcode` (lector), `qrcode.react` (etiqueta) [Supuesto]. Teléfono: `npm run dev -- --host` con HTTPS (`@vitejs/plugin-basic-ssl`) para que abra la cámara.

## Tareas

### Fase 0 — Mié noche

| ID | Tarea | Hecho cuando |
|---|---|---|
| B-0.1 | `src/mocks/`: fixtures desde `db/datos/*.csv` (orders, order_items, products, locations detalladas + internas, v_inventory de BOD-DEMO, shipments, shipment_items, v_replenishment, incidents), tipados con `database.types.ts` | Los hooks de David en modo mock los devuelven |
| B-0.2 | Prototipo del lector QR en una página suelta, probado en tu teléfono | La cámara lee un QR de prueba |

### Fase 1 — Jue 08:00–13:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| B-1.1 | **Trazabilidad** (`TraceTimeline`): por ítem, solicitado → aprobado → preparado → enviado → contado → aceptado, con faltantes resaltados, desde `useOrderTrace` | PED-DEMO-005: INS-002 10 → 8, faltante 2 |
| B-1.2 | **Inventario de bodega**: por producto, físico / reservado / disponible / vencido, compras pendientes al lado | PITCH 5: INS-005 = 1 disponible + COMPRA-DEMO-001 pendiente |

### Fase 2 — Jue 14:00–18:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| B-2.1 | **Cola de bodega**: pedidos `approved` y `preparing` | PED-DEMO-003 aparece en preparación con su diferencia |
| B-2.2 | **Preparar**: vista previa FEFO (`prepareOrder({dryRun:true})`), cantidades preparadas editables, confirmar | Lote vencido nunca propuesto; diferencia → queda `preparing` (PITCH 4) |
| B-2.3 | **Confirmar ruta mínima** (lista de pedidos `ready` + vehículo + orden) → `confirmRoutes` | Se crea el envío con guía y QR |
| B-2.4 | **Despacho**: envíos `created`, etiqueta con QR imprimible, botón despachar | Doble clic → un solo despacho |
| B-2.5 | **Recepción móvil**: escanear QR o tipear guía → ítems enviados → contado y aceptado por ítem → enviar | PITCH 8 en vivo desde el teléfono |

### Fase 3 — Jue 19:00–22:30

| ID | Tarea | Hecho cuando |
|---|---|---|
| B-3.1 | Recepción en el teléfono por IP LAN + HTTPS, con la cuenta auxiliar | Ciclo en vivo cerrado desde el teléfono |
| B-3.2 | Arreglos de I#3 en tus pantallas | Sin tropiezos en bodega/despacho/recepción |

### Fase 4 — Vie

| ID | Tarea | Hecho cuando |
|---|---|---|
| B-4.1 | **Mapa** (Leaflet): 700 puntos como catálogo (gris), 24 detallados resaltados, BOD-DEMO | Se ve Quito, Guayaquil, Cuenca |
| B-4.2 | **Plan de rutas**: llamar `planRoutes`, dibujar RUTA-DEMO-2 (precargada) vs calculada, km "estimado haversine", lista de no asignados con motivo, botón confirmar (reutiliza B-2.3) | PITCH 6 |
| B-4.3 | **Courier**: envíos courier con fecha prometida y badge "retrasado" | PITCH 9: ENV-DEMO-008 a G-001 |

### Fase 5 — Sáb (pitch)

Muestras las **escenas 3, 5 y 6**: bodega prepara (el lote vencido se salta solo), despacho y recepción **desde el teléfono** con faltante. 2 min.

## Prompt de arranque para tu IA

```text
Lee AGENTS.md, docs/04_SPEC_MAESTRA.md, docs/06_PLAN_EQUIPO.md, docs/07_GUIA_DISENO.md y docs/equipo/bruno.md.
Vamos a hacer la tarea B-0.1. No llames a Supabase directo: todo pasa por frontend/src/data/.
Los datos salen de db/datos/*.csv; no inventes registros.
Antes de escribir código dime qué archivos vas a crear.
Corre `npx tsc --noEmit && npm run build` antes de commitear.
```
