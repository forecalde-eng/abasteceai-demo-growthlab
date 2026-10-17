from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import auth, envios
from app.errors import desde_sqlstate
from app.main import create_app

U = lambda n: str(UUID(int=n))  # noqa: E731
ORD, SHIP, LOC, PROD, VEH, ITEM = (U(n) for n in (1, 2, 3, 4, 5, 6))
H = {"Authorization": "Bearer x"}
PUNTO = [{"id": LOC, "code": "Q-001", "name": "P", "city": "Quito", "demo_scope": "detailed"}]


@pytest.fixture
def llamadas(monkeypatch):
    registro = []
    monkeypatch.setattr(envios, "call_fn", lambda n, *a: registro.append((n, a)) or {"ok": n})
    return registro


def cliente(monkeypatch, rol, envio_en=LOC):
    me = auth.Me("s-1", "X", "x@x", rol, PUNTO)
    monkeypatch.setattr(auth, "verificar_jwt", lambda _: "u")
    monkeypatch.setattr(auth, "cargar_me", lambda _: me)
    monkeypatch.setattr(
        envios, "fetch_one", lambda *_: None if envio_en is None else (UUID(envio_en),)
    )
    return TestClient(create_app())


# ---- prepare
def test_prepare_pasa_dry_run_y_los_items(monkeypatch, llamadas):
    cuerpo = {"items": [{"product_id": PROD, "prepared_qty": 3}]}
    r = cliente(monkeypatch, "bodega").post(
        f"/orders/{ORD}/prepare?dry_run=true", json=cuerpo, headers=H
    )
    assert r.status_code == 200
    n, a = llamadas[0]
    assert (
        n == "fn_preparar"
        and str(a[1]) == ORD
        and a[2] == [{"product_id": PROD, "prepared_qty": 3}]
    )
    assert a[3] is True


def test_prepare_por_defecto_no_es_dry_run_y_solo_bodega(monkeypatch, llamadas):
    cuerpo = {"items": [{"product_id": PROD, "prepared_qty": 0}]}
    cliente(monkeypatch, "bodega").post(f"/orders/{ORD}/prepare", json=cuerpo, headers=H)
    assert llamadas[0][1][3] is False
    llamadas.clear()
    r = cliente(monkeypatch, "auxiliar").post(f"/orders/{ORD}/prepare", json=cuerpo, headers=H)
    assert r.status_code == 403 and llamadas == []


@pytest.mark.parametrize("items", [[], [{"product_id": PROD, "prepared_qty": -1}]])
def test_prepare_cuerpo_invalido_es_422(monkeypatch, llamadas, items):
    r = cliente(monkeypatch, "bodega").post(
        f"/orders/{ORD}/prepare", json={"items": items}, headers=H
    )
    assert r.status_code == 422 and llamadas == []


# ---- routes/confirm
RUTA = {
    "vehicle_id": VEH,
    "dispatch_date": "2026-10-11",
    "estimated_km": 12.5,
    "estimated_minutes": 90,
    "planning_method": "ortools_vrptw",
    "stops": [
        {
            "location_id": LOC,
            "location_code": "Q-007",
            "sequence": 1,
            "planned_arrival": "2026-10-11T09:00:00-05:00",
            "order_ids": [ORD],
        }
    ],
}


def test_confirm_responde_201_con_el_resultado_de_la_funcion(monkeypatch, llamadas):
    r = cliente(monkeypatch, "logistica").post("/routes/confirm", json=RUTA, headers=H)
    assert r.status_code == 201 and r.json() == {"ok": "fn_confirmar_ruta"}
    n, a = llamadas[0]
    assert str(a[1]) == VEH and str(a[2]) == "2026-10-11" and a[5] == 90 and a[6] == "ortools_vrptw"
    assert a[3] == [
        {
            "location_id": LOC,
            "location_code": "Q-007",
            "sequence": 1,
            "planned_arrival": "2026-10-11T09:00:00-05:00",
            "order_ids": [ORD],
        }
    ]


def test_confirm_rechaza_hora_sin_zona_y_otros_roles(monkeypatch, llamadas):
    c = cliente(monkeypatch, "logistica")
    naive = {**RUTA, "stops": [{**RUTA["stops"][0], "planned_arrival": "2026-10-11T09:00:00"}]}
    assert c.post("/routes/confirm", json=naive, headers=H).status_code == 422
    assert (
        cliente(monkeypatch, "bodega").post("/routes/confirm", json=RUTA, headers=H).status_code
        == 403
    )
    assert llamadas == []


def test_confirm_p0409_es_409(monkeypatch):
    def falla(*_):
        raise desde_sqlstate("P0409", "Pedido ya tiene envío", None)

    monkeypatch.setattr(envios, "call_fn", falla)
    r = cliente(monkeypatch, "logistica").post("/routes/confirm", json=RUTA, headers=H)
    assert r.status_code == 409


# ---- courier
def test_courier_201(monkeypatch, llamadas):
    cuerpo = {"order_id": ORD, "carrier_name": "Servientrega", "guide_code": "G-1",
              "promised_delivery_at": "2026-10-10T20:00:00-05:00"}  # fmt: skip
    r = cliente(monkeypatch, "logistica").post("/shipments/courier", json=cuerpo, headers=H)
    assert r.status_code == 201 and llamadas[0][0] == "fn_envio_courier"
    assert llamadas[0][1][2:4] == ("Servientrega", "G-1")


def test_courier_sin_guia_es_422(monkeypatch, llamadas):
    cuerpo = {"order_id": ORD, "carrier_name": "S", "guide_code": ""}
    assert (
        cliente(monkeypatch, "logistica")
        .post("/shipments/courier", json=cuerpo, headers=H)
        .status_code
        == 422
    )


# ---- dispatch / delivered / receipt
@pytest.mark.parametrize("rol", ["bodega", "logistica"])
def test_dispatch_bodega_o_logistica(monkeypatch, llamadas, rol):
    r = cliente(monkeypatch, rol).post(f"/shipments/{SHIP}/dispatch", headers=H)
    assert r.status_code == 200 and llamadas[0][0] == "fn_despachar"


def test_dispatch_otro_rol_es_403(monkeypatch, llamadas):
    assert (
        cliente(monkeypatch, "supervisor")
        .post(f"/shipments/{SHIP}/dispatch", headers=H)
        .status_code
        == 403
    )


def test_delivered_exige_punto_propio_y_existencia(monkeypatch, llamadas):
    ok = cliente(monkeypatch, "supervisor").post(f"/shipments/{SHIP}/delivered", headers=H)
    assert ok.status_code == 200 and llamadas[0][0] == "fn_marcar_entregado"
    llamadas.clear()
    ajeno = cliente(monkeypatch, "supervisor", envio_en=U(99)).post(
        f"/shipments/{SHIP}/delivered", headers=H
    )
    assert ajeno.status_code == 403 and llamadas == []
    nada = cliente(monkeypatch, "supervisor", envio_en=None).post(
        f"/shipments/{SHIP}/delivered", headers=H
    )
    assert nada.status_code == 404 and llamadas == []


RECIBO = {
    "notes": "faltan 2",
    "items": [{"shipment_item_id": ITEM, "counted_qty": 8, "accepted_qty": 8}],
}


def test_receipt_201_con_punto_propio(monkeypatch, llamadas):
    r = cliente(monkeypatch, "auxiliar").post(f"/shipments/{SHIP}/receipt", json=RECIBO, headers=H)
    assert r.status_code == 201
    n, a = llamadas[0]
    assert n == "fn_recibir" and a[2] == [
        {"shipment_item_id": ITEM, "counted_qty": 8, "accepted_qty": 8}
    ]
    assert a[3] == "faltan 2"


def test_receipt_punto_ajeno_u_otro_rol_es_403_y_cuerpo_vacio_422(monkeypatch, llamadas):
    ajeno = cliente(monkeypatch, "auxiliar", envio_en=U(99))
    assert ajeno.post(f"/shipments/{SHIP}/receipt", json=RECIBO, headers=H).status_code == 403
    assert (
        cliente(monkeypatch, "supervisor")
        .post(f"/shipments/{SHIP}/receipt", json=RECIBO, headers=H)
        .status_code
        == 403
    )
    assert (
        cliente(monkeypatch, "auxiliar")
        .post(f"/shipments/{SHIP}/receipt", json={"items": []}, headers=H)
        .status_code
        == 422
    )
    assert llamadas == []
