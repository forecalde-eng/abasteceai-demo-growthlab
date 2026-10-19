# Integración logística local · DEMO FICTICIA

## Alcance y fuentes

Revisión sobre `main` **7f2e6f8ee767da0bcbdd61ddb09670ec645fe9d9**.
Este PR solo contiene pruebas, el manifiesto de fuentes y este informe. No cambia
funciones, migraciones ni contratos; no ejecuta SQL remoto ni mezcla ramas.

| Pieza | Estado comprobado | Versión / dependencia |
|---|---|---|
| `fn_preparar` | En main, #131 fusionado | `db/10_fn_bodega.sql`; parciales y total acumulado; advisory `(17391011,5)` |
| `fn_confirmar_ruta` | En main, #127 + #130 fusionados | `db/11_fn_envios.sql`; vehículo/fecha y sequence; advisory `(17391011,4)` |
| `fn_despachar` | En main, #139 fusionado | Archivo 11; agrupación por ítem/lote, auditoría de reservas y parejas BOD/TRA |
| `fn_envio_courier` | #158 abierto, listo para revisión | Commit `6db5620d43a534a40dcc530491231d101112e04b`; solo se añade a la base efímera |
| `reservation_id` | **No existe migración integrada** | #135, Draft, commit `10a3d4c3d4b249fece67e553e416f00ef6d7c71c`; prototipo B no cargado |
| Conciliación 003/006 | #134 abierto, listo para revisión; con hallazgos | Commit `764cebafd5df927d01ac1f8a6a01df1e437e4904`; script 13 opcional, solo local |
| Reset que conserva conciliación | #153 abierto, Draft | Commit `df65ff8648208c7bdcd6de73ae7cb27256fb50e8`; integrar coordinado con #134, no es requisito del runner |

Los estados anteriores son una fotografía de GitHub al preparar este informe;
no representan despliegue remoto. Los hashes completos de los SQL ejecutados
están en `pruebas/logistica_fuentes.json`.

**Decisión vigente de trazabilidad:** [Omar en #135](https://github.com/forecalde-eng/abasteceai-demo-growthlab/pull/135#issuecomment-6235727887)
eligió A: no añadir DDL, agrupar reservas del mismo ítem/lote en una línea y una
pareja de movimientos, conservar sus UUID en la auditoría. #139 ya implementó
esa decisión. El prototipo B propone una pareja por reserva, incluso al compartir
línea: tiene cardinalidad distinta y no es una dependencia pendiente del despacho
actual. No debe convertirse en migración ni integrarse como requisito de este flujo.

## Cómo reproducir sin Supabase

Requiere Node.js y PGlite **0.5.10**. No usa `.env`, `DATABASE_URL`, claves,
credenciales, fetch ni servicios externos. Auth se sustituye únicamente en memoria
por su tabla mínima y `auth.uid()`; estas pruebas no verifican login real ni RLS
con sesiones reales. Cada escenario crea y cierra su propia base.

Instalar PGlite en una carpeta temporal y copiar allí **db completo**, como
variante de las instrucciones del README. Ejemplo Bash desde la raíz:

```bash
test_dir="$(mktemp -d)"
cp -R db "$test_dir/db"
npm install --prefix "$test_dir" --ignore-scripts --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.10
node "$test_dir/db/verificar_logistica_integracion.mjs"
node "$test_dir/db/verificar_logistica_integracion.mjs" --reverse
```

Para probar los PR pendientes se necesitan sus objetos Git, sin checkout, merge,
cherry-pick ni copia de SQL al PR de pruebas:

```bash
git fetch origin pull/158/head:refs/remotes/origin/pr-158-logistica pull/134/head:refs/remotes/origin/pr-134-logistica
```

Exportar con Node, conservando exactamente los bytes también en Windows (evitar
redirecciones PowerShell que cambien la codificación):

```bash
node -e "const f=require('node:fs'),p=require('node:path'),o=require('node:os'),c=require('node:child_process'); const d=p.join(o.tmpdir(),'abastece-logistica-fuentes');f.mkdirSync(d,{recursive:true});for(const [n,s] of [['courier.sql','6db5620d43a534a40dcc530491231d101112e04b:db/11_fn_envios.sql'],['reconcile.sql','764cebafd5df927d01ac1f8a6a01df1e437e4904:db/13_reconciliar_preparacion_demo.sql']]){const file=p.join(d,n);f.writeFileSync(file,c.execFileSync('git',['show',s]));console.log(file)}"
```

Usar las dos rutas impresas en los siguientes comandos; no son secretos:

```bash
node "$test_dir/db/verificar_logistica_integracion.mjs" --courier-sql /ruta/temporal/courier.sql
node "$test_dir/db/verificar_logistica_integracion.mjs" --courier-sql /ruta/temporal/courier.sql --reverse
node "$test_dir/db/verificar_logistica_integracion.mjs" --courier-sql /ruta/temporal/courier.sql --reconcile-sql /ruta/temporal/reconcile.sql
node "$test_dir/db/verificar_logistica_integracion.mjs" --courier-sql /ruta/temporal/courier.sql --reconcile-sql /ruta/temporal/reconcile.sql --reverse
```

El runner comprueba **todos los hashes antes de crear una base**. Del archivo
11 externo extrae solo `fn_envio_courier`, su GRANT y su REVOKE; no sustituye otras
funciones de main. El 13 externo se ejecuta sin cambios dentro de la base efímera.
Si cambian las fuentes, debe revisarse y actualizarse el manifiesto: no hay
descarga automática ni fallback a SQL inventado. Sin una fuente opcional, sus
casos aparecen como omitidos con su bloqueo explícito.

## Escenarios e invariantes

14 escenarios independientes por perfil. Se ejecutan en orden normal e inverso.
Los fixtures usan una copia local de un producto real del seed con SKU de prueba,
lotes y existencias **sintéticos y exclusivos de la base efímera**. El pedido se
crea y aprueba mediante las funciones reales; no se fuerzan estados `ready` ni
se fabrican reservas para hacer pasar el despacho. El pitch usa los datos
originales de PED-DEMO-001. Ningún fixture modifica `03_datos_ficticios.sql`.

- Parcial por falta de stock, dry_run sin modificar las 27 tablas ni secuencias,
  repetición sin nuevos efectos, existencia local adicional explícita y reanudación
  por diferencia. Dos reservas legítimas del mismo lote producen una línea y una pareja.
- Preparación completa FEFO desde dos lotes, excluyendo el vencido; ruta propia
  y courier, `created` sin líneas/movimientos y luego `dispatched` / `shipped`.
- Todas las reservas se cumplen una sola vez. Cada UUID auditado corresponde al
  ítem, producto y lote de la línea; su suma SQL exacta coincide con `shipped_qty`.
- Cada línea tiene dos movimientos `dispatch`, BOD negativo y TRA positivo,
  mismo `transfer_group`, producto y lote, suma cero y fecha `reference_at`.
  Se comprueban saldos físicos, reservas activas y todos los saldos históricos.
- Reintento de despacho sin filas ni auditorías nuevas, conservación de auditorías
  anteriores, exclusión ruta/courier y ruta con dos envíos despachados por separado.
- Error de auditoría en preparación, error en entrada TRA y error de auditoría de
  despacho: igualdad de los snapshots de las 27 tablas, Auth local y secuencias.
  Tras retirar el fallo inyectado la operación puede completarse.
- Rechazo del lote reservado que vence antes de despachar; comprobación de 003/006
  antes y después de conciliación y segunda conciliación sin efectos.

## Hallazgos y correcciones recomendadas

### Bloqueante para courier general: #158 convierte guías arbitrarias a numeric

Una guía válida de OpenAPI, **`G-1`**, provoca `22P02` en el UNION del correlativo.
El cast de `split_part(p_guide, '-', 3)::numeric` puede evaluarse como constante
antes de su WHERE. La prueba end-to-end lo encontró también con una guía UUID.
La transacción revierte y no deja envío parcial, pero el alta válida falla.

La cadena courier sí puede probarse con `GUIA-DEMO-1001`, entrada válida cuyo
segmento es numérico. **Ese éxito no implica que #158 esté libre de errores.**
Corregir en su rama mediante una conversión protegida dentro de CASE/IF, junto
con casos de guía sin prefijo, con guiones y con texto alfanumérico. Este PR
no cambia la implementación ni el contrato de guide_code.

### Bloqueante para conciliar saldos corruptos: NaN en #134

La regresión inserta un saldo local `NaN` en INS-001 y exige P0409 sin efectos.
La versión fijada de #134 acepta ese saldo y crea reservas: reproduce el
[hallazgo abierto](https://github.com/forecalde-eng/abasteceai-demo-growthlab/pull/134#discussion_r4304923889).
El CHECK original admite NaN; comparaciones normales no lo excluyen.
Añadir una comprobación explícita de finitud antes de cualquier escritura en
el PR de conciliación, sin editar aquí migraciones originales.

Las dos regresiones anteriores están marcadas **TODO**, no aprobadas ni
silenciadas como éxitos. El resumen distingue passed, skipped y todo; un exit
code 0 con TODO **no certifica** la corrección de esos PR. Mantener Draft y
repetir con versiones corregidas y sus hashes revisados antes de retirar TODO.

### Efecto funcional de #134 sobre el pitch

La semilla original tiene 9.377 filas. La conciliación deja 9.395 (+16 reservas,
+2 auditorías), 003 en preparing con 46 preparadas/reservadas y 006 en ready
con 63. Consume la última unidad disponible de INS-005: al aprobar PED-DEMO-001
con INS-005=1, fn_preparar obtiene **0**, devuelve preparing y la ruta no puede
confirmarse. No es un error de FEFO. Jorge/Omar deben acordar suministro real
registrado o ajustar el guion; no inventar stock ni alterar cantidades para
ocultarlo. #134 y #153 deben integrarse coordinados para que reset no deshaga
la corrección. Este runner no ejecuta reset ni valida el backend de #153.

### Límite del diseño A

La prueba confirma que el esquema permite al servidor insertar un movimiento
con el mismo producto y lote distinto al shipment_item. No existe reservation_id,
ni FK compuesta movimiento/lote/línea, ni garantía de pareja BOD/TRA para toda
escritura directa. **Las funciones probadas sí conservan esas correspondencias**
y la auditoría identifica las reservas agregadas. La protección depende de que
las escrituras operativas pasen por funciones autorizadas. No debe interpretarse
como una garantía relacional global; una evolución a B requiere acuerdo aparte.

## Concurrencia pendiente en PostgreSQL con dos conexiones

PGlite y el orden inverso demuestran aislamiento entre escenarios y reintentos
secuenciales; **no** prueban carreras reales, esperas ni ausencia de deadlocks.

Bloqueos actuales observados:

- Preparar: pedido FOR UPDATE → advisory 5 → hash ubicación/lote por FEFO;
  los triggers repiten ese hash. Dry_run no adquiere estos bloqueos de escritura.
- Confirmar ruta/courier: advisory 4 → vehículo FOR SHARE (solo propia) → pedidos
  FOR UPDATE. Ambos tipos de alta deben compartir el bloqueo 4.
- Despachar: pedido FOR UPDATE → envío FOR UPDATE → advisory 5 → ruta FOR UPDATE
  (own) → ítems/reservas ordenados por UUID → lotes FOR SHARE por UUID → hashes
  BOD/TRA ordenados. Cumple reservas antes de consumir stock reservado.

| Carrera futura A / B | Intercalado y resultado que verificar |
|---|---|
| Preparar / preparar, mismo pedido | A retiene el pedido; B espera y relee; sin reservas ni auditoría duplicadas |
| Preparar / preparar, pedidos y lote compartidos | A retiene advisory 5; B recalcula disponible tras esperar; stock y reservas válidos |
| Preparar / confirmar | A retiene pedido; confirmar espera y vuelve a comprobar ready; nunca planifica parcial |
| Ruta / courier, mismo pedido | A retiene advisory 4; un alta y un P0409, sin envío huérfano |
| Rutas con vehículo/fecha comunes | Un plan, el otro P0409; sin paradas/envíos del perdedor |
| Despachar / despachar, mismo envío | Un ledger y una auditoría; el segundo devuelve el estado actual |
| Despachar / preparar, mismo pedido | Espera de pedido; tras despacho preparar rechaza shipped; sin nuevas reservas |
| Dos envíos de una ruta | Estados individuales correctos; ruta dispatched tras el primero; sin deadlock |
| Escritor de stock externo / despacho | Retener hash ubicación/lote; despacho relee saldo y rechaza si falta respaldo |
| Cambio de vencimiento / despacho | Retener fila de lote; despacho valida la fecha finalmente bloqueada |

Usar barreras explícitas, lock_timeout y statement_timeout, ensayar ambos órdenes
de commit/rollback y verificar tablas después de cada carrera. No sustituir estas
pruebas por Promise.all en una sola conexión. Solo en PostgreSQL **local desechable**,
sin DATABASE_URL de Supabase; no ejecutadas en este trabajo.

## Resultados

Ejecutado con Node.js v24.19.0 y PGlite 0.5.10. Cada fila se ejecutó tanto en
orden normal como inverso, obteniendo el mismo resumen:

| Perfil | Aprobadas | Omitidas por fuente ausente | Regresiones TODO reproducidas |
|---|---:|---:|---:|
| Main, sin PR pendientes | 10 | 4 | 0 |
| Main + courier #158 | 12 | 1 | 1: guía alfanumérica |
| Main + courier #158 + conciliación #134 | 12 | 0 | 2: guía y NaN |

Son **14 escenarios por perfil**, no 14 éxitos en los perfiles con TODO. No hay
fallos adicionales. Las regresiones TODO son errores reales, deliberadamente
pendientes de corrección en sus ramas; no se deben retirar al aprobar este PR.

El control negativo de fuente alterada devuelve error SHA-256 **antes de crear
la base**, sin iniciar escenarios. No se usó el SQL alterado en ninguna prueba.

Suites existentes sobre main sin overlays: funciones **160/160**, integridad
**29/29** y base **61/61**. `git diff --check` limpio. No se prueba ni se modifica
el backend de #153. Ningún PR de implementación se modifica ni fusiona y las
llamadas remotas a la base de datos son **0**.
