# David — Base de datos

> IA: **Codex** (lee `AGENTS.md` sola). IDE: VS Code o Antigravity.
> Lee primero: `AGENTS.md`, `docs/04_SPEC_MAESTRA.md` (§5 F1–F3, §7), `docs/06_PLAN_EQUIPO.md` (§3 C2 y **C3**), `db/01_esquema.sql` y `db/02_reglas_y_accesos.sql` completos.
> Ramas: `back/david/<tarea>` (ej. `back/david/fn-despachar`).

## Tu misión

Que cada acción del flujo **escriba bien en la base**, como una función SQL que corre completa o no corre. Y que el frontend lea la base sin pensar en Supabase (`frontend/src/data/`).

Omar (FastAPI) valida el token, el rol y el punto, y llama a tu función. Tú haces el trabajo de verdad: revisar estado, mover stock, auditar.

## Lo que ya te da la base (no lo reprogrames)

- Triggers: historial inmutable, sin stock negativo, no consumir lo reservado, no reservar vencidos ni más de lo aprobado, envío ≤ preparado, recepción ≤ enviado.
- Vistas: `v_inventory`, `v_lot_balances`, `v_order_trace`, `v_replenishment`.
- SQL de duplicado y kit en `db/04_consultas_demo.sql`: reúsalo en `fn_analizar_reglas`.

## Reglas para tus funciones

- **Reloj de demo:** toda fecha nueva = `(select reference_at from abastece.demo_metadata where id)` (+ segundos crecientes si necesitas orden). Nunca `now()`: las vistas ignoran lo posterior.
- **Despacho:** primero reservas → `fulfilled`, **después** los movimientos. Si no, `check_stock_balance` lo rechaza.
- `SELECT … FOR UPDATE` sobre el pedido/envío al empezar.
- Revisa rol, punto y estado también adentro (doble candado con FastAPI). Lee el rol de `staff_members` con el `staff` que te pasan.
- Errores: `RAISE EXCEPTION USING ERRCODE='P0409', MESSAGE='…'` (`P0403`, `P0404`, `P0409`, `P0422`).
- Devuelve `jsonb` con el resultado.
- `SET search_path = ''` y nombres con esquema (`abastece.orders`), como las funciones de `02`.
- **Termina cada archivo con** `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon, authenticated;`. Si no, se pueden llamar desde el navegador y saltarse FastAPI.
- No tocar `db/01…06`. Lo nuevo va en `db/07+`.

## Cómo pruebas (sin Supabase)

`db/verificar_funciones.mjs`, con el mismo patrón que `verificar_postgres.mjs`: PGlite en memoria, carga `01`, `02`, `03` y tus `07+`, y prueba cada caso. Corre en segundos y en CI.

```js
// ejemplo de caso
await reject('Admin no aprueba su propio pedido', `select abastece.fn_decidir_pedido(...)`);
await check('PED-DEMO-005 faltan 2', `select shortage_qty value from abastece.v_order_trace where ...`, 2);
```

## Tareas

### Fase 0 — Mié noche

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-0.1 | `db/07_proveedor_openai.sql`: agrega `openai` al CHECK de `decision_logs.provider` | Prueba local: insertar `provider='openai'` pasa |
| D-0.2 | Proyecto Supabase Free. SQL Editor: `01` → `02` → `03` → `07`. Exponer `abastece` en Data API | `select count(*) from abastece.locations` = 703 |
| D-0.3 | 7 usuarios Auth (`*@abasteceai.example`, confirmados) y vincular `auth_user_id` | Auxiliar ve 3 puntos, supervisor 24, admin 703 **desde el cliente** |
| D-0.4 | Pasar por el canal privado: `SUPABASE_URL`, publishable key, secret key, `DATABASE_URL` (pooler, modo sesión), contraseñas de las 7 cuentas | Los 4 tienen su `.env` |
| D-0.5 | `supabase gen types typescript` → `frontend/src/data/database.types.ts` | En `main` |
| D-0.6 | `specs/000-contratos/funciones.md` con Omar: firma exacta, `jsonb` de entrada y salida, errores de cada función de C3 | Mergeado = congelado |
| D-0.7 | `db/verificar_funciones.mjs` corriendo (todavía sin casos) | `node db/verificar_funciones.mjs` OK |

### Fase 1 — Jue 08:00–13:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-1.1 | `08_fn_pedidos.sql`: `fn_crear_pedido` | Punto ajeno → P0403; misma clave → mismo pedido; adicional sin motivo → P0422 |
| D-1.2 | `fn_analizar_reglas` | 001/025 duplicado; 002 → INS-016; segunda llamada no duplica incidencias |
| D-1.3 | `fn_decidir_pedido` | P0409 fuera de `submitted`; P0403 pedido propio; P0422 sin motivo; `audit_events` escrito |
| D-1.4 | `frontend/src/data/`: cliente Supabase (`schema: 'abastece'`), React Query, hooks de C2, modo mocks | Jorge y Bruno ponen `VITE_USE_MOCKS=false` y sus pantallas siguen funcionando |
| D-1.5 | `api.ts`: escrituras con JWT y `Idempotency-Key` en `/orders` | Llamadas tipadas para los 13 endpoints |

### Fase 2 — Jue 14:00–18:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-2.1 | `10_fn_envios.sql`: **`fn_confirmar_ruta` primero** | Crea plan, paradas y envío `created` con `qr_token` y `guide_code` |
| D-2.2 | `09_fn_bodega.sql`: `fn_preparar` con FEFO y `dry_run` | Nunca elige DEMO-002-VENC; diferencia → `preparing` + incidencia; `dry_run` no escribe |
| D-2.3 | `fn_despachar` | Segunda llamada no repite movimientos; BOD −qty y TRA +qty con el mismo `transfer_group` |
| D-2.4 | `fn_marcar_entregado` | Stock del punto sin cambio |
| D-2.5 | `fn_recibir` | Aceptadas → punto; dañadas → CUA-DEMO; faltantes quedan en TRA + incidencia; segunda recepción → P0409 |
| D-2.6 | `fn_envio_courier` | Envío courier con fecha prometida |

### Fase 3 — Jue 19:00–22:30

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-3.1 | `11_reset_demo.sql` (TRUNCATE de las 27 tablas) + plantilla de re-vinculación de las 7 cuentas | Omar lo usa en `/admin/reset-demo` |
| D-3.2 | Ciclo PED-DEMO-001 completo en `verificar_funciones.mjs` | Las 6 escenas de la spec §6.2 pasan en local |
| D-3.3 | Arreglos de I#3 | — |

### Fase 4 — Vie

| ID | Tarea | Hecho cuando |
|---|---|---|
| D-4.1 | `fn_escenario_demanda(factor)` solo lectura (CONTINGENCIA, COULD) | Devuelve `recommended_qty` con demanda ×1,2, sin escribir |
| D-4.2 | Respaldo: resultados SIMULADO precargados para pasos con red | Pitch corre con APIs apagadas |

### Fase 5 — Sáb (pitch)

Muestras **integridad**: la trazabilidad de 6 etapas de PED-DEMO-005, por qué el stock no se puede inventar (las reglas viven en la base) y cómo cambió el tablero tras el ciclo en vivo. 1–2 min.

## Prompt de arranque para Codex

```text
Lee AGENTS.md, docs/04_SPEC_MAESTRA.md, docs/06_PLAN_EQUIPO.md (sobre todo §3 C3)
y docs/equipo/david.md. Lee también completos db/01_esquema.sql y db/02_reglas_y_accesos.sql.
Vamos a hacer la tarea D-0.1. Antes de escribir código dime qué archivos vas a crear.
No modifiques db/01…06. Usa el reloj de demo para toda fecha nueva.
Prueba con `node db/verificar_funciones.mjs` antes de commitear.
```
