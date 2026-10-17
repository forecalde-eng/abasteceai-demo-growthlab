import copy
import urllib.error
from types import SimpleNamespace

import pytest

from app.ai import jev

ESTADO = {"order_code": "PED-DEMO-001", "point_code": "Q-001", "observations": "Falta cloro."}
CLAVES_SOBRE = {
    "provider",
    "model_version",
    "input_state",
    "response",
    "proposed_action",
    "status",
    "input_tokens",
    "estimated_cost_usd",
}


def ajustes(monkeypatch, real=False, clave=""):
    cfg = SimpleNamespace(ai_calls_enabled=real, typesafe_api_key=clave)
    monkeypatch.setattr(jev, "get_settings", lambda: cfg)


def test_simulado_por_defecto_va_a_revision_humana(monkeypatch):
    ajustes(monkeypatch)
    s = jev.proponer(ESTADO)
    assert set(s) == CLAVES_SOBRE
    assert (s["provider"], s["input_tokens"], s["estimated_cost_usd"]) == ("mock", 0, 0)
    assert s["input_state"] == ESTADO and s["proposed_action"] == "urgent"
    assert s["status"] == "human_review"  # confianza 0,40 < 0,80 y noul 0,9 ≥ 0,5


def test_real_usa_typesafe_y_los_tokens_de_uso(monkeypatch):
    ajustes(monkeypatch, real=True, clave="k")
    resp = copy.deepcopy(jev._SIMULADO["response"])
    resp["usage"] = {"input_tokens": 120, "output_tokens": 5}
    monkeypatch.setattr(jev, "_llamar_jev", lambda _: resp)
    s = jev.proponer(ESTADO)
    assert (s["provider"], s["input_tokens"]) == ("typesafe", 120)


@pytest.mark.parametrize(
    "error", [urllib.error.URLError("sin red"), TimeoutError(), ValueError("sin clave")]
)
def test_fallo_de_jev_es_el_sobre_de_timeout(monkeypatch, error):
    ajustes(monkeypatch, real=True, clave="k")

    def falla(_):
        raise error

    monkeypatch.setattr(jev, "_llamar_jev", falla)
    s = jev.proponer(ESTADO)
    assert s == {**jev.FALLO, "input_state": ESTADO}
    assert s["response"] == {"error": "timeout"} and s["status"] == "human_review"


def test_real_sin_clave_de_typesafe_sigue_simulado(monkeypatch):
    # AI_CALLS_ENABLED=true solo con la llave de OpenAI: el asistente es real, Jev no.
    ajustes(monkeypatch, real=True, clave="  ")
    monkeypatch.setattr(jev, "_llamar_jev", lambda _: pytest.fail("no debe llamar a TypeSafe"))
    s = jev.proponer(ESTADO)
    assert (s["provider"], s["input_tokens"], s["proposed_action"]) == ("mock", 0, "urgent")


def test_respuesta_manipulada_se_rechaza(monkeypatch):
    ajustes(monkeypatch, real=True, clave="k")
    mala = copy.deepcopy(jev._SIMULADO["response"])
    mala["answers"]["urgency"]["choice"] = "routine"  # no es la más probable
    monkeypatch.setattr(jev, "_llamar_jev", lambda _: mala)
    assert jev.proponer(ESTADO)["response"] == {"error": "timeout"}


def test_confianza_alta_se_propone_sin_revision():
    answers = {
        "urgency": {"type": "choice", "confidence": 0.9},
        "needs_human_review": {"type": "noul", "noul": 0.1},
    }
    assert jev.requiere_revision(answers) is False


@pytest.mark.parametrize(
    "uso", [{"input_tokens": None}, {"input_tokens": "x"}, {"input_tokens": -3}]
)
def test_uso_mal_formado_va_por_el_fallo(monkeypatch, uso):
    ajustes(monkeypatch, real=True, clave="k")
    resp = {**copy.deepcopy(jev._SIMULADO["response"]), "usage": uso}
    monkeypatch.setattr(jev, "_llamar_jev", lambda _: resp)
    assert jev.proponer(ESTADO)["response"] == {"error": "timeout"}
