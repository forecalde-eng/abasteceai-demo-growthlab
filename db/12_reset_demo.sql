-- D-3.1 (#39). DESTRUCTIVO: borra solo los datos ficticios de las 27 tablas.
-- Ejecución exclusivamente administrativa, con respaldo y autorización previa.
-- No crea una RPC ni concede permisos. Ver 12_RESET_DEMO.md.
BEGIN;
LOCK TABLE
 abastece.demo_metadata,
 abastece.staff_members,
 abastece.locations,
 abastece.point_assignments,
 abastece.products,
 abastece.product_costs,
 abastece.product_lots,
 abastece.replenishment_policies,
 abastece.orders,
 abastece.order_items,
 abastece.vehicles,
 abastece.route_plans,
 abastece.route_stops,
 abastece.shipments,
 abastece.shipment_items,
 abastece.receipts,
 abastece.receipt_items,
 abastece.purchase_orders,
 abastece.purchase_order_items,
 abastece.stock_movements,
 abastece.inventory_reservations,
 abastece.incidents,
 abastece.decision_logs,
 abastece.documents,
 abastece.document_chunks,
 abastece.audit_events,
 abastece.demo_scenarios
 IN ACCESS EXCLUSIVE MODE;

DO $reset$
DECLARE
 v_expected text[] := ARRAY['demo_metadata', 'staff_members', 'locations', 'point_assignments', 'products', 'product_costs', 'product_lots', 'replenishment_policies', 'orders', 'order_items', 'vehicles', 'route_plans', 'route_stops', 'shipments', 'shipment_items', 'receipts', 'receipt_items', 'purchase_orders', 'purchase_order_items', 'stock_movements', 'inventory_reservations', 'incidents', 'decision_logs', 'documents', 'document_chunks', 'audit_events', 'demo_scenarios'];
 v_tables oid[];
BEGIN
 SELECT pg_catalog.array_agg(c.oid) INTO v_tables
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'abastece' AND c.relkind IN ('r', 'p');
 IF pg_catalog.cardinality(v_tables) <> 27 OR EXISTS (
  SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'abastece' AND c.relkind IN ('r', 'p') AND NOT c.relname = ANY(v_expected)
 ) THEN
  RAISE EXCEPTION 'Reset cancelado: el inventario de tablas no coincide con las 27 aprobadas';
 END IF;
 -- CASCADE nunca debe ampliar el borrado a tablas fuera de la lista aprobada.
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE contype = 'f' AND confrelid = ANY(v_tables) AND NOT conrelid = ANY(v_tables)) OR
    EXISTS (SELECT 1 FROM pg_catalog.pg_inherits
  WHERE inhparent = ANY(v_tables) AND NOT inhrelid = ANY(v_tables)) THEN
  RAISE EXCEPTION 'Reset cancelado: CASCADE alcanzaría tablas ajenas';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
  WHERE tgrelid = ANY(v_tables) AND NOT tgisinternal AND (tgtype::integer & 32) <> 0) THEN
  RAISE EXCEPTION 'Reset cancelado: existe un trigger TRUNCATE no revisado';
 END IF;
END;
$reset$;

TRUNCATE TABLE
 abastece.demo_metadata,
 abastece.staff_members,
 abastece.locations,
 abastece.point_assignments,
 abastece.products,
 abastece.product_costs,
 abastece.product_lots,
 abastece.replenishment_policies,
 abastece.orders,
 abastece.order_items,
 abastece.vehicles,
 abastece.route_plans,
 abastece.route_stops,
 abastece.shipments,
 abastece.shipment_items,
 abastece.receipts,
 abastece.receipt_items,
 abastece.purchase_orders,
 abastece.purchase_order_items,
 abastece.stock_movements,
 abastece.inventory_reservations,
 abastece.incidents,
 abastece.decision_logs,
 abastece.documents,
 abastece.document_chunks,
 abastece.audit_events,
 abastece.demo_scenarios
 RESTART IDENTITY CASCADE;
COMMIT;
