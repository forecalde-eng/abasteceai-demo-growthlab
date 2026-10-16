// DEMO FICTICIA · Generado desde CSV y vistas SQL oficiales por generate.mjs. No editar a mano.
import type { Shipment } from './types'

export const shipments: Shipment[] = [
  {
    "id": "ad2a6a10-b1f0-5179-87f4-5991817a751e",
    "code": "ENV-DEMO-004",
    "order_id": "54e5eeb1-7d15-50fd-ba9d-e6eee8b0ea7a",
    "location_id": "ba44ff75-f5e0-59ad-a1fa-a7dc032c35e6",
    "mode": "own",
    "route_id": "f21331f4-7748-560d-8a27-d3dc765e8f4b",
    "carrier_name": null,
    "guide_code": "GUIA-DEMO-004",
    "qr_token": "1a28ef31-de9b-5eac-b895-ec19cefae5d2",
    "status": "delivered_unchecked",
    "dispatched_at": "2026-10-10T12:00:00Z",
    "promised_delivery_at": "2026-10-10T20:00:00Z",
    "delivered_at": "2026-10-10T17:00:00Z",
    "provenance": "synthetic"
  },
  {
    "id": "b8543b9c-8e16-5e73-b5c1-9f31bc73494c",
    "code": "ENV-DEMO-005",
    "order_id": "e01ed5b7-f287-5728-9033-1452b2cc4eb7",
    "location_id": "85ffdf07-af4c-54ec-8829-1003b49a6879",
    "mode": "own",
    "route_id": "f21331f4-7748-560d-8a27-d3dc765e8f4b",
    "carrier_name": null,
    "guide_code": "GUIA-DEMO-005",
    "qr_token": "75c8f6b3-c7ba-5f53-9bb0-6ccd2f94fb34",
    "status": "with_difference",
    "dispatched_at": "2026-10-10T12:00:00Z",
    "promised_delivery_at": "2026-10-10T20:00:00Z",
    "delivered_at": "2026-10-10T17:00:00Z",
    "provenance": "synthetic"
  },
  {
    "id": "e54aa5b5-66cb-556d-922f-1f494189cd11",
    "code": "ENV-DEMO-008",
    "order_id": "05a31f45-d89d-52b6-b87c-da40f1464bbc",
    "location_id": "ac257a20-9323-575f-8ec8-1ceef8a5e999",
    "mode": "courier",
    "route_id": null,
    "carrier_name": "Courier DEMO (ficticio)",
    "guide_code": "GUIA-DEMO-008",
    "qr_token": "a8328c98-dcb0-5903-8c70-3754aba5349b",
    "status": "dispatched",
    "dispatched_at": "2026-10-09T16:00:00Z",
    "promised_delivery_at": "2026-10-10T20:00:00Z",
    "delivered_at": null,
    "provenance": "synthetic"
  },
  {
    "id": "97d3820c-c681-51b4-a777-1edfd659eb14",
    "code": "ENV-DEMO-009",
    "order_id": "52b34c13-a8a2-5a0f-9ce4-2a1b88c81d56",
    "location_id": "e12cbeb4-3490-5f21-921d-16d94fa7d5c5",
    "mode": "own",
    "route_id": "f21331f4-7748-560d-8a27-d3dc765e8f4b",
    "carrier_name": null,
    "guide_code": "GUIA-DEMO-009",
    "qr_token": "05418580-4765-5a68-ac3e-2037248dfefe",
    "status": "reconciled",
    "dispatched_at": "2026-10-10T12:00:00Z",
    "promised_delivery_at": "2026-10-10T20:00:00Z",
    "delivered_at": "2026-10-10T17:00:00Z",
    "provenance": "synthetic"
  }
]
