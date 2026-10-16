from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_validacion_usa_el_error_del_contrato():
    from fastapi import Body

    @app.post("/_prueba")
    def prueba(x: int = Body(embed=True)):  # pragma: no cover - solo fuerza un 422
        return x

    r = client.post("/_prueba", json={"x": "no-es-numero"})
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "VALIDATION"
    assert error["details"]["errors"][0]["field"].endswith("x")


def test_cors_permite_idempotency_key():
    r = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Idempotency-Key, Authorization",
        },
    )
    assert r.status_code == 200
    assert "idempotency-key" in r.headers["access-control-allow-headers"].lower()
