"""Pedidos (specs/000-contratos/funciones.md): crear (§1), analizar (§2) y decidir (§3).

La función SQL es la única que valida las reglas de negocio (adicional/regular, ítems, motivo):
sus `P0403/P0404/P0422` ya salen como 403/404/422 vía `app.errors`. Aquí solo se valida la forma
del cuerpo, que el punto sea de la sesión (doble candado) y se elige 201/200.
"""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.ai.jev import proponer
from app.auth import Me, ensure_point, require_roles
from app.db import call_fn, fetch_one
from app.errors import ApiError

router = APIRouter(tags=["pedidos"])


class ItemIn(BaseModel):
    product_id: UUID
    requested_qty: float = Field(gt=0, allow_inf_nan=False)


class CreateOrderIn(BaseModel):
    location_id: UUID
    cycle_month: date
    order_type: Literal["regular", "additional"]
    related_order_id: UUID | None = None
    reason: str | None = None
    observations: str = ""
    items: list[ItemIn] = Field(min_length=1)


@router.post("/orders", operation_id="createOrder", status_code=201)
def create_order(
    body: CreateOrderIn,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1)],
    me: Annotated[Me, Depends(require_roles("auxiliar", "supervisor"))],
) -> JSONResponse:
    ensure_point(me, body.location_id)
    resultado = call_fn(
        "fn_crear_pedido",
        me.staff_id,
        body.location_id,
        body.cycle_month,
        body.order_type,
        body.related_order_id,
        body.reason,
        body.observations,
        [{"product_id": str(i.product_id), "requested_qty": i.requested_qty} for i in body.items],
        idempotency_key,
    )
    # `created` es solo una señal interna: el OrderResult público son id, code y status.
    publico = {k: resultado[k] for k in ("id", "code", "status")}
    return JSONResponse(publico, status_code=201 if resultado["created"] else 200)


class DecisionItem(BaseModel):
    product_id: UUID
    approved_qty: float = Field(ge=0, allow_inf_nan=False)


class DecisionIn(BaseModel):
    decision: Literal["approve", "return", "cancel"]
    reason: str | None = None
    items: list[DecisionItem] | None = None


@router.post("/orders/{order_id}/decision", operation_id="decideOrder")
def decide_order(
    order_id: UUID,
    body: DecisionIn,
    me: Annotated[Me, Depends(require_roles("administrador"))],
) -> dict:
    items = None
    if body.items is not None:
        items = [
            {"product_id": str(i.product_id), "approved_qty": i.approved_qty} for i in body.items
        ]
    r = call_fn("fn_decidir_pedido", me.staff_id, order_id, body.decision, items, body.reason)
    return {k: r[k] for k in ("id", "code", "status")}  # OrderResult exacto


@router.post("/orders/{order_id}/analyze", operation_id="analyzeOrder")
def analyze_order(
    order_id: UUID,
    me: Annotated[Me, Depends(require_roles("administrador", "auxiliar", "supervisor"))],
) -> dict:
    fila = fetch_one(
        "SELECT o.status, o.requested_by, o.code, l.code, o.observations"
        " FROM abastece.orders o JOIN abastece.locations l ON l.id = o.location_id"
        " WHERE o.id = %s",
        [order_id],
    )
    if fila is None:
        raise ApiError(404, "NOT_FOUND", "Pedido no encontrado.")
    estado, autor, codigo, punto, observaciones = fila
    # Antes de gastar una llamada a Jev: auxiliar/supervisor solo analizan su propio pedido.
    if me.role != "administrador" and str(autor) != me.staff_id:
        raise ApiError(403, "FORBIDDEN", "Solo el autor puede analizar este pedido.")
    # Si no está en `submitted` no se llama a Jev: la función recibe NULL (acuerdo 12).
    sobre = None
    if estado == "submitted":
        sobre = proponer(
            {
                "order_code": codigo,
                "point_code": punto,
                "observations": observaciones or "",
                "provenance": "synthetic demo data",
            }
        )
    r = call_fn("fn_analizar_reglas", me.staff_id, order_id, sobre)
    if sobre is not None and "error" in sobre["response"]:
        # La propuesta ya quedó guardada en human_review (acuerdo 4); el contrato pide 502.
        raise ApiError(
            502,
            "UPSTREAM_AI",
            "Jev no respondió; la propuesta quedó en revisión humana.",
            {"decision_log_id": r["proposal"]["decision_log_id"]},
        )
    return r
