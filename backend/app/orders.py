"""POST /orders → `abastece.fn_crear_pedido` (HU-1.1, specs/000-contratos/funciones.md §1).

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

from app.auth import Me, ensure_point, require_roles
from app.db import call_fn

router = APIRouter(tags=["pedidos"])


class ItemIn(BaseModel):
    product_id: UUID
    requested_qty: float = Field(gt=0)


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
