# Jorge · Plan de desbloqueo (tickets de David) · DEMO FICTICIA

**Para:** Jorge (`@JorgeRevelo23`, admin de Supabase con `jrevelouemee@gmail.com`).
**De:** Omar. **Por qué:** David no se puede conectar y Supabase, las cuentas Auth, las llaves y las funciones SQL frenan a todo el equipo.
**Alcance:** solo lo que más traba. Lo demás de David queda pendiente hasta que aparezca.

## Reparto mientras David no está

| Quién | Qué |
|---|---|
| **Jorge** | Supabase (SQL, Auth, llaves) · funciones SQL `db/09…12` y su prueba local · mergear sus PRs y los de todos (squash) |
| **Omar (su cuenta + Claude)** | FastAPI en `backend/`: O-1.1 (JWT/roles/`GET /me`), `POST /routes/plan`, O-1.2, O-1.4, O-2.x |
| **Bruno** | Frontend de operaciones (B-2.5 recepción móvil, courier, mapa) |
| **David** | Pendiente. Si aparece, retoma desde el checklist del final; no repetir lo hecho |

## Antes de empezar

1. Lee `AGENTS.md`, `docs/06_PLAN_EQUIPO.md` (§3 C3 = tabla de funciones) y `docs/equipo/david.md` (los tickets D-x.x que vas a hacer).
2. Una tarea = una rama nueva desde `main` actualizado (`back/jorge/…`). **No encadenes PRs** (solo squash).
3. El borrador del contrato de funciones está en el PR de David [#93](https://github.com/forecalde-eng/abasteceai-demo-growthlab/pull/93) (`specs/000-contratos/funciones.md`, aún no en `main`). Las decisiones ya aceptadas están en la sección *Decisiones aceptadas* de abajo; si chocan con #93, **mandan estas**.
4. **Secretos:** nunca en el repo, chat, PR, logs ni capturas. Solo `backend/.env` y `frontend/.env.local` (en `.gitignore`), entregados por canal privado.

---

## FASE 0 · Supabase vivo (D-0.2, D-0.3, D-0.4) — lo más urgente

### 0.1 Revisar qué hay ya aplicado
En *SQL Editor*:

```sql
select count(*) from abastece.locations;   -- esperado 703
select pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'abastece.decision_logs'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%provider%';   -- debe incluir 'openai'
```
Si el esquema no existe, no se ha aplicado nada. Si ya hay datos, **no re-ejecutes** `01…03`; aplica solo lo que falte.

### 0.2 Aplicar en este orden exacto (archivo completo, uno por uno)
`db/01_esquema.sql` → `db/02_reglas_y_accesos.sql` → `db/07_integridad_preseed.sql` → `db/03_datos_ficticios.sql` → `db/08_proveedor_openai.sql`.
(`04`/`06` son verificación; `05` pgvector es opcional y se omite.) Detalle: `db/07_REVISION.md`.

### 0.3 Exponer el esquema (solo con RLS verificado)
*Project Settings → Data API → Exposed schemas* → agregar `abastece`. Antes confirma que todas las tablas tienen RLS activo (lo hace `02`). Si alguna no, no expongas.

### 0.4 Crear las 7 cuentas Auth (D-0.3)
Emails y roles: `specs/000-contratos/roles.md` (`auxiliar`, `supervisor`, `administrador`, `bodega`, `logistica`, `compras`, `gerencia` `@abasteceai.example`), **confirmadas**.

- Opción A: la herramienta de David en la rama `back/david/d-0.3-provision-auth` (PR #95), si corre en tu sistema.
- Opción B: *Authentication → Users → Add user* (con *Auto confirm*) ×7, y luego vincular:

```sql
update abastece.staff_members s set auth_user_id = u.id
from auth.users u where lower(u.email) = lower(s.demo_email);

select demo_email, role, auth_user_id is not null as vinculada from abastece.staff_members;  -- las 7 en true
```
Las contraseñas las generas tú y las pasas **solo por canal privado**.

### 0.5 Aceptación (desde el cliente, con la publishable key, no la secret)
- auxiliar ve **3** puntos (Q-001, Q-005, Q-008) · supervisor **24** · administrador **703**.
- Sin sesión, `abastece.*` no devuelve filas.

### 0.6 Entregar llaves (D-0.4), por canal privado
| Variable | Va a | Dónde se saca |
|---|---|---|
| URL del proyecto + publishable key | `frontend/.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_USE_MOCKS=false`) | Settings → API |
| `SUPABASE_SECRET_KEY` | solo `backend/.env` | idem |
| `DATABASE_URL` | solo `backend/.env` | Connect → **Session pooler (5432)**, `sslmode=require` |
| contraseñas de las 7 cuentas | canal privado | las que creaste |

Variables exactas: `backend/.env.example` y `db/config_frontend.env.example`.

**Hecho cuando:** 0.1–0.6 completos y el frontend con `VITE_USE_MOCKS=false` carga `/pedidos` con sesión real. Sin cambios en el repo no hay PR; basta avisar a Omar y Bruno.

---

## FASE 1 · `db/09_fn_pedidos.sql` (D-1.1, D-1.2, D-1.3)

Desbloquea crear, analizar y aprobar pedidos reales. Firmas en `docs/06_PLAN_EQUIPO.md §3 C3`. Todas en esquema `abastece`, `SECURITY DEFINER`, `SET search_path = abastece, pg_temp`, y **cada función termina con**
`REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon, authenticated;` (solo las llama el backend).

| Función | Qué hace | Casos de prueba obligatorios |
|---|---|---|
| `fn_crear_pedido(...)` | Crea pedido `submitted`, código `PED-DEMO-NNN` (siguiente hoy: 027) bajo `pg_advisory_xact_lock`. Idempotente por clave | punto ajeno → P0403 · misma clave+actor+cuerpo → mismo pedido (`created=false`) · clave de otro actor → P0404 · adicional sin motivo/relacionado → P0422 |
| `fn_analizar_reglas(p_staff uuid, p_order uuid, p_proposal jsonb)` | Reglas + registra la propuesta de IA; devuelve el `AnalysisResult` completo en **una** llamada | PED-DEMO-001/025 → `possible_duplicate` (sev. alta) · 002 → INS-016 `missing_from_kit` (media) · segunda llamada **no duplica** incidencias |
| `fn_decidir_pedido(...)` | `approve` / `return` / `cancel` | fuera de `submitted` → P0409 · pedido propio → P0403 · devolver/cancelar sin motivo → P0422 · escribe `audit_events` |

### Decisiones aceptadas (no las reinventes)
- **Errores:** `P0403` prohibido, `P0404` no existe, `P0409` estado/conflicto, `P0422` validación. En P0422 el `DETAIL` es JSON `{field, index?, product_id?, message?}`.
- **Fechas de negocio:** `demo_metadata.reference_at` (2026‑10‑10 22:00 UTC), **nunca `now()`**.
- **Crear:** devuelve el pedido + `created` (el backend lo quita: 201 vs 200). Las reglas de *adicional* (el relacionado existe, mismo punto y ciclo; *regular* con `related_order`/`reason` → P0422) viven **solo dentro** de `fn_crear_pedido`: el seed PED-DEMO-025 es regular con motivo/vínculo y no debe romperse.
- **Analizar:** en pedido que no está `submitted` → 200 con arreglos vacíos, sin llamar a Jev, sin 409. La `proposal` es siempre el log de IA (`mock`/`typesafe`), nunca el de `rules`. Si Jev falló: `provider='typesafe'`, `status='human_review'`, `response {"error":"timeout"}` (no es un 502).
- **Incidencias:** "abiertas" = `open|under_review`; dedupe por `(order_id, kind)`; códigos `INC-NNN` siguiendo el 008.
- **Decidir:** sin `items` → aprobado = solicitado; lista parcial → el resto = solicitado; aprobado > solicitado → P0422. El motivo se audita en `audit_events.after_state {decision, reason, items}`; **no** toques `orders.reason` ni `decision_logs.status`.

### Prueba y entrega
1. Local, sin Supabase: añade los casos a `db/verificar_funciones.mjs` y corre `node db/verificar_funciones.mjs` (PGlite). Debe pasar completo.
2. Ejecuta `09_fn_pedidos.sql` en el SQL Editor y repite 2–3 casos a mano.
3. PR → merge (ver abajo) → avisa a Omar: el backend (`POST /orders`, `analyze`, `decision`) entra ya.

---

## FASE 2 · Bodega y envíos (D-2.x) — después de la fase 1

**`db/11_fn_envios.sql`, primero `fn_confirmar_ruta`** (desbloquea a Bruno: plan `approved`, paradas y envío `created` con `qr_token` y `guide_code`). Luego `db/10_fn_bodega.sql` y el resto de `11`.

| Función | Reglas clave |
|---|---|
| `fn_preparar(…, dry_run)` | FEFO; **nunca** el lote `DEMO-002-VENC`; diferencia → pedido `preparing` + incidencia `packing_difference`; `dry_run` no escribe |
| `fn_despachar` | Idempotente; BOD −qty y TRA +qty con el **mismo** `transfer_group`; reserva → `fulfilled` |
| `fn_marcar_entregado` | El stock del punto **no cambia** |
| `fn_recibir` | Aceptadas → punto; dañadas → CUA-DEMO; faltantes quedan en TRA + incidencia `receipt_shortage`; segunda recepción → P0409 |
| `fn_envio_courier` | Envío courier con fecha prometida |

Transversales: `stock_movements` inmutable (corregir = movimiento compensatorio); despacho y recepción en **una transacción** idempotente; reservar reduce el disponible, no el físico; lotes vencidos no se reservan. Transiciones válidas: `specs/000-contratos/estados.md`; cualquier otra → P0409.

Después: `db/12_reset_demo.sql` (D-3.1): TRUNCATE de las 27 tablas + plantilla de re-vinculación de las 7 cuentas. Lo usa Omar en `/admin/reset-demo`.

---

## Cómo mergear (lo haces tú)

1. PR por tarea con la plantilla; commits pequeños en español. `Parte de #N` si el ticket queda a medias; `Closes #N` solo si queda completo.
2. Cambios en `db/` o `specs/000-contratos/` necesitan además a Omar o David (CODEOWNERS). Con David ausente, **Omar aprueba**. Pídeselo por el PR.
3. Corre `node db/verificar_funciones.mjs` antes de mergear.
4. **Squash** siempre (merge commit da 405). El siguiente PR parte de `main` actualizado.
5. El archivo SQL de `main` debe ser exactamente lo que ejecutaste en Supabase.

## Plan B
Si las fases 1–2 no llegan al pitch, la demo corre con mocks etiquetados **SIMULADO** (D-4.2). Lo mínimo vivo: Fase 0 (login real + datos), `fn_crear_pedido` y `fn_decidir_pedido`.

## Checklist (marca y avisa a Omar)
- [ ] 0.1 Estado revisado · [ ] 0.2 SQL aplicado (01→02→07→03→08) · [ ] 0.3 `abastece` expuesto
- [ ] 0.4 7 cuentas Auth vinculadas · [ ] 0.5 3/24/703 verificado · [ ] 0.6 llaves por canal privado
- [ ] 1 `09_fn_pedidos.sql` probado local y en Supabase, mergeado
- [ ] 2a `fn_confirmar_ruta` · [ ] 2b `10_fn_bodega.sql` · [ ] 2c resto de `11_fn_envios.sql` · [ ] 3 `12_reset_demo.sql`
