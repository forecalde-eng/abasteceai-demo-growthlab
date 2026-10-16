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

-- D-1.2 (#29): detecciones deterministas para fn_analizar_reglas.
-- No escribe ni recibe una propuesta de IA. El wrapper transaccional de C3
-- usará estos hallazgos cuando se cierre el formato de p_proposal.
CREATE FUNCTION abastece.fn_detectar_reglas_pedido(p_order uuid) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
 WITH target AS (
  SELECT id, location_id, cycle_month, status, order_type
  FROM abastece.orders WHERE id = p_order
 ), fingerprint AS (
  SELECT pg_catalog.string_agg(i.product_id::text || ':' || i.requested_qty::text,
   ',' ORDER BY i.product_id) AS value
  FROM abastece.order_items AS i WHERE i.order_id = p_order
 ), duplicates AS (
  SELECT o.id AS order_id, o.code AS order_code
  FROM target AS t
  JOIN abastece.orders AS o ON o.location_id = t.location_id
   AND o.cycle_month = t.cycle_month AND o.id <> t.id
  WHERE t.status = 'submitted' AND t.order_type = 'regular'
   AND o.order_type = 'regular' AND o.status <> 'cancelled'
   AND (SELECT value FROM fingerprint) IS NOT NULL
   AND (SELECT pg_catalog.string_agg(i.product_id::text || ':' || i.requested_qty::text,
    ',' ORDER BY i.product_id) FROM abastece.order_items AS i WHERE i.order_id = o.id)
    = (SELECT value FROM fingerprint)
 ), missing AS (
  SELECT p.id AS product_id, p.sku
  FROM target AS t
  JOIN abastece.replenishment_policies AS r ON r.location_id = t.location_id
  JOIN abastece.products AS p ON p.id = r.product_id
  WHERE t.status = 'submitted' AND t.order_type = 'regular' AND r.required_in_kit
   AND NOT EXISTS (SELECT 1 FROM abastece.order_items AS i
    WHERE i.order_id = t.id AND i.product_id = r.product_id)
 ), detected_kinds AS (
  SELECT 'possible_duplicate'::text AS kind WHERE EXISTS (SELECT 1 FROM duplicates)
  UNION ALL
  SELECT 'missing_from_kit'::text WHERE EXISTS (SELECT 1 FROM missing)
 ), open_incidents AS (
  SELECT DISTINCT ON (i.kind) i.id, i.code, i.kind
  FROM abastece.incidents AS i JOIN detected_kinds AS k ON k.kind = i.kind
  WHERE i.order_id = p_order AND i.status IN ('open', 'under_review')
  ORDER BY i.kind, i.created_at, i.id
 )
 SELECT pg_catalog.jsonb_build_object(
  'duplicates', coalesce((SELECT pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('order_id', order_id, 'order_code', order_code)
   ORDER BY order_code, order_id) FROM duplicates), '[]'::jsonb),
  'missing_kit', coalesce((SELECT pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('product_id', product_id, 'sku', sku)
   ORDER BY sku, product_id) FROM missing), '[]'::jsonb),
  'open_incidents', coalesce((SELECT pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('id', id, 'code', code, 'kind', kind)
   ORDER BY kind) FROM open_incidents), '[]'::jsonb),
  'kinds_to_create', coalesce((SELECT pg_catalog.jsonb_agg(k.kind ORDER BY k.kind)
   FROM detected_kinds AS k WHERE NOT EXISTS (
    SELECT 1 FROM open_incidents AS i WHERE i.kind = k.kind)), '[]'::jsonb)
 );
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_detectar_reglas_pedido(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_detectar_reglas_pedido(uuid) FROM PUBLIC, anon, authenticated;

-- El reloj de demostración es fijo. Esta identidad conserva el orden real de
-- inserción incluso cuando varios análisis comparten created_at.
ALTER TABLE abastece.decision_logs
 ADD COLUMN analysis_sequence bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX decision_logs_analysis_sequence_uq
 ON abastece.decision_logs (analysis_sequence);

-- D-1.2 (#29): POST /orders/{id}/analyze. FastAPI resuelve el JWT y llama a
-- Jev fuera de esta transacción únicamente si el pedido sigue submitted.
CREATE FUNCTION abastece.fn_analizar_reglas(
 p_staff uuid, p_order uuid, p_proposal jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
 v_role text;
 v_order abastece.orders%ROWTYPE;
 v_findings jsonb;
 v_incidents jsonb := '[]'::jsonb;
 v_proposal jsonb;
 v_log abastece.decision_logs%ROWTYPE;
 v_ref timestamptz;
 v_provider text;
 v_model_version text;
 v_status text;
 v_response jsonb;
 v_is_timeout boolean;
 v_input_tokens numeric;
 v_cost numeric;
 v_kind text;
 v_code text;
 v_ai_id uuid;
BEGIN
 SELECT role INTO v_role FROM abastece.staff_members
 WHERE id = p_staff AND active;
 IF v_role IS NULL OR v_role NOT IN ('administrador', 'auxiliar', 'supervisor') THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Perfil no autorizado para analizar';
 END IF;

 SELECT * INTO v_order FROM abastece.orders WHERE id = p_order FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Pedido no encontrado';
 END IF;
 IF v_role IN ('auxiliar', 'supervisor') AND v_order.requested_by <> p_staff THEN
  RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Solo el autor puede analizar este pedido';
 END IF;

 IF v_order.status <> 'submitted' THEN
  -- C3: esta rama no llama a Jev ni escribe; ignora incluso un sobre malformado.
  SELECT * INTO v_log FROM abastece.decision_logs
  WHERE order_id = p_order AND provider IN ('mock', 'typesafe', 'openai')
  ORDER BY analysis_sequence DESC LIMIT 1;
  IF FOUND THEN
   v_proposal := pg_catalog.jsonb_build_object(
    'source', CASE WHEN v_log.provider = 'mock' THEN 'SIMULADO' ELSE 'API_REAL' END,
    'model', CASE WHEN v_log.response ? 'error' THEN v_log.model_version
     ELSE coalesce(v_log.response->>'model', v_log.model_version) END,
    'status', v_log.status,
    'answers', CASE WHEN pg_catalog.jsonb_typeof(v_log.response->'answers') = 'object'
     THEN v_log.response->'answers' ELSE '{}'::jsonb END,
    'decision_log_id', v_log.id);
  END IF;
  RETURN pg_catalog.jsonb_build_object('order_id', p_order,
   'duplicates', '[]'::jsonb, 'missing_kit', '[]'::jsonb,
   'incidents', '[]'::jsonb, 'proposal', v_proposal);
 END IF;

 -- p_proposal es el sobre interno aprobado en C3. No se acepta un ID ni una
 -- fuente enviada por FastAPI: ambos se derivan del INSERT y del proveedor.
 IF p_proposal IS NULL OR pg_catalog.jsonb_typeof(p_proposal) <> 'object' THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_proposal debe ser objeto JSON';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_proposal) AS k(key)
  WHERE key NOT IN ('provider', 'model_version', 'input_state', 'response',
   'proposed_action', 'status', 'input_tokens', 'estimated_cost_usd')) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_proposal contiene claves no permitidas';
 END IF;
 v_provider := p_proposal->>'provider';
 v_status := p_proposal->>'status';
 v_response := p_proposal->'response';
 IF pg_catalog.jsonb_typeof(p_proposal->'provider') IS DISTINCT FROM 'string' OR
    v_provider IS NULL OR v_provider NOT IN ('mock', 'typesafe', 'openai') OR
    pg_catalog.jsonb_typeof(p_proposal->'status') IS DISTINCT FROM 'string' OR
    v_status IS NULL OR v_status NOT IN ('proposed', 'human_review') OR
    pg_catalog.jsonb_typeof(p_proposal->'input_state') IS DISTINCT FROM 'object' OR
    p_proposal->'input_state' = '{}'::jsonb OR
    pg_catalog.jsonb_typeof(v_response) IS DISTINCT FROM 'object' OR
    pg_catalog.jsonb_typeof(p_proposal->'proposed_action') IS DISTINCT FROM 'string' OR
    nullif(pg_catalog.btrim(p_proposal->>'proposed_action'), '') IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_proposal tiene campos inválidos';
 END IF;
 v_is_timeout := v_response ? 'error';
 IF v_is_timeout THEN
  IF v_response <> '{"error":"timeout"}'::jsonb OR v_provider <> 'typesafe' OR
     v_status <> 'human_review' OR p_proposal->>'proposed_action' <> 'human_review' THEN
   RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Timeout de Jev inválido';
  END IF;
 ELSE
  IF pg_catalog.jsonb_typeof(v_response->'model') IS DISTINCT FROM 'string' OR
     nullif(pg_catalog.btrim(v_response->>'model'), '') IS NULL OR
     pg_catalog.jsonb_typeof(v_response->'answers') IS DISTINCT FROM 'object' OR
     pg_catalog.jsonb_typeof(v_response->'usage') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Respuesta de Jev inválida';
  END IF;
 END IF;
 IF p_proposal ? 'model_version' AND
    (pg_catalog.jsonb_typeof(p_proposal->'model_version') IS DISTINCT FROM 'string' OR
     nullif(pg_catalog.btrim(p_proposal->>'model_version'), '') IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'model_version inválido';
 END IF;
 v_model_version := coalesce(p_proposal->>'model_version', v_response->>'model');
 IF nullif(pg_catalog.btrim(v_model_version), '') IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'model_version obligatorio';
 END IF;
 IF pg_catalog.jsonb_typeof(p_proposal->'input_tokens') IS DISTINCT FROM 'number' OR
    pg_catalog.jsonb_typeof(p_proposal->'estimated_cost_usd') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Uso de Jev inválido';
 END IF;
 v_input_tokens := (p_proposal->>'input_tokens')::numeric;
 v_cost := (p_proposal->>'estimated_cost_usd')::numeric;
 IF v_input_tokens < 0 OR v_input_tokens > 2147483647 OR
    v_input_tokens <> pg_catalog.trunc(v_input_tokens) OR
    v_cost < 0 OR v_cost >= 1000000 OR v_cost <> pg_catalog.round(v_cost, 8) OR
    (v_provider = 'mock' AND (v_input_tokens <> 0 OR v_cost <> 0)) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Uso de Jev fuera de rango';
 END IF;

 SELECT reference_at INTO STRICT v_ref FROM abastece.demo_metadata WHERE id = true;
 v_findings := abastece.fn_detectar_reglas_pedido(p_order);

 -- El pedido está bloqueado. El advisory lock serializa códigos INC-NNN entre
 -- pedidos distintos; incidents.code UNIQUE sigue siendo la defensa final.
 PERFORM pg_catalog.pg_advisory_xact_lock(17391011, 2);
 FOR v_kind IN SELECT pg_catalog.jsonb_array_elements_text(v_findings->'kinds_to_create')
 LOOP
  IF NOT EXISTS (SELECT 1 FROM abastece.incidents
   WHERE order_id = p_order AND kind = v_kind AND status IN ('open', 'under_review')) THEN
   SELECT 'INC-' || pg_catalog.lpad(
    (coalesce(max(substring(code FROM 5)::bigint), 0) + 1)::text, 3, '0')
   INTO v_code FROM abastece.incidents WHERE code ~ '^INC-[0-9]+$';
   INSERT INTO abastece.incidents
    (code, location_id, order_id, kind, severity, status, description,
     created_at, created_by)
   VALUES (v_code, v_order.location_id, p_order, v_kind,
    CASE v_kind WHEN 'possible_duplicate' THEN 'high' ELSE 'medium' END,
    'open', CASE v_kind WHEN 'possible_duplicate'
     THEN 'Posible duplicado: mismo punto, ciclo, productos y cantidades.'
     ELSE 'Faltan productos obligatorios del kit del punto.' END,
    v_ref, p_staff);
  END IF;
 END LOOP;

 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id', id, 'code', code, 'kind', kind) ORDER BY kind), '[]'::jsonb)
 INTO v_incidents FROM (
  SELECT DISTINCT ON (i.kind) i.id, i.code, i.kind, i.created_at
  FROM abastece.incidents AS i
  WHERE i.order_id = p_order AND i.status IN ('open', 'under_review')
   AND ((i.kind = 'possible_duplicate' AND
    pg_catalog.jsonb_array_length(v_findings->'duplicates') > 0) OR
    (i.kind = 'missing_from_kit' AND
    pg_catalog.jsonb_array_length(v_findings->'missing_kit') > 0))
  ORDER BY i.kind, i.created_at, i.id
 ) AS selected_incidents;

 INSERT INTO abastece.decision_logs
  (location_id, order_id, task, provider, model_version, input_state,
   response, proposed_action, status, input_tokens, estimated_cost_usd, created_at)
 VALUES (v_order.location_id, p_order, 'detect_rules', 'rules', 'rules-v1',
  pg_catalog.jsonb_build_object('order_id', p_order, 'order_code', v_order.code),
  pg_catalog.jsonb_build_object('duplicates', v_findings->'duplicates',
   'missing_kit', v_findings->'missing_kit', 'incidents', v_incidents),
  'review_alerts', 'proposed', 0, 0, v_ref);

 INSERT INTO abastece.decision_logs
  (location_id, order_id, task, provider, model_version, input_state,
   response, proposed_action, status, input_tokens, estimated_cost_usd, created_at)
 VALUES (v_order.location_id, p_order, 'classify_notes', v_provider,
  v_model_version, p_proposal->'input_state', v_response,
  p_proposal->>'proposed_action', v_status, v_input_tokens::integer, v_cost, v_ref)
 RETURNING id INTO v_ai_id;

 v_proposal := pg_catalog.jsonb_build_object(
  'source', CASE WHEN v_provider = 'mock' THEN 'SIMULADO' ELSE 'API_REAL' END,
  'model', CASE WHEN v_is_timeout THEN v_model_version ELSE v_response->>'model' END,
  'status', v_status,
  'answers', CASE WHEN v_is_timeout THEN '{}'::jsonb ELSE v_response->'answers' END,
  'decision_log_id', v_ai_id);
 RETURN pg_catalog.jsonb_build_object('order_id', p_order,
  'duplicates', v_findings->'duplicates', 'missing_kit', v_findings->'missing_kit',
  'incidents', v_incidents, 'proposal', v_proposal);
END;
$$;

GRANT EXECUTE ON FUNCTION abastece.fn_analizar_reglas(uuid,uuid,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION abastece.fn_analizar_reglas(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- D-1.3 (#30): POST /orders/{id}/decision.
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
