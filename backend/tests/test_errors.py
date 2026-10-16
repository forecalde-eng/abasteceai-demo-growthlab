import pytest

from app.errors import ApiError, desde_sqlstate


@pytest.mark.parametrize(
    ("sqlstate", "status", "code"),
    [
        ("P0403", 403, "FORBIDDEN"),
        ("P0404", 404, "NOT_FOUND"),
        ("P0409", 409, "INVALID_STATE"),
        ("P0422", 422, "VALIDATION"),
    ],
)
def test_sqlstate_a_http(sqlstate, status, code):
    err = desde_sqlstate(sqlstate, "mensaje", None)
    assert (err.status, err.code, err.message) == (status, code, "mensaje")
    assert err.body() == {"error": {"code": code, "message": "mensaje", "details": {}}}


def test_detail_json_pasa_a_details():
    err = desde_sqlstate("P0422", "Producto inválido", '{"field": "items[2].product_id"}')
    assert err.details == {"field": "items[2].product_id"}


def test_p0409_puede_ser_conflict():
    err = desde_sqlstate("P0409", "Clave repetida", '{"code": "CONFLICT"}')
    assert (err.status, err.code, err.details) == (409, "CONFLICT", {})


def test_detail_que_no_es_json_se_ignora():
    assert desde_sqlstate("P0403", "x", "texto suelto").details == {}


def test_errores_ajenos_no_se_traducen():
    # 23505 (unique violation) o un bug SQL no son respuestas del contrato
    assert desde_sqlstate("23505", "dup", None) is None
    assert desde_sqlstate(None, "x", None) is None


def test_api_error_es_excepcion():
    assert isinstance(ApiError(401, "UNAUTHORIZED", "sin sesión"), Exception)
