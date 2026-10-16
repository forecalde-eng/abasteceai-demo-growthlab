-- Correcciones previas a la semilla DEMO-1.1. Ejecutar despues de 01 y 02,
-- antes de 03. No modifica registros existentes ni los SQL 01-06.
BEGIN;

-- El CHECK original admite UNKNOWN cuando reason es NULL. Esta restriccion
-- adicional exige un motivo con al menos un caracter distinto de espacios.
ALTER TABLE abastece.orders
 ADD CONSTRAINT orders_additional_reason_required
 CHECK (order_type <> 'additional' OR
        (related_order_id IS NOT NULL AND reason IS NOT NULL AND btrim(reason) <> ''));

-- Las politicas RLS de incidencias y decisiones filtran por location_id.
-- Evitar que un registro de otro pedido se publique bajo un punto distinto.
ALTER TABLE abastece.incidents
 ADD CONSTRAINT incidents_order_location_fk
 FOREIGN KEY (order_id, location_id) REFERENCES abastece.orders(id, location_id);

ALTER TABLE abastece.decision_logs
 ADD CONSTRAINT decisions_order_has_location
 CHECK (order_id IS NULL OR location_id IS NOT NULL),
 ADD CONSTRAINT decisions_order_location_fk
 FOREIGN KEY (order_id, location_id) REFERENCES abastece.orders(id, location_id);

-- Una incidencia de envio debe coincidir tambien con el punto y, cuando se
-- indique order_id, con el pedido al que pertenece el envio.
ALTER TABLE abastece.shipments
 ADD CONSTRAINT shipments_id_location_unique UNIQUE (id, location_id);

ALTER TABLE abastece.incidents
 ADD CONSTRAINT incidents_shipment_location_fk
 FOREIGN KEY (shipment_id, location_id) REFERENCES abastece.shipments(id, location_id),
 ADD CONSTRAINT incidents_shipment_order_fk
 FOREIGN KEY (shipment_id, order_id) REFERENCES abastece.shipments(id, order_id);

-- Bodega necesita cantidades, pero purchase_order_items incluye costos.
-- Esta vista, de forma deliberada, consulta la tabla como su propietario;
-- por eso la comprobacion de rol activo esta dentro de la vista. La barrera
-- de seguridad impide adelantar predicados del llamador al filtro de rol.
CREATE VIEW abastece.v_warehouse_purchase_items WITH (security_barrier = true) AS
 SELECT i.id, i.purchase_id, i.product_id, i.ordered_qty
 FROM abastece.purchase_order_items AS i
 WHERE private.abastece_current_role() = 'bodega';
REVOKE ALL ON abastece.v_warehouse_purchase_items FROM PUBLIC, anon;
GRANT SELECT ON abastece.v_warehouse_purchase_items TO authenticated;

-- Los supervisores conservan sus paradas y envios filtrados por punto.
-- No se expone el total de una ruta que podria incluir puntos ajenos.
DROP POLICY routes_read ON abastece.route_plans;
CREATE POLICY routes_read ON abastece.route_plans FOR SELECT TO authenticated
 USING (private.abastece_current_role() IN
        ('administrador', 'bodega', 'logistica', 'gerencia'));

-- check_stock_balance y check_reservation filtran por ubicacion y lote.
-- Las columnas de orden ayudan tambien al balance historico por lote.
CREATE INDEX stock_location_lot_occurred
 ON abastece.stock_movements (location_id, lot_id, occurred_at, id);

COMMIT;
