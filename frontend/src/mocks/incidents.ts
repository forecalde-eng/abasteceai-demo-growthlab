// DEMO FICTICIA · Generado desde CSV y vistas SQL oficiales por generate.mjs. No editar a mano.
import type { Incident } from './types'

export const incidents: Incident[] = [
  {
    "id": "af887ca5-78ce-538c-9ce1-87e2bdf3baef",
    "code": "INC-DUPLICADO",
    "location_id": "704dfcd6-b98d-56ce-8661-bfc410332be8",
    "order_id": "115b2c00-4875-5463-a679-df955d15846f",
    "shipment_id": null,
    "kind": "possible_duplicate",
    "severity": "high",
    "status": "open",
    "description": "PED-DEMO-025 repite los 16 ítems de PED-DEMO-001, mismo punto y período.",
    "created_at": "2026-10-10T20:30:00Z",
    "created_by": "aca13b82-3dc4-538e-8e99-f7760d016163",
    "provenance": "synthetic"
  },
  {
    "id": "d414f0e3-31b8-5d91-9ded-be9af69ff6a2",
    "code": "INC-OMISION",
    "location_id": "50756d9d-9267-5fc0-ac92-4ea8f6abdc1a",
    "order_id": "4f0e7cb2-7f23-52a8-9dd3-0c2885bae6fa",
    "shipment_id": null,
    "kind": "missing_from_kit",
    "severity": "medium",
    "status": "open",
    "description": "INS-016 figura en el kit ficticio y no aparece en el pedido.",
    "created_at": "2026-10-10T20:30:00Z",
    "created_by": "aca13b82-3dc4-538e-8e99-f7760d016163",
    "provenance": "synthetic"
  },
  {
    "id": "121e8829-0627-5f43-83ba-b8c6c590f45a",
    "code": "INC-EMPAQUE",
    "location_id": "83ceb3cf-e00e-5994-8a74-84812eecb588",
    "order_id": "3fc22a86-c42c-57eb-8a95-e93a509013f4",
    "shipment_id": null,
    "kind": "packing_difference",
    "severity": "medium",
    "status": "open",
    "description": "Cantidades preparadas menores que las aprobadas; seguir en preparación.",
    "created_at": "2026-10-10T20:30:00Z",
    "created_by": "aca13b82-3dc4-538e-8e99-f7760d016163",
    "provenance": "synthetic"
  },
  {
    "id": "99c7390a-ea4f-53bc-9ed4-2c9d344a2797",
    "code": "INC-RECEPCION",
    "location_id": "85ffdf07-af4c-54ec-8829-1003b49a6879",
    "order_id": "e01ed5b7-f287-5728-9033-1452b2cc4eb7",
    "shipment_id": "b8543b9c-8e16-5e73-b5c1-9f31bc73494c",
    "kind": "receipt_shortage",
    "severity": "high",
    "status": "open",
    "description": "INS-002: se enviaron 10, se contaron y aceptaron 8. Dos permanecen pendientes en tránsito.",
    "created_at": "2026-10-10T20:30:00Z",
    "created_by": "aca13b82-3dc4-538e-8e99-f7760d016163",
    "provenance": "synthetic"
  },
  {
    "id": "4af5f674-ecf6-5e3e-98b8-c0f49d19cc81",
    "code": "INC-COURIER",
    "location_id": "ac257a20-9323-575f-8ec8-1ceef8a5e999",
    "order_id": "05a31f45-d89d-52b6-b87c-da40f1464bbc",
    "shipment_id": "e54aa5b5-66cb-556d-922f-1f494189cd11",
    "kind": "delay",
    "severity": "medium",
    "status": "open",
    "description": "Envío ficticio Quito–Guayaquil: superó la fecha prometida sin entrega confirmada.",
    "created_at": "2026-10-10T20:30:00Z",
    "created_by": "aca13b82-3dc4-538e-8e99-f7760d016163",
    "provenance": "synthetic"
  },
  {
    "id": "58d7ce2c-33a0-503b-9319-2178c71be0ec",
    "code": "INC-EXCESO",
    "location_id": "50756d9d-9267-5fc0-ac92-4ea8f6abdc1a",
    "order_id": null,
    "shipment_id": null,
    "kind": "excess_stock",
    "severity": "medium",
    "status": "open",
    "description": "Saldo DEMO alto respecto de la necesidad mensual supuesta.",
    "created_at": "2026-10-10T20:30:00Z",
    "created_by": "aca13b82-3dc4-538e-8e99-f7760d016163",
    "provenance": "synthetic"
  },
  {
    "id": "441d5657-d321-5983-9230-af3c6ded1231",
    "code": "INC-VENCIMIENTO",
    "location_id": "704dfcd6-b98d-56ce-8661-bfc410332be8",
    "order_id": null,
    "shipment_id": null,
    "kind": "expiry",
    "severity": "high",
    "status": "open",
    "description": "Lotes ficticios vencidos excluidos de stock utilizable.",
    "created_at": "2026-10-10T20:30:00Z",
    "created_by": "aca13b82-3dc4-538e-8e99-f7760d016163",
    "provenance": "synthetic"
  }
]
