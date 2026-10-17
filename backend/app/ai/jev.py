"""Jev (TypeSafe) clasifica las notas del pedido (HU-4.1). Solo propone (AGENTS.md, regla 2).

`proponer` devuelve el sobre `p_proposal` de `fn_analizar_reglas` (funciones.md, acuerdo 11):
nunca el log `rules`, y ante cualquier fallo el sobre de timeout, que SQL guarda como
`human_review`. Con `AI_CALLS_ENABLED=false` (por defecto) responde con el JSON simulado.
"""

import json
import math
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from app.config import get_settings

MODELO = "jev-1.13.0"
ENDPOINT = "https://api.typesafe.ai/v1/systemone"
UMBRAL_CONFIANZA = 0.80  # AGENTS/spec §HU-4.1: por debajo, revisión humana
UMBRAL_NOUL = 0.5
_SIMULADO = json.loads((Path(__file__).parent / "jev_simulado.json").read_text(encoding="utf-8"))
FALLO = {
    "provider": "typesafe",
    "model_version": MODELO,
    "response": {"error": "timeout"},
    "proposed_action": "human_review",
    "status": "human_review",
    "input_tokens": 0,
    "estimated_cost_usd": 0,
}


def validar_respuesta(solicitud: dict, respuesta: dict) -> dict:
    """Port de `db/integracion_jev.py::validate_response`: la forma, no el negocio."""
    answers = respuesta.get("answers", {})
    for clave, pregunta in solicitud["questions"].items():
        a = answers.get(clave)
        if not isinstance(a, dict) or a.get("type") != pregunta["type"]:
            raise ValueError(f"Respuesta incompleta o tipo incorrecto: {clave}")
        if pregunta["type"] == "choice":
            etiquetas, probs = set(pregunta["criteria"]), a.get("probabilities", {})
            if set(probs) != etiquetas or a.get("choice") not in etiquetas:
                raise ValueError(f"Opciones distintas del contrato: {clave}")
            if not all(_prob(p) for p in probs.values()) or abs(sum(probs.values()) - 1) > 0.002:
                raise ValueError(f"Probabilidades inválidas: {clave}")
            if abs(probs[a["choice"]] - max(probs.values())) > 0.002:
                raise ValueError(f"La elección no es la más probable: {clave}")
            if not _prob(a.get("confidence")):
                raise ValueError(f"Confianza inválida: {clave}")
        elif not _prob(a.get("noul")):
            raise ValueError(f"Noul inválido: {clave}")
    return respuesta


def _prob(x: Any) -> bool:
    return isinstance(x, int | float) and math.isfinite(x) and 0 <= x <= 1


def requiere_revision(answers: dict) -> bool:
    return any(
        (a["type"] == "choice" and a["confidence"] < UMBRAL_CONFIANZA)
        or (a["type"] == "noul" and a["noul"] >= UMBRAL_NOUL)
        for a in answers.values()
    )


def _llamar_jev(solicitud: dict) -> dict:
    clave = get_settings().typesafe_api_key.strip()
    if not clave:
        raise ValueError("Falta TYPESAFE_API_KEY")
    cuerpo = json.dumps(solicitud, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=cuerpo,
        method="POST",
        headers={"Authorization": "Bearer " + clave, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


def proponer(estado: dict) -> dict:
    """Sobre `p_proposal` para este `estado` (código, punto y observaciones del pedido)."""
    solicitud = {"model": MODELO, "state": estado, "questions": _SIMULADO["questions"]}
    real = get_settings().ai_calls_enabled
    try:
        respuesta = _llamar_jev(solicitud) if real else _SIMULADO["response"]
        validar_respuesta(solicitud, respuesta)
        answers = respuesta["answers"]
        tokens = int((respuesta.get("usage") or {}).get("input_tokens", 0)) if real else 0
        if tokens < 0:
            raise ValueError("input_tokens negativo")
    except (
        urllib.error.URLError,
        TimeoutError,
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
    ):
        return {**FALLO, "input_state": estado}
    return {
        "provider": "typesafe" if real else "mock",
        "model_version": respuesta.get("model", MODELO),
        "input_state": estado,
        "response": respuesta,
        "proposed_action": answers["urgency"]["choice"],
        "status": "human_review" if requiere_revision(answers) else "proposed",
        # shortcut: costo 0 hasta tener la tarifa de TypeSafe; con mock SQL exige 0 de todos modos.
        "input_tokens": tokens,
        "estimated_cost_usd": 0,
    }
