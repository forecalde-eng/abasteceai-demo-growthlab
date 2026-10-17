"""POST /assistant (HU-4.2): responde con documentos que el rol puede ver y los cita.

Solo lee: nunca escribe en la operación. Cada respuesta queda en `decision_logs` (regla 6) con su
`source`: SIMULADO sin llamada a IA (plantilla sobre el fragmento) o API_REAL con OpenAI.
Ninguna cantidad ni fecha sale del modelo: el texto solo parafrasea los fragmentos citados.
"""

import json
import urllib.error
import urllib.request
from typing import Annotated

from fastapi import APIRouter, Depends
from psycopg.types.json import Jsonb
from pydantic import BaseModel, StringConstraints

from app.ai.rag import buscar
from app.auth import Me, require_roles
from app.config import get_settings
from app.db import fetch_one
from app.errors import ApiError

router = APIRouter(tags=["asistente"])
SIN_FUENTE = "No tengo una fuente para eso."
ENCABEZADO = "DOCUMENTO FICTICIO DE DEMOSTRACION"
ENDPOINT = "https://api.openai.com/v1/chat/completions"
INSTRUCCION = (
    "Eres el asistente de AbasteceAI (demo con datos ficticios). Responde en español, breve, "
    "usando SOLO los fragmentos entregados. No calcules cantidades ni fechas. Si los fragmentos no "
    "responden la pregunta, di exactamente: " + SIN_FUENTE
)


class PreguntaIn(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


def _plantilla(fuentes: list[dict]) -> str:
    cuerpo = " ".join(fuentes[0]["body"].replace(ENCABEZADO, "").split())[:400]
    return f"Según «{fuentes[0]['title']}» ({fuentes[0]['version']}): {cuerpo}"


def _llamar_openai(pregunta: str, fuentes: list[dict]) -> tuple[str, int]:
    cfg = get_settings()
    if not cfg.openai_api_key.strip():
        raise ValueError("Falta OPENAI_API_KEY")
    contexto = "\n\n".join(f"[{f['title']} · {f['version']}]\n{f['body']}" for f in fuentes)
    cuerpo = {
        "model": cfg.openai_chat_model,
        "messages": [
            {"role": "system", "content": INSTRUCCION},
            {"role": "user", "content": f"Fragmentos:\n{contexto}\n\nPregunta: {pregunta}"},
        ],
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(cuerpo).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": "Bearer " + cfg.openai_api_key,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        j = json.loads(r.read())
    texto = j["choices"][0]["message"]["content"].strip()
    if not texto:
        raise ValueError("respuesta vacía")
    return texto, int(j.get("usage", {}).get("prompt_tokens", 0))


ROLES = ("auxiliar", "supervisor", "administrador", "bodega", "logistica", "compras", "gerencia")


@router.post("/assistant", operation_id="askAssistant")
def ask_assistant(body: PreguntaIn, me: Annotated[Me, Depends(require_roles(*ROLES))]) -> dict:
    cfg = get_settings()
    fuentes = buscar(me.role, [p["id"] for p in me.points], body.question)
    real = cfg.ai_calls_enabled and bool(fuentes)  # sin fuente no hay nada que redactar
    tokens = 0
    if not fuentes:
        texto, modelo = SIN_FUENTE, "plantilla-demo"
    elif not real:
        texto, modelo = _plantilla(fuentes), "plantilla-demo"
    else:
        try:
            texto, tokens = _llamar_openai(body.question, fuentes)
        except (
            urllib.error.URLError,
            TimeoutError,
            ValueError,
            KeyError,
            json.JSONDecodeError,
        ) as e:
            raise ApiError(502, "UPSTREAM_AI", "El asistente no pudo responder ahora.") from e
        modelo = cfg.openai_chat_model
    citas = [{k: f[k] for k in ("document_id", "title", "version")} for f in fuentes]
    fila = fetch_one(
        "INSERT INTO abastece.decision_logs (task, provider, model_version, input_state, response,"
        " proposed_action, status, input_tokens, estimated_cost_usd, created_at)"
        " SELECT 'assistant', %s, %s, %s, %s, 'answer', 'proposed', %s, 0, reference_at"
        " FROM abastece.demo_metadata WHERE id RETURNING id",
        [
            "openai" if real else "mock",
            modelo,
            Jsonb(
                {
                    "question": body.question,
                    "role": me.role,
                    "documents": [c["document_id"] for c in citas],
                }
            ),
            Jsonb({"answer": texto, "citations": citas}),
            tokens,
        ],
    )
    return {
        "answer": texto,
        "source": "API_REAL" if real else "SIMULADO",
        "model": modelo,
        "citations": citas,
        "decision_log_id": str(fila[0]),
    }
