# D-2.2 — propuesta de conciliación de preparación (DEMO FICTICIA)

Este cambio es independiente de `fn_preparar` (#131) y de la semilla original. **El SQL no está autorizado para ejecución remota.** Antes de aplicarlo en Supabase hacen falta un respaldo restaurable verificado, autorización explícita y una inspección del estado actual del proyecto.

## Alcance y resultado esperado

| Pedido | Estado inicial | Aprobado | Preparado inicial | Reservado inicial | Estado final | Preparado/reservado final |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| PED-DEMO-003 | `preparing` | 63 | 47 | 0 | `preparing` | 46/46 |
| PED-DEMO-006 | `approved` | 63 | 0 | 63 en 16 reservas | `ready` | 63/63 |

Ambos pedidos tienen los mismos 16 SKU, INS-001…INS-016. La cantidad aprobada es 6 para INS-002, 006, 011, 012 y 015; es 3 para los otros 11. El 003 declara 5 o 2 preparadas, respectivamente, sin reservas. El 006 ya tiene una reserva activa por línea, en BOD-DEMO y el lote válido `DEMO-NNN-A`, por la cantidad aprobada.

INS-005 tiene 8 unidades físicas y 7 reservadas en BOD-DEMO al reloj de demo; solo queda 1 disponible. Por eso el 003 debe reducir su `prepared_qty` de INS-005 de 2 a 1. Las otras 15 cantidades preparadas se conservan y se respaldan con reservas. `INC-EMPAQUE` sigue abierta. No se crea ningún movimiento físico.

La primera ejecución crea 16 reservas activas y exactamente dos auditorías con `occurred_at = demo_metadata.reference_at`. Si el resto de la base sigue igual que la semilla aprobada, el total pasa de 9.377 a 9.395 filas. Una segunda ejecución valida el estado final y no escribe. Un estado parcial, una auditoría alterada, una reserva inesperada, un lote nuevo utilizable o stock insuficiente produce `P0409` y deja todos los cambios de esta sentencia sin aplicar.

## Bloqueos y transacción

`13_reconciliar_preparacion_demo.sql` contiene una sola sentencia `DO`. Toma los pedidos en orden de código, después el bloqueo global de preparación usado por `fn_preparar`, las reservas existentes, bloqueos breves de los catálogos de productos y lotes para impedir cambios durante el análisis, un bloqueo de auditoría para evitar marcas duplicadas, y el bloqueo advisory de cada lote con la clave usada por los triggers de inventario. Luego bloquea y comprueba las 32 líneas. Las escrituras empiezan solamente después de validar cantidades, reservas, lotes y stock. Una excepción revierte toda la sentencia. Los bloqueos de tabla pueden pausar escrituras concurrentes mientras dure la transacción.

Para un ensayo de lectura del **resultado propuesto** en una conexión PostgreSQL, una vez autorizada una conexión y confirmado el proyecto, se debe ejecutar el archivo dentro de `BEGIN ISOLATION LEVEL SERIALIZABLE`, consultar los recuentos en esa misma transacción y finalizar con `ROLLBACK`. Por ejemplo, desde la raíz del repositorio, sin poner credenciales en el comando ni en archivos:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN ISOLATION LEVEL SERIALIZABLE;
\i db/13_reconciliar_preparacion_demo.sql
SELECT o.code, o.status, sum(i.prepared_qty) AS prepared_qty
FROM abastece.orders o JOIN abastece.order_items i ON i.order_id=o.id
WHERE o.code IN ('PED-DEMO-003','PED-DEMO-006')
GROUP BY o.code,o.status ORDER BY o.code;
ROLLBACK;
SQL
```

El ensayo local automatizado de `node db/verificar_13_reconciliacion.mjs` usa PGlite y también termina en `ROLLBACK`. Ese ensayo no sustituye la comprobación remota previa, el respaldo ni una prueba de concurrencia con dos conexiones PostgreSQL reales.

La ejecución definitiva requerirá un procedimiento aprobado aparte: identificar inequívocamente el proyecto, comprobar la base y el historial de migraciones, verificar el respaldo restaurable, comparar las 32 líneas y el inventario con las precondiciones de este archivo, ejecutar una sola transacción con `ON_ERROR_STOP`, y verificar el resultado antes de aceptar el commit. Ante una discrepancia o un error de serialización, detenerse e inspeccionar el estado; no reintentar automáticamente.

## Revisión previa a integración

La repetición verifica la ubicación, producto y lote de **todas** las reservas esperadas de los pedidos 003 y 006. Se añadió una regresión: después de conciliar, mover una reserva de INS-001 del 003 a C-003, que tiene stock suficiente, es válido para los triggers generales pero invalida esta conciliación. Una nueva ejecución debe rechazarlo con P0409 sin escribir. Antes de corregir la validación, esa prueba detectó que solo se verificaban las reservas del 006.

Integrar este archivo en main no autoriza su ejecución ni confirma el estado remoto. Se mantienen las condiciones de respaldo restaurable, inspección y autorización separada antes de aplicar la conciliación.

Verificación local sobre main `f4cb2cd`: conciliación **10/10**, funciones **160/160**, integridad **29/29** y base **61/61**; diff --check limpio. Solo bases PGlite desechables; ninguna llamada a Supabase.

### Bloqueo de integración con reset-demo

Codex señaló que el reinicio actual ejecuta 12 → 03 → re-vincular, valida 9.377 filas y desharía esta conciliación. Conservarla en cada reinicio requeriría acordar la inclusión de 13 y verificar el estado final de 9.395 filas (16 reservas y 2 auditorías adicionales), además de mantener 703 ubicaciones y las vinculaciones Auth. Este PR no modifica el backend ni autoriza ejecutar 13. El usuario autorizó corregir ese reinicio a 9.395 filas sin ejecutarlo en Supabase. La implementación y sus pruebas se preparan en un PR separado del backend; deben integrarse junto a esta corrección antes de activar el procedimiento.

La validación idempotente de ambas auditorías exige ahora occurred_at exactamente igual a reference_at, no cualquier fecha anterior. Dos pruebas simulan corrupción de una copia local para rechazar fechas alteradas sin escrituras.

Última validación específica: **12/12**, incluidas las dos fechas de auditoría alteradas. El ensayo combinado con el reinicio nuevo pasa **161/161** pruebas de funciones en PGlite, sin llamadas remotas.
