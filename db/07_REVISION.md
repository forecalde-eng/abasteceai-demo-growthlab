# Revisión de la migración 07

`07_integridad_preseed.sql` se ejecuta después de `02_reglas_y_accesos.sql` y antes de `03_datos_ficticios.sql`. Los archivos SQL 01–06 siguen intactos. Esta migración no altera registros: añade restricciones, una vista de lectura, una política de lectura y un índice.

## Decisiones

- Se añade un `CHECK` que rechaza el motivo `NULL`, vacío o formado solo por espacios para pedidos adicionales. El `CHECK` original se conserva.
- Las incidencias y decisiones con pedido se vinculan a `(order_id, location_id)`. Una decisión con pedido debe tener ubicación. Las incidencias con envío se vinculan además al punto del envío y, si indican pedido, al pedido del mismo envío.
- `v_warehouse_purchase_items` expone a bodega `id`, `purchase_id`, `product_id` y `ordered_qty`. No expone `unit_cost_usd`. La vista consulta la tabla como su propietario de forma deliberada para evitar abrir la tabla con costos mediante RLS; filtra dentro de la vista por el rol activo de la sesión. `security_barrier` impide adelantar predicados del llamador al filtro. Los demás roles siguen usando la tabla existente según RLS.
- El supervisor deja de ver `route_plans`, que contiene datos agregados de rutas compartidas. Mantiene sus paradas y envíos filtrados por punto. Si la interfaz necesita un resumen de ruta para supervisores, deberá diseñarse una proyección limitada a sus propios puntos.
- El índice `(location_id, lot_id, occurred_at, id)` responde a los filtros de los triggers de saldo y reserva y al orden del historial por lote. Su efecto en el servidor real queda pendiente de `EXPLAIN` y medición tras la carga.

## Pruebas locales realizadas

Entorno: PGlite `0.5.10` en `/tmp`, con sustituto local de Auth y sin llamadas remotas.

| Verificación | Resultado |
|---|---:|
| `node verificar_postgres.mjs` con secuencia 01 → 02 → 07 → 03 | 61/61 |
| `node verificar_07_integridad.mjs` con la misma secuencia | 29/29 |
| Ubicaciones tras la carga local | 703, sin códigos duplicados |
| Relaciones foráneas no validadas | 0 |

El verificador 07 cubre pedidos adicionales con motivos nulos, en blanco y válidos; ubicación de incidencias, decisiones y envíos; acceso a cantidades sin costos; y dos supervisores de puntos distintos en una ruta compartida. Los rechazos se prueban dentro de transacciones revertidas. Estas pruebas no sustituyen la comprobación de RLS con JWT reales en Supabase.

## Numeración reservada y orden remoto propuesto

1. `01_esquema.sql`
2. `02_reglas_y_accesos.sql`
3. `07_integridad_preseed.sql`
4. `03_datos_ficticios.sql` (una sola fuente; no importar además los CSV)
5. Verificar recuentos, relaciones, RLS y tamaño con `04_consultas_demo.sql` y `06_control_espacio.sql`; después exponer `abastece` a la Data API.
6. `08_proveedor_openai.sql` cuando exista y se active ese proveedor.
7. `09_fn_pedidos.sql`, `10_fn_bodega.sql` y `11_fn_envios.sql` cuando existan y se hayan probado. `12_reset_demo.sql` queda reservado para el reinicio autorizado de la demo.

`05_rag_vector_opcional.sql` sigue siendo opcional y requiere pgvector; no forma parte de la carga necesaria del sistema base. Esta secuencia no autoriza ni ejecuta cambios remotos.
