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
    monkeypatch.setattr(admin, "verificar_destino", lambda _: None)
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
    destino = []
    monkeypatch.setattr(admin, "verificar_destino", destino.append)
    monkeypatch.setattr(admin, "ejecutar_reset", lambda *_: OK)
    assert c.post("/admin/reset-demo", headers=H).status_code == 200
    assert destino == []  # en recuperación la base puede estar vacía: no se lee el destino


def test_destino_rechazado_no_deja_marca_y_se_vuelve_a_verificar(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    borrados = []
    monkeypatch.setattr(admin, "ejecutar_reset", lambda *_: borrados.append(1) or OK)

    def ajena(_):
        raise ApiError(403, "FORBIDDEN", "La base destino no es la DEMO FICTICIA")

    monkeypatch.setattr(admin, "verificar_destino", ajena)
    for _ in range(2):
        assert c.post("/admin/reset-demo", headers=H).status_code == 403
    assert borrados == [] and not admin.MARCA.exists()


def test_el_reset_espera_las_escrituras_admitidas(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    monkeypatch.setattr(admin, "ESPERA_ESCRITURAS_S", 0.1)
    assert admin.admitir_escritura()  # una escritura ya admitida y aún sin terminar
    try:
        r = c.post("/admin/reset-demo", headers=H)
    finally:
        admin.terminar_escritura()
    assert r.status_code == 409 and not admin.MARCA.exists()
    assert c.post("/admin/reset-demo", headers=H).status_code == 200


def test_los_archivos_del_reset_existen():
    assert all((admin.DB / p).is_file() for p in [*admin.PASOS, "conteos_datos.json"])


def test_si_cambia_la_base_la_recuperacion_vuelve_a_verificar_el_destino(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    monkeypatch.setattr(admin, "ejecutar_reset", falla)
    assert c.post("/admin/reset-demo", headers=H).status_code == 409
    monkeypatch.setenv("DATABASE_URL", "postgresql://u@otra-base:5432/postgres")
    get_settings.cache_clear()
    destino = []
    monkeypatch.setattr(admin, "verificar_destino", destino.append)
    monkeypatch.setattr(admin, "ejecutar_reset", lambda *_: OK)
    assert c.post("/admin/reset-demo", headers=H).status_code == 200
    assert destino == ["postgresql://u@otra-base:5432/postgres"]


def test_tras_cambiar_de_base_el_atajo_de_recuperacion_no_aplica(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    monkeypatch.setattr(admin, "ejecutar_reset", falla)
    assert c.post("/admin/reset-demo", headers=H).status_code == 409
    monkeypatch.setenv("DATABASE_URL", "postgresql://u@otra-base:5432/postgres")
    get_settings.cache_clear()
    monkeypatch.setattr(auth, "cargar_me", lambda _: None)  # sin perfil en la base nueva
    assert c.post("/admin/reset-demo", headers=H).status_code == 403


def test_rotar_la_clave_no_cambia_la_identidad_de_la_base():
    a = admin._identidad("postgresql://u:clave1@h:5432/postgres?sslmode=require")
    assert a == admin._identidad("postgresql://u:clave2@h:5432/postgres?sslmode=require")
    assert a != admin._identidad("postgresql://u:clave1@otro:5432/postgres")


def test_reset_concurrente_da_409_antes_de_mirar_el_perfil(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    monkeypatch.setattr(auth, "cargar_me", lambda _: None)  # staff vacío durante el borrado
    admin._en_curso.acquire()
    try:
        r = c.post("/admin/reset-demo", headers=H)
    finally:
        admin._en_curso.release()
    assert r.status_code == 409


def test_el_409_de_mantenimiento_lleva_cors(monkeypatch):
    c = cliente(monkeypatch, "administrador")
    origen = get_settings().cors_list[0]
    admin._en_curso.acquire()
    try:
        r = c.post("/orders", json={}, headers={**H, "Origin": origen})
    finally:
        admin._en_curso.release()
    assert r.status_code == 409 and r.headers.get("access-control-allow-origin") == origen
