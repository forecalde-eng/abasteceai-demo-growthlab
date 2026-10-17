"""Acceso a la base: un pool pequeño y una sola puerta, `call_fn`.

FastAPI no escribe SQL de negocio: valida y llama a UNA función `abastece.fn_*`.
Cada llamada es una transacción (si la función falla, no queda nada a medias).
"""

import re
from decimal import Decimal
from typing import Any

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app.config import get_settings
from app.errors import desde_sqlstate

MAX_CONEXIONES = 5  # Supabase Free: pocas conexiones en el pooler
_NOMBRE_FN = re.compile(r"^fn_[a-z0-9_]+$")
_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        url = get_settings().database_url
        if not url:
            raise RuntimeError("Falta DATABASE_URL en backend/.env")
        # prepare_threshold=None: sin sentencias preparadas, seguro detrás de un pooler.
        _pool = ConnectionPool(
            url,
            min_size=1,
            max_size=MAX_CONEXIONES,
            kwargs={"prepare_threshold": None},
            open=True,
        )
    return _pool


def cerrar_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def _param(valor: Any) -> Any:
    if isinstance(valor, float):
        # Las funciones piden `numeric` (cantidades, km): un float viajaría como double precision
        # y Postgres no encontraría la firma.
        return Decimal(str(valor))
    return Jsonb(valor) if isinstance(valor, dict | list) else valor


def call_fn(nombre: str, *args: Any) -> Any:
    """Ejecuta `SELECT abastece.<nombre>(args…)` y devuelve el `jsonb` como dict/list.

    Los errores `P04xx` de la función salen como `ApiError`; cualquier otro error de la base
    se deja pasar (es un bug del servidor, no una respuesta del contrato).
    """
    if not _NOMBRE_FN.match(nombre):
        raise ValueError(f"Solo se llaman funciones fn_*: {nombre!r}")
    consulta = sql.SQL("SELECT {}.{}({})").format(
        sql.Identifier("abastece"),
        sql.Identifier(nombre),
        sql.SQL(", ").join(sql.Placeholder() for _ in args),
    )
    try:
        with get_pool().connection() as conn:
            fila = conn.execute(consulta, [_param(a) for a in args]).fetchone()
    except psycopg.Error as exc:
        diag = exc.diag
        traducido = desde_sqlstate(exc.sqlstate, diag.message_primary or "", diag.message_detail)
        if traducido is None:
            raise
        raise traducido from exc
    return fila[0] if fila else None


def fetch_one(consulta: str, params: list[Any]) -> tuple | None:
    """Una fila de una lectura (SELECT) con el pool del backend; `None` si no hay."""
    with get_pool().connection() as conn:
        return conn.execute(consulta, params).fetchone()


def fetch_all(consulta: str, params: list[Any]) -> list[tuple]:
    """Todas las filas de una lectura (SELECT) con el pool del backend."""
    with get_pool().connection() as conn:
        return conn.execute(consulta, params).fetchall()
