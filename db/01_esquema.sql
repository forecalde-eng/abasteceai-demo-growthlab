-- AbasteceAI: esquema inicial para una DEMOSTRACIÓN con datos ficticios.
-- Ejecutar una sola vez en un proyecto Supabase nuevo. No borra datos existentes.
-- Los usuarios reales se crean mediante Supabase Auth; el seed no crea contraseñas.
BEGIN;
CREATE SCHEMA abastece;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE abastece.demo_metadata (
 id boolean PRIMARY KEY DEFAULT true CHECK (id), reference_at timestamptz NOT NULL,
 title text NOT NULL, provenance text NOT NULL CHECK (provenance='synthetic'),
 assumptions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abastece.staff_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid UNIQUE REFERENCES auth.users(id),
 full_name text NOT NULL, demo_email text NOT NULL UNIQUE,
 role text NOT NULL CHECK (role IN ('auxiliar','supervisor','administrador','bodega','logistica','compras','gerencia')),
 active boolean NOT NULL DEFAULT true, is_synthetic boolean NOT NULL DEFAULT true
);
CREATE TABLE abastece.locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('warehouse','service_point','transit','quarantine')),
 city text NOT NULL, zone text NOT NULL, latitude numeric(9,6), longitude numeric(9,6),
 site_type text, area_m2 numeric(12,2) CHECK (area_m2>0), workers integer CHECK (workers>0),
 window_start time, window_end time, service_minutes integer NOT NULL DEFAULT 10 CHECK (service_minutes>=0),
 demo_scope text NOT NULL CHECK (demo_scope IN ('detailed','catalog','internal')),
 is_synthetic boolean NOT NULL DEFAULT true,
 CHECK (latitude BETWEEN -90 AND 90), CHECK (longitude BETWEEN -180 AND 180),
 CHECK ((window_start IS NULL AND window_end IS NULL) OR window_end>window_start)
);
CREATE TABLE abastece.point_assignments (
 staff_id uuid REFERENCES abastece.staff_members(id), location_id uuid REFERENCES abastece.locations(id),
 PRIMARY KEY (staff_id,location_id)
);
CREATE TABLE abastece.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL UNIQUE, name text NOT NULL,
 category text NOT NULL, description text NOT NULL, inventory_unit text NOT NULL,
 content_quantity numeric(10,3), content_unit text,
 gross_weight_kg numeric(10,3) NOT NULL CHECK (gross_weight_kg>0),
 package_volume_m3 numeric(10,6) NOT NULL CHECK (package_volume_m3>0),
 lead_time_days integer NOT NULL CHECK (lead_time_days>=0),
 has_expiry boolean NOT NULL, active boolean NOT NULL DEFAULT true,
 provenance text NOT NULL DEFAULT 'synthetic' CHECK (provenance='synthetic')
);
CREATE TABLE abastece.product_costs (
 product_id uuid PRIMARY KEY REFERENCES abastece.products(id),
 unit_cost_usd numeric(12,2) NOT NULL CHECK (unit_cost_usd>=0),
 provenance text NOT NULL DEFAULT 'synthetic' CHECK (provenance='synthetic')
);
CREATE TABLE abastece.product_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES abastece.products(id),
 batch_code text NOT NULL UNIQUE, expires_on date, received_on date NOT NULL,
 is_synthetic boolean NOT NULL DEFAULT true, UNIQUE(id,product_id)
);
CREATE TABLE abastece.replenishment_policies (
 location_id uuid REFERENCES abastece.locations(id), product_id uuid REFERENCES abastece.products(id),
 daily_demand_units numeric(12,4) NOT NULL CHECK (daily_demand_units>0),
 review_days integer NOT NULL DEFAULT 30 CHECK (review_days>0),
 delivery_lead_days integer NOT NULL CHECK (delivery_lead_days>=0),
 safety_days integer NOT NULL CHECK (safety_days>=0),
 required_in_kit boolean NOT NULL DEFAULT true,
 source text NOT NULL DEFAULT 'synthetic_rule' CHECK (source='synthetic_rule'),
 PRIMARY KEY(location_id,product_id)
);
CREATE TABLE abastece.orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 location_id uuid NOT NULL REFERENCES abastece.locations(id), cycle_month date NOT NULL,
 requested_by uuid NOT NULL REFERENCES abastece.staff_members(id),
 approved_by uuid REFERENCES abastece.staff_members(id),
 requested_at timestamptz NOT NULL, approved_at timestamptz,
 status text NOT NULL CHECK (status IN ('draft','submitted','approved','preparing','ready','shipped','delivered_unchecked','reconciled','with_difference','cancelled')),
 order_type text NOT NULL CHECK (order_type IN ('regular','additional')),
 related_order_id uuid REFERENCES abastece.orders(id), reason text,
 observations text NOT NULL DEFAULT '', idempotency_key text NOT NULL UNIQUE,
 provenance text NOT NULL DEFAULT 'synthetic' CHECK (provenance='synthetic'),
 CHECK (order_type='regular' OR (related_order_id IS NOT NULL AND length(trim(reason))>0)),
 CHECK (approved_by IS NULL OR approved_by<>requested_by),
 CHECK (approved_at IS NULL OR approved_at>=requested_at),
 CHECK (status IN ('draft','submitted','cancelled') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 UNIQUE (id,location_id)
);
CREATE TABLE abastece.order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES abastece.orders(id),
 product_id uuid NOT NULL REFERENCES abastece.products(id),
 requested_qty numeric(12,3) NOT NULL CHECK (requested_qty>0),
 approved_qty numeric(12,3) CHECK (approved_qty>=0),
 prepared_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (prepared_qty>=0),
 CHECK (prepared_qty=0 OR (approved_qty IS NOT NULL AND prepared_qty<=approved_qty)),
 UNIQUE(order_id,product_id), UNIQUE(id,order_id,product_id)
);
CREATE TABLE abastece.vehicles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 description text NOT NULL, capacity_kg numeric(10,2) NOT NULL CHECK (capacity_kg>0),
 capacity_m3 numeric(10,3) NOT NULL CHECK (capacity_m3>0),
 available_from time NOT NULL, available_until time NOT NULL,
 is_synthetic boolean NOT NULL DEFAULT true, CHECK (available_until>available_from)
);
CREATE TABLE abastece.route_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 vehicle_id uuid NOT NULL REFERENCES abastece.vehicles(id), dispatch_date date NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','approved','dispatched','finished')),
 matrix_source text NOT NULL CHECK(matrix_source IN ('synthetic','openrouteservice')),
 planning_method text NOT NULL, estimated_km numeric(12,2), estimated_minutes numeric(12,2),
 approved_by uuid REFERENCES abastece.staff_members(id), provenance text NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE abastece.route_stops (
 route_id uuid REFERENCES abastece.route_plans(id), location_id uuid REFERENCES abastece.locations(id),
 sequence integer NOT NULL CHECK (sequence>0), planned_arrival timestamptz,
 PRIMARY KEY(route_id,sequence), UNIQUE(route_id,location_id)
);
CREATE TABLE abastece.shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 order_id uuid NOT NULL, location_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN ('own','courier')), route_id uuid REFERENCES abastece.route_plans(id),
 carrier_name text, guide_code text NOT NULL UNIQUE, qr_token uuid NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('created','dispatched','delivered_unchecked','reconciled','with_difference')),
 dispatched_at timestamptz, promised_delivery_at timestamptz, delivered_at timestamptz,
 provenance text NOT NULL DEFAULT 'synthetic' CHECK(provenance='synthetic'),
 FOREIGN KEY(order_id,location_id) REFERENCES abastece.orders(id,location_id),
 CHECK ((mode='own' AND route_id IS NOT NULL) OR (mode='courier' AND route_id IS NULL AND carrier_name IS NOT NULL)),
 CHECK (delivered_at IS NULL OR (dispatched_at IS NOT NULL AND delivered_at>=dispatched_at)),
 CHECK (promised_delivery_at IS NULL OR dispatched_at IS NULL OR promised_delivery_at>=dispatched_at),
 UNIQUE(id,order_id)
);
CREATE TABLE abastece.shipment_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shipment_id uuid NOT NULL,
 order_id uuid NOT NULL, order_item_id uuid NOT NULL, product_id uuid NOT NULL,
 lot_id uuid NOT NULL, shipped_qty numeric(12,3) NOT NULL CHECK(shipped_qty>0),
 FOREIGN KEY(shipment_id,order_id) REFERENCES abastece.shipments(id,order_id),
 FOREIGN KEY(order_item_id,order_id,product_id) REFERENCES abastece.order_items(id,order_id,product_id),
 FOREIGN KEY(lot_id,product_id) REFERENCES abastece.product_lots(id,product_id),
 UNIQUE(shipment_id,order_item_id,lot_id), UNIQUE(id,shipment_id)
);
CREATE TABLE abastece.receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shipment_id uuid NOT NULL UNIQUE REFERENCES abastece.shipments(id),
 checked_by uuid NOT NULL REFERENCES abastece.staff_members(id), checked_at timestamptz NOT NULL,
 notes text NOT NULL DEFAULT '', UNIQUE(id,shipment_id)
);
CREATE TABLE abastece.receipt_items (
 receipt_id uuid NOT NULL, shipment_id uuid NOT NULL, shipment_item_id uuid NOT NULL,
 counted_qty numeric(12,3) NOT NULL CHECK(counted_qty>=0),
 accepted_qty numeric(12,3) NOT NULL CHECK(accepted_qty>=0 AND accepted_qty<=counted_qty),
 PRIMARY KEY(receipt_id,shipment_item_id),
 FOREIGN KEY(receipt_id,shipment_id) REFERENCES abastece.receipts(id,shipment_id),
 FOREIGN KEY(shipment_item_id,shipment_id) REFERENCES abastece.shipment_items(id,shipment_id)
);
CREATE TABLE abastece.purchase_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 supplier_name text NOT NULL, created_by uuid NOT NULL REFERENCES abastece.staff_members(id),
 status text NOT NULL CHECK(status IN ('draft','ordered','partially_received','received','cancelled')),
 approved_by uuid REFERENCES abastece.staff_members(id), approved_at timestamptz,
 ordered_at timestamptz, expected_at timestamptz,
 CHECK(status IN ('draft','cancelled') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 provenance text NOT NULL DEFAULT 'synthetic' CHECK(provenance='synthetic')
);
CREATE TABLE abastece.purchase_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES abastece.purchase_orders(id),
 product_id uuid NOT NULL REFERENCES abastece.products(id), ordered_qty numeric(12,3) NOT NULL CHECK(ordered_qty>0),
 unit_cost_usd numeric(12,2) NOT NULL CHECK(unit_cost_usd>=0), UNIQUE(purchase_id,product_id)
);
CREATE TABLE abastece.stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES abastece.locations(id),
 product_id uuid NOT NULL, lot_id uuid NOT NULL,
 delta_qty numeric(12,3) NOT NULL CHECK(delta_qty<>0), occurred_at timestamptz NOT NULL,
 reason text NOT NULL CHECK(reason IN ('opening','historical_transfer','consumption','dispatch','receipt','adjustment')),
 transfer_group uuid, shipment_item_id uuid REFERENCES abastece.shipment_items(id),
 purchase_item_id uuid REFERENCES abastece.purchase_order_items(id),
 recorded_by uuid NOT NULL REFERENCES abastece.staff_members(id), note text NOT NULL DEFAULT '',
 provenance text NOT NULL DEFAULT 'synthetic' CHECK(provenance='synthetic'),
 FOREIGN KEY(lot_id,product_id) REFERENCES abastece.product_lots(id,product_id)
);
CREATE INDEX stock_location_product ON abastece.stock_movements(location_id,product_id,occurred_at);
CREATE TABLE abastece.inventory_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL REFERENCES abastece.order_items(id),
 location_id uuid NOT NULL REFERENCES abastece.locations(id), product_id uuid NOT NULL,
 lot_id uuid NOT NULL, quantity numeric(12,3) NOT NULL CHECK(quantity>0),
 status text NOT NULL CHECK(status IN ('active','released','fulfilled')), created_at timestamptz NOT NULL,
 FOREIGN KEY(lot_id,product_id) REFERENCES abastece.product_lots(id,product_id)
);
CREATE TABLE abastece.incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 location_id uuid NOT NULL REFERENCES abastece.locations(id), order_id uuid REFERENCES abastece.orders(id),
 shipment_id uuid REFERENCES abastece.shipments(id),
 kind text NOT NULL CHECK(kind IN ('possible_duplicate','missing_from_kit','packing_difference','receipt_shortage','delay','excess_stock','expiry')),
 severity text NOT NULL CHECK(severity IN ('low','medium','high')),
 status text NOT NULL CHECK(status IN ('open','under_review','resolved')),
 description text NOT NULL, created_at timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES abastece.staff_members(id), provenance text NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE abastece.decision_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid REFERENCES abastece.locations(id),
 order_id uuid REFERENCES abastece.orders(id), task text NOT NULL,
 provider text NOT NULL CHECK(provider IN ('mock','typesafe','rules')),
 model_version text NOT NULL, input_state jsonb NOT NULL, response jsonb NOT NULL,
 proposed_action text NOT NULL, status text NOT NULL CHECK(status IN ('proposed','human_review','accepted','rejected')),
 input_tokens integer NOT NULL DEFAULT 0 CHECK(input_tokens>=0),
 estimated_cost_usd numeric(14,8) NOT NULL DEFAULT 0 CHECK(estimated_cost_usd>=0),
 created_at timestamptz NOT NULL,
 CHECK(provider<>'mock' OR (input_tokens=0 AND estimated_cost_usd=0))
);
CREATE TABLE abastece.documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, version text NOT NULL,
 body text NOT NULL, source_label text NOT NULL CHECK(source_label='DOCUMENTO FICTICIO DE DEMOSTRACION'),
 allowed_roles text[] NOT NULL, location_id uuid REFERENCES abastece.locations(id),
 valid_from date NOT NULL, UNIQUE(title,version)
);
CREATE TABLE abastece.document_chunks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES abastece.documents(id),
 chunk_index integer NOT NULL CHECK(chunk_index>=0), body text NOT NULL,
 search_vector tsvector GENERATED ALWAYS AS(to_tsvector('spanish',body)) STORED,
 UNIQUE(document_id,chunk_index)
);
CREATE INDEX document_chunks_fts ON abastece.document_chunks USING gin(search_vector);
CREATE TABLE abastece.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES abastece.staff_members(id),
 location_id uuid REFERENCES abastece.locations(id), entity_type text NOT NULL, entity_id uuid,
 action text NOT NULL, before_state jsonb, after_state jsonb NOT NULL, occurred_at timestamptz NOT NULL,
 provenance text NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE abastece.demo_scenarios (
 code text PRIMARY KEY, title text NOT NULL, steps jsonb NOT NULL, expected_result text NOT NULL,
 is_synthetic boolean NOT NULL DEFAULT true
);
COMMIT;
