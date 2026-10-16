"""Error uniforme del contrato (`specs/000-contratos/openapi.yaml`, schema `Error`).

Las funciones SQL avisan con `RAISE EXCEPTION USING ERRCODE='P04xx'`
(docs/06_PLAN_EQUIPO.md §3 C3); aquí se traducen a HTTP.
"""

import json
from typing import Any

# SQLSTATE de las funciones → (HTTP, código del contrato)
SQLSTATE_A_HTTP: dict[str, tuple[int, str]] = {
    "P0403": (403, "FORBIDDEN"),
    "P0404": (404, "NOT_FOUND"),
    "P0409": (409, "INVALID_STATE"),
    "P0422": (422, "VALIDATION"),
}
CODIGOS = {
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "INVALID_STATE",
    "VALIDATION",
    "CONFLICT",
    "UPSTREAM_AI",
}


class ApiError(Exception):
    def __init__(
        self, status: int, code: str, message: str, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}

    def body(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}


def desde_sqlstate(sqlstate: str | None, message: str, detail: str | None) -> ApiError | None:
    """Traduce un error de una función SQL. `None` si no es uno de los nuestros (es un bug)."""
    if sqlstate not in SQLSTATE_A_HTTP:
        return None
    status, code = SQLSTATE_A_HTTP[sqlstate]
    details: dict[str, Any] = {}
    if detail:
        try:
            parsed = json.loads(detail)
        except ValueError:
            parsed = None
        if isinstance(parsed, dict):
            details = parsed
    # P0409 sirve para INVALID_STATE y CONFLICT: la función elige con {"code": "CONFLICT"}.
    if details.get("code") in CODIGOS:
        code = details.pop("code")
    return ApiError(status, code, message, details)
