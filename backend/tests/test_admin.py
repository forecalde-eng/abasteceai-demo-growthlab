from fastapi.testclient import TestClient

from app import admin, auth
from app.main import create_app

H = {"Authorization": "Bearer x"}


def cliente(monkeypatch, rol):
    monkeypatch.setattr(auth, "verificar_jwt", lambda _: "u")
    monkeypatch.setattr(auth, "cargar_me", lambda _: auth.Me("s-1", "X", "x@x", rol, []))
    monkeypatch.setattr(admin, "ejecutar_reset", lambda _: "2026-10-10T22:00:00+00:00")
    return TestClient(create_app())


def test_solo_administrador(monkeypatch):
    assert cliente(monkeypatch, "bodega").post("/admin/reset-demo", headers=H).status_code == 403


def test_reset_ok(monkeypatch):
    r = cliente(monkeypatch, "administrador").post("/admin/reset-demo", headers=H)
    assert r.status_code == 200
    assert r.json() == {"ok": True, "reference_at": "2026-10-10T22:00:00+00:00"}


def test_dos_resets_a_la_vez_dan_409(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    admin._en_curso.acquire()
    try:
        r = c.post("/admin/reset-demo", headers=H)
    finally:
        admin._en_curso.release()
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"


def test_los_archivos_del_reset_existen():
    assert all((admin.DB / p).is_file() for p in [*admin.PASOS, "conteos_datos.json"])


def test_durante_el_reset_se_rechazan_las_escrituras(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    admin._en_curso.acquire()
    try:
        r = c.post("/orders", json={}, headers=H)
        salud = c.get("/health")
    finally:
        admin._en_curso.release()
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    assert salud.status_code == 200
