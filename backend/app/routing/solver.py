"""Planificador de rutas VRPTW con OR-Tools (HU-3.1). Función pura: no toca la base.

Matriz sintética: distancia haversine × 1,3 (AGENTS/spec) a velocidad urbana fija. Pesos,
volúmenes, ventanas y horario del vehículo salen de la base; aquí solo se optimiza.
"""

import math
from dataclasses import dataclass, field

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

FACTOR_VIAL = 1.3
VELOCIDAD_KMH = 30  # supuesto de la demo: tráfico urbano de Quito; sin API real de tráfico
PENALIZACION = 1_000_000  # mucho mayor que cualquier distancia: solo se descarta lo que no cabe
LIMITE_SEGUNDOS = 2


@dataclass(frozen=True)
class Parada:
    location_id: str
    code: str
    lat: float
    lon: float
    ventana_ini: int  # minutos desde medianoche
    ventana_fin: int
    servicio: int  # minutos
    peso_kg: float
    volumen_m3: float
    order_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class Vehiculo:
    id: str
    code: str
    cap_kg: float
    cap_m3: float
    ini: int
    fin: int


@dataclass
class Plan:
    rutas: list[dict] = field(default_factory=list)
    sin_asignar: list[tuple[Parada, str]] = field(default_factory=list)  # (parada, motivo)


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (la1, lo1), (la2, lo2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    h = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    )
    return 2 * 6371.0088 * math.asin(math.sqrt(h)) * FACTOR_VIAL


def _minutos(distancia_km: float) -> int:
    return math.ceil(distancia_km / VELOCIDAD_KMH * 60)


def _motivo_individual(p: Parada, deposito, vehiculos: list[Vehiculo]) -> str | None:
    """Motivo si la parada es imposible por sí sola con TODA la flota; si no, `None`."""
    if not vehiculos:
        return "no_vehicle"
    if not any(p.peso_kg <= v.cap_kg and p.volumen_m3 <= v.cap_m3 for v in vehiculos):
        return "capacity"
    ida = _minutos(km(deposito, (p.lat, p.lon)))
    ok = any(
        max(v.ini + ida, p.ventana_ini) <= p.ventana_fin
        and max(v.ini + ida, p.ventana_ini) + p.servicio + ida <= v.fin
        and p.peso_kg <= v.cap_kg
        and p.volumen_m3 <= v.cap_m3
        for v in vehiculos
    )
    return None if ok else "window"


def planificar(
    deposito: tuple[float, float], paradas: list[Parada], vehiculos: list[Vehiculo]
) -> Plan:
    plan = Plan()
    candidatas: list[Parada] = []
    for p in paradas:
        motivo = _motivo_individual(p, deposito, vehiculos)
        if motivo:
            plan.sin_asignar.append((p, motivo))
        else:
            candidatas.append(p)
    if not candidatas:
        return plan

    puntos = [deposito] + [(p.lat, p.lon) for p in candidatas]
    n = len(puntos)
    dist = [[km(puntos[i], puntos[j]) if i != j else 0.0 for j in range(n)] for i in range(n)]
    viaje = [[_minutos(dist[i][j]) for j in range(n)] for i in range(n)]

    gestor = pywrapcp.RoutingIndexManager(n, len(vehiculos), 0)
    r = pywrapcp.RoutingModel(gestor)

    def servicio(i: int) -> int:
        return 0 if i == 0 else candidatas[i - 1].servicio

    def tiempo_cb(a, b):
        i, j = gestor.IndexToNode(a), gestor.IndexToNode(b)
        return viaje[i][j] + servicio(i)

    t = r.RegisterTransitCallback(tiempo_cb)
    r.SetArcCostEvaluatorOfAllVehicles(
        r.RegisterTransitCallback(
            lambda a, b: round(dist[gestor.IndexToNode(a)][gestor.IndexToNode(b)] * 1000)
        )
    )
    horizonte = max(v.fin for v in vehiculos)
    r.AddDimension(t, horizonte, horizonte, False, "tiempo")
    tiempo = r.GetDimensionOrDie("tiempo")
    for k, p in enumerate(candidatas, start=1):
        tiempo.CumulVar(gestor.NodeToIndex(k)).SetRange(p.ventana_ini, p.ventana_fin)
    for idx, v in enumerate(vehiculos):
        tiempo.CumulVar(r.Start(idx)).SetRange(v.ini, v.fin)
        tiempo.CumulVar(r.End(idx)).SetRange(v.ini, v.fin)

    for nombre, medida, tope in (
        ("kg", lambda p: p.peso_kg, lambda v: v.cap_kg),
        ("m3", lambda p: p.volumen_m3, lambda v: v.cap_m3),
    ):
        # Enteros: gramos y litros, redondeando la demanda hacia arriba para no sobrecargar.
        demanda = [0] + [math.ceil(medida(p) * 1000) for p in candidatas]
        cb = r.RegisterUnaryTransitCallback(lambda a, d=demanda: d[gestor.IndexToNode(a)])
        r.AddDimensionWithVehicleCapacity(
            cb, 0, [math.floor(tope(v) * 1000) for v in vehiculos], True, nombre
        )

    for k in range(1, n):
        r.AddDisjunction([gestor.NodeToIndex(k)], PENALIZACION)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    params.time_limit.seconds = LIMITE_SEGUNDOS
    sol = r.SolveWithParameters(params)
    if sol is None:
        plan.sin_asignar += [(p, "capacity") for p in candidatas]
        return plan

    asignadas: set[int] = set()
    for idx, v in enumerate(vehiculos):
        i = r.Start(idx)
        orden, recorrido = [], 0.0
        while not r.IsEnd(i):
            nodo = gestor.IndexToNode(i)
            sig = sol.Value(r.NextVar(i))
            if nodo:
                orden.append((nodo, sol.Min(tiempo.CumulVar(i))))
            recorrido += dist[nodo][gestor.IndexToNode(sig)]
            i = sig
        if not orden:
            continue
        asignadas.update(nodo for nodo, _ in orden)
        fin = sol.Min(tiempo.CumulVar(i))
        # Salida lo más tarde posible sin mover la primera llegada: la ruta dura de salir a volver.
        primera = orden[0]
        salida = primera[1] - viaje[0][primera[0]]
        plan.rutas.append(
            {
                "vehiculo": v,
                "paradas": [(candidatas[nodo - 1], llegada) for nodo, llegada in orden],
                "km": round(recorrido, 2),
                "minutos": fin - salida,
            }
        )
    for k, p in enumerate(candidatas, start=1):
        if k not in asignadas:
            plan.sin_asignar.append((p, _motivo_colectivo(p, plan.rutas, vehiculos)))
    return plan


def _motivo_colectivo(p: Parada, rutas: list[dict], vehiculos: list[Vehiculo]) -> str:
    """Por qué el solver descartó una parada que sola sí cabe: carga de la flota u horarios.

    Si algún vehículo aún tiene capacidad (peso y volumen) para ella, lo que la dejó fuera es el
    calendario (ventanas que chocan o falta de horas): `window`. Si no, la flota está llena.
    """
    carga = {r["vehiculo"].id: r["paradas"] for r in rutas}
    for v in vehiculos:
        asignadas = [x for x, _ in carga.get(v.id, [])]
        kg = sum(x.peso_kg for x in asignadas) + p.peso_kg
        m3 = sum(x.volumen_m3 for x in asignadas) + p.volumen_m3
        if kg <= v.cap_kg and m3 <= v.cap_m3:
            return "window"
    return "capacity"
