# D-2.3 · propuesta de trazabilidad de despacho (sin aprobación)

Este directorio contiene un **prototipo local**, no una migración numerada ni
autorizada para Supabase. No implementa `fn_despachar`. Jorge debe acordar la
creación de `shipment_items` y el estado de rutas; Omar debe revisar la
integración antes de convertirlo en una migración de despliegue.

## Modelo observado en main

`shipment_items` tiene `UNIQUE(shipment_id, order_item_id, lot_id)`. Una línea
puede representar la suma de varias reservas del mismo ítem y lote.
`inventory_reservations` no tiene unicidad por `(order_item_id, lot_id)`.
`stock_movements.shipment_item_id` apunta a la línea, pero no a la reserva;
su FK actual tampoco comprueba que el lote del movimiento sea el de la línea.
Los triggers actuales comprueban saldos y límites, pero no exigen dos
movimientos por `transfer_group`.

| Criterio | A: validar solo en `fn_despachar` | B: vínculo y restricciones incrementales |
|---|---|---|
| Integridad | Correcta si toda escritura usa la función; una consulta histórica no identifica la reserva concreta cuando se repite el ítem/lote. | `stock_movements.reservation_id` identifica cada reserva y una FK compuesta vincula el lote con la línea. Triggers e índices protegen cada pareja nueva vinculada. |
| Histórico | Sin cambios. | `reservation_id` nullable conserva las 128 filas `dispatch` de la semilla, que no tienen reservas cumplidas identificables. La FK compuesta se valida contra todas las filas históricas con línea. |
| Complejidad | Función más sencilla de desplegar; validaciones y auditoría extensas dentro de ella. | Una migración y triggers adicionales; la función debe escribir `reservation_id` en ambos movimientos. |
| Concurrencia | Depende por completo de bloqueos de la función y triggers existentes. | Además de esos bloqueos, índices únicos impiden despachar una reserva dos veces y compartir un grupo entre parejas nuevas. |
| FEFO y courier | La función debe conservar las reservas y lotes seleccionados previamente. | Igual: la migración no elige lotes ni depende de `route_id`; las pruebas cubren envíos own y courier. |
| Mantenimiento | Menos DDL, más invariantes implícitos. | Relación consultable y comprobable, con coste de dos índices y triggers por movimiento vinculado. |

**Recomendación:** B si la exigencia es reconstruir la cadena
reserva → línea → pareja BOD/TRA sin inferencias ambiguas. A sirve para
operar la demo con un backend de escritura estrictamente controlado, pero no
cumple esa exigencia de trazabilidad histórica ante dos reservas iguales.

## Invariantes del prototipo B

1. Una reserva `fulfilled` conserva `order_item_id`, producto, lote, cantidad y
   ubicación BOD-DEMO; una línea conserva el mismo ítem, producto y lote.
2. Cada reserva nueva vinculada produce exactamente dos movimientos
   `dispatch`, cada uno por la cantidad de la reserva: BOD-DEMO negativa y
   TRA-DEMO positiva, con iguales `reservation_id`, `shipment_item_id`, lote,
   producto y `transfer_group`. El control de pareja es diferido hasta el
   final de la transacción.
3. Cada reserva aparece como máximo una vez por ubicación; cada grupo aparece
   como máximo una vez por ubicación. La suma de reservas distintas vinculadas
   a una línea coincide con `shipped_qty` de esa línea.
4. Una reserva o línea ya referenciada por movimientos vinculados no se
   modifica ni elimina. `stock_movements` ya es inmutable por el trigger base.
5. `reservation_id IS NULL` preserva movimientos antiguos y permite reproducir
   `03_datos_ficticios.sql` tras un reset. **Límite deliberado:** la base no
   distingue una nueva inserción sin vínculo de una fila histórica; la futura
   `fn_despachar` debe exigir `reservation_id` no nulo en sus escrituras y sus
   pruebas. El rol servidor conserva acceso directo a la tabla.

El prototipo no demuestra que *todas* las líneas de un pedido hayan salido;
esa comprobación pertenece a la función de despacho. Tampoco decide qué
componente crea `shipment_items` ni cuándo cambia `route_plans.status`.

## Casos de cardinalidad

- Una reserva de un ítem/lote → una línea y una pareja.
- Dos reservas del mismo ítem/lote → **una** línea con cantidad agregada y
  **dos** parejas con grupos distintos; cada movimiento identifica su reserva.
- Un ítem preparado desde dos lotes → dos líneas, una por lote, y las parejas
  correspondientes; no se vuelve a seleccionar FEFO en el despacho.
- Un movimiento con lote diferente de la línea → rechazo por la nueva FK
  compuesta y el trigger, aun cuando el producto sea igual.
- Un reintento de la misma reserva → índice único; la función debe además
  bloquear el envío y devolver su estado sin intentar escribir.

## Precondiciones y despliegue eventual

El SQL exige las tablas base, BOD-DEMO y TRA-DEMO con sus tipos correctos,
ausencia de una columna `reservation_id` previa y ningún movimiento histórico
con lote o producto discordante respecto de su línea. Todo el archivo está en
una transacción; una precondición o validación fallida revierte el DDL. Debe
aplicarse **después** de `01 → 02 → 07 → 03`; los valores históricos NULL son
válidos. No se ha ejecutado remotamente.

Si Jorge y Omar aprueban el diseño, antes de asignar un número de migración
hay que comprobar main y los PR pendientes (#130, #131 y #134), revisar el
respaldo y el estado remoto, y pactar el orden de despliegue. La migración
tomará bloqueos `ALTER TABLE` y creará índices en `stock_movements`; en el
volumen demo esto es pequeño, pero requiere ventana de ejecución controlada.
El nuevo campo quedaría sujeto al permiso `SELECT` y RLS ya existentes sobre
`stock_movements`.

La futura `fn_despachar` tendrá que: bloquear pedido y envío, serializar con
la preparación real mediante el advisory lock `(17391011, 5)`, adquirir los
bloqueos por lote en orden estable, verificar todas las reservas, crear o
comprobar las líneas según el contrato acordado, cumplir reservas, insertar
parejas y registrar estados/auditoría en una transacción. Las pruebas reales
de dos conexiones PostgreSQL siguen pendientes; PGlite no las sustituye.

## Prueba local

Con Node.js y PGlite `0.5.10`, desde la raíz del repositorio:

```bash
mkdir -p /tmp/abastece-d23/db/prototipos
cp db/01_esquema.sql db/02_reglas_y_accesos.sql db/07_integridad_preseed.sql db/03_datos_ficticios.sql /tmp/abastece-d23/db/
cp db/prototipos/d23_trazabilidad_despacho.sql db/prototipos/verificar_d23_trazabilidad.mjs /tmp/abastece-d23/db/prototipos/
cd /tmp/abastece-d23
npm init -y
npm install --save-exact @electric-sql/pglite@0.5.10
node db/prototipos/verificar_d23_trazabilidad.mjs
```

El verificador solo crea bases PGlite en memoria y comprueba la semilla, las
cardinalidades, own y courier, rechazo de lotes discordantes, parejas
incompletas, duplicación, inmutabilidad, rollback y recarga de la semilla
con el prototipo instalado. Resultado local: `17/17`, sin llamadas remotas.
Las pruebas de concurrencia quedan para PostgreSQL
real después del acuerdo; no requieren ejecutar SQL en Supabase ahora.

## Decisiones pendientes

1. Quién crea `shipment_items` y si una línea agrega todas las reservas del
   mismo ítem/lote, tanto para own como para courier.
2. Si se aprueba la FK explícita y el control diferido de pareja, incluyendo
   la excepción histórica `reservation_id IS NULL`.
3. Cómo se actualiza una ruta cuando solo uno de sus envíos se despacha.
4. Si un lote vencido al momento del despacho debe producir `P0409`; el
   contrato actual fija FEFO en preparación, pero no esta transición.
