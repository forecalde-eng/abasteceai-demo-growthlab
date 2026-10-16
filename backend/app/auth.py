"""JWT de Supabase + perfil operativo (HU-0.1, regla 8: el rol y los puntos salen de la base).

Cada endpoint protegido usa `Depends(require_roles(...))`; `GET /me` usa `get_me`.
La función SQL vuelve a revisar rol y punto adentro (doble candado).
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, Header
from jwt import PyJWKClient

from app.config import get_settings
from app.db import get_pool
from app.errors import ApiError

# Roles con alcance total: ven los 703 puntos (db/02: abastece_can_read_point).
ROLES_ALCANCE_TOTAL = {"administrador", "bodega", "logistica", "compras", "gerencia"}
_ASIMETRICOS = ["ES256", "RS256"]


@lru_cache
def _jwks() -> PyJWKClient:
    return PyJWKClient(f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json")


def verificar_jwt(token: str) -> str:
    """Devuelve el `sub` (auth_user_id) de un JWT válido de Supabase; si no, 401."""
    cfg = get_settings()
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256" and cfg.supabase_jwt_secret:  # proyectos con clave legacy
            clave, algs = cfg.supabase_jwt_secret, ["HS256"]
        elif alg in _ASIMETRICOS and cfg.supabase_url:
            clave, algs = _jwks().get_signing_key_from_jwt(token).key, _ASIMETRICOS
        else:
            raise jwt.InvalidTokenError("algoritmo o configuración no soportados")
        claims = jwt.decode(token, clave, algorithms=algs, audience="authenticated")
        return str(claims["sub"])
    except (jwt.PyJWTError, KeyError) as exc:
        raise ApiError(401, "UNAUTHORIZED", "Sesión inválida o vencida.") from exc


@dataclass(frozen=True)
class Me:
    staff_id: str
    full_name: str
    email: str
    role: str
    points: list[dict[str, Any]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "staff_id": self.staff_id,
            "full_name": self.full_name,
            "email": self.email,
            "role": self.role,
            "points": self.points,
        }


def cargar_me(auth_user_id: str) -> Me | None:
    """Lee `staff_members` + puntos con el `sub` ya verificado. `None` = sin perfil operativo."""
    with get_pool().connection() as conn:
        staff = conn.execute(
            "SELECT id, full_name, demo_email, role FROM abastece.staff_members"
            " WHERE auth_user_id = %s AND active",
            [auth_user_id],
        ).fetchone()
        if staff is None:
            return None
        todos = staff[3] in ROLES_ALCANCE_TOTAL
        filas = conn.execute(
            "SELECT l.id, l.code, l.name, l.city, l.demo_scope FROM abastece.locations l"
            + ("" if todos else " JOIN abastece.point_assignments a ON a.location_id = l.id")
            + ("" if todos else " WHERE a.staff_id = %s")
            + " ORDER BY l.code",
            [] if todos else [staff[0]],
        ).fetchall()
    puntos = [
        {"id": str(f[0]), "code": f[1], "name": f[2], "city": f[3], "demo_scope": f[4]}
        for f in filas
    ]
    return Me(str(staff[0]), staff[1], staff[2], staff[3], puntos)


def get_me(authorization: Annotated[str | None, Header()] = None) -> Me:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "UNAUTHORIZED", "Falta la sesión (Authorization: Bearer).")
    me = cargar_me(verificar_jwt(authorization[7:].strip()))
    if me is None:
        raise ApiError(403, "FORBIDDEN", "Cuenta sin perfil operativo.")
    return me


def require_roles(*roles: str):
    """Dependencia: el rol (leído de la base) debe estar entre `roles`, si no 403."""

    def revisar(me: Annotated[Me, Depends(get_me)]) -> Me:
        if me.role not in roles:
            raise ApiError(403, "FORBIDDEN", "Tu rol no puede hacer esta acción.")
        return me

    return revisar
