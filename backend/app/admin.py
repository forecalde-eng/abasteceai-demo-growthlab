"""POST /admin/reset-demo (HU-0.3): vuelve la demo a la semilla con los archivos de `db/`.

Orden de `db/12_RESET_DEMO.md`: 12_reset_demo → 03_datos_ficticios → 12_revincular_cuentas.
Cada archivo trae su BEGIN/COMMIT: son tres transacciones, no una (no se anidan).
"""

import json
import threading
from pathlib import Path
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends
from psycopg import sql

from app.auth import Me, require_roles
from app.config import get_settings
from app.errors import ApiError

router = APIRouter(tags=["admin"])
DB = Path(__file__).resolve().parents[2] / "db"
PASOS = ["12_reset_demo.sql", "03_datos_ficticios.sql", "12_revincular_cuentas.sql"]
# shortcut: el candado es por proceso; con un solo uvicorn basta. Con varios, usar un advisory lock.
_en_curso = threading.Lock()


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


@router.post("/admin/reset-demo", operation_id="resetDemo")
def reset_demo(_: Annotated[Me, Depends(require_roles("administrador"))]) -> dict:
    if not _en_curso.acquire(blocking=False):
        raise ApiError(409, "CONFLICT", "Ya hay un reinicio en curso.")
    try:
        return {"ok": True, "reference_at": ejecutar_reset(get_settings().database_url)}
    finally:
        _en_curso.release()
