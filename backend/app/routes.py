"""POST /routes/plan (HU-3.1): propone rutas con OR-Tools. Solo lee: no escribe nada."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import Me, require_roles
from app.db import fetch_all, fetch_one
from app.errors import ApiError
from app.routing.solver import Parada, Vehiculo, planificar

router = APIRouter(tags=["rutas"])
ECUADOR = timezone(timedelta(hours=-5))  # continental, sin horario de verano


class PlanIn(BaseModel):
    dispatch_date: date
    order_ids: list[UUID] = Field(min_length=1)


def _min(t: time | None, por_defecto: int) -> int:
    return por_defecto if t is None else t.hour * 60 + t.minute


def _invalido(order_id: UUID | str, mensaje: str) -> ApiError:
    return ApiError(422, "VALIDATION", mensaje, {"field": "order_ids", "order_id": str(order_id)})


@router.post("/routes/plan", operation_id="planRoutes")
def plan_routes(body: PlanIn, _: Annotated[Me, Depends(require_roles("logistica"))]) -> dict:
    ids = list(dict.fromkeys(body.order_ids))
    filas = fetch_all(
        "SELECT o.id, o.code, o.status, l.id, l.code, l.city, l.latitude, l.longitude,"
        " l.window_start, l.window_end, l.service_minutes,"
        " COALESCE(SUM(i.prepared_qty * p.gross_weight_kg), 0),"
        " COALESCE(SUM(i.prepared_qty * p.package_volume_m3), 0)"
        " FROM abastece.orders o JOIN abastece.locations l ON l.id = o.location_id"
        " LEFT JOIN abastece.order_items i ON i.order_id = o.id"
        " LEFT JOIN abastece.products p ON p.id = i.product_id"
        " WHERE o.id = ANY(%s) GROUP BY o.id, l.id",
        [ids],
    )
    por_id = {f[0]: f for f in filas}
    for oid in ids:
        f = por_id.get(oid)
        if f is None:
            raise _invalido(oid, "Pedido no encontrado.")
        if f[2] != "ready":
            raise _invalido(oid, f"{f[1]} no está listo (estado {f[2]}).")
        if f[5] != "Quito" or f[6] is None or f[7] is None:
            raise _invalido(oid, f"{f[1]} no es de Quito o no tiene coordenadas.")

    bodega = fetch_one(
        "SELECT latitude, longitude FROM abastece.locations WHERE code = 'BOD-DEMO'", []
    )
    vehiculos = [
        Vehiculo(str(v[0]), v[1], float(v[2]), float(v[3]), _min(v[4], 0), _min(v[5], 1439))
        for v in fetch_all(
            # Igual que fn_confirmar_ruta: un plan aprobado/despachado/terminado ocupa el día.
            "SELECT v.id, v.code, v.capacity_kg, v.capacity_m3, v.available_from,"
            " v.available_until FROM abastece.vehicles v WHERE NOT EXISTS ("
            " SELECT 1 FROM abastece.route_plans rp WHERE rp.vehicle_id = v.id"
            " AND rp.dispatch_date = %s"
            " AND rp.status IN ('approved', 'dispatched', 'finished')) ORDER BY v.code",
            [body.dispatch_date],
        )
    ]

    # Varios pedidos del mismo punto se entregan en una sola parada.
    paradas: dict[UUID, dict] = {}
    codigos: dict[str, str] = {}
    for oid in ids:
        f = por_id[oid]
        codigos[str(oid)] = f[1]
        p = paradas.setdefault(
            f[3],
            {
                "code": f[4],
                "lat": float(f[6]),
                "lon": float(f[7]),
                "ini": _min(f[8], 0),
                "fin": _min(f[9], 1439),
                "serv": f[10],
                "kg": 0.0,
                "m3": 0.0,
                "orders": [],
            },
        )
        p["kg"] += float(f[11])
        p["m3"] += float(f[12])
        p["orders"].append(str(oid))
    plan = planificar(
        (float(bodega[0]), float(bodega[1])),
        [
            Parada(
                str(loc),
                p["code"],
                p["lat"],
                p["lon"],
                p["ini"],
                p["fin"],
                p["serv"],
                p["kg"],
                p["m3"],
                tuple(p["orders"]),
            )
            for loc, p in paradas.items()
        ],
        vehiculos,
    )

    inicio_dia = datetime.combine(body.dispatch_date, time(0), tzinfo=ECUADOR)
    return {
        "matrix_source": "synthetic",
        "planning_method": "ortools_vrptw",
        "routes": [
            {
                "vehicle_id": r["vehiculo"].id,
                "vehicle_code": r["vehiculo"].code,
                "stops": [
                    {
                        "location_id": p.location_id,
                        "location_code": p.code,
                        "sequence": n,
                        "planned_arrival": (inicio_dia + timedelta(minutes=llegada)).isoformat(),
                        "order_ids": list(p.order_ids),
                    }
                    for n, (p, llegada) in enumerate(r["paradas"], start=1)
                ],
                "estimated_km": r["km"],
                "estimated_minutes": r["minutos"],
            }
            for r in plan.rutas
        ],
        "unassigned": [
            {"order_id": oid, "order_code": codigos[oid], "reason": motivo}
            for p, motivo in plan.sin_asignar
            for oid in p.order_ids
        ],
    }
