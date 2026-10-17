from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import auth, orders
from app.errors import desde_sqlstate
from app.main import create_app

LOC = "11111111-1111-4111-8111-111111111111"
AJENA = "22222222-2222-4222-8222-222222222222"
PROD = "33333333-3333-4333-8333-333333333333"
PUNTOS = [{"id": LOC, "code": "Q-001", "name": "Punto", "city": "Quito", "demo_scope": "detailed"}]
H = {"Idempotency-Key": "k-1", "Authorization": "Bearer x"}
CUERPO = {
    "location_id": LOC,
    "cycle_month": "2026-10-01",
    "order_type": "regular",
    "items": [{"product_id": PROD, "requested_qty": 2.5}],
}


@pytest.fixture
def llamadas(monkeypatch):
    registro = []

    def falso(nombre, *args):
        registro.append((nombre, args))
        return {"id": "o-1", "code": "PED-DEMO-027", "status": "submitted", "created": True}

    monkeypatch.setattr(orders, "call_fn", falso)
    return registro


def cliente(monkeypatch, rol="auxiliar", puntos=PUNTOS, me=None):
    me = me or auth.Me("s-1", "Ana Demo", "a@x", rol, puntos)
    monkeypatch.setattr(auth, "verificar_jwt", lambda _: "u-1")
    monkeypatch.setattr(auth, "cargar_me", lambda _: me)
    return TestClient(create_app())


def test_crea_201_sin_created_y_con_los_argumentos_en_orden(monkeypatch, llamadas):
    r = cliente(monkeypatch).post("/orders", json=CUERPO, headers=H)
    assert r.status_code == 201
    assert r.json() == {"id": "o-1", "code": "PED-DEMO-027", "status": "submitted"}
    nombre, args = llamadas[0]
    assert nombre == "fn_crear_pedido"
    assert args[0] == "s-1" and str(args[1]) == LOC and str(args[2]) == "2026-10-01"
    assert args[3:7] == ("regular", None, None, "")
    assert args[7] == [{"product_id": PROD, "requested_qty": 2.5}] and args[8] == "k-1"


def test_clave_repetida_devuelve_200(monkeypatch):
    repetido = {"id": "o-1", "code": "PED-DEMO-027", "status": "approved", "created": False}
    monkeypatch.setattr(orders, "call_fn", lambda *_: repetido)
    r = cliente(monkeypatch).post("/orders", json=CUERPO, headers=H)
    assert r.status_code == 200 and r.json()["status"] == "approved" and "created" not in r.json()


def test_punto_ajeno_es_403_y_no_llama_a_la_base(monkeypatch, llamadas):
    r = cliente(monkeypatch).post("/orders", json={**CUERPO, "location_id": AJENA}, headers=H)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    assert llamadas == []


@pytest.mark.parametrize("rol", ["administrador", "bodega", "gerencia"])
def test_otros_roles_son_403(monkeypatch, llamadas, rol):
    r = cliente(monkeypatch, rol=rol).post("/orders", json=CUERPO, headers=H)
    assert r.status_code == 403 and llamadas == []


@pytest.mark.parametrize(
    "cambio",
    [
        {"items": []},
        {"items": [{"product_id": PROD, "requested_qty": 0}]},
        {"items": [{"product_id": "no-uuid", "requested_qty": 1}]},
        {"order_type": "otro"},
    ],
)
def test_cuerpo_invalido_es_422(monkeypatch, llamadas, cambio):
    r = cliente(monkeypatch).post("/orders", json={**CUERPO, **cambio}, headers=H)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION"
    assert llamadas == []


@pytest.mark.parametrize("cantidad", ["Infinity", "NaN", "1e999"])
def test_cantidad_no_finita_es_422(monkeypatch, llamadas, cantidad):
    crudo = (
        f'{{"location_id":"{LOC}","cycle_month":"2026-10-01","order_type":"regular",'
        f'"items":[{{"product_id":"{PROD}","requested_qty":{cantidad}}}]}}'
    )
    h = {**H, "Content-Type": "application/json"}
    r = cliente(monkeypatch).post("/orders", content=crudo, headers=h)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION"
    assert llamadas == []


def test_sin_idempotency_key_es_422(monkeypatch, llamadas):
    r = cliente(monkeypatch).post("/orders", json=CUERPO, headers={"Authorization": "Bearer x"})
    assert r.status_code == 422 and llamadas == []


def test_sin_sesion_es_401(monkeypatch, llamadas):
    r = cliente(monkeypatch).post("/orders", json=CUERPO, headers={"Idempotency-Key": "k"})
    assert r.status_code == 401 and llamadas == []


def test_p0404_clave_ajena_es_404(monkeypatch):
    def falla(*_):
        raise desde_sqlstate("P0404", "Pedido no encontrado", None)

    monkeypatch.setattr(orders, "call_fn", falla)
    r = cliente(monkeypatch).post("/orders", json=CUERPO, headers=H)
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_p0422_regular_con_motivo_conserva_el_campo(monkeypatch):
    def falla(*_):
        raise desde_sqlstate("P0422", "Un pedido regular no tiene reason", '{"field":"reason"}')

    monkeypatch.setattr(orders, "call_fn", falla)
    r = cliente(monkeypatch).post("/orders", json={**CUERPO, "reason": "x"}, headers=H)
    assert r.status_code == 422
    assert r.json()["error"] == {
        "code": "VALIDATION",
        "message": "Un pedido regular no tiene reason",
        "details": {"field": "reason"},
    }


# ---- /orders/{id}/decision y /orders/{id}/analyze ----
ORD = "44444444-4444-4444-8444-444444444444"
ADMIN = auth.Me("s-9", "Carla Demo", "c@x", "administrador", [])
AUX = auth.Me("s-1", "Ana Demo", "a@x", "auxiliar", PUNTOS)


def test_decision_devuelve_order_result_exacto(monkeypatch):
    visto = []

    def falso(nombre, *args):
        visto.append((nombre, args))
        return {"id": ORD, "code": "PED-DEMO-001", "status": "approved", "extra": 1}

    monkeypatch.setattr(orders, "call_fn", falso)
    cuerpo = {
        "decision": "approve",
        "reason": "esperar compra",
        "items": [{"product_id": PROD, "approved_qty": 1}],
    }
    r = cliente(monkeypatch, me=ADMIN).post(f"/orders/{ORD}/decision", json=cuerpo, headers=H)
    assert r.status_code == 200 and r.json() == {
        "id": ORD,
        "code": "PED-DEMO-001",
        "status": "approved",
    }
    nombre, args = visto[0]
    assert nombre == "fn_decidir_pedido" and args[0] == "s-9" and str(args[1]) == ORD
    assert args[2] == "approve" and args[3] == [{"product_id": PROD, "approved_qty": 1}]
    assert args[4] == "esperar compra"


def test_decision_sin_items_pasa_null(monkeypatch):
    visto = []
    monkeypatch.setattr(
        orders, "call_fn", lambda *a: visto.append(a) or {"id": 1, "code": "c", "status": "draft"}
    )
    cliente(monkeypatch, me=ADMIN).post(
        f"/orders/{ORD}/decision", json={"decision": "return", "reason": "x"}, headers=H
    )
    assert visto[0][4] is None


@pytest.mark.parametrize("rol", ["auxiliar", "supervisor", "bodega", "gerencia"])
def test_decision_solo_administrador(monkeypatch, llamadas, rol):
    r = cliente(monkeypatch, rol=rol).post(
        f"/orders/{ORD}/decision", json={"decision": "approve"}, headers=H
    )
    assert r.status_code == 403 and llamadas == []


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"decision": "otra"},
        {"decision": "approve", "items": [{"product_id": PROD, "approved_qty": -1}]},
        {"decision": "approve", "items": [{"product_id": "x", "approved_qty": 1}]},
    ],
)
def test_decision_invalida_es_422(monkeypatch, llamadas, cuerpo):
    r = cliente(monkeypatch, me=ADMIN).post(f"/orders/{ORD}/decision", json=cuerpo, headers=H)
    assert r.status_code == 422 and llamadas == []


def test_decision_p0409_es_409(monkeypatch):
    def falla(*_):
        raise desde_sqlstate("P0409", "Pedido fuera de submitted", None)

    monkeypatch.setattr(orders, "call_fn", falla)
    r = cliente(monkeypatch, me=ADMIN).post(
        f"/orders/{ORD}/decision", json={"decision": "cancel", "reason": "x"}, headers=H
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE"


AUTOR = "s-1"
SOBRE = {"provider": "mock", "response": {"answers": {}}}
RESULTADO = {
    "order_id": ORD,
    "duplicates": [],
    "missing_kit": [],
    "incidents": [],
    "proposal": {"decision_log_id": "L-1", "answers": {}},
}


def analizar(monkeypatch, fila, me=AUX, sobre=SOBRE, resultado=RESULTADO, previo=None, real=False):
    visto = {"jev": [], "fn": []}
    monkeypatch.setattr(orders, "modo_real", lambda: real)
    monkeypatch.setattr(orders, "fetch_one", lambda q, _: previo if "decision_logs" in q else fila)
    monkeypatch.setattr(orders, "proponer", lambda e: visto["jev"].append(e) or sobre)
    monkeypatch.setattr(orders, "call_fn", lambda *a: visto["fn"].append(a) or resultado)
    r = cliente(monkeypatch, me=me).post(f"/orders/{ORD}/analyze", headers=H)
    return r, visto


def test_analyze_submitted_llama_a_jev_y_pasa_el_sobre(monkeypatch):
    r, v = analizar(monkeypatch, ("submitted", AUTOR, "PED-DEMO-001", "Q-001", "Falta cloro"))
    assert r.status_code == 200 and r.json() == RESULTADO
    assert v["jev"][0]["order_code"] == "PED-DEMO-001" and v["jev"][0]["point_code"] == "Q-001"
    assert v["fn"] == [("fn_analizar_reglas", "s-1", UUID(ORD), SOBRE)]


def test_analyze_no_submitted_no_llama_a_jev(monkeypatch):
    r, v = analizar(monkeypatch, ("approved", AUTOR, "PED-DEMO-001", "Q-001", None))
    assert r.status_code == 200 and v["jev"] == [] and v["fn"][0][3] is None


def test_analyze_ajeno_es_403_sin_jev_ni_base(monkeypatch):
    r, v = analizar(monkeypatch, ("submitted", "otro", "PED-DEMO-001", "Q-001", ""))
    assert r.status_code == 403 and v == {"jev": [], "fn": []}


def test_analyze_administrador_puede_con_pedido_ajeno(monkeypatch):
    r, v = analizar(monkeypatch, ("submitted", "otro", "PED-DEMO-001", "Q-001", ""), me=ADMIN)
    assert r.status_code == 200 and len(v["jev"]) == 1


def test_analyze_pedido_inexistente_es_404(monkeypatch):
    r, v = analizar(monkeypatch, None)
    assert r.status_code == 404 and v == {"jev": [], "fn": []}


def test_analyze_con_jev_caido_es_502_con_la_propuesta_guardada(monkeypatch):
    caido = {"provider": "typesafe", "response": {"error": "timeout"}}
    r, v = analizar(monkeypatch, ("submitted", AUTOR, "PED-DEMO-001", "Q-001", ""), sobre=caido)
    assert r.status_code == 502 and len(v["fn"]) == 1  # SQL guardó human_review antes del 502
    e = r.json()["error"]
    assert e["code"] == "UPSTREAM_AI" and e["details"] == {"decision_log_id": "L-1"}


FILA_SUBMITTED = ("submitted", AUTOR, "PED-DEMO-001", "Q-001", "Falta cloro")
ESTADO = {"order_code": "PED-DEMO-001"}
PREVIO_MOCK = (
    "mock",
    "jev-1.13.0",
    ESTADO,
    {"model": "jev-1.13.0", "answers": {"a": 1}},
    "urgent",
    "human_review",
)


def test_reintento_reutiliza_la_clasificacion_sin_llamar_a_jev(monkeypatch):
    r, v = analizar(monkeypatch, FILA_SUBMITTED, previo=PREVIO_MOCK)
    assert r.status_code == 200 and v["jev"] == []
    sobre = v["fn"][0][3]
    assert sobre["provider"] == "mock" and sobre["response"]["answers"] == {"a": 1}
    assert (sobre["input_tokens"], sobre["estimated_cost_usd"]) == (0, 0)  # sin llamada nueva


def test_un_fallo_previo_se_vuelve_a_intentar(monkeypatch):
    fallo = ("typesafe", "jev-1.13.0", ESTADO, {"error": "timeout"}, "human_review", "human_review")
    r, v = analizar(monkeypatch, FILA_SUBMITTED, previo=fallo, real=True)
    assert len(v["jev"]) == 1


def test_cambiar_de_simulado_a_real_vuelve_a_llamar_a_jev(monkeypatch):
    r, v = analizar(monkeypatch, FILA_SUBMITTED, previo=PREVIO_MOCK, real=True)
    assert len(v["jev"]) == 1


def test_si_otro_admin_decidio_mientras_tanto_no_es_502(monkeypatch):
    caido = {"provider": "typesafe", "response": {"error": "timeout"}}
    sin_propuesta = {**RESULTADO, "proposal": None}
    r, v = analizar(monkeypatch, FILA_SUBMITTED, sobre=caido, resultado=sin_propuesta)
    assert r.status_code == 200 and r.json()["proposal"] is None
