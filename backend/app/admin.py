"""POST /admin/reset-demo (HU-0.3): vuelve la demo a la semilla con los archivos de `db/`.

Orden de `db/12_RESET_DEMO.md`: 12_reset_demo → 03_datos_ficticios → 12_revincular_cuentas.
Cada archivo trae su BEGIN/COMMIT: son tres transacciones, no una (no se anidan).
"""

import json
import threading
from pathlib import Path
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, Header
from psycopg import sql

from app import auth
from app.config import get_settings
from app.errors import ApiError

router = APIRouter(tags=["admin"])
DB = Path(__file__).resolve().parents[2] / "db"
PASOS = ["12_reset_demo.sql", "03_datos_ficticios.sql", "12_revincular_cuentas.sql"]
# shortcut: el candado es por proceso; con un solo uvicorn basta. Con varios, usar un advisory lock.
_en_curso = threading.Lock()
_fallido = False  # un reset a medias deja la base sin semilla: las escrituras siguen cerradas
_admin_sub: str | None = None  # quien inició el reset; puede reintentar aunque staff esté vacío


def reset_en_curso() -> bool:
    return _en_curso.locked() or _fallido


def ejecutar_reset(url: str) -> str:
    """Corre los tres archivos y verifica la semilla. Devuelve `reference_at` en ISO."""
    conteos: dict[str, int] = json.loads((DB / "conteos_datos.json").read_text(encoding="utf-8"))
    with psycopg.connect(url, autocommit=True, prepare_threshold=None) as conn:
        for paso in PASOS:
            try:
                conn.execute((DB / paso).read_text(encoding="utf-8"))
            except psycopg.Error as exc:
                raise ApiError(
                    409,
                    "INVALID_STATE",
                    f"Falló {paso}; revisa la base antes de reintentar.",
                    {"paso": paso},
                ) from exc
        malos = [
            tabla
            for tabla, esperado in conteos.items()
            if conn.execute(
                sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier("abastece", tabla))
            ).fetchone()[0]
            != esperado
        ]
        ped001, vinculadas, ref = conn.execute(
            "SELECT (SELECT status FROM abastece.orders WHERE code = 'PED-DEMO-001'),"
            " (SELECT count(*) FROM abastece.staff_members WHERE auth_user_id IS NOT NULL),"
            " (SELECT reference_at FROM abastece.demo_metadata)"
        ).fetchone()
    if malos or ped001 != "submitted" or vinculadas != 7:
        detalle = {"tablas": malos, "ped_demo_001": ped001, "cuentas_vinculadas": vinculadas}
        raise ApiError(409, "INVALID_STATE", "La semilla no quedó como se esperaba.", detalle)
    return ref.isoformat()


def autorizar_reset(authorization: Annotated[str | None, Header()] = None) -> str:
    """Administrador por la base; tras un reset fallido, el mismo `sub` verificado que lo inició."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "UNAUTHORIZED", "Falta la sesión (Authorization: Bearer).")
    sub = auth.verificar_jwt(authorization[7:].strip())
    if _fallido and sub == _admin_sub:
        return sub
    me = auth.cargar_me(sub)
    if me is None or me.role != "administrador":
        raise ApiError(403, "FORBIDDEN", "Tu rol no puede hacer esta acción.")
    return sub


@router.post("/admin/reset-demo", operation_id="resetDemo")
def reset_demo(sub: Annotated[str, Depends(autorizar_reset)]) -> dict:
    global _fallido, _admin_sub
    if not _en_curso.acquire(blocking=False):
        raise ApiError(409, "CONFLICT", "Ya hay un reinicio en curso.")
    try:
        _fallido, _admin_sub = True, sub
        ref = ejecutar_reset(get_settings().database_url)
        _fallido = False  # solo un reset verificado reabre las escrituras
        return {"ok": True, "reference_at": ref}
    finally:
        _en_curso.release()
