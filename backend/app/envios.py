"""Bodega y envíos: prepare, routes/confirm, shipments/* → una función SQL cada uno (C3).

FastAPI valida la forma del cuerpo, el rol y, donde el contrato lo pide, que el punto del envío sea
del usuario; las reglas de negocio y el estado los vuelve a revisar la función SQL (doble candado).
Las respuestas de las funciones ya son el schema del contrato y se devuelven tal cual.
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, Field

from app.auth import Me, ensure_point, require_roles
from app.db import call_fn, fetch_one
from app.errors import ApiError

router = APIRouter(tags=["bodega y envíos"])
Cantidad = Annotated[float, Field(ge=0, allow_inf_nan=False)]


def _punto_del_envio(shipment_id: UUID) -> UUID:
    fila = fetch_one("SELECT location_id FROM abastece.shipments WHERE id = %s", [shipment_id])
    if fila is None:
        raise ApiError(404, "NOT_FOUND", "Envío no encontrado.")
    return fila[0]


# ---- preparar (bodega) -----------------------------------------------------------------------
class PrepareItem(BaseModel):
    product_id: UUID
    prepared_qty: Cantidad


class PrepareIn(BaseModel):
    items: list[PrepareItem] = Field(min_length=1)


@router.post("/orders/{order_id}/prepare", operation_id="prepareOrder")
def prepare_order(
    order_id: UUID,
    body: PrepareIn,
    me: Annotated[Me, Depends(require_roles("bodega"))],
    dry_run: Annotated[bool, Query()] = False,
) -> dict:
    items = [{"product_id": str(i.product_id), "prepared_qty": i.prepared_qty} for i in body.items]
    return call_fn("fn_preparar", me.staff_id, order_id, items, dry_run)


# ---- ruta confirmada y courier (logística) ---------------------------------------------------
class StopIn(BaseModel):
    location_id: UUID
    location_code: str | None = None
    sequence: int = Field(ge=1)
    planned_arrival: AwareDatetime | None = None
    order_ids: list[UUID]


class ConfirmIn(BaseModel):
    vehicle_id: UUID
    dispatch_date: date
    stops: list[StopIn] = Field(min_length=1)
    estimated_km: Cantidad
    estimated_minutes: Cantidad
    planning_method: str


@router.post("/routes/confirm", operation_id="confirmRoutes", status_code=201)
def confirm_routes(
    body: ConfirmIn, me: Annotated[Me, Depends(require_roles("logistica"))]
) -> JSONResponse:
    paradas = [
        {
            "location_id": str(s.location_id),
            **({"location_code": s.location_code} if s.location_code else {}),
            "sequence": s.sequence,
            "planned_arrival": s.planned_arrival.isoformat() if s.planned_arrival else None,
            "order_ids": [str(o) for o in s.order_ids],
        }
        for s in body.stops
    ]
    r = call_fn(
        "fn_confirmar_ruta",
        me.staff_id,
        body.vehicle_id,
        body.dispatch_date,
        paradas,
        body.estimated_km,
        body.estimated_minutes,
        body.planning_method,
    )
    return JSONResponse(r, status_code=201)


class CourierIn(BaseModel):
    order_id: UUID
    carrier_name: str = Field(min_length=1)
    guide_code: str = Field(min_length=1)
    promised_delivery_at: AwareDatetime | None = None


@router.post("/shipments/courier", operation_id="createCourier", status_code=201)
def create_courier(
    body: CourierIn, me: Annotated[Me, Depends(require_roles("logistica"))]
) -> JSONResponse:
    r = call_fn(
        "fn_envio_courier",
        me.staff_id,
        body.order_id,
        body.carrier_name,
        body.guide_code,
        body.promised_delivery_at,
    )
    return JSONResponse(r, status_code=201)


# ---- despachar, entregar, recibir ------------------------------------------------------------
@router.post("/shipments/{shipment_id}/dispatch", operation_id="dispatchShipment")
def dispatch_shipment(
    shipment_id: UUID, me: Annotated[Me, Depends(require_roles("bodega", "logistica"))]
) -> dict:
    return call_fn("fn_despachar", me.staff_id, shipment_id)


@router.post("/shipments/{shipment_id}/delivered", operation_id="markDelivered")
def mark_delivered(
    shipment_id: UUID, me: Annotated[Me, Depends(require_roles("supervisor"))]
) -> dict:
    ensure_point(me, _punto_del_envio(shipment_id))
    return call_fn("fn_marcar_entregado", me.staff_id, shipment_id)


class ReceiptItem(BaseModel):
    shipment_item_id: UUID
    counted_qty: Cantidad
    accepted_qty: Cantidad


class ReceiptIn(BaseModel):
    notes: str = ""
    items: list[ReceiptItem] = Field(min_length=1)


@router.post("/shipments/{shipment_id}/receipt", operation_id="submitReceipt", status_code=201)
def submit_receipt(
    shipment_id: UUID, body: ReceiptIn, me: Annotated[Me, Depends(require_roles("auxiliar"))]
) -> JSONResponse:
    ensure_point(me, _punto_del_envio(shipment_id))
    items = [
        {
            "shipment_item_id": str(i.shipment_item_id),
            "counted_qty": i.counted_qty,
            "accepted_qty": i.accepted_qty,
        }
        for i in body.items
    ]
    r = call_fn("fn_recibir", me.staff_id, shipment_id, items, body.notes)
    return JSONResponse(r, status_code=201)
