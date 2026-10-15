-- Consultas de demostración, usando la fecha fija en demo_metadata.
-- Con JWT, las políticas limitan el resultado al rol y a los puntos asignados.

-- Inventario por lote: separar existente, utilizable, reservado y disponible.
SELECT l.code,p.sku,i.physical_qty,i.usable_qty,i.expired_qty,i.reserved_qty,i.available_qty
FROM abastece.v_inventory i JOIN abastece.locations l ON l.id=i.location_id
JOIN abastece.products p ON p.id=i.product_id ORDER BY l.code,p.sku;

-- Reposición y días de cobertura. Nivel crítico es una regla, no una probabilidad.
SELECT l.code,r.sku,r.coverage_days,r.coverage_status,r.confirmed_inbound_qty,r.recommended_qty
FROM abastece.v_replenishment r JOIN abastece.locations l ON l.id=r.location_id
WHERE r.coverage_status IN ('critical','excess') ORDER BY l.code,r.sku;

-- Posibles duplicados exactos: misma composición y cantidades, punto y período.
WITH fingerprints AS (
 SELECT o.id,o.code,o.location_id,o.cycle_month,o.order_type,
  string_agg(i.product_id::text||':'||i.requested_qty::text,',' ORDER BY i.product_id) fingerprint
 FROM abastece.orders o JOIN abastece.order_items i ON i.order_id=o.id
 WHERE o.status<>'cancelled' GROUP BY o.id
)
SELECT a.code original,b.code possible_duplicate
FROM fingerprints a JOIN fingerprints b ON a.id<b.id AND a.location_id=b.location_id
 AND a.cycle_month=b.cycle_month AND a.fingerprint=b.fingerprint
WHERE a.order_type='regular' AND b.order_type='regular';

-- Ítems omitidos del kit ficticio, solo en pedidos regulares sometidos a revisión.
SELECT o.code,p.sku,p.name
FROM abastece.orders o JOIN abastece.replenishment_policies r ON r.location_id=o.location_id
JOIN abastece.products p ON p.id=r.product_id
WHERE o.order_type='regular' AND o.status='submitted' AND r.required_in_kit
AND NOT EXISTS(SELECT 1 FROM abastece.order_items i WHERE i.order_id=o.id AND i.product_id=r.product_id);

-- Trazabilidad con recepción NULL cuando todavía no se contó.
SELECT * FROM abastece.v_order_trace
WHERE order_code IN ('PED-DEMO-004','PED-DEMO-005','PED-DEMO-009') ORDER BY order_code,sku;

-- Consumo histórico separado de entregas. Solo demostración, seis meses inventados.
SELECT date_trunc('month',m.occurred_at) AS month_bucket,l.code,p.sku,-sum(m.delta_qty) consumption_units
FROM abastece.stock_movements m JOIN abastece.locations l ON l.id=m.location_id
JOIN abastece.products p ON p.id=m.product_id WHERE m.reason='consumption'
GROUP BY 1,l.code,p.sku ORDER BY 1,l.code,p.sku;

-- Carga propia propuesta: no implica que se haya ejecutado OR-Tools.
SELECT r.code,v.code vehicle,v.capacity_kg,v.capacity_m3,
 sum(si.shipped_qty*p.gross_weight_kg) shipment_weight_kg,
 sum(si.shipped_qty*p.package_volume_m3) shipment_volume_m3
FROM abastece.route_plans r JOIN abastece.vehicles v ON v.id=r.vehicle_id
JOIN abastece.shipments s ON s.route_id=r.id JOIN abastece.shipment_items si ON si.shipment_id=s.id
JOIN abastece.products p ON p.id=si.product_id GROUP BY r.code,v.code,v.capacity_kg,v.capacity_m3;

-- Búsqueda textual en manuales ficticios autorizados (funciona sin embeddings).
SELECT d.title,d.version,d.source_label,c.body
FROM abastece.document_chunks c JOIN abastece.documents d ON d.id=c.document_id
WHERE c.search_vector @@ websearch_to_tsquery('spanish','recepción diferencias');

-- Retraso verificable por una fecha prometida; cálculo SQL independiente de Jev.
SELECT s.code,l.city,s.promised_delivery_at,s.status
FROM abastece.shipments s JOIN abastece.locations l ON l.id=s.location_id
WHERE s.delivered_at IS NULL AND s.promised_delivery_at<(SELECT reference_at FROM abastece.demo_metadata WHERE id);
