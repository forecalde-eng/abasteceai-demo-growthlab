# D-2.3 · despacho atómico de envíos

Parte de #35. Implementación basada en el [comentario de Omar en #135](https://github.com/forecalde-eng/abasteceai-demo-growthlab/pull/135#issuecomment-6235727887).
El PR #135 queda como referencia; su prototipo de cambios de esquema no se incorpora.
Jorge tiene pendiente confirmar las decisiones 2 (validación dentro de la función)
y 3 (la ruta cambia con el primer despacho). Este PR permanece en Draft para esa revisión.

## Contrato y alcance

`abastece.fn_despachar(p_staff uuid, p_shipment uuid) RETURNS jsonb`, en
`11_fn_envios.sql`. Respalda `POST /shipments/{id}/dispatch` y devuelve
`ShipmentResult`: `id`, `code`, `status`, `order_id`, `order_status`, `guide_code`.
No recibe cantidades ni lotes del cliente: conserva las reservas elegidas durante FEFO.

- Solo perfiles activos de bodega o logística; otro perfil produce `P0403`.
- Envío ausente: `P0404`. Repetir un envío `dispatched` devuelve el estado actual sin
  escribir. Los demás estados diferentes de `created` producen `P0409`.
- Un primer despacho exige pedido `ready`, cantidades preparadas iguales a las aprobadas,
  al menos una cantidad positiva y reservas activas de BOD-DEMO que coincidan exactamente
  por línea. Se rechazan reservas ya cumplidas, líneas de envío previas, varios envíos
  para un pedido y otros estados parciales; no se intenta corregirlos.
- Lotes vencidos: `P0409`; `expires_on IS NULL` o igual a la fecha del reloj de demo se
  consideran vigentes, igual que en preparación. La fecha prometida debe permitir
  `dispatched_at = reference_at`, como exige el CHECK existente.
- Una ruta propia debe estar `approved` o `dispatched` y tener una parada para el punto.
  El primer envío pasa la ruta a `dispatched`; los otros siguen `created` hasta que se
  despachen individualmente. No se establece `finished`. Courier no cambia rutas.

## Escrituras y trazabilidad

Todo ocurre en la transacción de la llamada SQL. Primero se cumplen las reservas
seleccionadas, después se crea una línea por `(order_item_id, lot_id)` que agrega sus
cantidades. Para cada línea se insertan dos movimientos `dispatch`: BOD-DEMO negativo
y TRA-DEMO positivo, iguales en cantidad, producto, lote, `shipment_item_id` y
`transfer_group`. No se modifica el stock del punto ni se crean recepciones.

Envío y pedido pasan a `dispatched` / `shipped`. Un evento `shipment_dispatch` conserva
los estados anteriores y posteriores y, para cada línea, sus UUID de reservas y
`transfer_group`. Fecha del envío, movimientos y auditoría usan
`demo_metadata.reference_at`. No se usan cantidades float ni secuencias nuevas.

No se agrega una FK o columna a `stock_movements`: esta es la opción A de Omar. La
auditoría permite relacionar las reservas agregadas con cada línea nueva. Los datos
históricos se conservan. Las restricciones existentes no garantizan por sí solas la
correspondencia entre lote del movimiento y línea, ni una pareja por grupo: esta
implementación la construye y la verifica con pruebas. El rol de servidor sigue
pudiendo saltarse estas reglas mediante escrituras directas; debe utilizar la función.

## Bloqueos

Orden de adquisición:

1. Leer el pedido del envío; bloquear pedido y luego envío, revalidando la asociación.
2. Advisory `(17391011, 5)`, compartido con `fn_preparar` después del bloqueo del pedido.
3. Ruta propia; ítems y reservas del pedido por UUID; lotes por UUID con `FOR SHARE`.
4. Advisory de BOD/TRA por lote, ordenados por el valor de
   `hashtextextended(location_id::text || lot_id::text, 0)`, igual al usado por los triggers.
5. Revalidar físico respecto de todas las reservas activas del lote antes de consumir.

La función no pide el bloqueo de confirmación de rutas `(17391011, 4)`; no crea rutas
ni requiere pedidos de otros envíos. `fn_confirmar_ruta` puede terminar o esperar el
pedido sin que despacho espere ese advisory. Preparación y despacho usan el mismo orden
pedido → advisory de inventario. Todos los bloqueos duran hasta el fin de la transacción.

`SECURITY INVOKER`, `search_path = ''`, EXECUTE solo para `service_role`; revocado a
PUBLIC, anon y authenticated. No cambia RLS ni Auth.

## Pruebas y límites

`verificar_funciones.mjs` carga 01 → 02 → 07 → 03 → 08 → 09 → 10 → 11 en PGlite.
Desde la raíz, con Node.js y npm, se puede reproducir sin conectar Supabase:

```bash
mkdir -p /tmp/abastece-d23
cp db/*.sql db/verificar_*.mjs db/jev_respuesta_SIMULADA.json /tmp/abastece-d23/
cd /tmp/abastece-d23
npm init -y
npm install --save-exact @electric-sql/pglite@0.5.10
node verificar_funciones.mjs
node verificar_07_integridad.mjs
node verificar_postgres.mjs
```

Incluye permisos reales de `service_role`, los siete roles, estados, reservas faltantes,
reservas repetidas, cantidades decimales, dos lotes, courier, ruta con dos envíos,
caducidad, stock inconsistente simulado, correspondencia de movimientos y rollback
por fallo de entrada TRA o auditoría. También cubre decidir → preparar → confirmar →
despachar PED-DEMO-001 y reintento sin duplicación.

Las simulaciones de datos corruptos deshabilitan triggers únicamente en la base
PGlite local; la función no deshabilita ningún trigger. PGlite tiene una conexión;
las llamadas encoladas no demuestran una carrera real.

Resultado local de esta entrega: funciones **109/109** (20 casos de despacho más
su contenedora incluidos), integridad **29/29**, base **61/61** y `git diff --check`
sin errores. La prueba del recorrido de PED-DEMO-001 termina en `shipped`, con
16 líneas de envío y sin usar `DEMO-002-VENC`.

Pendiente en PostgreSQL desechable para Fase 0: dos despachos simultáneos del mismo
envío, dos envíos de una ruta y preparación frente a despacho sobre el mismo pedido
y lotes. Verificar bloqueo y resultado único sin deadlocks, así como rollback y
permisos con el rol efectivo del backend.

Un lote que vence mientras el pedido está `ready` se rechaza sin liberar ni reasignar
reservas. `fn_preparar` acepta `approved`/`preparing`; un procedimiento para devolver
ese pedido a preparación debe acordarse aparte. Tampoco se modifica el orden
histórico del ledger: un movimiento con `occurred_at` igual a una entrada puede ser
rechazado por el trigger según sus UUID; se devuelve `P0409` y se revierte todo.

La ejecución remota requiere respaldo restaurable verificado, estado remoto revisado
y autorización explícita. Este trabajo solo prepara código y pruebas locales.
