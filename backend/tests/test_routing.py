import pytest

from app.routing import solver
from app.routing.solver import Parada, Vehiculo, planificar

BOD = (-0.221, -78.5019)
V1 = Vehiculo("v1", "VEH-DEMO-1", 600, 5.5, 450, 1050)
V2 = Vehiculo("v2", "VEH-DEMO-2", 350, 3.2, 450, 1050)


def parada(code, lat, lon, ini=480, fin=960, serv=10, kg=50.0, m3=0.5, ordenes=("o",)):
    return Parada(f"loc-{code}", code, lat, lon, ini, fin, serv, kg, m3, tuple(ordenes))


Q6 = parada("Q-006", -0.1767, -78.4838, 600, 1020, 10, ordenes=("o6",))  # 10:00–17:00
Q7 = parada("Q-007", -0.1767, -78.4758, 480, 960, 15, ordenes=("o7",))  # 08:00–16:00


def test_dos_paradas_cercanas_van_en_una_ruta_dentro_de_sus_ventanas():
    p = planificar(BOD, [Q6, Q7], [V1])
    assert p.sin_asignar == [] and len(p.rutas) == 1
    ruta = p.rutas[0]
    assert {x.code for x, _ in ruta["paradas"]} == {"Q-006", "Q-007"}
    for parada_, llegada in ruta["paradas"]:
        assert parada_.ventana_ini <= llegada <= parada_.ventana_fin
    assert ruta["km"] > 0 and ruta["minutos"] > 0 and ruta["vehiculo"] is V1


def test_la_distancia_es_haversine_por_1_3():
    d = solver.km((0.0, 0.0), (0.0, 1.0))  # 1° de longitud en el ecuador ≈ 111,19 km
    assert d == pytest.approx(111.19 * 1.3, rel=0.01)


def test_pedido_que_no_cabe_en_ningun_vehiculo_es_capacity():
    grande = parada("Q-010", -0.18, -78.48, kg=2000.0)
    p = planificar(BOD, [Q6, grande], [V1, V2])
    assert [(x.code, m) for x, m in p.sin_asignar] == [("Q-010", "capacity")]
    assert len(p.rutas) == 1


def test_ventana_imposible_es_window():
    tarde = parada("Q-011", -0.1767, -78.4838, ini=455, fin=460)  # 07:35–07:40, salida 07:30
    p = planificar(BOD, [tarde], [V1])
    assert [(x.code, m) for x, m in p.sin_asignar] == [("Q-011", "window")]
    assert p.rutas == []


def test_sin_vehiculos_es_no_vehicle():
    p = planificar(BOD, [Q6], [])
    assert [(x.code, m) for x, m in p.sin_asignar] == [("Q-006", "no_vehicle")]


def test_flota_saturada_deja_los_que_sobran_como_capacity():
    # Cada parada pesa 300 kg y VEH-DEMO-2 solo carga 350: cabe una por viaje.
    tres = [parada(f"Q-02{i}", -0.18 - i * 0.002, -78.48, kg=300.0) for i in range(3)]
    p = planificar(BOD, tres, [V2])
    asignadas = sum(len(r["paradas"]) for r in p.rutas)
    assert asignadas == 1 and len(p.sin_asignar) == 2
    assert {m for _, m in p.sin_asignar} == {"capacity"}
