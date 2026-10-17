import pytest
from fastapi.testclient import TestClient

from app import admin, auth
from app.config import get_settings
from app.errors import ApiError
from app.main import create_app

H = {"Authorization": "Bearer x"}
OK = "2026-10-10T22:00:00+00:00"


@pytest.fixture(autouse=True)
def entorno(monkeypatch, tmp_path):
    monkeypatch.setenv("RESET_DEMO_ENABLED", "true")
    monkeypatch.setattr(admin, "MARCA", tmp_path / ".reset_en_curso")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def cliente(monkeypatch, rol):
    monkeypatch.setattr(auth, "verificar_jwt", lambda _: "u")
    monkeypatch.setattr(auth, "cargar_me", lambda _: auth.Me("s-1", "X", "x@x", rol, []))
    monkeypatch.setattr(admin, "ejecutar_reset", lambda *_: OK)
    return TestClient(create_app())


def falla(*_):
    raise ApiError(409, "INVALID_STATE", "Falló 03_datos_ficticios.sql")


def test_solo_administrador(monkeypatch):
    assert cliente(monkeypatch, "bodega").post("/admin/reset-demo", headers=H).status_code == 403


def test_deshabilitado_por_defecto(monkeypatch):
    monkeypatch.setenv("RESET_DEMO_ENABLED", "false")
    get_settings.cache_clear()
    r = cliente(monkeypatch, "administrador").post("/admin/reset-demo", headers=H)
    assert r.status_code == 403


def test_reset_ok(monkeypatch):
    r = cliente(monkeypatch, "administrador").post("/admin/reset-demo", headers=H)
    assert r.status_code == 200 and r.json() == {"ok": True, "reference_at": OK}
    assert not admin.MARCA.exists()


def test_dos_resets_a_la_vez_dan_409(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    admin._en_curso.acquire()
    try:
        r = c.post("/admin/reset-demo", headers=H)
    finally:
        admin._en_curso.release()
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"


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


def test_un_fallo_deja_las_escrituras_cerradas_aunque_reinicie_el_proceso(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    monkeypatch.setattr(admin, "ejecutar_reset", falla)
    assert c.post("/admin/reset-demo", headers=H).status_code == 409
    # Un proceso nuevo (otra app) sigue viendo la marca en disco.
    otra = TestClient(create_app())
    assert otra.post("/orders", json={}, headers=H).json()["error"]["code"] == "CONFLICT"
    monkeypatch.setattr(admin, "ejecutar_reset", lambda *_: OK)
    assert otra.post("/admin/reset-demo", headers=H).status_code == 200
    assert otra.post("/orders", json={}, headers=H).status_code != 409


def test_tras_un_fallo_el_mismo_admin_puede_reintentar_sin_perfil(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    monkeypatch.setattr(admin, "ejecutar_reset", falla)
    assert c.post("/admin/reset-demo", headers=H).status_code == 409
    monkeypatch.setattr(auth, "cargar_me", lambda _: None)  # staff vacío tras el fallo
    monkeypatch.setattr(auth, "verificar_jwt", lambda _: "otro")  # otro token: necesita perfil
    assert c.post("/admin/reset-demo", headers=H).status_code == 403
    monkeypatch.setattr(auth, "verificar_jwt", lambda _: "u")
    llamadas = []
    monkeypatch.setattr(admin, "ejecutar_reset", lambda _, rec: llamadas.append(rec) or OK)
    assert c.post("/admin/reset-demo", headers=H).status_code == 200
    assert llamadas == [True]  # reintento en modo recuperación


def test_los_archivos_del_reset_existen():
    assert all((admin.DB / p).is_file() for p in [*admin.PASOS, "conteos_datos.json"])
