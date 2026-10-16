// DEMO FICTICIA · Generado desde CSV y vistas SQL oficiales por generate.mjs. No editar a mano.
import type { DecisionLog } from './types'

export const decisionLogs: DecisionLog[] = [
  {
    "id": "3adff086-0ac0-5475-ad82-9a099c8d0362",
    "location_id": "704dfcd6-b98d-56ce-8661-bfc410332be8",
    "order_id": "e554f1c3-989e-542f-9b2a-81eb1fbe0cfe",
    "task": "classify_request",
    "provider": "mock",
    "model_version": "SIMULATED/jev-1.13.0",
    "input_state": {
      "order_code": "PED-DEMO-001",
      "point_code": "Q-001",
      "observations": "Nos falta desinfectante y tenemos una jornada adicional mañana.",
      "computed_by_code": {
        "coverage_bucket": "critical",
        "sku": "INS-002"
      },
      "provenance": "synthetic demo data"
    },
    "response": {
      "model": "jev-1.13.0",
      "answers": {
        "urgency": {
          "type": "choice",
          "choice": "urgent",
          "probabilities": {
            "routine": 0.04,
            "urgent": 0.91,
            "review": 0.05
          },
          "confidence": 0.865
        },
        "additional_reason": {
          "type": "choice",
          "choice": "review",
          "probabilities": {
            "supported": 0.2,
            "possible_duplicate": 0.2,
            "review": 0.6
          },
          "confidence": 0.4
        },
        "needs_human_review": {
          "type": "noul",
          "noul": 0.9
        }
      },
      "usage": {
        "input_tokens": 0,
        "output_tokens": 0
      }
    },
    "proposed_action": "Mostrar prioridad sugerida y solicitar revisión del administrador.",
    "status": "human_review",
    "input_tokens": 0,
    "estimated_cost_usd": 0,
    "created_at": "2026-10-10T21:00:00Z"
  }
]
