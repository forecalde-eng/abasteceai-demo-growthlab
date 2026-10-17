import json
import urllib.error
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import asistente, auth
from app.main import create_app

H = {"Authorization": "Bearer x"}
FUENTE = {
    "document_id": "00000000-0000-0000-0000-000000000001",
    "title": "Recepción con diferencias DEMO",
    "version": "DEMO-1.1",
    "body": "DOCUMENTO FICTICIO DE DEMOSTRACION\nCuenta lo recibido y registra la diferencia.",
}


@pytest.fixture
def estado(monkeypatch):
    """Cliente con rol y base simulados; `estado.logs` recoge los INSERT de decision_logs."""
    e = SimpleNamespace(
        fuentes=[FUENTE], logs=[], buscadas=[], real=False, openai=None, rol="auxiliar"
    )
    monkeypatch.setattr(auth, "verificar_jwt", lambda _: "u")
    monkeypatch.setattr(
        auth, "cargar_me", lambda _: auth.Me("s-1", "X", "x@x", e.rol, [{"id": "p-1"}])
    )
    monkeypatch.setattr(asistente, "buscar", lambda *a: e.buscadas.append(a) or e.fuentes)
    monkeypatch.setattr(asistente, "fetch_one", lambda _sql, p: e.logs.append(p) or ("log-1",))
    monkeypatch.setattr(
        asistente,
        "get_settings",
        lambda: SimpleNamespace(
            ai_calls_enabled=e.real, openai_api_key="k", openai_chat_model="gpt-6-luna"
        ),
    )
    monkeypatch.setattr(
        asistente, "_llamar_openai", lambda *a: e.openai(*a) if e.openai else ("x", 0)
    )
    e.cliente = TestClient(create_app())
    return e


def preguntar(e, q="¿Cómo recibo?"):
    return e.cliente.post("/assistant", json={"question": q}, headers=H)


def test_simulado_cita_y_registra_mock(estado):
    r = preguntar(estado)
    j = r.json()
    assert r.status_code == 200 and j["source"] == "SIMULADO" and j["model"] == "plantilla-demo"
    assert j["answer"].startswith("Según «Recepción con diferencias DEMO» (DEMO-1.1)")
    assert "DOCUMENTO FICTICIO" not in j["answer"]
    assert j["citations"] == [{k: FUENTE[k] for k in ("document_id", "title", "version")}]
    assert j["decision_log_id"] == "log-1"
    assert estado.logs[0][0] == "mock" and estado.logs[0][-1] == 0
    assert estado.buscadas == [("auxiliar", ["p-1"], "¿Cómo recibo?")]


def test_sin_fuente_no_inventa_ni_llama_a_openai(estado):
    estado.fuentes, estado.real = [], True
    estado.openai = lambda *a: pytest.fail("no debe llamar a OpenAI sin fuente")
    j = preguntar(estado).json()
    assert j["answer"] == "No tengo una fuente para eso." and j["citations"] == []
    assert j["source"] == "SIMULADO" and estado.logs[0][0] == "mock"


def test_openai_real_registra_tokens(estado):
    estado.real, estado.openai = True, lambda *a: ("Respuesta redactada.", 321)
    j = preguntar(estado).json()
    assert (j["source"], j["answer"], j["model"]) == (
        "API_REAL",
        "Respuesta redactada.",
        "gpt-6-luna",
    )
    assert estado.logs[0][0] == "openai" and estado.logs[0][-1] == 321


@pytest.mark.parametrize(
    "fallo",
    [
        urllib.error.URLError("x"),
        TimeoutError(),
        KeyError("choices"),
        IndexError(),
        AttributeError(),
    ],
)
def test_openai_caido_es_502_sin_log(estado, fallo):
    def cae(*_):
        raise fallo

    estado.real, estado.openai = True, cae
    r = preguntar(estado)
    assert r.status_code == 502 and r.json()["error"]["code"] == "UPSTREAM_AI"
    assert estado.logs == []


@pytest.mark.parametrize("q", ["", "   ", "x" * 501])
def test_pregunta_invalida_es_422(estado, q):
    assert preguntar(estado, q).status_code == 422


def test_sin_sesion_es_401(estado):
    assert estado.cliente.post("/assistant", json={"question": "hola"}).status_code == 401


def test_llamar_openai_arma_la_peticion(monkeypatch, estado):
    visto = {}

    class R:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self):
            return json.dumps(
                {"choices": [{"message": {"content": " ok "}}], "usage": {"prompt_tokens": 7}}
            ).encode()

    def abre(req, timeout):
        visto.update(req=req, timeout=timeout)
        return R()

    monkeypatch.undo()  # _llamar_openai real; get_settings real salvo la llave
    monkeypatch.setattr(asistente.urllib.request, "urlopen", abre)
    monkeypatch.setattr(
        asistente,
        "get_settings",
        lambda: SimpleNamespace(openai_api_key="k", openai_chat_model="gpt-6-luna"),
    )
    assert asistente._llamar_openai("¿q?", [FUENTE]) == ("ok", 7)
    cuerpo = json.loads(visto["req"].data)
    assert cuerpo["model"] == "gpt-6-luna" and "¿q?" in cuerpo["messages"][1]["content"]
    assert visto["req"].get_header("Authorization") == "Bearer k" and visto["timeout"] == 15


def test_openai_sin_fuente_no_cita_candidatos(estado):
    estado.real, estado.openai = True, lambda *a: ("No tengo una fuente para eso.", 5)
    j = preguntar(estado).json()
    assert j["citations"] == [] and j["source"] == "API_REAL"
