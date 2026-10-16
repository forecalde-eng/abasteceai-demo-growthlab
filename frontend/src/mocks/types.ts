// DEMO FICTICIA · Generado desde db/datos/*.csv por generate.mjs. No editar a mano.
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
