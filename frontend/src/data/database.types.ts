// Generado del catálogo remoto de Supabase: proyecto ylwrzbxlpdmcvqwgnwtb, esquema abastece.
// 27 tablas, 5 vistas, 53 claves foráneas y 5 funciones de trigger.
// La CLI oficial no pudo alcanzar su servicio de tipos desde este entorno; los campos,
// nulabilidad, valores por defecto y relaciones proceden de pg_catalog/information_schema.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  abastece: {
    Tables: {
      "audit_events": {
        Row: {
        "id": string
        "actor_id": string
        "location_id": string | null
        "entity_type": string
        "entity_id": string | null
        "action": string
        "before_state": Json | null
        "after_state": Json
        "occurred_at": string
        "provenance": string
        }
        Insert: {
        "id"?: string
        "actor_id": string
        "location_id"?: string | null
        "entity_type": string
        "entity_id"?: string | null
        "action": string
        "before_state"?: Json | null
        "after_state": Json
        "occurred_at": string
        "provenance"?: string
        }
        Update: {
        "id"?: string
        "actor_id"?: string
        "location_id"?: string | null
        "entity_type"?: string
        "entity_id"?: string | null
        "action"?: string
        "before_state"?: Json | null
        "after_state"?: Json
        "occurred_at"?: string
        "provenance"?: string
        }
        Relationships: [
        {
          foreignKeyName: "audit_events_actor_id_fkey"
          columns: ["actor_id"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "audit_events_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        }
        ]
      }
      "decision_logs": {
        Row: {
        "id": string
        "location_id": string | null
        "order_id": string | null
        "task": string
        "provider": string
        "model_version": string
        "input_state": Json
        "response": Json
        "proposed_action": string
        "status": string
        "input_tokens": number
        "estimated_cost_usd": number
        "created_at": string
        }
        Insert: {
        "id"?: string
        "location_id"?: string | null
        "order_id"?: string | null
        "task": string
        "provider": string
        "model_version": string
        "input_state": Json
        "response": Json
        "proposed_action": string
        "status": string
        "input_tokens"?: number
        "estimated_cost_usd"?: number
        "created_at": string
        }
        Update: {
        "id"?: string
        "location_id"?: string | null
        "order_id"?: string | null
        "task"?: string
        "provider"?: string
        "model_version"?: string
        "input_state"?: Json
        "response"?: Json
        "proposed_action"?: string
        "status"?: string
        "input_tokens"?: number
        "estimated_cost_usd"?: number
        "created_at"?: string
        }
        Relationships: [
        {
          foreignKeyName: "decision_logs_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "decision_logs_order_id_fkey"
          columns: ["order_id"]
          isOneToOne: false
          referencedRelation: "orders"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "decisions_order_location_fk"
          columns: ["order_id", "location_id"]
          isOneToOne: false
          referencedRelation: "orders"
          referencedColumns: ["id", "location_id"]
        }
        ]
      }
      "demo_metadata": {
        Row: {
        "id": boolean
        "reference_at": string
        "title": string
        "provenance": string
        "assumptions": Json
        "created_at": string
        }
        Insert: {
        "id"?: boolean
        "reference_at": string
        "title": string
        "provenance": string
        "assumptions": Json
        "created_at"?: string
        }
        Update: {
        "id"?: boolean
        "reference_at"?: string
        "title"?: string
        "provenance"?: string
        "assumptions"?: Json
        "created_at"?: string
        }
        Relationships: []
      }
      "demo_scenarios": {
        Row: {
        "code": string
        "title": string
        "steps": Json
        "expected_result": string
        "is_synthetic": boolean
        }
        Insert: {
        "code": string
        "title": string
        "steps": Json
        "expected_result": string
        "is_synthetic"?: boolean
        }
        Update: {
        "code"?: string
        "title"?: string
        "steps"?: Json
        "expected_result"?: string
        "is_synthetic"?: boolean
        }
        Relationships: []
      }
      "document_chunks": {
        Row: {
        "id": string
        "document_id": string
        "chunk_index": number
        "body": string
        "search_vector": unknown | null
        }
        Insert: {
        "id"?: string
        "document_id": string
        "chunk_index": number
        "body": string
        }
        Update: {
        "id"?: string
        "document_id"?: string
        "chunk_index"?: number
        "body"?: string
        }
        Relationships: [
        {
          foreignKeyName: "document_chunks_document_id_fkey"
          columns: ["document_id"]
          isOneToOne: false
          referencedRelation: "documents"
          referencedColumns: ["id"]
        }
        ]
      }
      "documents": {
        Row: {
        "id": string
        "title": string
        "version": string
        "body": string
        "source_label": string
        "allowed_roles": string[]
        "location_id": string | null
        "valid_from": string
        }
        Insert: {
        "id"?: string
        "title": string
        "version": string
        "body": string
        "source_label": string
        "allowed_roles": string[]
        "location_id"?: string | null
        "valid_from": string
        }
        Update: {
        "id"?: string
        "title"?: string
        "version"?: string
        "body"?: string
        "source_label"?: string
        "allowed_roles"?: string[]
        "location_id"?: string | null
        "valid_from"?: string
        }
        Relationships: [
        {
          foreignKeyName: "documents_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        }
        ]
      }
      "incidents": {
        Row: {
        "id": string
        "code": string
        "location_id": string
        "order_id": string | null
        "shipment_id": string | null
        "kind": string
        "severity": string
        "status": string
        "description": string
        "created_at": string
        "created_by": string
        "provenance": string
        }
        Insert: {
        "id"?: string
        "code": string
        "location_id": string
        "order_id"?: string | null
        "shipment_id"?: string | null
        "kind": string
        "severity": string
        "status": string
        "description": string
        "created_at": string
        "created_by": string
        "provenance"?: string
        }
        Update: {
        "id"?: string
        "code"?: string
        "location_id"?: string
        "order_id"?: string | null
        "shipment_id"?: string | null
        "kind"?: string
        "severity"?: string
        "status"?: string
        "description"?: string
        "created_at"?: string
        "created_by"?: string
        "provenance"?: string
        }
        Relationships: [
        {
          foreignKeyName: "incidents_created_by_fkey"
          columns: ["created_by"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "incidents_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "incidents_order_id_fkey"
          columns: ["order_id"]
          isOneToOne: false
          referencedRelation: "orders"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "incidents_order_location_fk"
          columns: ["order_id", "location_id"]
          isOneToOne: false
          referencedRelation: "orders"
          referencedColumns: ["id", "location_id"]
        },
        {
          foreignKeyName: "incidents_shipment_id_fkey"
          columns: ["shipment_id"]
          isOneToOne: false
          referencedRelation: "shipments"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "incidents_shipment_location_fk"
          columns: ["shipment_id", "location_id"]
          isOneToOne: false
          referencedRelation: "shipments"
          referencedColumns: ["id", "location_id"]
        },
        {
          foreignKeyName: "incidents_shipment_order_fk"
          columns: ["shipment_id", "order_id"]
          isOneToOne: false
          referencedRelation: "shipments"
          referencedColumns: ["id", "order_id"]
        }
        ]
      }
      "inventory_reservations": {
        Row: {
        "id": string
        "order_item_id": string
        "location_id": string
        "product_id": string
        "lot_id": string
        "quantity": number
        "status": string
        "created_at": string
        }
        Insert: {
        "id"?: string
        "order_item_id": string
        "location_id": string
        "product_id": string
        "lot_id": string
        "quantity": number
        "status": string
        "created_at": string
        }
        Update: {
        "id"?: string
        "order_item_id"?: string
        "location_id"?: string
        "product_id"?: string
        "lot_id"?: string
        "quantity"?: number
        "status"?: string
        "created_at"?: string
        }
        Relationships: [
        {
          foreignKeyName: "inventory_reservations_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "inventory_reservations_lot_id_product_id_fkey"
          columns: ["lot_id", "product_id"]
          isOneToOne: false
          referencedRelation: "product_lots"
          referencedColumns: ["id", "product_id"]
        },
        {
          foreignKeyName: "inventory_reservations_order_item_id_fkey"
          columns: ["order_item_id"]
          isOneToOne: false
          referencedRelation: "order_items"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "inventory_reservations_order_item_id_product_id_fkey"
          columns: ["order_item_id", "product_id"]
          isOneToOne: false
          referencedRelation: "order_items"
          referencedColumns: ["id", "product_id"]
        }
        ]
      }
      "locations": {
        Row: {
        "id": string
        "code": string
        "name": string
        "kind": string
        "city": string
        "zone": string
        "latitude": number | null
        "longitude": number | null
        "site_type": string | null
        "area_m2": number | null
        "workers": number | null
        "window_start": string | null
        "window_end": string | null
        "service_minutes": number
        "demo_scope": string
        "is_synthetic": boolean
        }
        Insert: {
        "id"?: string
        "code": string
        "name": string
        "kind": string
        "city": string
        "zone": string
        "latitude"?: number | null
        "longitude"?: number | null
        "site_type"?: string | null
        "area_m2"?: number | null
        "workers"?: number | null
        "window_start"?: string | null
        "window_end"?: string | null
        "service_minutes"?: number
        "demo_scope": string
        "is_synthetic"?: boolean
        }
        Update: {
        "id"?: string
        "code"?: string
        "name"?: string
        "kind"?: string
        "city"?: string
        "zone"?: string
        "latitude"?: number | null
        "longitude"?: number | null
        "site_type"?: string | null
        "area_m2"?: number | null
        "workers"?: number | null
        "window_start"?: string | null
        "window_end"?: string | null
        "service_minutes"?: number
        "demo_scope"?: string
        "is_synthetic"?: boolean
        }
        Relationships: []
      }
      "order_items": {
        Row: {
        "id": string
        "order_id": string
        "product_id": string
        "requested_qty": number
        "approved_qty": number | null
        "prepared_qty": number
        }
        Insert: {
        "id"?: string
        "order_id": string
        "product_id": string
        "requested_qty": number
        "approved_qty"?: number | null
        "prepared_qty"?: number
        }
        Update: {
        "id"?: string
        "order_id"?: string
        "product_id"?: string
        "requested_qty"?: number
        "approved_qty"?: number | null
        "prepared_qty"?: number
        }
        Relationships: [
        {
          foreignKeyName: "order_items_order_id_fkey"
          columns: ["order_id"]
          isOneToOne: false
          referencedRelation: "orders"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "order_items_product_id_fkey"
          columns: ["product_id"]
          isOneToOne: false
          referencedRelation: "products"
          referencedColumns: ["id"]
        }
        ]
      }
      "orders": {
        Row: {
        "id": string
        "code": string
        "location_id": string
        "cycle_month": string
        "requested_by": string
        "approved_by": string | null
        "requested_at": string
        "approved_at": string | null
        "status": string
        "order_type": string
        "related_order_id": string | null
        "reason": string | null
        "observations": string
        "idempotency_key": string
        "provenance": string
        }
        Insert: {
        "id"?: string
        "code": string
        "location_id": string
        "cycle_month": string
        "requested_by": string
        "approved_by"?: string | null
        "requested_at": string
        "approved_at"?: string | null
        "status": string
        "order_type": string
        "related_order_id"?: string | null
        "reason"?: string | null
        "observations"?: string
        "idempotency_key": string
        "provenance"?: string
        }
        Update: {
        "id"?: string
        "code"?: string
        "location_id"?: string
        "cycle_month"?: string
        "requested_by"?: string
        "approved_by"?: string | null
        "requested_at"?: string
        "approved_at"?: string | null
        "status"?: string
        "order_type"?: string
        "related_order_id"?: string | null
        "reason"?: string | null
        "observations"?: string
        "idempotency_key"?: string
        "provenance"?: string
        }
        Relationships: [
        {
          foreignKeyName: "orders_approved_by_fkey"
          columns: ["approved_by"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "orders_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "orders_related_order_id_fkey"
          columns: ["related_order_id"]
          isOneToOne: false
          referencedRelation: "orders"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "orders_requested_by_fkey"
          columns: ["requested_by"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        }
        ]
      }
      "point_assignments": {
        Row: {
        "staff_id": string
        "location_id": string
        }
        Insert: {
        "staff_id": string
        "location_id": string
        }
        Update: {
        "staff_id"?: string
        "location_id"?: string
        }
        Relationships: [
        {
          foreignKeyName: "point_assignments_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "point_assignments_staff_id_fkey"
          columns: ["staff_id"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        }
        ]
      }
      "product_costs": {
        Row: {
        "product_id": string
        "unit_cost_usd": number
        "provenance": string
        }
        Insert: {
        "product_id": string
        "unit_cost_usd": number
        "provenance"?: string
        }
        Update: {
        "product_id"?: string
        "unit_cost_usd"?: number
        "provenance"?: string
        }
        Relationships: [
        {
          foreignKeyName: "product_costs_product_id_fkey"
          columns: ["product_id"]
          isOneToOne: true
          referencedRelation: "products"
          referencedColumns: ["id"]
        }
        ]
      }
      "product_lots": {
        Row: {
        "id": string
        "product_id": string
        "batch_code": string
        "expires_on": string | null
        "received_on": string
        "is_synthetic": boolean
        }
        Insert: {
        "id"?: string
        "product_id": string
        "batch_code": string
        "expires_on"?: string | null
        "received_on": string
        "is_synthetic"?: boolean
        }
        Update: {
        "id"?: string
        "product_id"?: string
        "batch_code"?: string
        "expires_on"?: string | null
        "received_on"?: string
        "is_synthetic"?: boolean
        }
        Relationships: [
        {
          foreignKeyName: "product_lots_product_id_fkey"
          columns: ["product_id"]
          isOneToOne: false
          referencedRelation: "products"
          referencedColumns: ["id"]
        }
        ]
      }
      "products": {
        Row: {
        "id": string
        "sku": string
        "name": string
        "category": string
        "description": string
        "inventory_unit": string
        "content_quantity": number | null
        "content_unit": string | null
        "gross_weight_kg": number
        "package_volume_m3": number
        "lead_time_days": number
        "has_expiry": boolean
        "active": boolean
        "provenance": string
        }
        Insert: {
        "id"?: string
        "sku": string
        "name": string
        "category": string
        "description": string
        "inventory_unit": string
        "content_quantity"?: number | null
        "content_unit"?: string | null
        "gross_weight_kg": number
        "package_volume_m3": number
        "lead_time_days": number
        "has_expiry": boolean
        "active"?: boolean
        "provenance"?: string
        }
        Update: {
        "id"?: string
        "sku"?: string
        "name"?: string
        "category"?: string
        "description"?: string
        "inventory_unit"?: string
        "content_quantity"?: number | null
        "content_unit"?: string | null
        "gross_weight_kg"?: number
        "package_volume_m3"?: number
        "lead_time_days"?: number
        "has_expiry"?: boolean
        "active"?: boolean
        "provenance"?: string
        }
        Relationships: []
      }
      "purchase_order_items": {
        Row: {
        "id": string
        "purchase_id": string
        "product_id": string
        "ordered_qty": number
        "unit_cost_usd": number
        }
        Insert: {
        "id"?: string
        "purchase_id": string
        "product_id": string
        "ordered_qty": number
        "unit_cost_usd": number
        }
        Update: {
        "id"?: string
        "purchase_id"?: string
        "product_id"?: string
        "ordered_qty"?: number
        "unit_cost_usd"?: number
        }
        Relationships: [
        {
          foreignKeyName: "purchase_order_items_product_id_fkey"
          columns: ["product_id"]
          isOneToOne: false
          referencedRelation: "products"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "purchase_order_items_purchase_id_fkey"
          columns: ["purchase_id"]
          isOneToOne: false
          referencedRelation: "purchase_orders"
          referencedColumns: ["id"]
        }
        ]
      }
      "purchase_orders": {
        Row: {
        "id": string
        "code": string
        "supplier_name": string
        "created_by": string
        "status": string
        "approved_by": string | null
        "approved_at": string | null
        "ordered_at": string | null
        "expected_at": string | null
        "provenance": string
        }
        Insert: {
        "id"?: string
        "code": string
        "supplier_name": string
        "created_by": string
        "status": string
        "approved_by"?: string | null
        "approved_at"?: string | null
        "ordered_at"?: string | null
        "expected_at"?: string | null
        "provenance"?: string
        }
        Update: {
        "id"?: string
        "code"?: string
        "supplier_name"?: string
        "created_by"?: string
        "status"?: string
        "approved_by"?: string | null
        "approved_at"?: string | null
        "ordered_at"?: string | null
        "expected_at"?: string | null
        "provenance"?: string
        }
        Relationships: [
        {
          foreignKeyName: "purchase_orders_approved_by_fkey"
          columns: ["approved_by"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "purchase_orders_created_by_fkey"
          columns: ["created_by"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        }
        ]
      }
      "receipt_items": {
        Row: {
        "receipt_id": string
        "shipment_id": string
        "shipment_item_id": string
        "counted_qty": number
        "accepted_qty": number
        }
        Insert: {
        "receipt_id": string
        "shipment_id": string
        "shipment_item_id": string
        "counted_qty": number
        "accepted_qty": number
        }
        Update: {
        "receipt_id"?: string
        "shipment_id"?: string
        "shipment_item_id"?: string
        "counted_qty"?: number
        "accepted_qty"?: number
        }
        Relationships: [
        {
          foreignKeyName: "receipt_items_receipt_id_shipment_id_fkey"
          columns: ["receipt_id", "shipment_id"]
          isOneToOne: false
          referencedRelation: "receipts"
          referencedColumns: ["id", "shipment_id"]
        },
        {
          foreignKeyName: "receipt_items_shipment_item_id_shipment_id_fkey"
          columns: ["shipment_item_id", "shipment_id"]
          isOneToOne: false
          referencedRelation: "shipment_items"
          referencedColumns: ["id", "shipment_id"]
        }
        ]
      }
      "receipts": {
        Row: {
        "id": string
        "shipment_id": string
        "checked_by": string
        "checked_at": string
        "notes": string
        }
        Insert: {
        "id"?: string
        "shipment_id": string
        "checked_by": string
        "checked_at": string
        "notes"?: string
        }
        Update: {
        "id"?: string
        "shipment_id"?: string
        "checked_by"?: string
        "checked_at"?: string
        "notes"?: string
        }
        Relationships: [
        {
          foreignKeyName: "receipts_checked_by_fkey"
          columns: ["checked_by"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "receipts_shipment_id_fkey"
          columns: ["shipment_id"]
          isOneToOne: true
          referencedRelation: "shipments"
          referencedColumns: ["id"]
        }
        ]
      }
      "replenishment_policies": {
        Row: {
        "location_id": string
        "product_id": string
        "daily_demand_units": number
        "review_days": number
        "delivery_lead_days": number
        "safety_days": number
        "required_in_kit": boolean
        "source": string
        }
        Insert: {
        "location_id": string
        "product_id": string
        "daily_demand_units": number
        "review_days"?: number
        "delivery_lead_days": number
        "safety_days": number
        "required_in_kit"?: boolean
        "source"?: string
        }
        Update: {
        "location_id"?: string
        "product_id"?: string
        "daily_demand_units"?: number
        "review_days"?: number
        "delivery_lead_days"?: number
        "safety_days"?: number
        "required_in_kit"?: boolean
        "source"?: string
        }
        Relationships: [
        {
          foreignKeyName: "replenishment_policies_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "replenishment_policies_product_id_fkey"
          columns: ["product_id"]
          isOneToOne: false
          referencedRelation: "products"
          referencedColumns: ["id"]
        }
        ]
      }
      "route_plans": {
        Row: {
        "id": string
        "code": string
        "vehicle_id": string
        "dispatch_date": string
        "status": string
        "matrix_source": string
        "planning_method": string
        "estimated_km": number | null
        "estimated_minutes": number | null
        "approved_by": string | null
        "provenance": string
        }
        Insert: {
        "id"?: string
        "code": string
        "vehicle_id": string
        "dispatch_date": string
        "status": string
        "matrix_source": string
        "planning_method": string
        "estimated_km"?: number | null
        "estimated_minutes"?: number | null
        "approved_by"?: string | null
        "provenance"?: string
        }
        Update: {
        "id"?: string
        "code"?: string
        "vehicle_id"?: string
        "dispatch_date"?: string
        "status"?: string
        "matrix_source"?: string
        "planning_method"?: string
        "estimated_km"?: number | null
        "estimated_minutes"?: number | null
        "approved_by"?: string | null
        "provenance"?: string
        }
        Relationships: [
        {
          foreignKeyName: "route_plans_approved_by_fkey"
          columns: ["approved_by"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "route_plans_vehicle_id_fkey"
          columns: ["vehicle_id"]
          isOneToOne: false
          referencedRelation: "vehicles"
          referencedColumns: ["id"]
        }
        ]
      }
      "route_stops": {
        Row: {
        "route_id": string
        "location_id": string | null
        "sequence": number
        "planned_arrival": string | null
        }
        Insert: {
        "route_id": string
        "location_id"?: string | null
        "sequence": number
        "planned_arrival"?: string | null
        }
        Update: {
        "route_id"?: string
        "location_id"?: string | null
        "sequence"?: number
        "planned_arrival"?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "route_stops_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "route_stops_route_id_fkey"
          columns: ["route_id"]
          isOneToOne: false
          referencedRelation: "route_plans"
          referencedColumns: ["id"]
        }
        ]
      }
      "shipment_items": {
        Row: {
        "id": string
        "shipment_id": string
        "order_id": string
        "order_item_id": string
        "product_id": string
        "lot_id": string
        "shipped_qty": number
        }
        Insert: {
        "id"?: string
        "shipment_id": string
        "order_id": string
        "order_item_id": string
        "product_id": string
        "lot_id": string
        "shipped_qty": number
        }
        Update: {
        "id"?: string
        "shipment_id"?: string
        "order_id"?: string
        "order_item_id"?: string
        "product_id"?: string
        "lot_id"?: string
        "shipped_qty"?: number
        }
        Relationships: [
        {
          foreignKeyName: "shipment_items_lot_id_product_id_fkey"
          columns: ["lot_id", "product_id"]
          isOneToOne: false
          referencedRelation: "product_lots"
          referencedColumns: ["id", "product_id"]
        },
        {
          foreignKeyName: "shipment_items_order_item_id_order_id_product_id_fkey"
          columns: ["order_item_id", "order_id", "product_id"]
          isOneToOne: false
          referencedRelation: "order_items"
          referencedColumns: ["id", "order_id", "product_id"]
        },
        {
          foreignKeyName: "shipment_items_shipment_id_order_id_fkey"
          columns: ["shipment_id", "order_id"]
          isOneToOne: false
          referencedRelation: "shipments"
          referencedColumns: ["id", "order_id"]
        }
        ]
      }
      "shipments": {
        Row: {
        "id": string
        "code": string
        "order_id": string
        "location_id": string
        "mode": string
        "route_id": string | null
        "carrier_name": string | null
        "guide_code": string
        "qr_token": string
        "status": string
        "dispatched_at": string | null
        "promised_delivery_at": string | null
        "delivered_at": string | null
        "provenance": string
        }
        Insert: {
        "id"?: string
        "code": string
        "order_id": string
        "location_id": string
        "mode": string
        "route_id"?: string | null
        "carrier_name"?: string | null
        "guide_code": string
        "qr_token": string
        "status": string
        "dispatched_at"?: string | null
        "promised_delivery_at"?: string | null
        "delivered_at"?: string | null
        "provenance"?: string
        }
        Update: {
        "id"?: string
        "code"?: string
        "order_id"?: string
        "location_id"?: string
        "mode"?: string
        "route_id"?: string | null
        "carrier_name"?: string | null
        "guide_code"?: string
        "qr_token"?: string
        "status"?: string
        "dispatched_at"?: string | null
        "promised_delivery_at"?: string | null
        "delivered_at"?: string | null
        "provenance"?: string
        }
        Relationships: [
        {
          foreignKeyName: "shipments_order_id_location_id_fkey"
          columns: ["order_id", "location_id"]
          isOneToOne: false
          referencedRelation: "orders"
          referencedColumns: ["id", "location_id"]
        },
        {
          foreignKeyName: "shipments_route_id_fkey"
          columns: ["route_id"]
          isOneToOne: false
          referencedRelation: "route_plans"
          referencedColumns: ["id"]
        }
        ]
      }
      "staff_members": {
        Row: {
        "id": string
        "auth_user_id": string | null
        "full_name": string
        "demo_email": string
        "role": string
        "active": boolean
        "is_synthetic": boolean
        }
        Insert: {
        "id"?: string
        "auth_user_id"?: string | null
        "full_name": string
        "demo_email": string
        "role": string
        "active"?: boolean
        "is_synthetic"?: boolean
        }
        Update: {
        "id"?: string
        "auth_user_id"?: string | null
        "full_name"?: string
        "demo_email"?: string
        "role"?: string
        "active"?: boolean
        "is_synthetic"?: boolean
        }
        Relationships: [
        {
          foreignKeyName: "staff_members_auth_user_id_fkey"
          columns: ["auth_user_id"]
          isOneToOne: true
          referencedRelation: "users"
          referencedColumns: ["id"]
        }
        ]
      }
      "stock_movements": {
        Row: {
        "id": string
        "location_id": string
        "product_id": string
        "lot_id": string
        "delta_qty": number
        "occurred_at": string
        "reason": string
        "transfer_group": string | null
        "shipment_item_id": string | null
        "purchase_item_id": string | null
        "recorded_by": string
        "note": string
        "provenance": string
        }
        Insert: {
        "id"?: string
        "location_id": string
        "product_id": string
        "lot_id": string
        "delta_qty": number
        "occurred_at": string
        "reason": string
        "transfer_group"?: string | null
        "shipment_item_id"?: string | null
        "purchase_item_id"?: string | null
        "recorded_by": string
        "note"?: string
        "provenance"?: string
        }
        Update: {
        "id"?: string
        "location_id"?: string
        "product_id"?: string
        "lot_id"?: string
        "delta_qty"?: number
        "occurred_at"?: string
        "reason"?: string
        "transfer_group"?: string | null
        "shipment_item_id"?: string | null
        "purchase_item_id"?: string | null
        "recorded_by"?: string
        "note"?: string
        "provenance"?: string
        }
        Relationships: [
        {
          foreignKeyName: "stock_movements_location_id_fkey"
          columns: ["location_id"]
          isOneToOne: false
          referencedRelation: "locations"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "stock_movements_lot_id_product_id_fkey"
          columns: ["lot_id", "product_id"]
          isOneToOne: false
          referencedRelation: "product_lots"
          referencedColumns: ["id", "product_id"]
        },
        {
          foreignKeyName: "stock_movements_purchase_item_id_fkey"
          columns: ["purchase_item_id"]
          isOneToOne: false
          referencedRelation: "purchase_order_items"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "stock_movements_recorded_by_fkey"
          columns: ["recorded_by"]
          isOneToOne: false
          referencedRelation: "staff_members"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "stock_movements_shipment_item_id_fkey"
          columns: ["shipment_item_id"]
          isOneToOne: false
          referencedRelation: "shipment_items"
          referencedColumns: ["id"]
        }
        ]
      }
      "vehicles": {
        Row: {
        "id": string
        "code": string
        "description": string
        "capacity_kg": number
        "capacity_m3": number
        "available_from": string
        "available_until": string
        "is_synthetic": boolean
        }
        Insert: {
        "id"?: string
        "code": string
        "description": string
        "capacity_kg": number
        "capacity_m3": number
        "available_from": string
        "available_until": string
        "is_synthetic"?: boolean
        }
        Update: {
        "id"?: string
        "code"?: string
        "description"?: string
        "capacity_kg"?: number
        "capacity_m3"?: number
        "available_from"?: string
        "available_until"?: string
        "is_synthetic"?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      "v_inventory": {
        Row: {
        "location_id": string | null
        "product_id": string | null
        "physical_qty": number | null
        "usable_qty": number | null
        "expired_qty": number | null
        "reserved_qty": number | null
        "available_qty": number | null
        }
        Relationships: []
      }
      "v_lot_balances": {
        Row: {
        "location_id": string | null
        "product_id": string | null
        "lot_id": string | null
        "physical_qty": number | null
        "expires_on": string | null
        "usable": boolean | null
        }
        Relationships: []
      }
      "v_order_trace": {
        Row: {
        "order_code": string | null
        "location_id": string | null
        "status": string | null
        "order_item_id": string | null
        "sku": string | null
        "name": string | null
        "requested_qty": number | null
        "approved_qty": number | null
        "prepared_qty": number | null
        "shipped_qty": number | null
        "counted_qty": number | null
        "accepted_qty": number | null
        "shortage_qty": number | null
        }
        Relationships: []
      }
      "v_replenishment": {
        Row: {
        "location_id": string | null
        "product_id": string | null
        "sku": string | null
        "daily_demand_units": number | null
        "review_days": number | null
        "delivery_lead_days": number | null
        "safety_days": number | null
        "usable_qty": number | null
        "confirmed_inbound_qty": number | null
        "coverage_days": number | null
        "recommended_qty": number | null
        "coverage_status": string | null
        "demand_source": string | null
        }
        Relationships: []
      }
      "v_warehouse_purchase_items": {
        Row: {
        "id": string | null
        "purchase_id": string | null
        "product_id": string | null
        "ordered_qty": number | null
        }
        Relationships: []
      }
    }
    Functions: {
      "check_receipt_quantity": { Args: Record<PropertyKey, never>; Returns: unknown }
      "check_reservation": { Args: Record<PropertyKey, never>; Returns: unknown }
      "check_shipment_quantity": { Args: Record<PropertyKey, never>; Returns: unknown }
      "check_stock_balance": { Args: Record<PropertyKey, never>; Returns: unknown }
      "prevent_ledger_edit": { Args: Record<PropertyKey, never>; Returns: unknown }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
};
