// DEMO FICTICIA · Generado desde CSV y vistas SQL oficiales por generate.mjs. No editar a mano.
export interface Order {
  id: string
  code: string
  location_id: string
  cycle_month: string
  requested_by: string
  approved_by: string | null
  requested_at: string
  approved_at: string | null
  status: 'draft' | 'submitted' | 'approved' | 'preparing' | 'ready' | 'shipped' | 'delivered_unchecked' | 'reconciled' | 'with_difference' | 'cancelled'
  order_type: 'regular' | 'additional'
  related_order_id: string | null
  reason: string | null
  observations: string
  idempotency_key: string
  provenance: 'synthetic'
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  requested_qty: number
  approved_qty: number | null
  prepared_qty: number
}

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  description: string
  inventory_unit: string
  content_quantity: number | null
  content_unit: string | null
  gross_weight_kg: number
  package_volume_m3: number
  lead_time_days: number
  has_expiry: boolean
  active: boolean
  provenance: 'synthetic'
}

export interface Location {
  id: string
  code: string
  name: string
  kind: 'warehouse' | 'service_point' | 'transit' | 'quarantine'
  city: string
  zone: string
  latitude: number | null
  longitude: number | null
  site_type: string | null
  area_m2: number | null
  workers: number | null
  window_start: string | null
  window_end: string | null
  service_minutes: number
  demo_scope: 'detailed' | 'catalog' | 'internal'
  is_synthetic: boolean
}

export interface Shipment {
  id: string
  code: string
  order_id: string
  location_id: string
  mode: 'own' | 'courier'
  route_id: string | null
  carrier_name: string | null
  guide_code: string
  qr_token: string
  status: 'created' | 'dispatched' | 'delivered_unchecked' | 'reconciled' | 'with_difference'
  dispatched_at: string | null
  promised_delivery_at: string | null
  delivered_at: string | null
  provenance: 'synthetic'
}

export interface ShipmentItem {
  id: string
  shipment_id: string
  order_id: string
  order_item_id: string
  product_id: string
  lot_id: string
  shipped_qty: number
}

export interface Incident {
  id: string
  code: string
  location_id: string
  order_id: string | null
  shipment_id: string | null
  kind: 'possible_duplicate' | 'missing_from_kit' | 'packing_difference' | 'receipt_shortage' | 'delay' | 'excess_stock' | 'expiry'
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'under_review' | 'resolved'
  description: string
  created_at: string
  created_by: string
  provenance: string
}

export interface Purchase {
  id: string
  code: string
  supplier_name: string
  created_by: string
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled'
  approved_by: string | null
  approved_at: string | null
  ordered_at: string | null
  expected_at: string | null
  provenance: 'synthetic'
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string
  ordered_qty: number
  unit_cost_usd: number
}

export interface Vehicle {
  id: string
  code: string
  description: string
  capacity_kg: number
  capacity_m3: number
  available_from: string
  available_until: string
  is_synthetic: boolean
}

export interface DecisionLog {
  id: string
  location_id: string | null
  order_id: string | null
  task: string
  provider: 'mock' | 'typesafe' | 'rules'
  model_version: string
  input_state: Record<string, unknown>
  response: Record<string, unknown>
  proposed_action: string
  status: 'proposed' | 'human_review' | 'accepted' | 'rejected'
  input_tokens: number
  estimated_cost_usd: number
  created_at: string
}

export interface Inventory {
  location_id: string
  product_id: string
  physical_qty: number
  usable_qty: number
  expired_qty: number
  reserved_qty: number
  available_qty: number
}

export interface Replenishment {
  location_id: string
  product_id: string
  sku: string
  daily_demand_units: number
  review_days: number
  delivery_lead_days: number
  safety_days: number
  usable_qty: number
  confirmed_inbound_qty: number
  coverage_days: number
  recommended_qty: number
  coverage_status: 'critical' | 'attention' | 'covered' | 'excess'
  demand_source: 'synthetic_rule'
}

export interface OrderTrace {
  order_code: string
  location_id: string
  status: Order['status']
  order_item_id: string
  sku: string
  name: string
  requested_qty: number
  approved_qty: number | null
  prepared_qty: number
  shipped_qty: number
  counted_qty: number | null
  accepted_qty: number | null
  shortage_qty: number | null
}
