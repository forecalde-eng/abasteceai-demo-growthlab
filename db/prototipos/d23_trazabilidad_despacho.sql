-- PROTOTIPO D-2.3: no forma parte de la secuencia de migraciones aprobadas.
-- Aplicar solo sobre una copia local cargada con 01, 02, 07 y 03.
-- Si el contrato se aprueba, asignar número de migración en otro PR.
BEGIN;

DO $$
BEGIN
 IF pg_catalog.to_regclass('abastece.inventory_reservations') IS NULL OR
    pg_catalog.to_regclass('abastece.shipment_items') IS NULL OR
    pg_catalog.to_regclass('abastece.stock_movements') IS NULL THEN
  RAISE EXCEPTION 'Faltan las tablas base de trazabilidad';
 END IF;
 IF EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'abastece' AND table_name = 'stock_movements'
   AND column_name = 'reservation_id'
 ) THEN
  RAISE EXCEPTION 'La relación con reservas ya existe: revisar el estado antes de aplicar';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM abastece.locations
  WHERE code = 'BOD-DEMO' AND kind = 'warehouse') OR
    NOT EXISTS (SELECT 1 FROM abastece.locations
  WHERE code = 'TRA-DEMO' AND kind = 'transit') THEN
  RAISE EXCEPTION 'Faltan BOD-DEMO o TRA-DEMO con sus tipos esperados';
 END IF;
 -- La FK compuesta se valida también al crearla. Esta consulta da un error
 -- explícito antes de tomar los bloqueos de ALTER TABLE.
 IF EXISTS (
  SELECT 1 FROM abastece.stock_movements AS m
  JOIN abastece.shipment_items AS si ON si.id = m.shipment_item_id
  WHERE m.product_id <> si.product_id OR m.lot_id <> si.lot_id
 ) THEN
  RAISE EXCEPTION 'Hay movimientos históricos cuyo producto o lote difiere de la línea';
 END IF;
END;
$$;

-- Una línea puede sumar varias reservas del mismo ítem y lote. Por eso el
-- vínculo de cada reserva está en cada movimiento, no en shipment_items.
ALTER TABLE abastece.stock_movements
 ADD COLUMN reservation_id uuid,
 ADD CONSTRAINT stock_movement_reservation_fk FOREIGN KEY (reservation_id)
  REFERENCES abastece.inventory_reservations(id),
 ADD CONSTRAINT stock_movement_dispatch_trace_shape CHECK (
  reservation_id IS NULL OR
  (reason = 'dispatch' AND shipment_item_id IS NOT NULL AND transfer_group IS NOT NULL)
 );

-- También protege las filas históricas que ya tienen shipment_item_id.
ALTER TABLE abastece.shipment_items
 ADD CONSTRAINT shipment_item_product_lot_identity UNIQUE (id, product_id, lot_id);
ALTER TABLE abastece.stock_movements
 ADD CONSTRAINT stock_movement_shipment_item_lot_fk
 FOREIGN KEY (shipment_item_id, product_id, lot_id)
 REFERENCES abastece.shipment_items(id, product_id, lot_id);

-- Cada reserva produce como máximo una salida y una entrada. Cada grupo
-- identifica una pareja; los índices cubren además las consultas de control.
CREATE UNIQUE INDEX stock_dispatch_reservation_location_unique
 ON abastece.stock_movements(reservation_id, location_id)
 WHERE reservation_id IS NOT NULL AND reason = 'dispatch';
CREATE UNIQUE INDEX stock_dispatch_group_location_unique
 ON abastece.stock_movements(transfer_group, location_id)
 WHERE reservation_id IS NOT NULL AND reason = 'dispatch';

CREATE FUNCTION abastece.check_dispatch_trace_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 v_res abastece.inventory_reservations%ROWTYPE;
 v_item abastece.shipment_items%ROWTYPE;
 v_warehouse uuid;
 v_transit uuid;
BEGIN
 IF NEW.reservation_id IS NULL THEN RETURN NEW; END IF;

 SELECT * INTO v_res FROM abastece.inventory_reservations
 WHERE id = NEW.reservation_id FOR SHARE;
 SELECT * INTO v_item FROM abastece.shipment_items
 WHERE id = NEW.shipment_item_id FOR SHARE;
 IF v_res.id IS NULL OR v_item.id IS NULL OR v_res.status <> 'fulfilled' OR
    v_res.order_item_id <> v_item.order_item_id OR
    v_res.product_id <> v_item.product_id OR
    v_res.lot_id <> v_item.lot_id OR
    NEW.product_id <> v_res.product_id OR NEW.lot_id <> v_res.lot_id OR
    pg_catalog.abs(NEW.delta_qty) <> v_res.quantity THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'Movimiento no corresponde a la reserva cumplida y la línea de envío';
 END IF;

 SELECT id INTO v_warehouse FROM abastece.locations
 WHERE code = 'BOD-DEMO' AND kind = 'warehouse';
 SELECT id INTO v_transit FROM abastece.locations
 WHERE code = 'TRA-DEMO' AND kind = 'transit';
 IF v_warehouse IS NULL OR v_transit IS NULL OR
    NOT ((NEW.location_id = v_warehouse AND NEW.delta_qty < 0) OR
         (NEW.location_id = v_transit AND NEW.delta_qty > 0)) OR
    v_res.location_id <> v_warehouse THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'Movimiento de despacho fuera de BOD-DEMO o TRA-DEMO';
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_trace_link BEFORE INSERT ON abastece.stock_movements
 FOR EACH ROW EXECUTE FUNCTION abastece.check_dispatch_trace_link();

-- El primer movimiento existe solo temporalmente durante la transacción.
-- La pareja y el total por línea se comprueban al final, antes del COMMIT.
CREATE FUNCTION abastece.check_dispatch_trace_pair() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 v_qty numeric(12,3);
 v_shipped numeric(12,3);
 v_linked numeric(12,3);
 v_warehouse uuid;
 v_transit uuid;
 v_valid boolean;
BEGIN
 SELECT quantity INTO v_qty FROM abastece.inventory_reservations
 WHERE id = NEW.reservation_id;
 SELECT shipped_qty INTO v_shipped FROM abastece.shipment_items
 WHERE id = NEW.shipment_item_id;
 SELECT id INTO v_warehouse FROM abastece.locations WHERE code = 'BOD-DEMO';
 SELECT id INTO v_transit FROM abastece.locations WHERE code = 'TRA-DEMO';

 SELECT pg_catalog.count(*) = 2 AND
        pg_catalog.count(*) FILTER (WHERE reservation_id = NEW.reservation_id
         AND shipment_item_id = NEW.shipment_item_id AND product_id = NEW.product_id
         AND lot_id = NEW.lot_id AND reason = 'dispatch') = 2 AND
        pg_catalog.count(*) FILTER (WHERE location_id = v_warehouse
         AND delta_qty = -v_qty) = 1 AND
        pg_catalog.count(*) FILTER (WHERE location_id = v_transit
         AND delta_qty = v_qty) = 1
 INTO v_valid FROM abastece.stock_movements
 WHERE transfer_group = NEW.transfer_group;
 IF NOT v_valid THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'La transferencia de despacho requiere una salida y entrada equivalentes';
 END IF;

 SELECT coalesce(pg_catalog.sum(r.quantity), 0) INTO v_linked
 FROM abastece.inventory_reservations AS r
 WHERE EXISTS (
  SELECT 1 FROM abastece.stock_movements AS m
  WHERE m.reservation_id = r.id AND m.shipment_item_id = NEW.shipment_item_id
   AND m.reason = 'dispatch'
 );
 IF v_linked <> v_shipped THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'La cantidad de la línea no coincide con sus reservas despachadas';
 END IF;
 RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER dispatch_trace_pair
 AFTER INSERT ON abastece.stock_movements
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (NEW.reservation_id IS NOT NULL)
 EXECUTE FUNCTION abastece.check_dispatch_trace_pair();

-- Una vez que el libro inmutable referencia estas filas, sus atributos
-- tampoco deben poder cambiar y deshacer la correspondencia histórica.
CREATE FUNCTION abastece.prevent_linked_dispatch_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF TG_TABLE_NAME = 'inventory_reservations' AND EXISTS (
  SELECT 1 FROM abastece.stock_movements WHERE reservation_id = OLD.id
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'Reserva despachada: no modificar ni eliminar';
 END IF;
 IF TG_TABLE_NAME = 'shipment_items' AND EXISTS (
  SELECT 1 FROM abastece.stock_movements WHERE shipment_item_id = OLD.id
   AND reservation_id IS NOT NULL
 ) THEN
  RAISE EXCEPTION USING ERRCODE = 'P0409',
   MESSAGE = 'Línea despachada: no modificar ni eliminar';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER linked_dispatch_reservation_immutable
 BEFORE UPDATE OR DELETE ON abastece.inventory_reservations
 FOR EACH ROW EXECUTE FUNCTION abastece.prevent_linked_dispatch_edit();
CREATE TRIGGER linked_dispatch_shipment_item_immutable
 BEFORE UPDATE OR DELETE ON abastece.shipment_items
 FOR EACH ROW EXECUTE FUNCTION abastece.prevent_linked_dispatch_edit();

REVOKE EXECUTE ON FUNCTION abastece.check_dispatch_trace_link(),
 abastece.check_dispatch_trace_pair(), abastece.prevent_linked_dispatch_edit()
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION abastece.check_dispatch_trace_link(),
 abastece.check_dispatch_trace_pair(), abastece.prevent_linked_dispatch_edit()
 TO service_role;

COMMIT;
