# David — Backend y base de datos

> Lee primero: `AGENTS.md`, `docs/04_SPEC_MAESTRA.md` (§5 F1–F3, §7, §8), `docs/06_PLAN_EQUIPO.md` (§3 contratos).
> Ramas: `back/david/<tarea>` (ej. `back/david/dispatch`). PRs pequeños a `main`.

## Tu misión

Que cada acción del flujo **escriba bien en la base**: transaccional, idempotente, respetando rol, punto y estado. Y que el frontend lea la base sin pensar en Supabase (capa `frontend/src/data/`).

## Lo que ya te da la base (no lo reprogrames)

- Triggers: historial inmutable, sin stock negativo, no consumir lo reservado, no reservar vencidos ni más de lo aprobado, envío ≤ preparado, recepción ≤ enviado.
- Vistas: `v_inventory`, `v_lot_balances`, `v_order_trace`, `v_replenishment`.
- SQL de duplicado y kit en `db/04_consultas_demo.sql`.

## Reglas que más te afectan

- **Reloj de demo (I11):** toda fecha nueva = `demo_metadata.reference_at` (+ segundos crecientes). Nunca `now()`: las vistas ignoran lo posterior.
- **Despacho:** primero reservas → `fulfilled`, **después** los movimientos (el trigger `check_stock_balance` rechaza consumir stock reservado).
- `SELECT … FOR UPDATE` sobre pedido/envío al inicio de cada escritura.
- Errores con el formato uniforme de la spec §8.

## Tareas

### Fase 0 — Mié noche

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-0.1 | Proyecto Supabase Free. SQL Editor: `01` → `02` → `03` → `07_proveedor_openai.sql` (la escribes: agrega `openai` al CHECK de `decision_logs.provider`) | `select count(*) from abastece.locations` = 703 |
| D-0.2 | Exponer `abastece` en Data API. Crear 7 usuarios Auth (`*@abasteceai.example`, confirmados) y vincular `auth_user_id` | Auxiliar ve 3 puntos, supervisor 24, admin 703 **desde el cliente** |
| D-0.3 | Pasar por el canal privado: `SUPABASE_URL`, publishable key, secret key, `DATABASE_URL` (pooler, modo sesión), contraseñas de las 7 cuentas | Los 4 tienen su `.env` |
| D-0.4 | `supabase gen types typescript` → `frontend/src/data/database.types.ts` | Archivo en `main` |
| D-0.5 | Esqueleto backend: `uv`, FastAPI, `main.py`, `/health`, `db.py` (pool psycopg ≤ 5 + fixture `db_tx` con rollback), `clock.py`, `errors.py`, ruff + pytest | `uv run pytest` verde; `/health` responde |
| D-0.6 | Stubs de `get_current_staff` y `classify_notes` con la firma de C3 | Omar puede reemplazarlos sin tocar tus routers |

### Fase 1 — Jue 08:00–13:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-1.1 | `frontend/src/data/`: cliente Supabase (`schema: 'abastece'`), React Query, hooks de lectura de C2, modo mocks | Jorge y Bruno cambian `VITE_USE_MOCKS=false` y sus pantallas siguen funcionando |
| D-1.2 | `api.ts`: escrituras con JWT y `Idempotency-Key` en `/orders` | Llamadas tipadas para los 13 endpoints |
| D-1.3 | `rules/orders.py`: `find_duplicates`, `missing_kit_items` + unitarias | 001/025 duplicado; 002 → INS-016 |
| D-1.4 | `POST /orders` | Punto ajeno 403; misma clave → mismo pedido |
| D-1.5 | `POST /orders/{id}/analyze`: reglas + `classify_notes` + `incidents` sin duplicar | `test_pitch_1`, `test_pitch_2` |
| D-1.6 | `POST /orders/{id}/decision`: aprobar (con `approved_qty`), devolver, cancelar | 409 fuera de `submitted`; 403 autoaprobación; 422 sin motivo |

### Fase 2 — Jue 14:00–18:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-2.1 | `rules/stock.py`: FEFO sobre lotes usables | Nunca elige DEMO-002-VENC |
| D-2.2 | `POST /orders/{id}/prepare` (+`dry_run`) | `test_pitch_4`, `test_pitch_5` |
| D-2.3 | `POST /routes/confirm`: crea `route_plans`, `route_stops`, `shipments` `created` con `qr_token` y `guide_code` | Envío listo para despachar (**hazlo primero en la fase**) |
| D-2.4 | `POST /shipments/{id}/dispatch` | Doble llamada = un despacho; fallo inyectado = 0 movimientos |
| D-2.5 | `POST /shipments/{id}/delivered` | `test_pitch_7` |
| D-2.6 | `POST /shipments/{id}/receipt` | `test_pitch_8`; segundo intento 409 |
| D-2.7 | `POST /shipments/courier` + retraso calculado en SQL | `test_pitch_9` |

### Fase 3 — Jue 19:00–22:30

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-3.1 | `POST /admin/reset-demo` + script CLI: TRUNCATE → `03` → re-vincular las 7 cuentas | Guion → reset → guion idéntico |
| D-3.2 | Arreglos de I#3 | Ciclo PED-DEMO-001 completo sin errores |

### Fase 4 — Vie

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-4.1 | `POST /scenarios/run` CONTINGENCIA en memoria (COULD) | No escribe nada; devuelve cantidades ×1,2 |
| D-4.2 | Respaldo: casos SIMULADO precargados para pasos con red | Pitch corre con APIs apagadas |

## Prompt de arranque para tu IA

```text
Lee AGENTS.md, docs/04_SPEC_MAESTRA.md, docs/06_PLAN_EQUIPO.md y docs/equipo/david.md.
Lee también db/01_esquema.sql y db/02_reglas_y_accesos.sql completos.
Vamos a hacer la tarea D-0.5. Antes de escribir código dime qué archivos vas a crear.
Usa el reloj de demo (demo_metadata.reference_at) para toda fecha nueva.
Corre `uv run pytest && uv run ruff check .` antes de commitear.
```
