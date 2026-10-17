"""POST /admin/reset-demo (HU-0.3): vuelve la demo a la semilla con los archivos de `db/`.

Orden: 12_reset_demo → 03_datos_ficticios → 13_reconciliar → 12_revincular_cuentas.
Son cuatro transacciones: 13 es una sentencia DO; las otras incluyen BEGIN/COMMIT.
"""

import hashlib
import json
import threading
import time
from pathlib import Path
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, Header
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

from app import auth
from app.config import get_settings
from app.errors import ApiError

router = APIRouter(tags=["admin"])
DB = Path(__file__).resolve().parents[2] / "db"
PASOS = [
    "12_reset_demo.sql",
    "03_datos_ficticios.sql",
    "13_reconciliar_preparacion_demo.sql",
    "12_revincular_cuentas.sql",
]
# shortcut: candado y marca son de esta máquina; con un solo uvicorn basta. Con varios, guardar
# el estado en la base (advisory lock + tabla de mantenimiento).
_en_curso = threading.Lock()
# Existe mientras un reset no termine verificado (sobrevive a reinicios del proceso). Guarda el
# `sub` de quien lo inició: puede reintentar aunque `staff_members` haya quedado vacío.
MARCA = Path(__file__).resolve().parents[1] / ".reset_en_curso"


# Admitir una escritura y arrancar un reset se deciden bajo el mismo candado; el reset espera a
# que terminen las escrituras ya admitidas antes de borrar.
_admision = threading.Lock()
_activas = 0
ESPERA_ESCRITURAS_S = 30


def _identidad(url: str) -> str:
    """Base destino estable: host, puerto, base y usuario; sin la contraseña (puede rotar)."""
    d = conninfo_to_dict(url) if url else {}
    clave = f"{d.get('host')}:{d.get('port')}/{d.get('dbname')}@{d.get('user')}"
    return hashlib.sha256(clave.encode()).hexdigest()


def _marca_actual() -> tuple[str, str] | None:
    """(sub que inició el reset, identidad de su base) si hay un reset a medias."""
    try:
        sub, _, ident = MARCA.read_text(encoding="utf-8").partition("\n")
    except FileNotFoundError:  # no hay marca, o un reset exitoso la borró mientras leíamos
        return None
    return sub, ident


def reset_en_curso() -> bool:
    return _en_curso.locked() or MARCA.exists()


def admitir_escritura() -> bool:
    global _activas
    with _admision:
        if reset_en_curso():
            return False
        _activas += 1
        return True


def terminar_escritura() -> None:
    global _activas
    with _admision:
        _activas -= 1


def esperar_escrituras() -> None:
    fin = time.monotonic() + ESPERA_ESCRITURAS_S
    while True:
        with _admision:
            if _activas == 0:
                return
        if time.monotonic() > fin:
            raise ApiError(409, "CONFLICT", "Hay escrituras en curso; reintenta el reinicio.")
        time.sleep(0.05)


def verificar_destino(url: str) -> None:
    """Antes de borrar: la base debe ser la DEMO FICTICIA sintética."""
    with psycopg.connect(url, prepare_threshold=None) as conn:
        demo = conn.execute(
            "SELECT count(*) FROM abastece.demo_metadata"
            " WHERE provenance = 'synthetic' AND title LIKE '%DEMO FICTICIA%'"
        ).fetchone()[0]
    if demo != 1:
        raise ApiError(
            403, "FORBIDDEN", "La base destino no es la DEMO FICTICIA; no se borra nada."
        )


def ejecutar_reset(url: str) -> str:
    """Restaura y concilia la demo: 9.395 filas. No modifica la semilla original."""
    # Leer todo antes del TRUNCATE: un despliegue incompleto no debe borrar datos.
    try:
        conteos: dict[str, int] = json.loads((DB / "conteos_datos.json").read_text("utf-8"))
        scripts = [(paso, (DB / paso).read_text("utf-8")) for paso in PASOS]
        conteos["inventory_reservations"] += 16
        conteos["audit_events"] += 2
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ApiError(
            409, "INVALID_STATE", "Faltan archivos válidos del reinicio; no se borró nada."
        ) from exc
    with psycopg.connect(url, autocommit=True, prepare_threshold=None) as conn:
        for paso, contenido in scripts:
            try:
                conn.execute(contenido)
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
        conciliados = conn.execute(
            "SELECT o.code, o.status, count(*)::int, sum(i.prepared_qty),"
            " sum((SELECT coalesce(sum(r.quantity),0) FROM abastece.inventory_reservations r"
            " WHERE r.order_item_id=i.id AND r.status='active')),"
            " bool_and(i.prepared_qty=(SELECT coalesce(sum(r.quantity),0)"
            " FROM abastece.inventory_reservations r"
            " WHERE r.order_item_id=i.id AND r.status='active'))"
            " FROM abastece.orders o JOIN abastece.order_items i ON i.order_id=o.id"
            " WHERE o.code IN ('PED-DEMO-003','PED-DEMO-006') GROUP BY o.code,o.status"
            " ORDER BY o.code"
        ).fetchall()
        ped001, vinculadas, ref = conn.execute(
            "SELECT (SELECT status FROM abastece.orders WHERE code = 'PED-DEMO-001'),"
            " (SELECT count(*) FROM abastece.staff_members WHERE auth_user_id IS NOT NULL),"
            " (SELECT reference_at FROM abastece.demo_metadata)"
        ).fetchone()
    esperado_conciliado = [
        ("PED-DEMO-003", "preparing", 16, 46, 46, True),
        ("PED-DEMO-006", "ready", 16, 63, 63, True),
    ]
    if malos or ped001 != "submitted" or vinculadas != 7 or conciliados != esperado_conciliado:
        detalle = {
            "tablas": malos,
            "ped_demo_001": ped001,
            "cuentas_vinculadas": vinculadas,
            "conciliacion_valida": conciliados == esperado_conciliado,
        }
        raise ApiError(409, "INVALID_STATE", "La semilla no quedó como se esperaba.", detalle)
    return ref.isoformat()


def autorizar_reset(authorization: Annotated[str | None, Header()] = None) -> str:
    """Administrador por la base; tras un reset fallido, el mismo `sub` verificado que lo inició."""
    if not get_settings().reset_demo_enabled:
        raise ApiError(
            403, "FORBIDDEN", "El reinicio de la demo está deshabilitado en este entorno."
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "UNAUTHORIZED", "Falta la sesión (Authorization: Bearer).")
    sub = auth.verificar_jwt(authorization[7:].strip())
    # Recuperación: el mismo sub que inició el reset y la misma base (staff puede estar vacío).
    if _marca_actual() == (sub, _identidad(get_settings().database_url)):
        return sub
    if _en_curso.locked():  # en plena fase destructiva staff puede estar vacío: 409, no 403
        raise ApiError(409, "CONFLICT", "Ya hay un reinicio en curso.")
    me = auth.cargar_me(sub)
    if me is None or me.role != "administrador":
        raise ApiError(403, "FORBIDDEN", "Tu rol no puede hacer esta acción.")
    return sub


@router.post("/admin/reset-demo", operation_id="resetDemo")
def reset_demo(sub: Annotated[str, Depends(autorizar_reset)]) -> dict:
    with _admision:
        if not _en_curso.acquire(blocking=False):
            raise ApiError(409, "CONFLICT", "Ya hay un reinicio en curso.")
    try:
        esperar_escrituras()
        url = get_settings().database_url
        # Solo se omite al recuperar un reset a medias sobre la MISMA base (puede estar vacía).
        marca = _marca_actual()
        if marca is None or marca[1] != _identidad(url):
            verificar_destino(url)
        # Desde aquí empieza lo destructivo.
        MARCA.write_text(f"{sub}\n{_identidad(url)}", encoding="utf-8")
        ref = ejecutar_reset(url)
        MARCA.unlink()  # solo un reset verificado reabre las escrituras
        return {"ok": True, "reference_at": ref}
    finally:
        _en_curso.release()
