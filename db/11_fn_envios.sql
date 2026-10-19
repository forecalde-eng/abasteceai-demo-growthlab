-- D-2.1 (#33): confirma una propuesta de ruta recibida del backend.
-- El cálculo de rutas se hace fuera de SQL; esta función valida y persiste
-- el plan, sus paradas y un envío propio por pedido dentro de una transacción.
CREATE OR REPLACE FUNCTION abastece.fn_confirmar_ruta(
 p_staff uuid, p_vehicle uuid, p_dispatch_date date, p_stops jsonb,
 p_km numeric, p_minutes numeric, p_method text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_vehicle abastece.vehicles%ROWTYPE;
 v_order abastece.orders%ROWTYPE;
 v_location abastece.locations%ROWTYPE;
 v_stop jsonb;
 v_order_value jsonb;
 v_stop_number integer := 0;
 v_order_id uuid;
 v_location_id uuid;
 v_arrival timestamptz;
 v_previous_arrival timestamptz;
 v_locations uuid[] := ARRAY[]::uuid[];
 v_orders uuid[] := ARRAY[]::uuid[];
 v_stops jsonb := '[]'::jsonb;
 v_shipments jsonb := '[]'::jsonb;
 v_route_id uuid;
 v_route_number integer;
 v_shipment_number integer;
 v_shipment_id uuid;
 v_shipment_code text;
 v_guide_code text;
 v_weight numeric;
 v_volume numeric;
 v_reference_at timestamptz;
 v_staff_role text;
BEGIN
 SELECT role INTO v_staff_role FROM abastece.staff_members
 WHERE id = p_staff AND active;
 IF v_staff_role IS DISTINCT FROM 'logistica' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Rol no autorizado para confirmar rutas';
 END IF;

 IF p_stops IS NULL OR pg_catalog.jsonb_typeof(p_stops) <> 'array' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Paradas inválidas';
 END IF;
 IF p_vehicle IS NULL OR p_dispatch_date IS NULL OR
    pg_catalog.jsonb_array_length(p_stops) = 0 OR
    p_km IS NULL OR p_km < 0 OR p_km::text = 'NaN' OR
    p_minutes IS NULL OR p_minutes < 0 OR p_minutes::text = 'NaN' OR
    p_method IS NULL OR p_method <> 'ortools_vrptw' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Propuesta de ruta inválida';
 END IF;

 -- El bloqueo serializa la asignación de códigos y las confirmaciones
 -- simultáneas. Las restricciones UNIQUE siguen siendo la defensa final.
 PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 4);
 SELECT * INTO v_vehicle FROM abastece.vehicles WHERE id = p_vehicle FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Vehículo no disponible';
 END IF;
 -- Un borrador no reserva el vehículo. Un plan aprobado, despachado o
 -- terminado ya ocupó esta fecha; se consulta bajo el bloqueo de confirmación.
 IF EXISTS (
  SELECT 1 FROM abastece.route_plans
  WHERE vehicle_id = p_vehicle AND dispatch_date = p_dispatch_date
   AND status IN ('approved', 'dispatched', 'finished')
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Vehículo ya asignado para la fecha';
 END IF;

 FOR v_stop IN SELECT value FROM pg_catalog.jsonb_array_elements(p_stops)
 LOOP
  v_stop_number := v_stop_number + 1;
  IF pg_catalog.jsonb_typeof(v_stop) <> 'object' OR
     NOT (v_stop ? 'sequence') OR
     pg_catalog.jsonb_typeof(v_stop->'sequence') <> 'number' OR
     v_stop->>'sequence' !~ '^[1-9][0-9]*$' OR
     (v_stop->>'sequence')::numeric <> v_stop_number OR
     pg_catalog.jsonb_typeof(v_stop->'location_id') <> 'string' OR
     v_stop->>'location_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     pg_catalog.jsonb_typeof(v_stop->'order_ids') <> 'array' THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Parada inválida';
  END IF;
  v_location_id := (v_stop->>'location_id')::uuid;
  IF v_location_id = ANY(v_locations) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Punto repetido en la ruta';
  END IF;
  v_locations := pg_catalog.array_append(v_locations, v_location_id);
  SELECT * INTO v_location FROM abastece.locations WHERE id = v_location_id;
  IF NOT FOUND OR v_location.kind <> 'service_point' OR v_location.city <> 'Quito' THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Punto no elegible para ruta propia';
  END IF;
  IF v_stop ? 'location_code' AND
     (pg_catalog.jsonb_typeof(v_stop->'location_code') <> 'string' OR
      v_stop->>'location_code' <> v_location.code) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Código de punto incongruente';
  END IF;

  v_arrival := NULL;
  IF v_stop ? 'planned_arrival' AND v_stop->'planned_arrival' <> 'null'::jsonb THEN
   IF pg_catalog.jsonb_typeof(v_stop->'planned_arrival') <> 'string' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Hora de llegada inválida';
   END IF;
   BEGIN
    v_arrival := (v_stop->>'planned_arrival')::timestamptz;
   EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Hora de llegada inválida';
   END;
   IF (v_arrival AT TIME ZONE 'America/Guayaquil')::date <> p_dispatch_date OR
      (v_arrival AT TIME ZONE 'America/Guayaquil')::time < v_vehicle.available_from OR
      (v_arrival AT TIME ZONE 'America/Guayaquil')::time > v_vehicle.available_until OR
      (v_location.window_start IS NOT NULL AND
       ((v_arrival AT TIME ZONE 'America/Guayaquil')::time < v_location.window_start OR
        (v_arrival AT TIME ZONE 'America/Guayaquil')::time > v_location.window_end)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Llegada fuera de la ventana permitida';
   END IF;
   IF v_previous_arrival IS NOT NULL AND v_arrival <= v_previous_arrival THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Llegadas fuera de secuencia';
   END IF;
   v_previous_arrival := v_arrival;
  END IF;
  v_stops := v_stops || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'location_id', v_location_id, 'sequence', v_stop_number,
   'planned_arrival', v_arrival));

  FOR v_order_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_stop->'order_ids')
  LOOP
   IF pg_catalog.jsonb_typeof(v_order_value) <> 'string' OR
      v_order_value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Identificador de pedido inválido';
   END IF;
   v_order_id := (v_order_value #>> '{}')::uuid;
   IF v_order_id = ANY(v_orders) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Pedido repetido en la ruta';
   END IF;
   v_orders := pg_catalog.array_append(v_orders, v_order_id);
   SELECT * INTO v_order FROM abastece.orders WHERE id = v_order_id FOR UPDATE;
   IF NOT FOUND OR v_order.status <> 'ready' OR v_order.location_id <> v_location_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Pedido no elegible para esta parada';
   END IF;
   IF EXISTS (SELECT 1 FROM abastece.shipments WHERE order_id = v_order_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Pedido ya tiene envío';
   END IF;
   IF NOT EXISTS (SELECT 1 FROM abastece.order_items WHERE order_id = v_order_id) OR
      EXISTS (SELECT 1 FROM abastece.order_items WHERE order_id = v_order_id
       AND (approved_qty IS NULL OR prepared_qty <> approved_qty)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Pedido sin preparación completa';
   END IF;
  END LOOP;
 END LOOP;
 IF pg_catalog.array_length(v_orders, 1) IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'La ruta debe contener pedidos';
 END IF;

 SELECT coalesce(pg_catalog.sum(i.prepared_qty * p.gross_weight_kg), 0),
        coalesce(pg_catalog.sum(i.prepared_qty * p.package_volume_m3), 0)
 INTO v_weight, v_volume
 FROM abastece.order_items AS i JOIN abastece.products AS p ON p.id = i.product_id
 WHERE i.order_id = ANY(v_orders);
 IF v_weight > v_vehicle.capacity_kg OR v_volume > v_vehicle.capacity_m3 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Capacidad del vehículo excedida';
 END IF;

 SELECT reference_at INTO STRICT v_reference_at FROM abastece.demo_metadata WHERE id = true;
 SELECT coalesce(pg_catalog.max(pg_catalog.split_part(code, '-', 3)::integer), 0) + 1
 INTO v_route_number FROM abastece.route_plans WHERE code ~ '^RUTA-DEMO-[0-9]+$';
 -- fn_envio_courier debe compartir este bloqueo para reservar el mismo
 -- espacio de códigos ENV-DEMO/GUIA-DEMO sin carreras concurrentes.
 SELECT coalesce(pg_catalog.max(n), 0) + 1 INTO v_shipment_number
 FROM (
  SELECT pg_catalog.split_part(code, '-', 3)::integer AS n FROM abastece.shipments
  WHERE code ~ '^ENV-DEMO-[0-9]+$'
  UNION ALL
  SELECT pg_catalog.split_part(guide_code, '-', 3)::integer FROM abastece.shipments
  WHERE guide_code ~ '^GUIA-DEMO-[0-9]+$'
 ) AS used_codes;

 INSERT INTO abastece.route_plans
  (code, vehicle_id, dispatch_date, status, matrix_source, planning_method,
   estimated_km, estimated_minutes, approved_by)
 VALUES ('RUTA-DEMO-' || v_route_number, p_vehicle, p_dispatch_date,
  'approved', 'synthetic', p_method, p_km, p_minutes, p_staff)
 RETURNING id INTO v_route_id;
 INSERT INTO abastece.route_stops(route_id, location_id, sequence, planned_arrival)
 SELECT v_route_id, (s->>'location_id')::uuid, (s->>'sequence')::integer,
        (s->>'planned_arrival')::timestamptz
 FROM pg_catalog.jsonb_array_elements(v_stops) AS s;

 FOR v_order_id IN SELECT pg_catalog.unnest(v_orders)
 LOOP
  v_shipment_code := 'ENV-DEMO-' || pg_catalog.lpad(v_shipment_number::text, 3, '0');
  v_guide_code := 'GUIA-DEMO-' || pg_catalog.lpad(v_shipment_number::text, 3, '0');
  INSERT INTO abastece.shipments
   (code, order_id, location_id, mode, route_id, guide_code, qr_token, status)
  SELECT v_shipment_code, o.id, o.location_id, 'own', v_route_id,
         v_guide_code, pg_catalog.gen_random_uuid(), 'created'
  FROM abastece.orders AS o WHERE o.id = v_order_id
  RETURNING id INTO v_shipment_id;
  v_shipments := v_shipments || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'id', v_shipment_id, 'code', v_shipment_code, 'status', 'created',
   'order_id', v_order_id, 'order_status', 'ready', 'guide_code', v_guide_code));
  v_shipment_number := v_shipment_number + 1;
 END LOOP;

 INSERT INTO abastece.audit_events
  (actor_id, entity_type, entity_id, action, before_state, after_state, occurred_at)
 VALUES (p_staff, 'route_plan', v_route_id, 'route_confirmed', NULL,
  pg_catalog.jsonb_build_object('status', 'approved', 'shipment_count',
   pg_catalog.array_length(v_orders, 1)), v_reference_at);

 RETURN pg_catalog.jsonb_build_object('route_plan_id', v_route_id,
  'code', 'RUTA-DEMO-' || v_route_number, 'status', 'approved', 'shipments', v_shipments);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_confirmar_ruta(uuid,uuid,date,jsonb,numeric,numeric,text) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_confirmar_ruta(uuid,uuid,date,jsonb,numeric,numeric,text) FROM PUBLIC, anon, authenticated;

-- D-2.6 (#38), HU-3.3: registrar no es despachar. El backend entrega la guía
-- del courier; inventario, reservas y líneas se conservan hasta fn_despachar.
CREATE OR REPLACE FUNCTION abastece.fn_envio_courier(
 p_staff uuid, p_order uuid, p_carrier text, p_guide text, p_promised_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_role text;
 v_order abastece.orders%ROWTYPE;
 v_reference_at timestamptz;
 v_number text;
 v_code text;
 v_shipment uuid;
BEGIN
 SELECT role INTO v_role FROM abastece.staff_members WHERE id = p_staff AND active;
 IF v_role IS DISTINCT FROM 'logistica' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Solo logística activa puede registrar courier';
 END IF;
 IF p_order IS NULL OR p_carrier IS NULL OR pg_catalog.btrim(p_carrier) = '' OR
    p_guide IS NULL OR pg_catalog.btrim(p_guide) = '' OR
    (p_promised_at IS NOT NULL AND NOT pg_catalog.isfinite(p_promised_at)) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Datos de courier inválidos';
 END IF;
 -- Igual que fn_confirmar_ruta: advisory de altas → pedido FOR UPDATE.
 -- Comparte el espacio ENV-DEMO/GUIA-DEMO y evita asignar el pedido dos veces.
 PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 4);
 SELECT * INTO v_order FROM abastece.orders WHERE id = p_order FOR UPDATE;
 -- El endpoint no anuncia 404; al igual que rutas, un pedido no elegible es 409.
 IF NOT FOUND OR v_order.status <> 'ready' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Pedido no elegible para courier';
 END IF;
 IF EXISTS (SELECT 1 FROM abastece.shipments WHERE order_id = p_order) OR
    EXISTS (SELECT 1 FROM abastece.shipments WHERE guide_code = p_guide) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Pedido o guía ya tiene envío';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM abastece.order_items WHERE order_id = p_order) OR
    EXISTS (SELECT 1 FROM abastece.order_items WHERE order_id = p_order AND
     (approved_qty IS NULL OR approved_qty::text = 'NaN' OR prepared_qty::text = 'NaN' OR
      prepared_qty <> approved_qty)) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Pedido sin preparación completa';
 END IF;
 SELECT reference_at INTO STRICT v_reference_at FROM abastece.demo_metadata WHERE id;
 IF p_promised_at < v_reference_at THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Fecha prometida anterior al reloj de demo';
 END IF;
 -- Solo los códigos internos de envío asignan correlativos. Una guía externa
 -- es texto opaco, aunque coincida con GUIA-DEMO-NNN: nunca convertirla a numeric.
 SELECT (coalesce(pg_catalog.max(pg_catalog.split_part(code, '-', 3)::numeric), 0) + 1)::text
 INTO v_number FROM abastece.shipments WHERE code ~ '^ENV-DEMO-[0-9]+$';
 v_code := 'ENV-DEMO-' || pg_catalog.lpad(v_number, greatest(3, pg_catalog.length(v_number)), '0');
 INSERT INTO abastece.shipments
  (code, order_id, location_id, mode, carrier_name, guide_code, qr_token, status, promised_delivery_at)
 VALUES (v_code, p_order, v_order.location_id, 'courier', p_carrier, p_guide,
  pg_catalog.gen_random_uuid(), 'created', p_promised_at)
 RETURNING id INTO v_shipment;
 INSERT INTO abastece.audit_events
  (actor_id, location_id, entity_type, entity_id, action, before_state, after_state, occurred_at)
 VALUES (p_staff, v_order.location_id, 'shipment', v_shipment, 'shipment_courier_created', NULL,
  pg_catalog.jsonb_build_object('status', 'created', 'order_id', p_order, 'mode', 'courier',
   'carrier_name', p_carrier, 'guide_code', p_guide, 'promised_delivery_at', p_promised_at), v_reference_at);
 RETURN pg_catalog.jsonb_build_object('id', v_shipment, 'code', v_code, 'status', 'created',
  'order_id', p_order, 'order_status', v_order.status, 'guide_code', p_guide);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_envio_courier(uuid,uuid,text,text,timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_envio_courier(uuid,uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;

-- D-2.5 (#37), HU-2.4. FastAPI resuelve JWT; el QR no autoriza la recepción.
-- Una línea por shipment_item, incluidas las cantidades cero. No reserva stock.
CREATE OR REPLACE FUNCTION abastece.fn_recibir(
 p_staff uuid, p_shipment uuid, p_items jsonb, p_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_role text;
 v_order_id uuid;
 v_order abastece.orders%ROWTYPE;
 v_shipment abastece.shipments%ROWTYPE;
 v_reference_at timestamptz;
 v_transit uuid;
 v_quarantine uuid;
 v_receipt uuid;
 v_item jsonb;
 v_index integer;
 v_item_id uuid;
 v_seen uuid[] := ARRAY[]::uuid[];
 v_counted numeric;
 v_accepted numeric;
 v_line record;
 v_leg record;
 v_lock bigint;
 v_transfer uuid;
 v_move uuid;
 v_last uuid;
 v_bytes bytea;
 v_byte integer;
 v_carry boolean;
 v_status text := 'reconciled';
 v_shortages jsonb := '[]'::jsonb;
 v_lines jsonb := '[]'::jsonb;
 v_transfers jsonb;
 v_code text;
 v_number text;
BEGIN
 SELECT role INTO v_role FROM abastece.staff_members WHERE id = p_staff AND active;
 IF v_role IS DISTINCT FROM 'auxiliar' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Solo un auxiliar activo puede recibir';
 END IF;
 SELECT order_id INTO v_order_id FROM abastece.shipments WHERE id = p_shipment;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Envío no encontrado';
 END IF;
 -- Igual que preparación/despacho: pedido → envío → advisory global inventario.
 SELECT * INTO v_order FROM abastece.orders WHERE id = v_order_id FOR UPDATE;
 SELECT * INTO v_shipment FROM abastece.shipments WHERE id = p_shipment FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Envío no encontrado';
 END IF;
 IF v_shipment.order_id IS DISTINCT FROM v_order.id THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'El pedido del envío cambió';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM abastece.point_assignments
  WHERE staff_id = p_staff AND location_id = v_shipment.location_id) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Punto no asignado al auxiliar';
 END IF;
 IF EXISTS (SELECT 1 FROM abastece.receipts WHERE shipment_id = p_shipment) OR
    v_shipment.status NOT IN ('dispatched', 'delivered_unchecked') OR
    (v_shipment.status = 'dispatched' AND v_order.status <> 'shipped') OR
    (v_shipment.status = 'delivered_unchecked' AND v_order.status <> 'delivered_unchecked') THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Recepción existente o estado incompatible';
 END IF;
 SELECT reference_at INTO STRICT v_reference_at FROM abastece.demo_metadata WHERE id;
 IF v_shipment.dispatched_at IS NULL OR v_shipment.dispatched_at > v_reference_at OR
    v_shipment.delivered_at > v_reference_at THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Fechas de envío incompatibles con la recepción';
 END IF;
 SELECT id INTO v_transit FROM abastece.locations WHERE code = 'TRA-DEMO' AND kind = 'transit';
 SELECT id INTO v_quarantine FROM abastece.locations WHERE code = 'CUA-DEMO' AND kind = 'quarantine';
 IF v_transit IS NULL OR v_quarantine IS NULL OR NOT EXISTS (
  SELECT 1 FROM abastece.locations WHERE id = v_shipment.location_id AND kind = 'service_point'
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Ubicaciones de recepción no disponibles';
 END IF;
 IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR
    pg_catalog.jsonb_array_length(p_items) = 0 THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'items debe ser un arreglo no vacío',
   DETAIL = '{"field":"items"}';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 5);
 PERFORM i.id FROM abastece.order_items i WHERE i.order_id = v_order.id ORDER BY i.id FOR UPDATE;
 PERFORM i.id FROM abastece.shipment_items i WHERE i.shipment_id = p_shipment ORDER BY i.id FOR UPDATE;
 FOR v_item, v_index IN SELECT value, ordinality::integer
  FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY
 LOOP
  IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR
     pg_catalog.jsonb_typeof(v_item->'shipment_item_id') IS DISTINCT FROM 'string' OR
     (v_item->>'shipment_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     pg_catalog.jsonb_typeof(v_item->'counted_qty') IS DISTINCT FROM 'number' OR
     pg_catalog.jsonb_typeof(v_item->'accepted_qty') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Línea de recepción inválida',
    DETAIL = pg_catalog.jsonb_build_object('field', 'items', 'index', v_index)::text;
  END IF;
  v_item_id := (v_item->>'shipment_item_id')::uuid;
  v_counted := (v_item->>'counted_qty')::numeric;
  v_accepted := (v_item->>'accepted_qty')::numeric;
  IF v_item_id = ANY(v_seen) OR v_counted < 0 OR v_accepted < 0 OR v_accepted > v_counted OR
     v_counted > 999999999.999 OR v_counted <> pg_catalog.trunc(v_counted, 3) OR
     v_accepted <> pg_catalog.trunc(v_accepted, 3) OR NOT EXISTS (
      SELECT 1 FROM abastece.shipment_items WHERE id = v_item_id AND shipment_id = p_shipment
       AND shipped_qty::text <> 'NaN' AND v_counted <= shipped_qty
     ) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Cantidad, duplicado o línea ajena al envío',
    DETAIL = pg_catalog.jsonb_build_object('field', 'items', 'index', v_index)::text;
  END IF;
  v_seen := pg_catalog.array_append(v_seen, v_item_id);
 END LOOP;
 IF pg_catalog.cardinality(v_seen) <> (SELECT pg_catalog.count(*) FROM abastece.shipment_items
  WHERE shipment_id = p_shipment) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'Se requiere una línea por cada shipment_item',
   DETAIL = '{"field":"items"}';
 END IF;
 PERFORM l.id FROM abastece.product_lots l WHERE l.id IN (
  SELECT lot_id FROM abastece.shipment_items WHERE shipment_id = p_shipment
 ) ORDER BY l.id FOR SHARE;
 -- Los mismos advisory de ubicación/lote que los triggers, en orden estable.
 FOR v_lock IN SELECT DISTINCT pg_catalog.hashtextextended(x.location_id::text || i.lot_id::text, 0)
  FROM abastece.shipment_items i CROSS JOIN
   (VALUES (v_transit), (v_shipment.location_id), (v_quarantine)) x(location_id)
  WHERE i.shipment_id = p_shipment ORDER BY 1
 LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(v_lock);
 END LOOP;
 -- No gastar tránsito de otro envío para tapar una traza ausente o corrupta.
 IF EXISTS (
  SELECT 1 FROM abastece.shipment_items i WHERE i.shipment_id = p_shipment AND (
   EXISTS (SELECT 1 FROM abastece.stock_movements m WHERE m.shipment_item_id = i.id AND
    (m.product_id <> i.product_id OR m.lot_id <> i.lot_id OR m.reason = 'receipt')) OR
   (SELECT coalesce(pg_catalog.sum(m.delta_qty), 0) FROM abastece.stock_movements m
    WHERE m.shipment_item_id = i.id AND m.location_id = v_transit AND m.reason = 'dispatch'
     AND m.occurred_at <= v_reference_at) <> i.shipped_qty
  )
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Trazabilidad de despacho incompleta o incompatible';
 END IF;
 IF EXISTS (
  SELECT 1 FROM (
   -- Respaldar todo lo enviado: después de retirar lo contado, el faltante
   -- debe seguir existiendo en TRA; no basta con poder retirar counted_qty.
   SELECT lot_id, pg_catalog.sum(shipped_qty) AS needed
   FROM abastece.shipment_items WHERE shipment_id = p_shipment GROUP BY lot_id
  ) q CROSS JOIN LATERAL (SELECT
   (SELECT coalesce(pg_catalog.sum(delta_qty), 0) FROM abastece.stock_movements
    WHERE location_id = v_transit AND lot_id = q.lot_id AND occurred_at <= v_reference_at) AS physical,
   (SELECT coalesce(pg_catalog.sum(quantity), 0) FROM abastece.inventory_reservations
    WHERE location_id = v_transit AND lot_id = q.lot_id AND status = 'active') AS reserved
  ) stock WHERE stock.physical::text = 'NaN' OR stock.reserved::text = 'NaN' OR
   q.needed > stock.physical - stock.reserved
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Stock disponible en tránsito insuficiente';
 END IF;
 INSERT INTO abastece.receipts (shipment_id, checked_by, checked_at, notes)
 VALUES (p_shipment, p_staff, v_reference_at, coalesce(p_notes, '')) RETURNING id INTO v_receipt;
 FOR v_line IN SELECT i.*, (j.value->>'counted_qty')::numeric AS counted,
   (j.value->>'accepted_qty')::numeric AS accepted
  FROM abastece.shipment_items i JOIN pg_catalog.jsonb_array_elements(p_items) j(value)
   ON i.id = (j.value->>'shipment_item_id')::uuid
  WHERE i.shipment_id = p_shipment ORDER BY i.id
 LOOP
  INSERT INTO abastece.receipt_items
   (receipt_id, shipment_id, shipment_item_id, counted_qty, accepted_qty)
  VALUES (v_receipt, p_shipment, v_line.id, v_line.counted, v_line.accepted);
  IF v_line.accepted <> v_line.shipped_qty THEN v_status := 'with_difference'; END IF;
  IF v_line.counted < v_line.shipped_qty THEN
   v_shortages := v_shortages || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'shipment_item_id', v_line.id, 'shortage_qty', v_line.shipped_qty - v_line.counted));
  END IF;
  v_transfers := '[]'::jsonb;
  FOR v_leg IN SELECT * FROM (VALUES
   (v_shipment.location_id, v_line.accepted),
   (v_quarantine, v_line.counted - v_line.accepted)) legs(location_id, qty) WHERE qty > 0
  LOOP
   v_transfer := pg_catalog.gen_random_uuid();
   -- check_stock_balance ordena por (occurred_at,id). Con el reloj fijo, la
   -- salida debe ordenar después de la entrada de despacho del mismo instante.
   -- Mantener reference_at y los triggers: avanzar el UUID solo si es necesario.
   v_move := pg_catalog.gen_random_uuid();
   SELECT id INTO v_last FROM abastece.stock_movements
   WHERE location_id = v_transit AND lot_id = v_line.lot_id AND occurred_at = v_reference_at
   ORDER BY id DESC LIMIT 1;
   IF v_last IS NOT NULL AND v_move <= v_last THEN v_move := v_last; END IF;
   WHILE v_move = v_last OR EXISTS (SELECT 1 FROM abastece.stock_movements WHERE id = v_move) LOOP
    v_bytes := pg_catalog.uuid_send(v_move);
    v_carry := true;
    FOR v_byte IN REVERSE 15..0 LOOP
     IF pg_catalog.get_byte(v_bytes, v_byte) < 255 THEN
      v_bytes := pg_catalog.set_byte(v_bytes, v_byte, pg_catalog.get_byte(v_bytes, v_byte) + 1);
      v_carry := false;
      EXIT;
     END IF;
     v_bytes := pg_catalog.set_byte(v_bytes, v_byte, 0);
    END LOOP;
    IF v_carry THEN
     RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'No hay UUID posterior para ordenar el historial';
    END IF;
    v_move := pg_catalog.encode(v_bytes, 'hex')::uuid;
   END LOOP;
   BEGIN
    INSERT INTO abastece.stock_movements
     (id, location_id, product_id, lot_id, delta_qty, occurred_at, reason,
      transfer_group, shipment_item_id, recorded_by)
    VALUES (v_move, v_transit, v_line.product_id, v_line.lot_id, -v_leg.qty, v_reference_at,
     'receipt', v_transfer, v_line.id, p_staff);
    INSERT INTO abastece.stock_movements
     (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
      transfer_group, shipment_item_id, recorded_by)
    VALUES (v_leg.location_id, v_line.product_id, v_line.lot_id, v_leg.qty, v_reference_at,
     'receipt', v_transfer, v_line.id, p_staff);
   EXCEPTION WHEN raise_exception THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Inventario incompatible con la recepción';
   END;
   v_transfers := v_transfers || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'transfer_group', v_transfer, 'from', v_transit, 'to', v_leg.location_id, 'quantity', v_leg.qty));
  END LOOP;
  v_lines := v_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'shipment_item_id', v_line.id, 'shipped_qty', v_line.shipped_qty, 'counted_qty', v_line.counted,
   'accepted_qty', v_line.accepted, 'damaged_qty', v_line.counted - v_line.accepted,
   'shortage_qty', v_line.shipped_qty - v_line.counted, 'transfers', v_transfers));
 END LOOP;
 IF pg_catalog.jsonb_array_length(v_shortages) > 0 THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 2);
  SELECT (coalesce(pg_catalog.max(substring(code FROM 5)::bigint), 0) + 1)::text
  INTO v_number FROM abastece.incidents WHERE code ~ '^INC-[0-9]+$';
  v_code := 'INC-' || pg_catalog.lpad(v_number, greatest(3, pg_catalog.length(v_number)), '0');
  INSERT INTO abastece.incidents
   (code, location_id, order_id, shipment_id, kind, severity, status, description, created_at, created_by)
  VALUES (v_code, v_shipment.location_id, v_order.id, p_shipment, 'receipt_shortage', 'high', 'open',
   'Faltantes de recepción; permanecen en tránsito: ' || v_shortages::text, v_reference_at, p_staff);
 END IF;
 UPDATE abastece.shipments SET status = v_status WHERE id = p_shipment;
 UPDATE abastece.orders SET status = v_status WHERE id = v_order.id;
 INSERT INTO abastece.audit_events
  (actor_id, location_id, entity_type, entity_id, action, before_state, after_state, occurred_at)
 VALUES (p_staff, v_shipment.location_id, 'shipment', p_shipment, 'shipment_receipt',
  pg_catalog.jsonb_build_object('status', v_shipment.status, 'order_status', v_order.status),
  pg_catalog.jsonb_build_object('status', v_status, 'order_status', v_status,
   'receipt_id', v_receipt, 'items', v_lines, 'incident_code', v_code), v_reference_at);
 RETURN pg_catalog.jsonb_build_object('id', v_shipment.id, 'code', v_shipment.code,
  'status', v_status, 'order_id', v_order.id, 'order_status', v_status, 'guide_code', v_shipment.guide_code);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_recibir(uuid,uuid,jsonb,text) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_recibir(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;


-- D-2.3 (#35): acuerdos de Omar en #135. Sin cambios de tablas ni nuevas FK.
-- Una línea por ítem/lote; la auditoría conserva las reservas que la componen.
CREATE OR REPLACE FUNCTION abastece.fn_despachar(p_staff uuid, p_shipment uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_staff_role text;
 v_order_id uuid;
 v_order abastece.orders%ROWTYPE;
 v_shipment abastece.shipments%ROWTYPE;
 v_route_status text;
 v_bodega uuid;
 v_transit uuid;
 v_reference_at timestamptz;
 v_reservations uuid[];
 v_lock bigint;
 v_line record;
 v_shipment_item uuid;
 v_transfer uuid;
 v_lines jsonb := '[]'::jsonb;
BEGIN
 SELECT role INTO v_staff_role FROM abastece.staff_members
 WHERE id = p_staff AND active;
 IF v_staff_role IS NULL OR v_staff_role NOT IN ('bodega', 'logistica') THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Rol no autorizado para despachar';
 END IF;

 SELECT order_id INTO v_order_id FROM abastece.shipments WHERE id = p_shipment;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Envío no encontrado';
 END IF;
 -- Mismo orden que preparación: pedido antes del advisory global (17391011, 5).
 -- Releer el envío bloqueado evita usar un order_id cambiado durante la espera.
 SELECT * INTO v_order FROM abastece.orders WHERE id = v_order_id FOR UPDATE;
 SELECT * INTO v_shipment FROM abastece.shipments WHERE id = p_shipment FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Envío no encontrado';
 END IF;
 IF v_shipment.order_id IS DISTINCT FROM v_order.id THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'El pedido del envío cambió';
 END IF;
 IF v_shipment.status = 'dispatched' THEN
  RETURN pg_catalog.jsonb_build_object('id', v_shipment.id, 'code', v_shipment.code,
   'status', v_shipment.status, 'order_id', v_order.id,
   'order_status', v_order.status, 'guide_code', v_shipment.guide_code);
 END IF;
 IF v_shipment.status <> 'created' OR v_order.status <> 'ready' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Envío o pedido no apto para despacho';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 5);

 IF v_shipment.mode = 'own' THEN
  SELECT status INTO v_route_status FROM abastece.route_plans
  WHERE id = v_shipment.route_id FOR UPDATE;
  IF v_route_status IS NULL OR v_route_status NOT IN ('approved', 'dispatched') OR
     NOT EXISTS (SELECT 1 FROM abastece.route_stops
      WHERE route_id = v_shipment.route_id AND location_id = v_shipment.location_id) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Ruta no apta para este envío';
  END IF;
 END IF;
 SELECT id INTO v_bodega FROM abastece.locations WHERE code = 'BOD-DEMO' AND kind = 'warehouse';
 SELECT id INTO v_transit FROM abastece.locations WHERE code = 'TRA-DEMO' AND kind = 'transit';
 IF v_bodega IS NULL OR v_transit IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Ubicaciones de despacho no disponibles';
 END IF;
 SELECT reference_at INTO STRICT v_reference_at FROM abastece.demo_metadata WHERE id = true;
 IF v_shipment.dispatched_at IS NOT NULL OR v_shipment.delivered_at IS NOT NULL OR
    (v_shipment.promised_delivery_at IS NOT NULL AND
     v_shipment.promised_delivery_at < v_reference_at) OR
    EXISTS (SELECT 1 FROM abastece.shipments
     WHERE order_id = v_order.id AND id <> p_shipment) OR
    EXISTS (SELECT 1 FROM abastece.shipment_items WHERE order_id = v_order.id) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Envío con datos previos incompatibles';
 END IF;

 PERFORM i.id FROM abastece.order_items AS i
 WHERE i.order_id = v_order.id ORDER BY i.id FOR UPDATE;
 PERFORM r.id FROM abastece.inventory_reservations AS r
 JOIN abastece.order_items AS i ON i.id = r.order_item_id
 WHERE i.order_id = v_order.id ORDER BY r.id FOR UPDATE OF r;
 IF NOT EXISTS (SELECT 1 FROM abastece.order_items WHERE order_id = v_order.id AND prepared_qty > 0) OR
    EXISTS (SELECT 1 FROM abastece.order_items WHERE order_id = v_order.id
     AND (approved_qty IS NULL OR prepared_qty <> approved_qty OR
      approved_qty::text = 'NaN' OR prepared_qty::text = 'NaN')) OR
    EXISTS (
     SELECT 1 FROM abastece.order_items AS i
     LEFT JOIN (
      SELECT order_item_id, pg_catalog.sum(quantity) AS qty
      FROM abastece.inventory_reservations WHERE status = 'active' GROUP BY order_item_id
     ) AS r ON r.order_item_id = i.id
     WHERE i.order_id = v_order.id AND i.prepared_qty <> coalesce(r.qty, 0)
    ) OR EXISTS (
     SELECT 1 FROM abastece.inventory_reservations AS r
     JOIN abastece.order_items AS i ON i.id = r.order_item_id
     WHERE i.order_id = v_order.id AND (r.status = 'fulfilled' OR
      (r.status = 'active' AND (r.location_id <> v_bodega OR r.product_id <> i.product_id OR
       r.quantity::text = 'NaN')))
    ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Preparación o reservas inconsistentes';
 END IF;
 SELECT pg_catalog.array_agg(r.id ORDER BY r.id) INTO v_reservations
 FROM abastece.inventory_reservations AS r
 JOIN abastece.order_items AS i ON i.id = r.order_item_id
 WHERE i.order_id = v_order.id AND r.status = 'active';

 -- Fija las fechas de los lotes antes de validarlas. Los advisory son los
 -- mismos de check_stock_balance/check_reservation, ordenados para BOD y TRA.
 PERFORM l.id FROM abastece.product_lots AS l WHERE l.id IN (
  SELECT lot_id FROM abastece.inventory_reservations WHERE id = ANY(v_reservations)
 ) ORDER BY l.id FOR SHARE;
 IF EXISTS (
  SELECT 1 FROM abastece.inventory_reservations AS r
  JOIN abastece.product_lots AS l ON l.id = r.lot_id
  WHERE r.id = ANY(v_reservations) AND l.expires_on < v_reference_at::date
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Reserva activa en lote vencido';
 END IF;
 FOR v_lock IN
  SELECT DISTINCT pg_catalog.hashtextextended(x.location_id::text || r.lot_id::text, 0)
  FROM abastece.inventory_reservations AS r
  CROSS JOIN (VALUES (v_bodega), (v_transit)) AS x(location_id)
  WHERE r.id = ANY(v_reservations) ORDER BY 1
 LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(v_lock);
 END LOOP;
 IF EXISTS (
  SELECT 1 FROM (
   SELECT
    (SELECT coalesce(pg_catalog.sum(delta_qty), 0) FROM abastece.stock_movements
     WHERE location_id = v_bodega AND lot_id = l.lot_id AND occurred_at <= v_reference_at) AS physical,
    (SELECT coalesce(pg_catalog.sum(quantity), 0) FROM abastece.inventory_reservations
     WHERE location_id = v_bodega AND lot_id = l.lot_id AND status = 'active') AS reserved
   FROM (SELECT DISTINCT lot_id FROM abastece.inventory_reservations
    WHERE id = ANY(v_reservations)) AS l
  ) AS stock WHERE physical < reserved OR physical::text = 'NaN' OR reserved::text = 'NaN'
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Stock físico insuficiente para las reservas';
 END IF;

 -- Cumplir primero: el trigger de inventario impide consumir stock reservado.
 UPDATE abastece.inventory_reservations SET status = 'fulfilled'
 WHERE id = ANY(v_reservations);
 FOR v_line IN
  SELECT order_item_id, product_id, lot_id, pg_catalog.sum(quantity) AS qty,
   pg_catalog.jsonb_agg(id ORDER BY id) AS reservation_ids
  FROM abastece.inventory_reservations WHERE id = ANY(v_reservations)
  GROUP BY order_item_id, product_id, lot_id ORDER BY order_item_id, lot_id
 LOOP
  INSERT INTO abastece.shipment_items
   (shipment_id, order_id, order_item_id, product_id, lot_id, shipped_qty)
  VALUES (p_shipment, v_order.id, v_line.order_item_id, v_line.product_id,
   v_line.lot_id, v_line.qty) RETURNING id INTO v_shipment_item;
  v_transfer := pg_catalog.gen_random_uuid();
  BEGIN
   INSERT INTO abastece.stock_movements
    (location_id, product_id, lot_id, delta_qty, occurred_at, reason,
     transfer_group, shipment_item_id, recorded_by)
   VALUES
    (v_bodega, v_line.product_id, v_line.lot_id, -v_line.qty, v_reference_at,
     'dispatch', v_transfer, v_shipment_item, p_staff),
    (v_transit, v_line.product_id, v_line.lot_id, v_line.qty, v_reference_at,
     'dispatch', v_transfer, v_shipment_item, p_staff);
  EXCEPTION WHEN raise_exception THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Inventario incompatible con el despacho';
  END;
  v_lines := v_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'shipment_item_id', v_shipment_item, 'order_item_id', v_line.order_item_id,
   'product_id', v_line.product_id, 'lot_id', v_line.lot_id, 'shipped_qty', v_line.qty,
   'reservation_ids', v_line.reservation_ids, 'transfer_group', v_transfer));
 END LOOP;
 UPDATE abastece.shipments SET status = 'dispatched', dispatched_at = v_reference_at
 WHERE id = p_shipment;
 UPDATE abastece.orders SET status = 'shipped' WHERE id = v_order.id;
 IF v_shipment.mode = 'own' AND v_route_status = 'approved' THEN
  UPDATE abastece.route_plans SET status = 'dispatched' WHERE id = v_shipment.route_id;
 END IF;
 INSERT INTO abastece.audit_events
  (actor_id, location_id, entity_type, entity_id, action, before_state, after_state, occurred_at)
 VALUES (p_staff, v_order.location_id, 'shipment', p_shipment, 'shipment_dispatch',
  pg_catalog.jsonb_build_object('status', v_shipment.status, 'order_status', v_order.status,
   'route_status', v_route_status),
  pg_catalog.jsonb_build_object('status', 'dispatched', 'order_status', 'shipped',
   'route_status', CASE WHEN v_shipment.mode = 'own' THEN 'dispatched' ELSE NULL END,
   'items', v_lines), v_reference_at);
 RETURN pg_catalog.jsonb_build_object('id', v_shipment.id, 'code', v_shipment.code,
  'status', 'dispatched', 'order_id', v_order.id, 'order_status', 'shipped',
  'guide_code', v_shipment.guide_code);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_despachar(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_despachar(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- D-2.4 (#36), HU-2.3: entrega sin conteo. No mueve ni reserva inventario.
CREATE OR REPLACE FUNCTION abastece.fn_marcar_entregado(p_staff uuid, p_shipment uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_role text;
 v_order_id uuid;
 v_order abastece.orders%ROWTYPE;
 v_shipment abastece.shipments%ROWTYPE;
 v_reference_at timestamptz;
BEGIN
 SELECT role INTO v_role FROM abastece.staff_members WHERE id = p_staff AND active;
 IF v_role IS DISTINCT FROM 'supervisor' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Solo un supervisor activo puede marcar entrega';
 END IF;
 SELECT order_id INTO v_order_id FROM abastece.shipments WHERE id = p_shipment;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Envío no encontrado';
 END IF;
 -- Orden compartido con despacho y recepción: pedido antes de envío.
 SELECT * INTO v_order FROM abastece.orders WHERE id = v_order_id FOR UPDATE;
 SELECT * INTO v_shipment FROM abastece.shipments WHERE id = p_shipment FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Envío no encontrado';
 END IF;
 IF v_shipment.order_id IS DISTINCT FROM v_order.id THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'El pedido del envío cambió';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM abastece.point_assignments
  WHERE staff_id = p_staff AND location_id = v_shipment.location_id) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Punto no asignado al supervisor';
 END IF;
 -- Autorizar antes de devolver el resultado idempotente, incluso para históricos.
 IF v_shipment.status <> 'delivered_unchecked' THEN
  IF v_shipment.status <> 'dispatched' OR v_order.status <> 'shipped' THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Envío o pedido no apto para marcar entrega';
  END IF;
  SELECT reference_at INTO STRICT v_reference_at FROM abastece.demo_metadata WHERE id;
  IF v_shipment.dispatched_at IS NULL OR v_shipment.dispatched_at > v_reference_at OR
     v_shipment.delivered_at IS NOT NULL OR
     EXISTS (SELECT 1 FROM abastece.receipts WHERE shipment_id = p_shipment) THEN
   RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Fechas o recepción incompatibles con marcar entrega';
  END IF;
  UPDATE abastece.shipments SET status = 'delivered_unchecked', delivered_at = v_reference_at
  WHERE id = p_shipment;
  UPDATE abastece.orders SET status = 'delivered_unchecked' WHERE id = v_order.id;
  INSERT INTO abastece.audit_events
   (actor_id, location_id, entity_type, entity_id, action, before_state, after_state, occurred_at)
  VALUES (p_staff, v_shipment.location_id, 'shipment', p_shipment, 'shipment_delivered',
   pg_catalog.jsonb_build_object('status', v_shipment.status, 'order_status', v_order.status),
   pg_catalog.jsonb_build_object('status', 'delivered_unchecked', 'order_id', v_order.id,
    'order_status', 'delivered_unchecked', 'delivered_at', v_reference_at), v_reference_at);
  v_shipment.status := 'delivered_unchecked';
  v_order.status := 'delivered_unchecked';
 END IF;
 RETURN pg_catalog.jsonb_build_object('id', v_shipment.id, 'code', v_shipment.code,
  'status', v_shipment.status, 'order_id', v_order.id,
  'order_status', v_order.status, 'guide_code', v_shipment.guide_code);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_marcar_entregado(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_marcar_entregado(uuid,uuid) FROM PUBLIC, anon, authenticated;
