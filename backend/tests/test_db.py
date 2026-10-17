from types import SimpleNamespace

import psycopg
import pytest
from psycopg.types.json import Jsonb

from app import db
from app.errors import ApiError


class ErrorSQL(psycopg.Error):
    """Error de base con SQLSTATE propio, como el que lanza `RAISE ... ERRCODE='P0403'`."""

    def __init__(self, sqlstate, primary, detail=None):
        self._ss = sqlstate
        self._diag = SimpleNamespace(message_primary=primary, message_detail=detail)
        super().__init__(primary)

    @property
    def sqlstate(self):
        return self._ss

    @property
    def diag(self):
        return self._diag


class FakeConn:
    def __init__(self, resultado=None, error=None):
        self.resultado, self.error = resultado, error
        self.consulta = self.params = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, consulta, params):
        self.consulta, self.params = consulta, params
        if self.error:
            raise self.error
        return self

    def fetchone(self):
        return (self.resultado,)


def con_pool(monkeypatch, conn):
    monkeypatch.setattr(db, "get_pool", lambda: SimpleNamespace(connection=lambda: conn))
    return conn


def test_call_fn_arma_la_consulta_y_devuelve_el_jsonb(monkeypatch):
    conn = con_pool(monkeypatch, FakeConn({"id": "x", "status": "submitted"}))
    out = db.call_fn("fn_crear_pedido", "staff-1", {"a": 1}, [{"b": 2}], None, 5)
    assert out == {"id": "x", "status": "submitted"}
    assert conn.consulta.as_string() == 'SELECT "abastece"."fn_crear_pedido"(%s, %s, %s, %s, %s)'
    # dict y list viajan como jsonb; lo demás tal cual
    assert isinstance(conn.params[1], Jsonb) and isinstance(conn.params[2], Jsonb)
    assert conn.params[0] == "staff-1" and conn.params[3] is None and conn.params[4] == 5


@pytest.mark.parametrize("nombre", ["pg_sleep", "fn_x; DROP TABLE y", "FN_X", "otra.fn_x", ""])
def test_solo_se_llaman_funciones_fn(monkeypatch, nombre):
    con_pool(monkeypatch, FakeConn())
    with pytest.raises(ValueError):
        db.call_fn(nombre)


def test_error_p04xx_sale_como_api_error(monkeypatch):
    con_pool(monkeypatch, FakeConn(error=ErrorSQL("P0403", "Punto no asignado")))
    with pytest.raises(ApiError) as e:
        db.call_fn("fn_crear_pedido", "s")
    assert (e.value.status, e.value.code) == (403, "FORBIDDEN")


def test_otro_error_de_base_no_se_oculta(monkeypatch):
    con_pool(monkeypatch, FakeConn(error=ErrorSQL("42P01", "no existe la tabla")))
    with pytest.raises(psycopg.Error):
        db.call_fn("fn_crear_pedido", "s")


def test_sin_database_url_falla_claro(monkeypatch):
    monkeypatch.setattr(db, "_pool", None)
    monkeypatch.setattr(db, "get_settings", lambda: SimpleNamespace(database_url=""))
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        db.get_pool()


def test_los_float_viajan_como_numeric():
    from decimal import Decimal

    assert db._param(12.5) == Decimal("12.5") and isinstance(db._param(90.0), Decimal)
    assert db._param(3) == 3 and db._param("x") == "x"
