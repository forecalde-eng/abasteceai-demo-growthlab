# Fase 0 · Despliegue de Supabase y respaldo restaurable — borrador para David

**Autor:** Jorge (`@JorgeRevelo23`, admin de Supabase). **Revisión:** David.
**Estado:** **borrador; no autoriza escrituras.** La Fase 0 se ejecuta solo
cuando David confirme este procedimiento (y su respaldo) tras revisarlo.

Complementa a `docs/equipo/jorge_desbloqueo.md` (§Fase 0), que fija el *qué*; este
documento fija el **cómo seguro**: orden, verificación, respaldo y vuelta atrás.

> **Regla de oro:** *primero el respaldo restaurable **verificado**, después
> cualquier escritura.* Supabase Free **no** tiene copias automáticas: el respaldo
> es del equipo. La **fuente de verdad** del dataset es el SQL del repo
> (`db/01…09.sql`); el `pg_dump` es el respaldo puntual (*point-in-time*) y su
> valor es poder **volver** a un estado conocido sin re-ejecutar todo.

---

## 0. Alcance y principios

- **Objetivo:** dejar `abastece` vivo en Supabase (esquema + datos ficticios + 7
  cuentas Auth + llaves) con evidencia de aceptación **3 / 24 / 703**.
- **Fuera de alcance:** `09_fn_pedidos.sql` (Fase 1) y `10`/`11`/`12` (Fase 2–3).
- **Orden de carga:** `01 → 02 → 07 → 03 → 08`. `04`/`06` verifican; `05`
  (pgvector) es opcional y **se omite**.
- **Idempotencia:** si el esquema ya existe **con datos**, no se re-ejecutan
  `01…03`; se aplica solo lo que falte (ver §1).
- **Secretos:** contraseñas y `DATABASE_URL` **solo** por canal privado y en
  `backend/.env`. Nunca en el repo, PR, chat, logs ni capturas. Todo `VITE_*`
  termina en el navegador.
- **Fecha de negocio:** el dataset usa `demo_metadata.reference_at`
  (**2026-10-10 22:00 UTC**); **nunca `now()`**. Respaldo y verificación no
  dependen del reloj real.

## 1. Preflight — mirar antes de escribir (sin cambios)

1. **Confirma el proyecto esperado** (evita ejecutar contra el proyecto
   equivocado): en el dashboard, la URL debe contener el *project ref* acordado
   (`ylwrzbxlpdmcvqwgnwtb`). Anótalo en la evidencia.
2. **¿Hay algo ya aplicado?** En *SQL Editor*:

   ```sql
   select to_regnamespace('abastece') is not null as esquema_existe;
   select count(*) as locations from abastece.locations;          -- esperado 703
   select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'abastece.decision_logs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%';            -- debe incluir 'openai'
   ```

   - Si `esquema_existe = false` → base **vacía**: se aplica todo en orden (§3).
   - Si existe y `locations = 703` → ya está cargada: **no** re-ejecutes `01…03`;
     salta a verificar (§6) y aplica solo lo que falte (p. ej. `08` si el `CHECK`
     aún no incluye `openai`).
3. **Espacio:** ejecuta `db/06_control_espacio.sql`. Objetivo propio del equipo
   < 100 MB; Free incluye 500 MB. El dataset de la demo es de **~13 MB**.

## 2. Respaldo restaurable **antes** de tocar nada

### 2.1 Tomar el respaldo

Con el **Session pooler (5432, `sslmode=require`)** de *Connect* (no la conexión
directa). El `DATABASE_URL` completo vive solo en `backend/.env`; **nunca** se
imprime ni se pega en el PR.

```powershell
# PowerShell. $env:DATABASE_URL se lee de backend/.env (o se teclea sin eco).
pg_dump $env:DATABASE_URL --schema=abastece --format=custom --no-owner `
  --file="respaldos\abastece_ANTES_<YYYYMMDD-HHMM>.dump"
pg_dump $env:DATABASE_URL --schema=abastece --format=plain --no-owner `
  --file="respaldos\abastece_ANTES_<YYYYMMDD-HHMM>.sql"
```

- Guarda los ficheros **fuera del repo** (carpeta `respaldos/`, ignorada por git)
  y súbelos a un almacenamiento privado del equipo.
- `--schema=abastece` es deliberado: el respaldo restaurable es **nuestro** dato.
  El esquema `auth` es **gestionado por Supabase** y no se restaura desde el dump
  (ver §5.3).

### 2.2 Verificar que **restaura** (el *drill*)

Un respaldo sin *drill* no es un respaldo. Comprueba en un **Postgres desechable**
(local en Docker, o un segundo proyecto Free usado solo para la prueba):

```bash
createdb drill_fase0
pg_restore --dbname=drill_fase0 --no-owner --schema=abastece `
  "respaldos/abastece_ANTES_<...>.dump"
```

```sql
-- Debe coincidir con db/conteos_datos.json (27 tablas).
select 'locations' t, count(*) n from abastece.locations
union all select 'products',            count(*) from abastece.products
union all select 'orders',              count(*) from abastece.orders
union all select 'order_items',         count(*) from abastece.order_items
union all select 'stock_movements',     count(*) from abastece.stock_movements
union all select 'staff_members',       count(*) from abastece.staff_members
union all select 'replenishment_policies', count(*) from abastece.replenishment_policies
order by 1;
```

**Criterio de "restaurable verificado":** el `drill` arranca, las tablas se crean
y los conteos coinciden con `conteos_datos.json`. Se anota la fecha y el resultado
en la evidencia del PR/aviso a David.

> En base **vacía** el respaldo "antes" es trivial (no hay datos). Aun así se toma
> (prueba el canal y deja la línea base) y **el que importa** es el "después"
> (§6), que sí se *drillea*.

## 3. Despliegue (orden exacto, un archivo por vez)

Ejecuta cada archivo **completo** y en este orden, verificando tras cada paso:

| # | Archivo | Qué añade | Verificación inmediata |
|---|---|---|---|
| 1 | `db/01_esquema.sql` | esquema `abastece` + 27 tablas + RLS activo | `select count(*) from information_schema.tables where table_schema='abastece';` → **27** |
| 2 | `db/02_reglas_y_accesos.sql` | políticas RLS, roles/permisos | todas las tablas con RLS activo (§4) |
| 3 | `db/07_integridad_preseed.sql` | FKs compuestas y guardas previas al seed | sin error |
| 4 | `db/03_datos_ficticios.sql` | dataset ficticio (26 pedidos, 703 puntos, 7523 movimientos…) | §6 cuadra con `conteos_datos.json` |
| 5 | `db/08_proveedor_openai.sql` | amplía el `CHECK` de `decision_logs.provider` con `openai` | §1.2 devuelve `openai` |

Detalle de integridad del preseed: `db/07_REVISION.md`.

## 4. Exponer el esquema `abastece` — **solo** con RLS verificado

Antes de exponer, confirma que **ninguna** tabla queda sin RLS:

```sql
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'abastece' and c.relkind = 'r' and not c.relrowsecurity;
-- Debe devolver 0 filas.
```

Solo entonces: *Project Settings → Data API → Exposed schemas* → agregar
`abastece`. Si alguna tabla no tuviera RLS, **no se expone** y se avisa.

## 5. Cuentas Auth (7) y vínculo

### 5.1 Crear/confirmar las 7 cuentas

Emails y roles en `specs/000-contratos/roles.md` (los `@abasteceai.example`):
`auxiliar`, `supervisor`, `administrador`, `bodega`, `logistica`, `compras`,
`gerencia`. Opción A: la herramienta de #95 (D-0.3) en cuanto esté fusionada.
Opción B: *Authentication → Users → Add user* (con *Auto confirm*) ×7.

### 5.2 Vincular

```sql
update abastece.staff_members s set auth_user_id = u.id
from auth.users u where lower(u.email) = lower(s.demo_email);

select demo_email, role, auth_user_id is not null as vinculada
from abastece.staff_members;   -- las 7 en true
```

### 5.3 Sobre el respaldo de las cuentas

Las contraseñas se generan y se pasan **solo por canal privado**. Las cuentas
Auth **no** forman parte del respaldo restaurable (§2.1): si hubiera que rehacer
la base, se **re-crean** las 7 cuentas y se **re-vinculan** con el `UPDATE` de
§5.2 (idempotente por email). Es el mismo camino que usará `12_reset_demo.sql`.

## 6. Aceptación y respaldo **después**

### 6.1 Aceptación (desde el cliente, con la *publishable* key, no la secret)

- `auxiliar` ve **3** puntos · `supervisor` **24** · `administrador` **703**.
- Sin sesión, `abastece.*` **no** devuelve filas.
- Conteos de `abastece` coinciden con `db/conteos_datos.json`.

### 6.2 Respaldo "después" + *drill*

Repite §2.1 con `..._DESPUES_<...>` y repite el *drill* de §2.2. **Este** es el
respaldo que da valor: permite volver al estado cargado y verificado sin rehacer
la carga. `main` y Supabase deben quedar describiendo exactamente el mismo estado.

## 7. Vuelta atrás (rollback)

- **Si un paso falla a mitad:** para la carga, anota el archivo y el punto, y
  decide entre (a) corregir y re-aplicar desde el paso fallido, o (b) **restaurar
  el respaldo "antes"** y reintentar limpio. Una carga parcial no se "arregla"
  adivinando.
- **Si la base queda inconsistente:** *Project Settings → Database → Reset* (o
  vaciar el esquema `abastece`) y **re-aplicar `01→02→07→03→08`** (la fuente de
  verdad del repo siempre reconstruye el dataset).
- **Nada destructivo se ejecuta sin el respaldo "antes" ya verificado.**

## 8. Qué **no** hacer

- No ejecutar `01…03` dos veces sobre datos.
- No exponer `abastece` sin el chequeo de RLS de §4.
- No poner contraseñas ni la *secret key* en ningún `VITE_*` ni en `.env` del
  frontend.
- No usar `now()`; el dataset es de `demo_metadata.reference_at`.
- No cargar `09…12` en Fase 0.

## 9. Evidencia (para el "revisemos juntos")

- [ ] Preflight: ref del proyecto confirmado + estado inicial anotado
- [ ] Respaldo **antes** tomado y ***drill* OK** (conteos = `conteos_datos.json`)
- [ ] Carga `01 → 02 → 07 → 03 → 08` verificada paso a paso (27 tablas, `openai`)
- [ ] RLS: 0 tablas sin RLS → `abastece` expuesto
- [ ] 7 cuentas creadas y vinculadas (`vinculada = true` ×7)
- [ ] Aceptación **3 / 24 / 703** desde el cliente
- [ ] Respaldo **después** tomado y ***drill* OK**
- [ ] Llaves entregadas por canal privado (URL + publishable → frontend; secret +
      `DATABASE_URL` → backend; contraseñas → canal privado)
