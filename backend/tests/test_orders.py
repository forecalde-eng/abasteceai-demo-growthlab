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


def cliente(monkeypatch, rol="auxiliar", puntos=PUNTOS):
    me = auth.Me("s-1", "Ana Demo", "a@x", rol, puntos)
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
