-- D-2.2: corrección puntual de los dos pedidos ficticios de preparación.
-- Una sola sentencia DO: error => rollback íntegro de esta operación.
-- Para ensayo: BEGIN; ejecutar este archivo; verificar; ROLLBACK.
-- Para aplicar en el futuro, exigir respaldo restaurable y autorización expresa.
DO $reconcile$
DECLARE
 v_three abastece.orders%ROWTYPE;
 v_six abastece.orders%ROWTYPE;
 v_item record;
 v_lot record;
 v_reservation record;
 v_bodega uuid;
 v_actor uuid;
 v_reference_at timestamptz;
 v_existing integer;
 v_count_three integer := 0;
 v_count_six integer := 0;
 v_expected_approved numeric;
 v_expected_prepared numeric;
 v_expected_reserved numeric;
 v_reservation_count integer;
 v_expected_reservation_count integer;
 v_reservation_qty numeric;
 v_physical numeric;
 v_reserved numeric;
 v_needed numeric;
 v_mode text;
 v_item_ids uuid[] := ARRAY[]::uuid[];
 v_product_ids uuid[] := ARRAY[]::uuid[];
 v_lot_ids uuid[] := ARRAY[]::uuid[];
 v_quantities numeric[] := ARRAY[]::numeric[];
 v_marker constant text := 'd-2.2-003-006-v1';
BEGIN
 PERFORM pg_catalog.set_config('search_path', '', true);
 -- fn_preparar toma primero la fila del pedido y luego este bloqueo global.
 SELECT * INTO STRICT v_three FROM abastece.orders
 WHERE code = 'PED-DEMO-003' FOR UPDATE;
 SELECT * INTO STRICT v_six FROM abastece.orders
 WHERE code = 'PED-DEMO-006' FOR UPDATE;
 PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 5);

 SELECT id INTO STRICT v_bodega FROM abastece.locations
 WHERE code = 'BOD-DEMO' AND kind = 'warehouse';
 SELECT id INTO STRICT v_actor FROM abastece.staff_members
 WHERE role = 'bodega' AND active;
 SELECT reference_at INTO STRICT v_reference_at FROM abastece.demo_metadata
 WHERE id = true FOR SHARE;

 -- Bloquear las reservas existentes antes de tomar los bloqueos por lote:
 -- un UPDATE de reserva toma primero su fila y luego el advisory del trigger.
 FOR v_reservation IN
  SELECT r.id FROM abastece.inventory_reservations AS r
  JOIN abastece.order_items AS i ON i.id = r.order_item_id
  WHERE i.order_id IN (v_three.id, v_six.id)
  ORDER BY r.id FOR UPDATE OF r
 LOOP
  NULL;
 END LOOP;
 -- Congela catálogo FEFO y evita auditorías concurrentes con la misma marca.
 LOCK TABLE abastece.products, abastece.product_lots IN SHARE MODE;
 LOCK TABLE abastece.audit_events IN SHARE ROW EXCLUSIVE MODE;

 SELECT pg_catalog.count(*) INTO v_existing FROM abastece.audit_events
 WHERE action = 'seed_reconciliation' AND entity_id IN (v_three.id, v_six.id);
 IF v_three.status = 'preparing' AND v_six.status = 'approved' AND v_existing = 0 THEN
  v_mode := 'before';
 ELSIF v_three.status = 'preparing' AND v_six.status = 'ready' AND v_existing = 2 THEN
  v_mode := 'after';
 ELSE
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'Estado parcial o inesperado de la conciliación de preparación';
 END IF;

 IF (SELECT pg_catalog.count(*) FROM abastece.shipments
     WHERE order_id IN (v_three.id, v_six.id)) <> 0 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'Los pedidos ya tienen envíos';
 END IF;
 IF (SELECT pg_catalog.count(*) FROM abastece.incidents
     WHERE code = 'INC-EMPAQUE' AND order_id = v_three.id
      AND kind = 'packing_difference' AND severity = 'medium'
      AND status = 'open') <> 1 OR
    (SELECT pg_catalog.count(*) FROM abastece.incidents
     WHERE order_id = v_three.id AND kind = 'packing_difference'
      AND status IN ('open','under_review')) <> 1 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'INC-EMPAQUE cambió o no pertenece al pedido';
 END IF;
 IF EXISTS (SELECT 1 FROM abastece.incidents
     WHERE order_id = v_six.id AND kind = 'packing_difference'
      AND status IN ('open', 'under_review')) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'PED-DEMO-006 tiene una incidencia de preparación inesperada';
 END IF;

 -- Los 16 lotes DEMO-NNN-A son los únicos no vencidos de estos productos.
 -- Bloquear cada lote con la misma clave usada por los triggers de inventario.
 FOR v_lot IN
  SELECT p.sku, p.id AS product_id, l.id AS lot_id, l.expires_on,
   l.batch_code, l.received_on
  FROM abastece.order_items AS i
  JOIN abastece.products AS p ON p.id = i.product_id
  JOIN abastece.product_lots AS l ON l.product_id = p.id
   AND l.batch_code = 'DEMO-' || pg_catalog.split_part(p.sku, '-', 2) || '-A'
  WHERE i.order_id = v_three.id
  ORDER BY p.sku, l.expires_on NULLS LAST, l.received_on, l.batch_code, l.id
  FOR SHARE OF l
 LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   v_bodega::text || v_lot.lot_id::text, 0));
 END LOOP;

 -- Todas las comprobaciones de las 32 líneas y del stock ocurren antes
 -- del primer UPDATE o INSERT. Cualquier cambio de la semilla aborta.
 FOR v_item IN
  SELECT o.code, i.id AS item_id, i.product_id, p.sku,
   i.approved_qty, i.prepared_qty
  FROM abastece.orders AS o
  JOIN abastece.order_items AS i ON i.order_id = o.id
  JOIN abastece.products AS p ON p.id = i.product_id
  WHERE o.id IN (v_three.id, v_six.id)
  ORDER BY o.code, p.sku
  FOR UPDATE OF i
 LOOP
  IF v_item.sku NOT IN (
   'INS-001','INS-002','INS-003','INS-004','INS-005','INS-006',
   'INS-007','INS-008','INS-009','INS-010','INS-011','INS-012',
   'INS-013','INS-014','INS-015','INS-016') THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Producto del seed inesperado';
  END IF;
  v_expected_approved := CASE WHEN v_item.sku IN (
   'INS-002','INS-006','INS-011','INS-012','INS-015') THEN 6 ELSE 3 END;
  IF v_item.code = 'PED-DEMO-003' THEN
   v_count_three := v_count_three + 1;
   v_expected_prepared := CASE
    WHEN v_item.sku = 'INS-005' AND v_mode = 'after' THEN 1
    WHEN v_item.sku IN ('INS-002','INS-006','INS-011','INS-012','INS-015') THEN 5
    ELSE 2 END;
   v_expected_reserved := CASE WHEN v_mode = 'before' THEN 0
    ELSE v_expected_prepared END;
  ELSE
   v_count_six := v_count_six + 1;
   v_expected_prepared := CASE WHEN v_mode = 'before' THEN 0
    ELSE v_expected_approved END;
   v_expected_reserved := v_expected_approved;
  END IF;
  IF v_item.approved_qty IS DISTINCT FROM v_expected_approved OR
     v_item.prepared_qty IS DISTINCT FROM v_expected_prepared THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409',
    MESSAGE = 'Cantidad aprobada o preparada del seed cambió', DETAIL = v_item.code || '/' || v_item.sku;
  END IF;
  SELECT pg_catalog.count(*), coalesce(pg_catalog.sum(quantity),0)
   INTO v_reservation_count, v_reservation_qty
  FROM abastece.inventory_reservations
  WHERE order_item_id = v_item.item_id AND status = 'active';
  v_expected_reservation_count := CASE WHEN v_expected_reserved = 0 THEN 0 ELSE 1 END;
  IF v_reservation_qty <> v_expected_reserved OR
     v_reservation_count <> v_expected_reservation_count OR
     EXISTS (SELECT 1 FROM abastece.inventory_reservations
      WHERE order_item_id = v_item.item_id AND status <> 'active') THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409',
    MESSAGE = 'Reservas del seed cambiaron', DETAIL = v_item.code || '/' || v_item.sku;
  END IF;

  SELECT l.id, l.batch_code, l.expires_on, l.received_on INTO STRICT v_lot
  FROM abastece.product_lots AS l
  WHERE l.product_id = v_item.product_id
   AND l.batch_code = 'DEMO-' || pg_catalog.split_part(v_item.sku, '-', 2) || '-A';
  IF (v_lot.expires_on IS NOT NULL AND v_lot.expires_on < v_reference_at::date) OR
     EXISTS (SELECT 1 FROM abastece.product_lots AS extra
      WHERE extra.product_id = v_item.product_id AND extra.id <> v_lot.id
       AND (extra.expires_on IS NULL OR extra.expires_on >= v_reference_at::date)) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409',
    MESSAGE = 'Lotes FEFO del seed cambiaron', DETAIL = v_item.sku;
  END IF;
  IF v_expected_reserved > 0 AND EXISTS (
   SELECT 1 FROM abastece.inventory_reservations AS r
   WHERE r.order_item_id = v_item.item_id
    AND (r.location_id <> v_bodega OR r.product_id <> v_item.product_id
     OR r.lot_id <> v_lot.id)) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409',
    MESSAGE = 'Reserva en lote o ubicación inesperados', DETAIL = v_item.code || '/' || v_item.sku;
  END IF;
  IF v_item.code = 'PED-DEMO-003' THEN
   v_needed := CASE WHEN v_item.sku = 'INS-005' THEN 1
    ELSE v_item.prepared_qty END;
   v_item_ids := pg_catalog.array_append(v_item_ids, v_item.item_id);
   v_product_ids := pg_catalog.array_append(v_product_ids, v_item.product_id);
   v_lot_ids := pg_catalog.array_append(v_lot_ids, v_lot.id);
   v_quantities := pg_catalog.array_append(v_quantities, v_needed);
  END IF;
 END LOOP;
 IF v_count_three <> 16 OR v_count_six <> 16 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Se esperaban 32 líneas exactas';
 END IF;

 -- Verificar inventario por lote tras obtener todos los bloqueos.
 FOR v_lot IN
  SELECT p.sku, l.id AS lot_id
  FROM abastece.order_items AS i
  JOIN abastece.products AS p ON p.id = i.product_id
  JOIN abastece.product_lots AS l ON l.product_id = p.id
   AND l.batch_code = 'DEMO-' || pg_catalog.split_part(p.sku, '-', 2) || '-A'
  WHERE i.order_id = v_three.id ORDER BY p.sku
 LOOP
  SELECT coalesce(pg_catalog.sum(delta_qty),0) INTO v_physical
   FROM abastece.stock_movements
   WHERE location_id = v_bodega AND lot_id = v_lot.lot_id
    AND occurred_at <= v_reference_at;
  SELECT coalesce(pg_catalog.sum(quantity),0) INTO v_reserved
   FROM abastece.inventory_reservations
   WHERE location_id = v_bodega AND lot_id = v_lot.lot_id AND status = 'active';
  -- isfinite(numeric) no existe en PostgreSQL. SUM devuelve numeric sin typmod;
  -- excluir sus tres valores especiales antes de comparar disponibilidad.
  -- Este bucle termina para TODOS los lotes antes de la primera escritura.
  IF v_physical::text IN ('NaN', 'Infinity', '-Infinity') OR
     v_reserved::text IN ('NaN', 'Infinity', '-Infinity') THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409',
    MESSAGE = 'Saldo físico o reservado no finito', DETAIL = v_lot.sku;
  END IF;
  IF v_physical < v_reserved OR
     (v_mode = 'before' AND v_physical - v_reserved <
      CASE WHEN v_lot.sku = 'INS-005' THEN 1
       WHEN v_lot.sku IN ('INS-002','INS-006','INS-011','INS-012','INS-015') THEN 5
       ELSE 2 END) OR
     (v_lot.sku = 'INS-005' AND v_mode = 'before' AND
      (v_physical <> 8 OR v_reserved <> 7)) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409',
    MESSAGE = 'Stock por lote insuficiente o inesperado', DETAIL = v_lot.sku;
  END IF;
 END LOOP;

 IF v_mode = 'after' THEN
  IF (SELECT pg_catalog.count(*) FROM abastece.audit_events
      WHERE action = 'seed_reconciliation' AND entity_type = 'order'
       AND entity_id = v_three.id AND actor_id = v_actor
       AND location_id = v_three.location_id
       AND before_state = '{"status":"preparing","prepared_total":47,"active_reserved_total":0}'::jsonb
       AND after_state = pg_catalog.jsonb_build_object('reconciliation_id', v_marker,
        'status', 'preparing', 'prepared_total', 46, 'active_reserved_total', 46)
       AND occurred_at = v_reference_at) <> 1 OR
     (SELECT pg_catalog.count(*) FROM abastece.audit_events
      WHERE action = 'seed_reconciliation' AND entity_type = 'order'
       AND entity_id = v_six.id AND actor_id = v_actor
       AND location_id = v_six.location_id
       AND before_state = '{"status":"approved","prepared_total":0,"active_reserved_total":63}'::jsonb
       AND after_state = pg_catalog.jsonb_build_object('reconciliation_id', v_marker,
        'status', 'ready', 'prepared_total', 63, 'active_reserved_total', 63)
       AND occurred_at = v_reference_at) <> 1 THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Auditoría de conciliación incompleta';
  END IF;
  RETURN; -- segunda ejecución validada: ningún efecto nuevo
 END IF;

 -- Primera escritura, solo después de verificar las 32 líneas y el stock.
 UPDATE abastece.order_items SET prepared_qty = 1
 WHERE id = (SELECT i.id FROM abastece.order_items AS i
  JOIN abastece.products AS p ON p.id = i.product_id
  WHERE i.order_id = v_three.id AND p.sku = 'INS-005');
 FOR v_existing IN 1..pg_catalog.array_length(v_item_ids, 1) LOOP
  INSERT INTO abastece.inventory_reservations
   (order_item_id, location_id, product_id, lot_id, quantity, status, created_at)
  VALUES (v_item_ids[v_existing], v_bodega, v_product_ids[v_existing],
   v_lot_ids[v_existing], v_quantities[v_existing], 'active', v_reference_at);
 END LOOP;
 UPDATE abastece.order_items SET prepared_qty = approved_qty
 WHERE order_id = v_six.id;
 GET DIAGNOSTICS v_existing = ROW_COUNT;
 IF v_existing <> 16 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Actualización incompleta del pedido 006';
 END IF;
 UPDATE abastece.orders SET status = 'ready' WHERE id = v_six.id;
 INSERT INTO abastece.audit_events
  (actor_id, location_id, entity_type, entity_id, action,
   before_state, after_state, occurred_at)
 VALUES
 (v_actor, v_three.location_id, 'order', v_three.id, 'seed_reconciliation',
  '{"status":"preparing","prepared_total":47,"active_reserved_total":0}'::jsonb,
  pg_catalog.jsonb_build_object('reconciliation_id', v_marker,
   'status', 'preparing', 'prepared_total', 46, 'active_reserved_total', 46), v_reference_at),
 (v_actor, v_six.location_id, 'order', v_six.id, 'seed_reconciliation',
  '{"status":"approved","prepared_total":0,"active_reserved_total":63}'::jsonb,
  pg_catalog.jsonb_build_object('reconciliation_id', v_marker,
   'status', 'ready', 'prepared_total', 63, 'active_reserved_total', 63), v_reference_at);

 IF (SELECT status FROM abastece.orders WHERE id = v_three.id) <> 'preparing' OR
    (SELECT status FROM abastece.orders WHERE id = v_six.id) <> 'ready' OR
    (SELECT pg_catalog.sum(prepared_qty) FROM abastece.order_items WHERE order_id = v_three.id) <> 46 OR
    (SELECT pg_catalog.sum(prepared_qty) FROM abastece.order_items WHERE order_id = v_six.id) <> 63 OR
    (SELECT pg_catalog.count(*) FROM abastece.inventory_reservations AS r
     JOIN abastece.order_items AS i ON i.id = r.order_item_id
     WHERE i.order_id = v_three.id AND r.status = 'active') <> 16 OR
    EXISTS (SELECT 1 FROM abastece.order_items AS i
     LEFT JOIN (SELECT order_item_id, pg_catalog.sum(quantity) AS qty
      FROM abastece.inventory_reservations WHERE status = 'active'
      GROUP BY order_item_id) AS r ON r.order_item_id = i.id
     WHERE i.order_id IN (v_three.id, v_six.id)
      AND i.prepared_qty <> coalesce(r.qty, 0)) OR
    (SELECT pg_catalog.count(*) FROM abastece.audit_events
     WHERE action = 'seed_reconciliation'
      AND entity_id IN (v_three.id, v_six.id)) <> 2 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Verificación posterior a la conciliación falló';
 END IF;
END;
$reconcile$;
