-- D-1.1 (#28): POST /orders. FastAPI resuelve el JWT y pasa el staff real.
-- La función se invoca solo desde el backend; no se concede a clientes.
-- created es un indicador interno para escoger HTTP 201/200 y se omite del OrderResult.
CREATE FUNCTION abastece.fn_crear_pedido(
 p_staff uuid, p_location uuid, p_cycle_month date, p_order_type text,
 p_related_order uuid, p_reason text, p_observations text,
 p_items jsonb, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_role text;
 v_existing abastece.orders%ROWTYPE;
 v_order_id uuid;
 v_code text;
 v_reference_at timestamptz;
 v_item jsonb;
 v_index integer;
 v_product uuid;
 v_seen uuid[] := ARRAY[]::uuid[];
 v_quantity numeric;
BEGIN
 -- El backend autentica el JWT. Este segundo control exige un staff activo y
 -- un punto asignado incluso si el llamador backend pasa un UUID equivocado.
 SELECT s.role INTO v_role
 FROM abastece.staff_members AS s
 WHERE s.id = p_staff AND s.active;
 IF v_role IS NULL OR v_role NOT IN ('auxiliar', 'supervisor') THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Rol no autorizado para crear pedidos';
 END IF;

 IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Idempotency-Key obligatoria',
   DETAIL = '{"field":"Idempotency-Key"}';
 END IF;

 -- Serializa tanto la consulta de idempotencia como la asignación del código.
 -- La unicidad de orders.code/idempotency_key sigue siendo la última defensa.
 PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 1);
 SELECT * INTO v_existing FROM abastece.orders
 WHERE idempotency_key = p_idempotency_key;
 IF FOUND THEN
  IF v_existing.requested_by <> p_staff THEN
   RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Pedido no encontrado';
  END IF;
  IF NOT EXISTS (
   SELECT 1 FROM abastece.point_assignments
   WHERE staff_id = p_staff AND location_id = v_existing.location_id
  ) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Punto no asignado';
  END IF;
  RETURN pg_catalog.jsonb_build_object('id', v_existing.id, 'code', v_existing.code,
   'status', v_existing.status, 'created', false);
 END IF;

 IF p_location IS NULL OR NOT EXISTS (
  SELECT 1 FROM abastece.point_assignments AS a
  JOIN abastece.locations AS l ON l.id = a.location_id
  WHERE a.staff_id = p_staff AND a.location_id = p_location AND l.kind = 'service_point'
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Punto no asignado';
 END IF;
 IF p_cycle_month IS NULL OR extract(day FROM p_cycle_month) <> 1 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'cycle_month debe ser el primer día del mes',
   DETAIL = '{"field":"cycle_month"}';
 END IF;
 IF p_order_type IS NULL OR p_order_type NOT IN ('regular', 'additional') THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'order_type inválido',
   DETAIL = '{"field":"order_type"}';
 END IF;

 IF p_order_type = 'regular' THEN
  IF p_related_order IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Un pedido regular no tiene related_order_id',
    DETAIL = '{"field":"related_order_id"}';
  END IF;
  -- Propuesta D-0.6 pendiente de confirmación de Omar: sin motivo en regular.
  IF nullif(btrim(p_reason), '') IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Un pedido regular no tiene reason',
    DETAIL = '{"field":"reason"}';
  END IF;
 ELSE
  IF p_related_order IS NULL THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'related_order_id obligatorio en pedido adicional',
    DETAIL = '{"field":"related_order_id"}';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'reason obligatorio en pedido adicional',
    DETAIL = '{"field":"reason"}';
  END IF;
  IF NOT EXISTS (
   SELECT 1 FROM abastece.orders AS o
   WHERE o.id = p_related_order AND o.location_id = p_location
    AND o.cycle_month = p_cycle_month
  ) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Pedido relacionado de otro punto o ciclo',
    DETAIL = '{"field":"related_order_id"}';
  END IF;
 END IF;

 IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'items debe ser una lista no vacía',
   DETAIL = '{"field":"items"}';
 END IF;
 IF pg_catalog.jsonb_array_length(p_items) = 0 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'items debe ser una lista no vacía',
   DETAIL = '{"field":"items"}';
 END IF;

 SELECT reference_at INTO STRICT v_reference_at FROM abastece.demo_metadata WHERE id = true;
 SELECT 'PED-DEMO-' || pg_catalog.lpad((coalesce(max(substring(code FROM 10)::integer), 0) + 1)::text, 3, '0')
 INTO v_code FROM abastece.orders WHERE code ~ '^PED-DEMO-[0-9]+$';

 INSERT INTO abastece.orders
  (code, location_id, cycle_month, requested_by, requested_at, status,
   order_type, related_order_id, reason, observations, idempotency_key)
 VALUES
  (v_code, p_location, p_cycle_month, p_staff, v_reference_at, 'submitted',
   p_order_type, p_related_order, nullif(btrim(p_reason), ''),
   coalesce(p_observations, ''), p_idempotency_key)
 RETURNING id INTO v_order_id;

 -- Un fallo de cualquier ítem revierte el pedido y todos los ítems anteriores:
 -- la llamada a la función es una sola sentencia dentro de la transacción.
 FOR v_item, v_index IN
  SELECT value, (ordinality - 1)::integer
  FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY
 LOOP
  IF pg_catalog.jsonb_typeof(v_item) <> 'object' OR
     pg_catalog.jsonb_typeof(v_item->'product_id') <> 'string' THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'product_id inválido',
    DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].product_id', v_index), 'index', v_index)::text;
  END IF;
  BEGIN
   v_product := (v_item->>'product_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'product_id inválido',
    DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].product_id', v_index), 'index', v_index)::text;
  END;
  IF v_product = ANY(v_seen) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Producto repetido',
    DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].product_id', v_index), 'index', v_index,
     'product_id', v_product)::text;
  END IF;
  v_seen := pg_catalog.array_append(v_seen, v_product);
  IF NOT EXISTS (SELECT 1 FROM abastece.products WHERE id = v_product AND active) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Producto inexistente o inactivo',
    DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].product_id', v_index), 'index', v_index,
     'product_id', v_product)::text;
  END IF;
  IF pg_catalog.jsonb_typeof(v_item->'requested_qty') <> 'number' THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'requested_qty inválida',
    DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].requested_qty', v_index), 'index', v_index,
     'product_id', v_product)::text;
  END IF;
  v_quantity := (v_item->>'requested_qty')::numeric;
  IF v_quantity <= 0 OR v_quantity > 999999999.999 OR
     v_quantity <> pg_catalog.round(v_quantity, 3) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'requested_qty fuera de numeric(12,3)',
    DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].requested_qty', v_index), 'index', v_index,
     'product_id', v_product)::text;
  END IF;
  INSERT INTO abastece.order_items (order_id, product_id, requested_qty)
  VALUES (v_order_id, v_product, v_quantity);
 END LOOP;

 RETURN pg_catalog.jsonb_build_object('id', v_order_id, 'code', v_code,
  'status', 'submitted', 'created', true);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_crear_pedido(uuid,uuid,date,text,uuid,text,text,jsonb,text) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_crear_pedido(uuid,uuid,date,text,uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;

-- D-1.3 (#30): POST /orders/{id}/decision. D-1.2 insertará
-- fn_analizar_reglas entre las funciones de creación y decisión.
CREATE FUNCTION abastece.fn_decidir_pedido(
 p_staff uuid, p_order uuid, p_decision text, p_items jsonb, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_order abastece.orders%ROWTYPE;
 v_item jsonb;
 v_index integer;
 v_product uuid;
 v_requested numeric(12,3);
 v_approved numeric;
 v_seen uuid[] := ARRAY[]::uuid[];
 v_corrected boolean := false;
 v_status text;
 v_reference_at timestamptz;
 v_before_items jsonb;
 v_after_items jsonb := '[]'::jsonb;
BEGIN
 -- p_staff procede del JWT resuelto por FastAPI; el rol se valida otra vez aquí.
 IF NOT EXISTS (
  SELECT 1 FROM abastece.staff_members
  WHERE id = p_staff AND active AND role = 'administrador'
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Solo un administrador activo puede decidir';
 END IF;

 SELECT * INTO v_order FROM abastece.orders WHERE id = p_order FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Pedido no encontrado';
 END IF;
 IF v_order.requested_by = p_staff THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'No puede decidir su propio pedido';
 END IF;
 IF v_order.status <> 'submitted' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'El pedido no está en submitted';
 END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approve', 'return', 'cancel') THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Decisión inválida',
   DETAIL = '{"field":"decision"}';
 END IF;
 IF p_decision <> 'approve' AND p_items IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'items solo se admite para approve',
   DETAIL = '{"field":"items"}';
 END IF;
 IF p_decision IN ('return', 'cancel') AND nullif(btrim(p_reason), '') IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'La decisión requiere motivo',
   DETAIL = '{"field":"reason"}';
 END IF;
 IF p_decision = 'approve' AND p_items IS NOT NULL AND
    pg_catalog.jsonb_typeof(p_items) <> 'array' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'items debe ser una lista',
   DETAIL = '{"field":"items"}';
 END IF;

 IF p_decision = 'approve' AND p_items IS NOT NULL THEN
  FOR v_item, v_index IN
   SELECT value, (ordinality - 1)::integer
   FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY
  LOOP
   IF pg_catalog.jsonb_typeof(v_item) <> 'object' OR
      pg_catalog.jsonb_typeof(v_item->'product_id') <> 'string' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'product_id inválido',
     DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].product_id', v_index))::text;
   END IF;
   BEGIN
    v_product := (v_item->>'product_id')::uuid;
   EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'product_id inválido',
     DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].product_id', v_index))::text;
   END;
   IF v_product = ANY(v_seen) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Producto repetido',
     DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].product_id', v_index),
      'product_id', v_product)::text;
   END IF;
   v_seen := pg_catalog.array_append(v_seen, v_product);
   SELECT requested_qty INTO v_requested FROM abastece.order_items
   WHERE order_id = p_order AND product_id = v_product FOR UPDATE;
   IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Producto ajeno al pedido',
     DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].product_id', v_index),
      'product_id', v_product)::text;
   END IF;
   IF pg_catalog.jsonb_typeof(v_item->'approved_qty') <> 'number' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'approved_qty inválida',
     DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].approved_qty', v_index),
      'product_id', v_product)::text;
   END IF;
   v_approved := (v_item->>'approved_qty')::numeric;
   IF v_approved < 0 OR v_approved > v_requested OR
      v_approved <> pg_catalog.round(v_approved, 3) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'approved_qty fuera de rango',
     DETAIL = pg_catalog.jsonb_build_object('field', pg_catalog.format('items[%s].approved_qty', v_index),
      'product_id', v_product)::text;
   END IF;
   v_corrected := v_corrected OR v_approved <> v_requested;
  END LOOP;
 END IF;
 IF v_corrected AND nullif(btrim(p_reason), '') IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Corregir cantidades requiere motivo',
   DETAIL = '{"field":"reason"}';
 END IF;

 SELECT reference_at INTO STRICT v_reference_at
 FROM abastece.demo_metadata WHERE id = true;
 SELECT coalesce(pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('product_id', product_id,
    'requested_qty', requested_qty, 'approved_qty', approved_qty)
   ORDER BY product_id), '[]'::jsonb)
 INTO v_before_items FROM abastece.order_items WHERE order_id = p_order;

 v_status := CASE p_decision WHEN 'approve' THEN 'approved'
  WHEN 'return' THEN 'draft' ELSE 'cancelled' END;
 IF p_decision = 'approve' THEN
  -- Primero se cubren todas las líneas; una lista parcial corrige solo las
  -- líneas presentes. El bloqueo del pedido serializa decisiones concurrentes.
  UPDATE abastece.order_items SET approved_qty = requested_qty
  WHERE order_id = p_order;
  IF p_items IS NOT NULL THEN
   FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items)
   LOOP
    UPDATE abastece.order_items
    SET approved_qty = (v_item->>'approved_qty')::numeric
    WHERE order_id = p_order AND product_id = (v_item->>'product_id')::uuid;
   END LOOP;
  END IF;
  UPDATE abastece.orders
  SET status = v_status, approved_by = p_staff, approved_at = v_reference_at
  WHERE id = p_order;
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('product_id', product_id, 'approved_qty', approved_qty)
    ORDER BY product_id), '[]'::jsonb)
  INTO v_after_items FROM abastece.order_items WHERE order_id = p_order;
 ELSE
  -- No se aprueban cantidades al devolver o cancelar: after_state.items = [].
  UPDATE abastece.orders
  SET status = v_status, approved_by = NULL, approved_at = NULL
  WHERE id = p_order;
 END IF;

 INSERT INTO abastece.audit_events
  (actor_id, location_id, entity_type, entity_id, action,
   before_state, after_state, occurred_at)
 VALUES
  (p_staff, v_order.location_id, 'order', p_order, 'order_' || p_decision,
   pg_catalog.jsonb_build_object('status', v_order.status, 'items', v_before_items),
   pg_catalog.jsonb_build_object('status', v_status, 'decision', p_decision,
    'reason', nullif(btrim(p_reason), ''), 'items', v_after_items), v_reference_at);

 RETURN pg_catalog.jsonb_build_object('id', v_order.id, 'code', v_order.code,
  'status', v_status);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_decidir_pedido(uuid,uuid,text,jsonb,text) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_decidir_pedido(uuid,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated;
