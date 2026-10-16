import time
from types import SimpleNamespace
from typing import Annotated

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends
from fastapi.testclient import TestClient

from app import auth
from app.errors import ApiError
from app.main import create_app

CLAVE = ec.generate_private_key(ec.SECP256R1())
SECRETO = "s" * 32


ISS = "https://x.supabase.co/auth/v1"


def token(sub="u-1", alg="ES256", aud="authenticated", exp=3600, clave=None, iss=ISS):
    claims = {"sub": sub, "aud": aud, "iss": iss, "exp": int(time.time()) + exp}
    return jwt.encode(claims, clave or (CLAVE if alg == "ES256" else SECRETO), algorithm=alg)


@pytest.fixture(autouse=True)
def config(monkeypatch):
    cfg = SimpleNamespace(supabase_url="https://x.supabase.co", supabase_jwt_secret=SECRETO)
    monkeypatch.setattr(auth, "get_settings", lambda: cfg)
    jwks = SimpleNamespace(
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=CLAVE.public_key())
    )
    monkeypatch.setattr(auth, "_jwks", lambda: jwks)


def test_jwt_valido_asimetrico_y_legacy():
    assert auth.verificar_jwt(token()) == "u-1"
    assert auth.verificar_jwt(token(alg="HS256")) == "u-1"


@pytest.mark.parametrize(
    "malo",
    [
        token(exp=-10),
        token(aud="otra"),
        token(iss="https://otro.supabase.co/auth/v1"),
        token(alg="HS256", iss="https://otro.supabase.co/auth/v1"),
        token(clave=ec.generate_private_key(ec.SECP256R1())),
        "no-es-un-jwt",
    ],
)
def test_jwt_invalido_es_401(malo):
    with pytest.raises(ApiError) as e:
        auth.verificar_jwt(malo)
    assert (e.value.status, e.value.code) == (401, "UNAUTHORIZED")


def test_ensure_point():
    me = auth.Me("s-1", "Ana", "a@x", "auxiliar", [{"id": "p-1"}])
    auth.ensure_point(me, "p-1")
    with pytest.raises(ApiError) as e:
        auth.ensure_point(me, "p-2")
    assert (e.value.status, e.value.code) == (403, "FORBIDDEN")


def test_algoritmo_none_rechazado():
    sin_firma = jwt.encode({"sub": "u-1", "aud": "authenticated"}, None, algorithm="none")
    with pytest.raises(ApiError):
        auth.verificar_jwt(sin_firma)


class FakeConn:
    def __init__(self, staff, puntos):
        self.staff, self.puntos, self.consultas = staff, puntos, []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, consulta, params):
        self.consultas.append((consulta, params))
        datos = self.staff if "staff_members" in consulta else self.puntos
        return SimpleNamespace(fetchone=lambda: datos, fetchall=lambda: datos)


def pool(conn):
    return SimpleNamespace(connection=lambda: conn)


PUNTO = [("p-1", "Q-001", "Punto 1", "Quito", "detailed")]


def test_cargar_me_auxiliar_solo_sus_puntos(monkeypatch):
    conn = FakeConn(("s-1", "Ana Demo", "auxiliar@abasteceai.example", "auxiliar"), PUNTO)
    monkeypatch.setattr(auth, "get_pool", lambda: pool(conn))
    me = auth.cargar_me("u-1")
    assert me.role == "auxiliar" and me.points[0]["code"] == "Q-001"
    consulta, params = conn.consultas[1]
    assert "point_assignments" in consulta and params == ["s-1"]


def test_cargar_me_administrador_ve_todos(monkeypatch):
    conn = FakeConn(
        ("s-3", "Carla Demo", "administrador@abasteceai.example", "administrador"), PUNTO
    )
    monkeypatch.setattr(auth, "get_pool", lambda: pool(conn))
    auth.cargar_me("u-3")
    consulta, params = conn.consultas[1]
    assert "point_assignments" not in consulta and params == []


def test_cargar_me_sin_perfil(monkeypatch):
    monkeypatch.setattr(auth, "get_pool", lambda: pool(FakeConn(None, [])))
    assert auth.cargar_me("u-9") is None


def cliente(monkeypatch, me):
    app = create_app()

    @app.get("/solo-admin")
    def solo_admin(_: Annotated[auth.Me, Depends(auth.require_roles("administrador"))]):
        return {"ok": True}

    monkeypatch.setattr(auth, "cargar_me", lambda _: me)
    return TestClient(app)


AUX = auth.Me("s-1", "Ana Demo", "auxiliar@abasteceai.example", "auxiliar", PUNTO[:0])
H = {"Authorization": f"Bearer {token()}"}


def test_me_ok(monkeypatch):
    r = cliente(monkeypatch, AUX).get("/me", headers=H)
    assert r.status_code == 200 and r.json()["role"] == "auxiliar"
    assert set(r.json()) == {"staff_id", "full_name", "email", "role", "points"}


def test_me_sin_header_o_sin_perfil(monkeypatch):
    assert cliente(monkeypatch, AUX).get("/me").status_code == 401
    r = cliente(monkeypatch, None).get("/me", headers=H)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"


def test_rol_equivocado_es_403(monkeypatch):
    assert cliente(monkeypatch, AUX).get("/solo-admin", headers=H).status_code == 403
    adm = auth.Me("s-3", "Carla", "c@x", "administrador", [])
    assert cliente(monkeypatch, adm).get("/solo-admin", headers=H).status_code == 200


def test_jwks_caido_es_401_no_500(monkeypatch):
    def caido():
        raise jwt.PyJWKClientConnectionError("sin red")

    monkeypatch.setattr(auth, "_jwks", caido)
    with pytest.raises(ApiError) as e:
        auth.verificar_jwt(token())
    assert e.value.status == 401
