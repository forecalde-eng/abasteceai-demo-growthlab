from datetime import time
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import auth, routes
from app.main import create_app

O1, O2, O3 = (str(UUID(int=n)) for n in (1, 2, 3))
L6, L7 = UUID(int=6), UUID(int=7)
H = {"Authorization": "Bearer x"}
CUERPO = {"dispatch_date": "2026-10-11", "order_ids": [O1, O2]}


def fila(oid, code, loc, lcode, lat, lon, ini, fin, kg, estado="ready", ciudad="Quito"):
    return (UUID(oid), code, estado, loc, lcode, ciudad, Decimal(lat), Decimal(lon),
            ini, fin, 10, Decimal(kg), Decimal("0.5"))  # fmt: skip


FILAS = [
    fila(O1, "PED-DEMO-001", L6, "Q-006", "-0.1767", "-78.4838", time(10), time(17), "50"),
    fila(O2, "PED-DEMO-002", L7, "Q-007", "-0.1767", "-78.4758", time(8), time(16), "50"),
]
VEHICULOS = [
    (UUID(int=11), "VEH-DEMO-1", Decimal("600"), Decimal("5.5"), time(7, 30), time(17, 30)),
    (UUID(int=12), "VEH-DEMO-2", Decimal("350"), Decimal("3.2"), time(7, 30), time(17, 30)),
]


def cliente(monkeypatch, filas=FILAS, rol="logistica", vehiculos=VEHICULOS):
    me = auth.Me("s-5", "Elena Demo", "e@x", rol, [])
    monkeypatch.setattr(auth, "verificar_jwt", lambda _: "u")
    monkeypatch.setattr(auth, "cargar_me", lambda _: me)
    monkeypatch.setattr(
        routes, "fetch_all", lambda q, _: filas if "FROM abastece.orders" in q else vehiculos
    )
    monkeypatch.setattr(routes, "fetch_one", lambda *_: (Decimal("-0.221"), Decimal("-78.5019")))
    return TestClient(create_app())


def test_plan_valido_con_la_forma_del_contrato(monkeypatch):
    r = cliente(monkeypatch).post("/routes/plan", json=CUERPO, headers=H)
    assert r.status_code == 200
    j = r.json()
    assert (j["matrix_source"], j["planning_method"]) == ("synthetic", "ortools_vrptw")
    assert j["unassigned"] == [] and len(j["routes"]) == 1
    ruta = j["routes"][0]
    assert ruta["vehicle_code"] in {"VEH-DEMO-1", "VEH-DEMO-2"} and ruta["estimated_km"] > 0
    assert [s["sequence"] for s in ruta["stops"]] == [1, 2]
    assert {s["location_code"] for s in ruta["stops"]} == {"Q-006", "Q-007"}
    assert all(s["planned_arrival"].startswith("2026-10-11T") for s in ruta["stops"])
    assert all(s["planned_arrival"].endswith("-05:00") for s in ruta["stops"])


def test_no_escribe_nada():
    # El módulo solo importa lecturas (fetch_*): no puede llamar a funciones fn_* de escritura.
    assert not hasattr(routes, "call_fn")


def test_dos_pedidos_del_mismo_punto_son_una_parada(monkeypatch):
    mismas = [
        fila(O1, "PED-DEMO-001", L6, "Q-006", "-0.1767", "-78.4838", time(10), time(17), "50"),
        fila(O2, "PED-DEMO-002", L6, "Q-006", "-0.1767", "-78.4838", time(10), time(17), "70"),
    ]
    r = cliente(monkeypatch, mismas).post("/routes/plan", json=CUERPO, headers=H)
    paradas = r.json()["routes"][0]["stops"]
    assert len(paradas) == 1 and set(paradas[0]["order_ids"]) == {O1, O2}


def test_lo_que_no_cabe_sale_en_unassigned_por_pedido(monkeypatch):
    pesado = fila(
        O3, "PED-DEMO-003", L6, "Q-006", "-0.1767", "-78.4838", time(10), time(17), "5000"
    )
    r = cliente(monkeypatch, [FILAS[1], pesado]).post(
        "/routes/plan", json={**CUERPO, "order_ids": [O2, O3]}, headers=H
    )
    assert r.json()["unassigned"] == [
        {"order_id": O3, "order_code": "PED-DEMO-003", "reason": "capacity"}
    ]


@pytest.mark.parametrize("rol", ["auxiliar", "supervisor", "administrador", "bodega", "gerencia"])
def test_solo_logistica(monkeypatch, rol):
    assert (
        cliente(monkeypatch, rol=rol).post("/routes/plan", json=CUERPO, headers=H).status_code
        == 403
    )


def test_pedido_no_listo_es_422_con_su_id(monkeypatch):
    sin_listo = [
        FILAS[0],
        fila(
            O2,
            "PED-DEMO-002",
            L7,
            "Q-007",
            "-0.17",
            "-78.47",
            time(8),
            time(16),
            "5",
            estado="approved",
        ),
    ]
    r = cliente(monkeypatch, sin_listo).post("/routes/plan", json=CUERPO, headers=H)
    e = r.json()["error"]
    assert r.status_code == 422 and e["details"] == {"field": "order_ids", "order_id": O2}


def test_pedido_de_otra_ciudad_o_inexistente_es_422(monkeypatch):
    guayaquil = [
        FILAS[0],
        fila(
            O2,
            "PED-DEMO-002",
            L7,
            "G-001",
            "-2.17",
            "-79.9",
            time(8),
            time(16),
            "5",
            ciudad="Guayaquil",
        ),
    ]
    assert (
        cliente(monkeypatch, guayaquil).post("/routes/plan", json=CUERPO, headers=H).status_code
        == 422
    )
    assert (
        cliente(monkeypatch, [FILAS[0]]).post("/routes/plan", json=CUERPO, headers=H).status_code
        == 422
    )


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"dispatch_date": "2026-10-11", "order_ids": []},
        {"order_ids": [O1]},
        {"dispatch_date": "no", "order_ids": [O1]},
    ],
)
def test_cuerpo_invalido_es_422(monkeypatch, cuerpo):
    assert cliente(monkeypatch).post("/routes/plan", json=cuerpo, headers=H).status_code == 422
