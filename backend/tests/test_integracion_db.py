"""Pruebas contra un Postgres REAL con las funciones SQL de `db/` (sin simulaciones).

Se saltan si no hay `TEST_DATABASE_URL`. Úsalas SOLO con una base desechable: crean pedidos y
vinculan cuentas, y la última reinicia la demo. Preparar la base (una vez): roles y `auth`
ficticios + `db/01,02,07,03,08,09,10,11`; ver `backend/README.md`. Ejemplo:

    export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5544/abastece_test
    uv run pytest tests/test_integracion_db.py
"""

import os
import uuid
from datetime import UTC, datetime

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import auth, db
from app.config import get_settings
from app.main import create_app

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="sin TEST_DATABASE_URL (base desechable)")

ROLES = ["auxiliar", "supervisor", "administrador", "bodega", "logistica", "compras", "gerencia"]


@pytest.fixture(scope="module")
def api():
    mp = pytest.MonkeyPatch()
    mp.setenv("DATABASE_URL", URL)
    mp.setenv("AI_CALLS_ENABLED", "false")
    get_settings.cache_clear()
    db.cerrar_pool()
    with psycopg.connect(URL, autocommit=True) as c:
        c.execute(
            "INSERT INTO auth.users(id, email) SELECT gen_random_uuid(), demo_email"
            " FROM abastece.staff_members s WHERE NOT EXISTS"
            " (SELECT 1 FROM auth.users u WHERE u.email = s.demo_email)"
        )
        c.execute(
            "UPDATE abastece.staff_members s SET auth_user_id = u.id"
            " FROM auth.users u WHERE u.email = s.demo_email"
        )
        sub = {
            r: str(i) for r, i in c.execute("SELECT role, auth_user_id FROM abastece.staff_members")
        }
        loc = str(c.execute("SELECT id FROM abastece.locations WHERE code='Q-001'").fetchone()[0])
        ids = c.execute(
            "SELECT id FROM abastece.products WHERE sku IN ('INS-001','INS-002') ORDER BY sku"
        )
        prods = [str(r[0]) for r in ids]
        ords = {c_: str(i) for c_, i in c.execute("SELECT code, id FROM abastece.orders")}
    mp.setattr(auth, "verificar_jwt", lambda token: token)  # el "token" es el auth_user_id
    cliente = TestClient(create_app())
    yield SimpleNs(cliente=cliente, sub=sub, loc=loc, prods=prods, ords=ords)
    db.cerrar_pool()
    get_settings.cache_clear()
    mp.undo()


class SimpleNs:
    def __init__(self, **kw):
        self.__dict__.update(kw)

    def h(self, rol, **extra):
        return {"Authorization": f"Bearer {self.sub[rol]}", **extra}


def cuerpo(api, **cambios):
    base = {
        "location_id": api.loc,
        "cycle_month": "2026-11-01",
        "order_type": "regular",
        "items": [
            {"product_id": api.prods[0], "requested_qty": 2},
            {"product_id": api.prods[1], "requested_qty": 3},
        ],
    }
    return {**base, **cambios}


def test_me_de_cada_rol_con_sus_puntos(api):
    esperado = {"auxiliar": 3, "supervisor": 24, "administrador": 703, "bodega": 703}
    for rol, n in esperado.items():
        r = api.cliente.get("/me", headers=api.h(rol))
        assert r.status_code == 200, r.text
        assert r.json()["role"] == rol and len(r.json()["points"]) == n
    codigos = {
        p["code"] for p in api.cliente.get("/me", headers=api.h("auxiliar")).json()["points"]
    }
    assert codigos == {"Q-001", "Q-005", "Q-008"}


def test_ciclo_crear_analizar_decidir(api):
    c, clave = api.cliente, f"it-{uuid.uuid4()}"
    # crear: 201, y la misma clave → 200 con el mismo pedido
    r1 = c.post(
        "/orders", json=cuerpo(api), headers=api.h("auxiliar", **{"Idempotency-Key": clave})
    )
    assert r1.status_code == 201, r1.text
    assert set(r1.json()) == {"id", "code", "status"} and r1.json()["status"] == "submitted"
    r2 = c.post(
        "/orders", json=cuerpo(api), headers=api.h("auxiliar", **{"Idempotency-Key": clave})
    )
    assert r2.status_code == 200 and r2.json() == r1.json()
    # clave de otro actor → 404 (no revela el pedido)
    r3 = c.post(
        "/orders", json=cuerpo(api), headers=api.h("supervisor", **{"Idempotency-Key": clave})
    )
    assert r3.status_code == 404 and r3.json()["error"]["code"] == "NOT_FOUND"
    oid = r1.json()["id"]

    # analizar como autor: Jev simulado, omisión de kit detectada, incidencia sin duplicar
    a1 = c.post(f"/orders/{oid}/analyze", headers=api.h("auxiliar"))
    assert a1.status_code == 200, a1.text
    j = a1.json()
    assert j["proposal"]["source"] == "SIMULADO" and j["proposal"]["status"] == "human_review"
    assert j["missing_kit"] and any(i["kind"] == "missing_from_kit" for i in j["incidents"])
    a2 = c.post(f"/orders/{oid}/analyze", headers=api.h("auxiliar"))
    assert a2.status_code == 200
    assert {i["id"] for i in a2.json()["incidents"]} == {i["id"] for i in j["incidents"]}
    assert a2.json()["proposal"]["answers"] == j["proposal"]["answers"]  # reutiliza, no recalcula

    # decidir: el auxiliar no puede; el administrador sí; repetir → 409
    d = {"decision": "approve", "reason": "ok"}
    assert c.post(f"/orders/{oid}/decision", json=d, headers=api.h("auxiliar")).status_code == 403
    ok = c.post(f"/orders/{oid}/decision", json=d, headers=api.h("administrador"))
    assert ok.status_code == 200 and ok.json()["status"] == "approved"
    otra = c.post(f"/orders/{oid}/decision", json=d, headers=api.h("administrador"))
    assert otra.status_code == 409 and otra.json()["error"]["code"] == "INVALID_STATE"


def test_errores_p0422_con_su_campo(api):
    h = api.h("auxiliar", **{"Idempotency-Key": f"it-{uuid.uuid4()}"})
    r = api.cliente.post("/orders", json=cuerpo(api, reason="no va aquí"), headers=h)
    assert r.status_code == 422
    assert r.json()["error"]["details"]["field"] == "reason"
    h = api.h("auxiliar", **{"Idempotency-Key": f"it-{uuid.uuid4()}"})
    malo = cuerpo(api, items=[{"product_id": str(uuid.uuid4()), "requested_qty": 1}])
    r = api.cliente.post("/orders", json=malo, headers=h)
    assert r.status_code == 422 and r.json()["error"]["details"]["index"] == 0


def test_duplicado_de_la_demo_001_y_025(api):
    r = api.cliente.post(
        f"/orders/{api.ords['PED-DEMO-001']}/analyze", headers=api.h("administrador")
    )
    assert r.status_code == 200, r.text
    assert "PED-DEMO-025" in [d["order_code"] for d in r.json()["duplicates"]]


def test_analizar_pedido_ajeno_es_403(api):
    r = api.cliente.post(f"/orders/{api.ords['PED-DEMO-001']}/analyze", headers=api.h("auxiliar"))
    assert r.status_code == 403


def test_plan_de_rutas_con_un_pedido_listo(api):
    cuerpo_ = {"dispatch_date": "2026-10-11", "order_ids": [api.ords["PED-DEMO-007"]]}
    r = api.cliente.post("/routes/plan", json=cuerpo_, headers=api.h("logistica"))
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["unassigned"] == [] and j["routes"][0]["stops"][0]["location_code"] == "Q-007"
    noready = {"dispatch_date": "2026-10-11", "order_ids": [api.ords["PED-DEMO-002"]]}
    assert (
        api.cliente.post("/routes/plan", json=noready, headers=api.h("logistica")).status_code
        == 422
    )


def test_plan_no_propone_vehiculo_ya_ocupado_ese_dia(api):
    # RUTA-DEMO-1 (dispatched) ocupa VEH-DEMO-1 el 2026-10-10, fecha del reloj de demo.
    cuerpo_ = {"dispatch_date": "2026-10-10", "order_ids": [api.ords["PED-DEMO-007"]]}
    r = api.cliente.post("/routes/plan", json=cuerpo_, headers=api.h("logistica"))
    assert r.status_code == 200, r.text
    rutas = r.json()["routes"]
    assert rutas and "VEH-DEMO-1" not in {x["vehicle_code"] for x in rutas}


def test_planificar_y_confirmar_la_ruta_crea_el_envio_con_guia_y_qr(api):
    """Lo que hará la pantalla de Bruno: confirma tal cual la propuesta de /routes/plan."""
    oid = api.ords["PED-DEMO-007"]
    _limpiar_envios(oid)  # la base se prepara una vez: sin esto la 2.ª corrida daría 409
    plan = api.cliente.post(
        "/routes/plan",
        json={"dispatch_date": "2026-10-11", "order_ids": [oid]},
        headers=api.h("logistica"),
    ).json()
    ruta = plan["routes"][0]
    confirmar = {
        "vehicle_id": ruta["vehicle_id"],
        "dispatch_date": "2026-10-11",
        "stops": ruta["stops"],
        "estimated_km": ruta["estimated_km"],
        "estimated_minutes": ruta["estimated_minutes"],
        "planning_method": plan["planning_method"],
    }
    r = api.cliente.post("/routes/confirm", json=confirmar, headers=api.h("logistica"))
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["status"] == "approved" and j["code"].startswith("RUTA-DEMO-")
    envio = j["shipments"][0]
    assert envio["status"] == "created" and envio["order_id"] == oid
    assert envio["guide_code"].startswith("GUIA-DEMO-")
    # el mismo pedido ya tiene envío → 409; otro rol → 403
    otra = api.cliente.post("/routes/confirm", json=confirmar, headers=api.h("logistica"))
    assert otra.status_code == 409 and otra.json()["error"]["code"] == "INVALID_STATE"
    assert (
        api.cliente.post("/routes/confirm", json=confirmar, headers=api.h("bodega")).status_code
        == 403
    )


def _limpiar_envios(order_id):
    """Deja el pedido sin envío (y sin sus rutas huérfanas) para que la prueba sea repetible."""
    with psycopg.connect(URL, autocommit=True) as c:
        c.execute("DELETE FROM abastece.shipment_items WHERE order_id = %s", [order_id])
        c.execute("DELETE FROM abastece.shipments WHERE order_id = %s", [order_id])
        c.execute(
            "DELETE FROM abastece.route_stops WHERE route_id NOT IN"
            " (SELECT route_id FROM abastece.shipments WHERE route_id IS NOT NULL)"
        )
        c.execute(
            "DELETE FROM abastece.route_plans WHERE id NOT IN"
            " (SELECT route_id FROM abastece.shipments WHERE route_id IS NOT NULL)"
        )


def preguntar(api, rol, q):
    return api.cliente.post("/assistant", json={"question": q}, headers=api.h(rol))


def test_asistente_cita_segun_el_rol_y_deja_log(api):
    r = preguntar(api, "auxiliar", "¿Cuál es la regla de recepción?")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["source"] == "SIMULADO"
    assert ("Recepción con diferencias DEMO", "DEMO-1.1") in [
        (c["title"], c["version"]) for c in j["citations"]
    ]
    with psycopg.connect(URL) as c:
        fila = c.execute(
            "SELECT task, provider, input_tokens FROM abastece.decision_logs WHERE id = %s",
            [j["decision_log_id"]],
        ).fetchone()
    assert fila == ("assistant", "mock", 0)


def test_asistente_no_filtra_documentos_de_otro_rol(api):
    q = "costos y compras"
    aux = preguntar(api, "auxiliar", q).json()
    assert "Costos y compras DEMO" not in [c["title"] for c in aux["citations"]]
    comp = preguntar(api, "compras", q).json()
    assert "Costos y compras DEMO" in [c["title"] for c in comp["citations"]]


def test_asistente_sin_fuente(api):
    j = preguntar(api, "auxiliar", "zzzqqq xylofono").json()
    assert j["answer"] == "No tengo una fuente para eso." and j["citations"] == []


def test_asistente_respeta_la_negacion(api):
    q = "recepción diferencias"
    assert preguntar(api, "auxiliar", q).json()["citations"]
    excluido = preguntar(api, "auxiliar", q + " -recepción -diferencias -conteo").json()
    assert excluido["citations"] == []


def test_reset_demo_vuelve_a_la_semilla(api, monkeypatch, tmp_path):
    """Último de la suite: borra lo que crearon las pruebas anteriores y recarga la semilla."""
    from app import admin

    monkeypatch.setenv("RESET_DEMO_ENABLED", "true")
    monkeypatch.setattr(admin, "MARCA", tmp_path / ".reset_en_curso")
    get_settings.cache_clear()
    oid = api.ords["PED-DEMO-001"]
    d = {"decision": "approve", "reason": "ensayo"}
    api.cliente.post(f"/orders/{oid}/decision", json=d, headers=api.h("administrador"))
    assert api.cliente.post("/admin/reset-demo", headers=api.h("bodega")).status_code == 403
    r = api.cliente.post("/admin/reset-demo", headers=api.h("administrador"))
    assert r.status_code == 200, r.text
    ref = datetime.fromisoformat(r.json()["reference_at"])
    assert r.json()["ok"] is True and ref == datetime(2026, 10, 10, 22, tzinfo=UTC)
    with psycopg.connect(URL) as c:
        assert c.execute(
            "SELECT status FROM abastece.orders WHERE code = 'PED-DEMO-001'"
        ).fetchone() == ("submitted",)
