-- Reglas de integridad, vistas y RLS. Lectura por usuario/rol/punto.
-- Las acciones de escritura se implementarán mediante endpoints o RPC validados.
-- Este archivo deniega escritura directa del navegador, incluso sobre el propio rol.
BEGIN;
ALTER TABLE abastece.order_items ADD UNIQUE(id,product_id);
ALTER TABLE abastece.inventory_reservations ADD FOREIGN KEY(order_item_id,product_id)
 REFERENCES abastece.order_items(id,product_id);

CREATE FUNCTION abastece.prevent_ledger_edit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'El historial de inventario es inmutable: registrar un movimiento compensatorio';
END; $$;
CREATE TRIGGER stock_history_immutable BEFORE UPDATE OR DELETE ON abastece.stock_movements
 FOR EACH ROW EXECUTE FUNCTION abastece.prevent_ledger_edit();

CREATE FUNCTION abastece.check_stock_balance() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE minimum_balance numeric; final_balance numeric; reserved numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.location_id::text||NEW.lot_id::text,0));
 SELECT min(balance) INTO minimum_balance FROM (
  SELECT sum(x.delta_qty) OVER(ORDER BY x.occurred_at,x.id ROWS UNBOUNDED PRECEDING) balance
  FROM (
   SELECT id,occurred_at,delta_qty FROM abastece.stock_movements
    WHERE location_id=NEW.location_id AND lot_id=NEW.lot_id
   UNION ALL SELECT NEW.id,NEW.occurred_at,NEW.delta_qty
  ) x
 ) balances;
 IF minimum_balance<0 THEN RAISE EXCEPTION 'Movimiento produce inventario negativo, incluso en el historial'; END IF;
 SELECT coalesce(sum(delta_qty),0)+NEW.delta_qty INTO final_balance FROM abastece.stock_movements
  WHERE location_id=NEW.location_id AND lot_id=NEW.lot_id;
 SELECT coalesce(sum(quantity),0) INTO reserved FROM abastece.inventory_reservations
  WHERE location_id=NEW.location_id AND lot_id=NEW.lot_id AND status='active';
 IF final_balance<reserved THEN RAISE EXCEPTION 'Movimiento consumiría inventario reservado: resolver reservas en la misma transacción'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER stock_nonnegative BEFORE INSERT ON abastece.stock_movements
 FOR EACH ROW EXECUTE FUNCTION abastece.check_stock_balance();

CREATE FUNCTION abastece.check_reservation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE balance numeric; reserved numeric; prepared numeric; approved numeric; expiry date; ref_date date;
BEGIN
 IF NEW.status<>'active' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.location_id::text||NEW.lot_id::text,0));
 SELECT reference_at::date INTO ref_date FROM abastece.demo_metadata WHERE id;
 SELECT expires_on INTO expiry FROM abastece.product_lots WHERE id=NEW.lot_id;
 IF expiry<ref_date THEN RAISE EXCEPTION 'No reservar un lote vencido'; END IF;
 SELECT coalesce(sum(delta_qty),0) INTO balance FROM abastece.stock_movements
  WHERE location_id=NEW.location_id AND lot_id=NEW.lot_id
   AND occurred_at<=(SELECT reference_at FROM abastece.demo_metadata WHERE id);
 SELECT coalesce(sum(quantity),0) INTO reserved FROM abastece.inventory_reservations
  WHERE location_id=NEW.location_id AND lot_id=NEW.lot_id AND status='active' AND id<>NEW.id;
 IF reserved+NEW.quantity>balance THEN RAISE EXCEPTION 'Stock disponible insuficiente para reservar'; END IF;
 SELECT approved_qty,prepared_qty INTO approved,prepared FROM abastece.order_items WHERE id=NEW.order_item_id;
 IF approved IS NULL THEN RAISE EXCEPTION 'No reservar un ítem sin cantidad aprobada'; END IF;
 SELECT coalesce(sum(quantity),0) INTO reserved FROM abastece.inventory_reservations
  WHERE order_item_id=NEW.order_item_id AND status='active' AND id<>NEW.id;
 IF reserved+NEW.quantity>approved THEN RAISE EXCEPTION 'Reserva supera cantidad aprobada'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER reservation_integrity BEFORE INSERT OR UPDATE ON abastece.inventory_reservations
 FOR EACH ROW EXECUTE FUNCTION abastece.check_reservation();

CREATE FUNCTION abastece.check_shipment_quantity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE prepared numeric; already_sent numeric;
BEGIN
 SELECT prepared_qty INTO prepared FROM abastece.order_items WHERE id=NEW.order_item_id FOR UPDATE;
 SELECT coalesce(sum(shipped_qty),0) INTO already_sent FROM abastece.shipment_items
  WHERE order_item_id=NEW.order_item_id AND id<>NEW.id;
 IF already_sent+NEW.shipped_qty>prepared THEN RAISE EXCEPTION 'Envío supera cantidad preparada'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER shipment_quantity BEFORE INSERT OR UPDATE ON abastece.shipment_items
 FOR EACH ROW EXECUTE FUNCTION abastece.check_shipment_quantity();

CREATE FUNCTION abastece.check_receipt_quantity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sent numeric;
BEGIN
 SELECT shipped_qty INTO sent FROM abastece.shipment_items WHERE id=NEW.shipment_item_id;
 IF NEW.counted_qty>sent THEN RAISE EXCEPTION 'Exceso de recepción: registrar incidencia y ajuste autorizado por separado'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER receipt_quantity BEFORE INSERT OR UPDATE ON abastece.receipt_items
 FOR EACH ROW EXECUTE FUNCTION abastece.check_receipt_quantity();

CREATE FUNCTION private.abastece_current_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT role FROM abastece.staff_members WHERE auth_user_id=(SELECT auth.uid()) AND active;
$$;
CREATE FUNCTION private.abastece_current_staff() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT id FROM abastece.staff_members WHERE auth_user_id=(SELECT auth.uid()) AND active;
$$;
CREATE FUNCTION private.abastece_can_read_point(point_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM abastece.staff_members s WHERE s.auth_user_id=(SELECT auth.uid()) AND s.active
   AND (s.role IN ('administrador','bodega','logistica','compras','gerencia') OR
    EXISTS(SELECT 1 FROM abastece.point_assignments a WHERE a.staff_id=s.id AND a.location_id=point_id))
 );
$$;
REVOKE ALL ON FUNCTION private.abastece_current_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.abastece_current_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.abastece_can_read_point(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.abastece_current_role(),private.abastece_current_staff(),private.abastece_can_read_point(uuid) TO authenticated;

GRANT USAGE ON SCHEMA abastece TO authenticated,service_role;
REVOKE ALL ON SCHEMA abastece FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA abastece FROM anon,authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA abastece TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA abastece TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA abastece FROM PUBLIC,anon,authenticated;

DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='abastece' LOOP
  EXECUTE format('ALTER TABLE abastece.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END; $$;

CREATE POLICY metadata_read ON abastece.demo_metadata FOR SELECT TO authenticated USING(private.abastece_current_role() IS NOT NULL);
CREATE POLICY staff_read ON abastece.staff_members FOR SELECT TO authenticated USING(
 id=private.abastece_current_staff() OR private.abastece_current_role() IN ('administrador','gerencia'));
CREATE POLICY location_read ON abastece.locations FOR SELECT TO authenticated USING(private.abastece_can_read_point(id));
CREATE POLICY assignment_read ON abastece.point_assignments FOR SELECT TO authenticated USING(
 staff_id=private.abastece_current_staff() OR private.abastece_current_role() IN ('administrador','gerencia'));
CREATE POLICY products_read ON abastece.products FOR SELECT TO authenticated USING(private.abastece_current_role() IS NOT NULL);
CREATE POLICY costs_read ON abastece.product_costs FOR SELECT TO authenticated USING(private.abastece_current_role() IN ('administrador','compras','gerencia'));
CREATE POLICY lots_read ON abastece.product_lots FOR SELECT TO authenticated USING(private.abastece_current_role() IS NOT NULL);
CREATE POLICY policy_read ON abastece.replenishment_policies FOR SELECT TO authenticated USING(private.abastece_can_read_point(location_id));
CREATE POLICY orders_read ON abastece.orders FOR SELECT TO authenticated USING(private.abastece_can_read_point(location_id));
CREATE POLICY order_items_read ON abastece.order_items FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM abastece.orders o WHERE o.id=order_id AND private.abastece_can_read_point(o.location_id)));
CREATE POLICY vehicles_read ON abastece.vehicles FOR SELECT TO authenticated USING(private.abastece_current_role() IN ('supervisor','administrador','bodega','logistica','gerencia'));
CREATE POLICY routes_read ON abastece.route_plans FOR SELECT TO authenticated USING(
 private.abastece_current_role() IN ('administrador','bodega','logistica','gerencia') OR
 (private.abastece_current_role()='supervisor' AND EXISTS(
  SELECT 1 FROM abastece.route_stops s WHERE s.route_id=id AND private.abastece_can_read_point(s.location_id))));
CREATE POLICY stops_read ON abastece.route_stops FOR SELECT TO authenticated USING(private.abastece_can_read_point(location_id));
CREATE POLICY shipments_read ON abastece.shipments FOR SELECT TO authenticated USING(private.abastece_can_read_point(location_id));
CREATE POLICY shipment_items_read ON abastece.shipment_items FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM abastece.shipments s WHERE s.id=shipment_id AND private.abastece_can_read_point(s.location_id)));
CREATE POLICY receipts_read ON abastece.receipts FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM abastece.shipments s WHERE s.id=shipment_id AND private.abastece_can_read_point(s.location_id)));
CREATE POLICY receipt_items_read ON abastece.receipt_items FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM abastece.shipments s WHERE s.id=shipment_id AND private.abastece_can_read_point(s.location_id)));
CREATE POLICY purchases_read ON abastece.purchase_orders FOR SELECT TO authenticated USING(private.abastece_current_role() IN ('administrador','bodega','compras','gerencia'));
CREATE POLICY purchase_items_read ON abastece.purchase_order_items FOR SELECT TO authenticated USING(private.abastece_current_role() IN ('administrador','compras','gerencia'));
CREATE POLICY stock_read ON abastece.stock_movements FOR SELECT TO authenticated USING(private.abastece_can_read_point(location_id));
CREATE POLICY reservations_read ON abastece.inventory_reservations FOR SELECT TO authenticated USING(private.abastece_can_read_point(location_id));
CREATE POLICY incidents_read ON abastece.incidents FOR SELECT TO authenticated USING(private.abastece_can_read_point(location_id));
CREATE POLICY decisions_read ON abastece.decision_logs FOR SELECT TO authenticated USING(
 (location_id IS NOT NULL AND private.abastece_can_read_point(location_id)) OR
 private.abastece_current_role() IN ('administrador','logistica','gerencia'));
CREATE POLICY documents_read ON abastece.documents FOR SELECT TO authenticated USING(
 private.abastece_current_role()=ANY(allowed_roles) AND (location_id IS NULL OR private.abastece_can_read_point(location_id)));
CREATE POLICY chunks_read ON abastece.document_chunks FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM abastece.documents d WHERE d.id=document_id));
CREATE POLICY audit_read ON abastece.audit_events FOR SELECT TO authenticated USING(
 actor_id=private.abastece_current_staff() OR private.abastece_current_role() IN ('administrador','gerencia'));
CREATE POLICY scenarios_read ON abastece.demo_scenarios FOR SELECT TO authenticated USING(private.abastece_current_role() IS NOT NULL);

CREATE VIEW abastece.v_lot_balances WITH(security_invoker=true) AS
 SELECT m.location_id,m.product_id,m.lot_id,sum(m.delta_qty) physical_qty,
  l.expires_on,
  (l.expires_on IS NULL OR l.expires_on>=(SELECT reference_at::date FROM abastece.demo_metadata WHERE id)) usable
 FROM abastece.stock_movements m JOIN abastece.product_lots l ON l.id=m.lot_id
 WHERE m.occurred_at<=(SELECT reference_at FROM abastece.demo_metadata WHERE id)
 GROUP BY m.location_id,m.product_id,m.lot_id,l.expires_on;
CREATE VIEW abastece.v_inventory WITH(security_invoker=true) AS
 WITH balances AS(
  SELECT location_id,product_id,sum(physical_qty) physical_qty,
   sum(CASE WHEN usable THEN physical_qty ELSE 0 END) usable_qty,
   sum(CASE WHEN NOT usable THEN physical_qty ELSE 0 END) expired_qty
  FROM abastece.v_lot_balances GROUP BY location_id,product_id
 ), reservations AS(
  SELECT location_id,product_id,sum(quantity) reserved_qty FROM abastece.inventory_reservations
  WHERE status='active' GROUP BY location_id,product_id
 )
 SELECT b.*,coalesce(r.reserved_qty,0) reserved_qty,b.usable_qty-coalesce(r.reserved_qty,0) available_qty
 FROM balances b LEFT JOIN reservations r USING(location_id,product_id);
CREATE VIEW abastece.v_order_trace WITH(security_invoker=true) AS
 WITH sent AS(SELECT order_item_id,sum(shipped_qty) shipped_qty FROM abastece.shipment_items GROUP BY order_item_id),
 received AS(SELECT s.order_item_id,sum(r.counted_qty) counted_qty,sum(r.accepted_qty) accepted_qty
  FROM abastece.receipt_items r JOIN abastece.shipment_items s ON s.id=r.shipment_item_id GROUP BY s.order_item_id)
 SELECT o.code order_code,o.location_id,o.status,i.id order_item_id,p.sku,p.name,
  i.requested_qty,i.approved_qty,i.prepared_qty,coalesce(s.shipped_qty,0) shipped_qty,
  r.counted_qty,r.accepted_qty,
  CASE WHEN r.counted_qty IS NULL THEN NULL ELSE coalesce(s.shipped_qty,0)-r.counted_qty END shortage_qty
 FROM abastece.order_items i JOIN abastece.orders o ON o.id=i.order_id JOIN abastece.products p ON p.id=i.product_id
 LEFT JOIN sent s ON s.order_item_id=i.id LEFT JOIN received r ON r.order_item_id=i.id;
CREATE VIEW abastece.v_replenishment WITH(security_invoker=true) AS
 WITH pending AS(
  SELECT s.location_id,si.product_id,sum(si.shipped_qty-coalesce(ri.counted_qty,0)) pending_units
  FROM abastece.shipments s JOIN abastece.shipment_items si ON si.shipment_id=s.id
  LEFT JOIN abastece.receipt_items ri ON ri.shipment_item_id=si.id
  WHERE s.status IN ('dispatched','delivered_unchecked') GROUP BY s.location_id,si.product_id
 )
 SELECT r.location_id,r.product_id,p.sku,r.daily_demand_units,r.review_days,r.delivery_lead_days,r.safety_days,
  coalesce(i.usable_qty,0) usable_qty,coalesce(pending.pending_units,0) confirmed_inbound_qty,
  coalesce(i.usable_qty,0)/r.daily_demand_units coverage_days,
  greatest(0,ceil(r.daily_demand_units*(r.review_days+r.delivery_lead_days+r.safety_days)
   -coalesce(i.usable_qty,0)-coalesce(pending.pending_units,0))) recommended_qty,
  CASE WHEN coalesce(i.usable_qty,0)<r.daily_demand_units*r.delivery_lead_days THEN 'critical'
   WHEN coalesce(i.usable_qty,0)<r.daily_demand_units*(r.delivery_lead_days+r.safety_days) THEN 'attention'
   WHEN coalesce(i.usable_qty,0)>r.daily_demand_units*(r.review_days+r.delivery_lead_days+r.safety_days)*2 THEN 'excess'
   ELSE 'covered' END coverage_status,
  'synthetic_rule'::text demand_source
 FROM abastece.replenishment_policies r JOIN abastece.products p ON p.id=r.product_id
 LEFT JOIN abastece.v_inventory i USING(location_id,product_id)
 LEFT JOIN pending USING(location_id,product_id);
GRANT SELECT ON abastece.v_lot_balances,abastece.v_inventory,abastece.v_order_trace,abastece.v_replenishment TO authenticated,service_role;
COMMIT;
