-- D-2.2 (#34): preparación por lote FEFO. El cuerpo JSONB es el arreglo
-- PrepareRequest.items; prepared_qty expresa el total acumulado deseado.
CREATE OR REPLACE FUNCTION abastece.fn_preparar(
 p_staff uuid, p_order uuid, p_items jsonb, p_dry_run boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_order abastece.orders%ROWTYPE;
 v_item_row record;
 v_lot record;
 v_existing record;
 v_item jsonb;
 v_seen uuid[] := ARRAY[]::uuid[];
 v_product uuid;
 v_target numeric;
 v_actual numeric;
 v_remaining numeric;
 v_available numeric;
 v_take numeric;
 v_new_total numeric := 0;
 v_lots_raw jsonb;
 v_lots jsonb;
 v_lines jsonb := '[]'::jsonb;
 v_before jsonb;
 v_status text;
 v_incident_code text;
 v_bodega uuid;
 v_reference_at timestamptz;
 v_role text;
 v_count integer;
 v_index integer := 0;
BEGIN
 SELECT role INTO v_role FROM abastece.staff_members
 WHERE id = p_staff AND active;
 IF v_role IS DISTINCT FROM 'bodega' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Rol no autorizado para preparar pedidos';
 END IF;
 IF p_dry_run IS NULL OR p_items IS NULL OR
    pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Solicitud de preparación inválida';
 END IF;

 IF p_dry_run THEN
  SELECT * INTO v_order FROM abastece.orders WHERE id = p_order;
 ELSE
  SELECT * INTO v_order FROM abastece.orders WHERE id = p_order FOR UPDATE;
 END IF;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Pedido no encontrado';
 END IF;
 IF v_order.status NOT IN ('approved', 'preparing') THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Pedido no apto para preparación';
 END IF;

 SELECT id INTO v_bodega FROM abastece.locations
 WHERE code = 'BOD-DEMO' AND kind = 'warehouse';
 IF v_bodega IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Bodega no disponible';
 END IF;
 SELECT reference_at INTO STRICT v_reference_at
 FROM abastece.demo_metadata WHERE id = true;

 SELECT pg_catalog.count(*) INTO v_count FROM abastece.order_items
 WHERE order_id = p_order;
 IF v_count = 0 OR pg_catalog.jsonb_array_length(p_items) <> v_count THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Se requiere una línea por producto aprobado';
 END IF;
 -- Evita sumar reservas nuevas sobre cantidades precargadas sin respaldo.
 -- PED-DEMO-003 en la semilla necesita conciliación separada antes de reanudarse.
 IF EXISTS (
  SELECT 1 FROM abastece.order_items AS i
  LEFT JOIN (
   SELECT order_item_id, pg_catalog.sum(quantity) AS qty
   FROM abastece.inventory_reservations WHERE status = 'active'
   GROUP BY order_item_id
  ) AS r ON r.order_item_id = i.id
  WHERE i.order_id = p_order AND i.prepared_qty <> coalesce(r.qty, 0)
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'Cantidades preparadas sin reservas activas equivalentes';
 END IF;
 -- Al reanudar, una reserva previa vencida no puede contar como preparación válida.
 -- Rechazar también en dry_run evita sugerir un estado ready con stock caducado.
 IF EXISTS (
  SELECT 1 FROM abastece.inventory_reservations AS r
  JOIN abastece.order_items AS i ON i.id = r.order_item_id
  JOIN abastece.product_lots AS l ON l.id = r.lot_id
  WHERE i.order_id = p_order AND r.status = 'active'
   AND l.expires_on < v_reference_at::date
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'Reserva activa en lote vencido';
 END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'product_id', product_id, 'approved_qty', approved_qty,
   'prepared_qty', prepared_qty) ORDER BY product_id), '[]'::jsonb)
 INTO v_before FROM abastece.order_items WHERE order_id = p_order;

 -- Una sola preparación real por vez; los triggers protegen también cada lote
 -- frente a movimientos de inventario que usan su mismo bloqueo advisory.
 IF NOT p_dry_run THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 5);
 END IF;
 FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items)
 LOOP
  v_index := v_index + 1;
  IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR
     pg_catalog.jsonb_typeof(v_item->'product_id') IS DISTINCT FROM 'string' OR
     v_item->>'product_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     pg_catalog.jsonb_typeof(v_item->'prepared_qty') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Línea de preparación inválida',
    DETAIL = pg_catalog.jsonb_build_object('field', 'items', 'index', v_index)::text;
  END IF;
  v_product := (v_item->>'product_id')::uuid;
  IF v_product = ANY(v_seen) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Producto repetido',
    DETAIL = pg_catalog.jsonb_build_object('field', 'items', 'index', v_index,
     'product_id', v_product)::text;
  END IF;
  v_seen := pg_catalog.array_append(v_seen, v_product);
  v_target := (v_item->>'prepared_qty')::numeric;
  IF v_target < 0 OR v_target > 999999999.999 OR
     v_target <> pg_catalog.round(v_target, 3) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'prepared_qty fuera de numeric(12,3)',
    DETAIL = pg_catalog.jsonb_build_object('field', 'items', 'index', v_index,
     'product_id', v_product)::text;
  END IF;
  SELECT i.*, p.sku INTO v_item_row
  FROM abastece.order_items AS i JOIN abastece.products AS p ON p.id = i.product_id
  WHERE i.order_id = p_order AND i.product_id = v_product;
  IF NOT FOUND OR v_item_row.approved_qty IS NULL THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Producto no aprobado en el pedido',
    DETAIL = pg_catalog.jsonb_build_object('field', 'items', 'index', v_index,
     'product_id', v_product)::text;
  END IF;
  IF v_target > v_item_row.approved_qty OR v_target < v_item_row.prepared_qty THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Cantidad preparada fuera de rango',
    DETAIL = pg_catalog.jsonb_build_object('field', 'items', 'index', v_index,
     'product_id', v_product)::text;
  END IF;

  v_remaining := v_target - v_item_row.prepared_qty;
  v_lots_raw := '[]'::jsonb;
  FOR v_existing IN
   SELECT l.id, l.batch_code, l.expires_on, pg_catalog.sum(r.quantity) AS qty
   FROM abastece.inventory_reservations AS r
   JOIN abastece.product_lots AS l ON l.id = r.lot_id
   WHERE r.order_item_id = v_item_row.id AND r.status = 'active'
   GROUP BY l.id, l.batch_code, l.expires_on
  LOOP
   v_lots_raw := v_lots_raw || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'lot_id', v_existing.id, 'batch_code', v_existing.batch_code,
    'expires_on', v_existing.expires_on, 'qty', v_existing.qty));
  END LOOP;
  FOR v_lot IN
   SELECT l.id, l.batch_code, l.expires_on,
    b.physical_qty - coalesce(r.reserved_qty, 0) AS available
   FROM abastece.product_lots AS l
   JOIN (
    SELECT lot_id, pg_catalog.sum(delta_qty) AS physical_qty
    FROM abastece.stock_movements
    WHERE location_id = v_bodega AND product_id = v_product
     AND occurred_at <= v_reference_at
    GROUP BY lot_id
   ) AS b ON b.lot_id = l.id
   LEFT JOIN (
    SELECT lot_id, pg_catalog.sum(quantity) AS reserved_qty
    FROM abastece.inventory_reservations
    WHERE location_id = v_bodega AND product_id = v_product AND status = 'active'
    GROUP BY lot_id
   ) AS r ON r.lot_id = l.id
   WHERE l.product_id = v_product
    AND (l.expires_on IS NULL OR l.expires_on >= v_reference_at::date)
    AND b.physical_qty - coalesce(r.reserved_qty, 0) > 0
   ORDER BY l.expires_on NULLS LAST, l.received_on, l.batch_code, l.id
  LOOP
   EXIT WHEN v_remaining = 0;
   v_available := v_lot.available;
   IF NOT p_dry_run THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
     v_bodega::text || v_lot.id::text, 0));
    SELECT
     (SELECT coalesce(pg_catalog.sum(delta_qty), 0) FROM abastece.stock_movements
      WHERE location_id = v_bodega AND lot_id = v_lot.id
       AND occurred_at <= v_reference_at) -
     (SELECT coalesce(pg_catalog.sum(quantity), 0) FROM abastece.inventory_reservations
      WHERE location_id = v_bodega AND lot_id = v_lot.id AND status = 'active')
    INTO v_available;
   END IF;
   IF v_available <= 0 THEN CONTINUE; END IF;
   v_take := least(v_remaining, v_available);
   IF NOT p_dry_run THEN
    INSERT INTO abastece.inventory_reservations
     (order_item_id, location_id, product_id, lot_id, quantity, status, created_at)
    VALUES (v_item_row.id, v_bodega, v_product, v_lot.id, v_take, 'active', v_reference_at);
   END IF;
   v_lots_raw := v_lots_raw || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'lot_id', v_lot.id, 'batch_code', v_lot.batch_code,
    'expires_on', v_lot.expires_on, 'qty', v_take));
   v_remaining := v_remaining - v_take;
   v_new_total := v_new_total + v_take;
  END LOOP;
  v_actual := v_target - v_remaining;
  IF v_actual < v_item_row.approved_qty THEN v_status := 'preparing'; END IF;
  IF NOT p_dry_run AND v_actual <> v_item_row.prepared_qty THEN
   UPDATE abastece.order_items SET prepared_qty = v_actual WHERE id = v_item_row.id;
  END IF;
  WITH summed AS (
   SELECT lot_id, batch_code, expires_on, pg_catalog.sum(qty) AS qty
   FROM pg_catalog.jsonb_to_recordset(v_lots_raw)
    AS x(lot_id uuid, batch_code text, expires_on date, qty numeric)
   GROUP BY lot_id, batch_code, expires_on
  )
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'lot_id', lot_id, 'batch_code', batch_code, 'expires_on', expires_on, 'qty', qty)
    ORDER BY expires_on NULLS LAST, batch_code, lot_id), '[]'::jsonb)
  INTO v_lots FROM summed;
  v_lines := v_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'product_id', v_product, 'sku', v_item_row.sku,
   'approved_qty', v_item_row.approved_qty, 'prepared_qty', v_actual,
   'lots', v_lots));
 END LOOP;

 IF v_status IS NULL THEN v_status := 'ready'; END IF;
 SELECT code INTO v_incident_code FROM abastece.incidents
 WHERE order_id = p_order AND kind = 'packing_difference'
  AND status IN ('open', 'under_review')
 ORDER BY created_at DESC, id DESC LIMIT 1;
 IF p_dry_run THEN
  RETURN pg_catalog.jsonb_build_object('order_id', p_order, 'code', v_order.code,
   'status', v_status, 'dry_run', true, 'incident_code',
   CASE WHEN v_status = 'preparing' THEN v_incident_code ELSE NULL END,
   'lines', v_lines);
 END IF;
 -- Repetir sin asignar más no vuelve a registrar auditoría ni reservas.
 IF v_order.status = v_status AND v_new_total = 0 THEN
  RETURN pg_catalog.jsonb_build_object('order_id', p_order, 'code', v_order.code,
   'status', v_status, 'dry_run', false, 'incident_code',
   CASE WHEN v_status = 'preparing' THEN v_incident_code ELSE NULL END,
   'lines', v_lines);
 END IF;

 UPDATE abastece.orders SET status = v_status WHERE id = p_order;
 IF v_status = 'preparing' AND v_incident_code IS NULL THEN
  -- Comparte la secuencia INC-NNN con fn_analizar_reglas.
  PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 2);
  SELECT 'INC-' || pg_catalog.lpad(
   (coalesce(pg_catalog.max(substring(code FROM 5)::bigint), 0) + 1)::text,
   3, '0') INTO v_incident_code
  FROM abastece.incidents WHERE code ~ '^INC-[0-9]+$';
  INSERT INTO abastece.incidents
   (code, location_id, order_id, kind, severity, status, description, created_at, created_by)
  VALUES (v_incident_code, v_order.location_id, p_order, 'packing_difference',
   'medium', 'open',
   'Cantidades preparadas menores que las aprobadas; seguir en preparación.',
   v_reference_at, p_staff);
 ELSIF v_status = 'ready' THEN
  UPDATE abastece.incidents SET status = 'resolved'
  WHERE order_id = p_order AND kind = 'packing_difference'
   AND status IN ('open', 'under_review');
  v_incident_code := NULL;
 END IF;
 INSERT INTO abastece.audit_events
  (actor_id, location_id, entity_type, entity_id, action,
   before_state, after_state, occurred_at)
 VALUES (p_staff, v_order.location_id, 'order', p_order, 'order_prepare',
  pg_catalog.jsonb_build_object('status', v_order.status, 'items', v_before),
  pg_catalog.jsonb_build_object('status', v_status, 'items', v_lines), v_reference_at);

 RETURN pg_catalog.jsonb_build_object('order_id', p_order, 'code', v_order.code,
  'status', v_status, 'dry_run', false, 'incident_code', v_incident_code,
  'lines', v_lines);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_preparar(uuid,uuid,jsonb,boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_preparar(uuid,uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
