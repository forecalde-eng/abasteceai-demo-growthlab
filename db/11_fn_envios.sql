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
